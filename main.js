const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// ── Data store ────────────────────────────────────────────────────────────────
const DATA_FILE = path.join(app.getPath('userData'), 'services.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {}
  return { services: [] };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ── Process management ────────────────────────────────────────────────────────
const processes = {}; // serviceId -> { proc, logs[] }
const pids = {};      // serviceId -> lastKnownPid

function startProcess(win, service) {
  if (processes[service.id]) return;

  const logs = [];
  processes[service.id] = { proc: null, logs };

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
    if (win && !win.isDestroyed()) win.webContents.send('log-line', { id: service.id, line });

    // ── Thuật toán nhận diện URL tối ưu ──────────────────────────────────────
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

    // Tìm Local URL
    for (const re of localPatterns) {
      const match = trimmed.match(re);
      if (match) {
        detectedLocal = match[1].replace('0.0.0.0', 'localhost');
        break;
      }
    }

    // Tìm Network URL
    for (const re of networkPatterns) {
      const match = trimmed.match(re);
      if (match) {
        detectedNetwork = match[1];
        break;
      }
    }

    if ((detectedLocal || detectedNetwork) && win && !win.isDestroyed()) {
      win.webContents.send('url-detected', { 
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

    processes[service.id].proc = proc;
    pids[service.id] = proc.pid;

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
      if (win && !win.isDestroyed()) win.webContents.send('status-change', { id: service.id, status: 'running', pid: proc.pid });
    });

    proc.on('error', err => {
      sendLog('error', `Không thể khởi động: ${err.message}`);
      if (win && !win.isDestroyed()) win.webContents.send('status-change', { id: service.id, status: 'error' });
      delete processes[service.id];
    });

    proc.on('close', code => {
      sendLog(code === 0 ? 'plain' : 'warn', `Tiến trình kết thúc (code: ${code})`);
      if (win && !win.isDestroyed()) win.webContents.send('status-change', { id: service.id, status: code === 0 ? 'stopped' : 'error' });
      delete processes[service.id];
    });

  } catch (err) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('log-line', { id: service.id, line: { time: new Date().toLocaleTimeString(), type: 'error', text: 'Lỗi: ' + err.message } });
      win.webContents.send('status-change', { id: service.id, status: 'error' });
    }
    delete processes[service.id];
  }
}

// Dừng tiến trình một cách triệt để (bao gồm cả tiến trình con và chiếm dụng port)
function stopProcess(id, service = null) {
  return new Promise(async (resolve) => {
    // 1. Thử giết theo PID tree (kể cả khi shell đã đóng)
    const pid = pids[id];
    if (pid) {
      spawn('taskkill', ['/pid', pid.toString(), '/f', '/t'], { shell: true });
    }

    // 2. Thử giết theo Port (nếu có thông tin URL)
    const url = service?.localUrl || service?.url;
    if (url) {
      const portMatch = url.match(/:(\d+)\/?$/);
      if (portMatch) {
        const port = portMatch[1];
        // Tìm PID đang chiếm port này trên Windows
        const findCmd = `netstat -ano | findstr :${port}`;
        const finder = spawn('cmd.exe', ['/c', findCmd], { shell: true });
        
        finder.stdout.on('data', (data) => {
          const lines = data.toString().split('\n');
          lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length > 4 && line.includes('LISTENING')) {
              const portPid = parts[parts.length - 1];
              if (portPid && portPid !== '0') {
                spawn('taskkill', ['/pid', portPid, '/f', '/t'], { shell: true });
              }
            }
          });
        });
      }
    }

    // Đợi 1 giây để các lệnh kill thực thi và OS giải phóng tài nguyên
    setTimeout(() => {
      const entry = processes[id];
      if (entry?.proc) {
        try { entry.proc.kill(); } catch(e) {}
      }
      delete processes[id];
      // Không xóa pids[id] ngay để nhỡ có lệnh stop gọi lại
      resolve();
    }, 1200);
  });
}

// ── Window ────────────────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#1e293b',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1e293b',
      symbolColor: '#cbd5e1',
      height: 44
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('close', async (e) => {
    const runningIds = Object.keys(processes);
    if (runningIds.length > 0) {
      e.preventDefault();
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        buttons: ['Dừng tất cả & Thoát', 'Huỷ'],
        title: 'Cảnh báo',
        message: `Vẫn còn ${runningIds.length} service đang chạy. Bạn có muốn dừng tất cả và thoát không?`
      });

      if (choice === 0) {
        // User chọn thoát: Dừng tất cả rồi mới quit
        for (const id of runningIds) {
          await stopProcess(id);
        }
        app.exit(); // Thoát ép buộc sau khi đã clean up
      }
    }
  });
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('load-data', () => loadData());
ipcMain.handle('save-data', (_, data) => { saveData(data); return true; });
ipcMain.handle('start-service', (_, s) => { startProcess(mainWindow, s); return { ok: true }; });
ipcMain.handle('stop-service', async (_, id) => {
  const data = loadData();
  const s = data.services.find(x => x.id === id);
  await stopProcess(id, s);
  return { ok: true };
});

ipcMain.handle('restart-service', async (_, s) => {
  await stopProcess(s.id, s);
  // Khởi động lại
  startProcess(mainWindow, s);
  return { ok: true };
});
ipcMain.handle('get-logs', (_, id) => processes[id]?.logs || []);
ipcMain.handle('get-running-ids', () => Object.keys(processes).map(Number));
ipcMain.handle('send-input', (_, { id, text }) => {
  const entry = processes[id];
  if (entry?.proc && entry.proc.stdin) {
    entry.proc.stdin.write(text + '\n');
    return { ok: true };
  }
  return { ok: false };
});
ipcMain.handle('open-url', (_, url) => shell.openExternal(url));
ipcMain.handle('open-antigravity', async (_, dir) => {
  if (!dir) return;
  // Thử mở bằng lệnh 'antigravity', nếu không có thì fallback sang 'code' (VS Code)
  const cmd = process.platform === 'win32' ? 'cmd.exe' : 'sh';
  const args = process.platform === 'win32' ? ['/c', `antigravity "${dir}" || code "${dir}"`] : ['-c', `antigravity "${dir}" || code "${dir}"`];
  
  spawn(cmd, args, { shell: true });
});
ipcMain.handle('open-folder', (_, dir) => {
  if (dir) shell.openPath(dir.replace(/^~[/\\]?/, (process.env.USERPROFILE || '') + '\\'));
});
ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('export-backup', async (_, data) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    title: 'Lưu file backup',
    defaultPath: `devlaunch-backup-${new Date().toISOString().slice(0,10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (!r.canceled && r.filePath) { fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2)); return { ok: true }; }
  return { ok: false };
});
ipcMain.handle('import-backup', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Mở file backup', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile']
  });
  if (!r.canceled && r.filePaths.length > 0) return JSON.parse(fs.readFileSync(r.filePaths[0], 'utf-8'));
  return null;
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
