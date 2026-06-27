const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class ServiceManager extends EventEmitter {
  constructor(userDataPath) {
    super();
    this.userDataPath = userDataPath;
    this.dataFile = path.join(userDataPath, 'services.json');
    this.processes = {}; // serviceId -> { proc, logs[] }
    this.pids = {};      // serviceId -> lastKnownPid
    this.isQuitting = false;
    try {
      fs.mkdirSync(this.userDataPath, { recursive: true });
    } catch (e) {}
  }

  loadData() {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf-8'));
        // Maintain defaults
        if (!data.services) data.services = [];
        if (!data.projects) data.projects = {};
        if (!data.projectOrder) data.projectOrder = [];
        if (!data.mcpPort) data.mcpPort = 20263;
        if (data.mcpEnabled === undefined) data.mcpEnabled = false; // secure default: false
        return data;
      }
    } catch (e) {
      console.error('[ServiceManager] Failed to load data:', e);
    }
    return { 
      services: [], 
      projects: {}, 
      projectOrder: [], 
      backupDir: null,
      mcpPort: 20263,
      mcpEnabled: false
    };
  }

  saveData(newData, desc = 'Auto update', skipBackup = false) {
    try {
      const existing = this.loadData();
      const merged = {
        ...existing,
        ...newData
      };
      fs.writeFileSync(this.dataFile, JSON.stringify(merged, null, 2), 'utf-8');
      this.emit('services-updated', merged);

      if (!skipBackup && merged.backupDir && fs.existsSync(merged.backupDir)) {
        try {
          const dateStr = new Date().toLocaleString('vi-VN', { 
            year: 'numeric', month: '2-digit', day: '2-digit', 
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
          }).replace(/[/:]/g, '-').replace(', ', '_').replace(/ /g, '');
          
          let safeDesc = (desc || 'Auto update')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
          if (safeDesc.length > 40) safeDesc = safeDesc.substring(0, 40);
          
          const filename = `backup_${dateStr}_${safeDesc}.json`;
          const filepath = path.join(merged.backupDir, filename);
          fs.writeFileSync(filepath, JSON.stringify(merged, null, 2), 'utf-8');

          // Keep only the latest 20 backup files
          const files = fs.readdirSync(merged.backupDir);
          const backupFiles = files
            .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
            .map(f => {
              const fp = path.join(merged.backupDir, f);
              try {
                const stat = fs.statSync(fp);
                return { name: f, path: fp, mtime: stat.mtimeMs };
              } catch (err) {
                return null;
              }
            })
            .filter(Boolean);
          
          if (backupFiles.length > 20) {
            backupFiles.sort((a, b) => b.mtime - a.mtime); // Newest first
            const toDelete = backupFiles.slice(20);
            for (const fileInfo of toDelete) {
              try {
                fs.unlinkSync(fileInfo.path);
              } catch (err) {
                console.error(`[ServiceManager] Failed to delete old backup: ${fileInfo.path}`, err);
              }
            }
          }
        } catch (e) {
          console.error('[ServiceManager] Auto backup error:', e);
        }
      }
      return true;
    } catch (e) {
      console.error('[ServiceManager] Failed to save data:', e);
      return false;
    }
  }

  generateServiceId(existingServices) {
    let id = Date.now();
    const used = new Set(existingServices.map(s => Number(s.id)));
    while (used.has(id)) {
      id += 1;
    }
    return id;
  }

  getLogs(id) {
    return this.processes[id]?.logs || [];
  }

  getRunningIds() {
    return Object.keys(this.processes).map(Number);
  }

  startService(service) {
    if (this.processes[service.id]) {
      return false;
    }

    const logs = [];
    this.processes[service.id] = { proc: null, logs };

    const parts = service.cmd.trim().split(/\s+/);
    let cmd = parts[0];
    const args = parts.slice(1);

    // Windows: npm/npx need .cmd extension
    if (['npm', 'npx', 'yarn', 'pnpm', 'node'].includes(cmd)) {
      cmd = cmd + '.cmd';
    }

    const rawDir = service.dir || process.env.USERPROFILE || 'C:\\';
    const cwd = rawDir.replace(/^~[/\\]?/, (process.env.USERPROFILE || 'C:\\Users\\user') + '\\');

    const sendLog = (type, text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const line = { time: new Date().toLocaleTimeString('vi-VN'), type, text: trimmed };
      logs.push(line);
      if (logs.length > 1000) logs.shift();

      this.emit('log', { id: service.id, line });

      // URL detection algorithms
      const localPatterns = [
        /(?:Local|localhost|127\.0\.0\.1)[:\s]+(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?)/i,
        /(https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)/i
      ];
      const networkPatterns = [
        /(?:Network|IP|LAN|On Your Network)[:\s]+(https?:\/\/(?:[\d]{1,3}\.){3}[\d]{1,3}(?::\d+)?)/i,
        /(https?:\/\/(?!localhost)(?!127\.0\.0\.1)(?:[\d]{1,3}\.){3}[\d]{1,3}(?::\d+)?)/i
      ];

      let detectedLocal = null;
      let detectedNetwork = null;

      for (const re of localPatterns) {
        const match = trimmed.match(re);
        if (match) {
          detectedLocal = match[1].replace('0.0.0.0', 'localhost');
          break;
        }
      }

      for (const re of networkPatterns) {
        const match = trimmed.match(re);
        if (match) {
          detectedNetwork = match[1];
          break;
        }
      }

      if (detectedLocal || detectedNetwork) {
        this.emit('url-detected', { 
          id: service.id, 
          local: detectedLocal, 
          network: detectedNetwork 
        });
      }
    };

    try {
      const proc = spawn(cmd, args, {
        cwd,
        shell: true,
        env: { ...process.env },
        windowsHide: true
      });

      this.processes[service.id].proc = proc;
      this.pids[service.id] = proc.pid;

      proc.stdout.setEncoding('utf8');
      proc.stderr.setEncoding('utf8');

      proc.stdout.on('data', d => d.split('\n').forEach(l => sendLog('plain', l)));
      proc.stderr.on('data', d => {
        d.split('\n').forEach(l => {
          const lo = l.toLowerCase();
          if (lo.includes('error') || lo.includes('fail')) sendLog('error', l);
          else if (lo.includes('warn')) sendLog('warn', l);
          else sendLog('info', l);
        });
      });

      proc.on('spawn', () => {
        sendLog('success', `✓ Đã khởi động (PID: ${proc.pid})`);
        this.emit('status-change', { id: service.id, status: 'running', pid: proc.pid });
      });

      proc.on('error', err => {
        sendLog('error', `Không thể khởi động: ${err.message}`);
        if (!this.isQuitting) {
          this.emit('status-change', { id: service.id, status: 'error' });
        }
        delete this.processes[service.id];
      });

      proc.on('close', code => {
        sendLog(code === 0 ? 'plain' : 'warn', `Tiến trình kết thúc (code: ${code})`);
        if (!this.isQuitting) {
          this.emit('status-change', { id: service.id, status: code === 0 ? 'stopped' : 'error' });
        }
        delete this.processes[service.id];
      });

      return true;
    } catch (err) {
      this.emit('log', { 
        id: service.id, 
        line: { time: new Date().toLocaleTimeString(), type: 'error', text: 'Lỗi: ' + err.message } 
      });
      this.emit('status-change', { id: service.id, status: 'error' });
      delete this.processes[service.id];
      return false;
    }
  }

  stopService(id) {
    return new Promise(async (resolve) => {
      const data = this.loadData();
      const service = data.services.find(x => x.id === id);

      const pid = this.pids[id];
      if (pid) {
        spawn('taskkill', ['/pid', pid.toString(), '/f', '/t'], { shell: true });
      }

      const url = service?.localUrl || service?.url;
      if (url) {
        const portMatch = url.match(/:(\d+)\/?$/);
        if (portMatch) {
          const port = portMatch[1];
          const findCmd = `netstat -ano | findstr :${port}`;
          const finder = spawn('cmd.exe', ['/c', findCmd], { shell: true });
          
          finder.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
              const parts = line.trim().split(/\s+/);
              if (parts.length > 4 && line.includes('LISTENING')) {
                const localAddress = parts[1]; // e.g. 127.0.0.1:3000 or [::]:3000
                const localPortMatch = localAddress.match(/:(\d+)$/);
                if (localPortMatch && localPortMatch[1] === port) {
                  const portPid = parts[parts.length - 1];
                  if (portPid && portPid !== '0') {
                    spawn('taskkill', ['/pid', portPid, '/f', '/t'], { shell: true });
                  }
                }
              }
            });
          });
        }
      }

      setTimeout(() => {
        const entry = this.processes[id];
        if (entry?.proc) {
          try { entry.proc.kill(); } catch(e) {}
        }
        delete this.processes[id];
        resolve();
      }, 1200);
    });
  }

  async restartService(service) {
    await this.stopService(service.id);
    return this.startService(service);
  }

  addService(serviceData) {
    const data = this.loadData();
    if (data.services.some(s => s.name === serviceData.name && s.project === serviceData.project)) {
      return null;
    }
    const newService = {
      id: this.generateServiceId(data.services),
      name: serviceData.name,
      project: serviceData.project,
      cmd: serviceData.cmd,
      dir: serviceData.dir,
      url: serviceData.localUrl || '',
      localUrl: serviceData.localUrl || '',
      networkUrl: '',
      status: 'stopped',
      color: '#CCFF00'
    };
    data.services.push(newService);
    this.saveData(data, `Add service ${serviceData.name}`);
    return newService;
  }

  async deleteService(id) {
    const data = this.loadData();
    const s = data.services.find(x => x.id === id);
    if (!s) return false;
    await this.stopService(id);
    data.services = data.services.filter(x => x.id !== id);
    this.saveData(data, `Delete service ${s.name}`);
    return true;
  }

  async shutdown() {
    this.isQuitting = true;
    const runningIds = Object.keys(this.processes).map(Number);
    for (const id of runningIds) {
      await this.stopService(id);
    }
  }
}

module.exports = ServiceManager;
