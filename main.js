const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const readline = require('readline');
const ServiceManager = require('./service-manager');
const McpHandler = require('./mcp-handler');

// ── Check Stdio MCP Mode early ────────────────────────────────────────────────
const isMcpMode = process.argv.includes('--mcp') || process.argv.includes('mcp');

if (isMcpMode) {
  runMcpCli();
} else {
  runGuiMode();
}

// ── Stdio MCP / Proxy Runner ──────────────────────────────────────────────────
function isJsonRpcPayload(chunk) {
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
  try {
    const obj = JSON.parse(text.trim());
    return obj && obj.jsonrpc === '2.0';
  } catch {
    return false;
  }
}

function runMcpCli() {
  const http = require('http');
  process.stderr.write('[DEBUG] runMcpCli started\n');
  const userDataPath = app.getPath('userData');
  const serviceManager = new ServiceManager(userDataPath);
  const data = serviceManager.loadData();
  const port = data.mcpPort || 20263;

  process.stderr.write(`[DEBUG] Attempting proxy connection to 127.0.0.1:${port}...\n`);
  
  let fallbackTriggered = false;
  let sseRequest = null;

  const triggerFallback = () => {
    if (fallbackTriggered) return;
    fallbackTriggered = true;
    if (sseRequest) {
      try { sseRequest.destroy(); } catch (e) {}
    }
    process.stderr.write('[DEBUG] Proxy connection failed. Starting Standalone Headless Master Mode...\n');
    runStandaloneHeadless(serviceManager);
  };

  sseRequest = http.request({
    host: '127.0.0.1',
    port: port,
    path: '/sse',
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream'
    },
    timeout: 1000
  }, (res) => {
    if (res.statusCode !== 200) {
      triggerFallback();
      return;
    }

    // Disable timeout once connected to allow open-ended EventSource stream
    sseRequest.setTimeout(0);
    if (res.socket) {
      res.socket.setTimeout(0);
    }

    process.stderr.write('[DEBUG] Proxy connection established with GUI instance!\n');

    let buffer = '';
    let endpoint = null;

    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const parts = buffer.split('\n\n');
      buffer = parts.pop();

      for (const part of parts) {
        const lines = part.split('\n');
        let eventType = null;
        let dataVal = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            dataVal = line.substring(6).trim();
          }
        }
        if (eventType === 'endpoint' && dataVal) {
          endpoint = dataVal;
          setupStdinBridge(endpoint, port);
        } else if (eventType === 'message' && dataVal) {
          process.stdout.write(dataVal + '\n');
        }
      }
    });

    res.on('end', () => {
      process.exit(0);
    });

    res.on('error', () => {
      process.exit(1);
    });
  });

  sseRequest.on('timeout', () => {
    triggerFallback();
  });

  sseRequest.on('error', (err) => {
    process.stderr.write(`[DEBUG] TCP connection error: ${err.message}\n`);
    triggerFallback();
  });

  sseRequest.end();
}

function setupStdinBridge(endpoint, port) {
  const http = require('http');
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;

    const postReq = http.request({
      host: '127.0.0.1',
      port: port,
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(line)
      }
    }, (postRes) => {
      postRes.resume();
    });

    postReq.on('error', (err) => {
      process.stderr.write(`[MCP Proxy Error] Failed to POST message: ${err.message}\n`);
    });

    postReq.write(line);
    postReq.end();
  });
}

function runStandaloneHeadless(serviceManager) {
  process.stderr.write('[DEBUG] runStandaloneHeadless initialized\n');
  const mcpHandler = new McpHandler();

  // Stdio Purity Wrapper
  const originalStdoutWrite = process.stdout.write;
  process.stdout.write = (chunk, encoding, callback) => {
    if (isJsonRpcPayload(chunk)) {
      return originalStdoutWrite.call(process.stdout, chunk, encoding, callback);
    } else {
      return process.stderr.write(chunk, encoding, callback);
    }
  };

  // Listen to service log and status events
  serviceManager.on('log', ({ id, line }) => {
    process.stderr.write(`[Service log ${id}] [${line.type}] ${line.text}\n`);
  });

  serviceManager.on('status-change', ({ id, status, pid }) => {
    process.stderr.write(`[Service status ${id}] status: ${status} (PID: ${pid || 'N/A'})\n`);
    
    // Auto update status in services.json
    const data = serviceManager.loadData();
    const s = data.services.find(x => x.id === id);
    if (s) {
      s.status = status;
      serviceManager.saveData(data, `MCP Status Update: ${s.name} is ${status}`, true);
    }
  });

  serviceManager.on('url-detected', ({ id, local, network }) => {
    const data = serviceManager.loadData();
    const s = data.services.find(x => x.id === id);
    if (s) {
      if (local && !s.localUrl) s.localUrl = local;
      if (network && !s.networkUrl) s.networkUrl = network;
      if (local && !s.url) s.url = local;
      serviceManager.saveData(data, `URL Detected: ${s.name}`, true);
    }
  });

  // Headless context: requireApproval auto-denies mutating actions
  const context = {
    listServices: async () => {
      const data = serviceManager.loadData();
      return data.services;
    },
    startService: async (id) => {
      const data = serviceManager.loadData();
      if (data.mcpRequireApproval) {
        process.stderr.write(`[MCP Audit] start_service denied: requireApproval is enabled but running headless.\n`);
        return false;
      }
      const s = data.services.find(x => x.id === id);
      if (!s) return false;
      return serviceManager.startService(s);
    },
    stopService: async (id) => {
      const data = serviceManager.loadData();
      if (data.mcpRequireApproval) {
        process.stderr.write(`[MCP Audit] stop_service denied: requireApproval is enabled but running headless.\n`);
        return;
      }
      await serviceManager.stopService(id);
    },
    restartService: async (id) => {
      const data = serviceManager.loadData();
      if (data.mcpRequireApproval) {
        process.stderr.write(`[MCP Audit] restart_service denied: requireApproval is enabled but running headless.\n`);
        return false;
      }
      const s = data.services.find(x => x.id === id);
      if (!s) return false;
      await serviceManager.stopService(id);
      return serviceManager.startService(s);
    },
    getLogs: async (id) => {
      return serviceManager.getLogs(id);
    },
    addService: async (serviceData) => {
      const data = serviceManager.loadData();
      if (data.mcpRequireApproval) {
        process.stderr.write(`[MCP Audit] add_service denied: requireApproval is enabled but running headless.\n`);
        return null;
      }
      if (data.services.some(s => s.name === serviceData.name && s.project === serviceData.project)) {
        return null;
      }
      const newService = {
        id: serviceManager.generateServiceId(data.services),
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
      serviceManager.saveData(data, `Add service ${serviceData.name}`);
      return newService;
    },
    deleteService: async (id) => {
      const data = serviceManager.loadData();
      if (data.mcpRequireApproval) {
        process.stderr.write(`[MCP Audit] delete_service denied: requireApproval is enabled but running headless.\n`);
        return;
      }
      const s = data.services.find(x => x.id === id);
      if (!s) return;
      await serviceManager.stopService(id);
      data.services = data.services.filter(x => x.id !== id);
      serviceManager.saveData(data, `Delete service ${s.name}`);
    }
  };

  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    try {
      const req = JSON.parse(line);
      process.stderr.write(`[MCP Audit] Headless client invoked: ${req.method}\n`);
      const resp = await mcpHandler.handleMessage(req, context);
      if (resp) {
        originalStdoutWrite.call(process.stdout, JSON.stringify(resp) + '\n');
      }
    } catch (err) {
      process.stderr.write(`[MCP Error] Failed parsing JSON-RPC line: ${err.message}\n`);
    }
  });

  // Handle clean exits on SIGINT/SIGTERM
  const handleExit = async () => {
    process.stderr.write('[MCP Server] Shutting down headless services...\n');
    await serviceManager.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);
}

// ── GUI Runner Mode ───────────────────────────────────────────────────────────
let serviceManager;
let mainWindow;
let tray = null;
let tcpServer = null;
let mcpClients = [];
const mcpHandler = new McpHandler();
const pendingApprovals = new Map();
let nextApprovalId = 1;
function runGuiMode() {
  const isMultiInstance = process.argv.includes('--multi') || process.argv.includes('--multi-instance') || process.env.DEVLAUNCH_MULTI === '1';
  const gotTheLock = isMultiInstance ? true : app.requestSingleInstanceLock();

  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });

    app.whenReady().then(() => {
      serviceManager = new ServiceManager(app.getPath('userData'));

      // Event handlers to communicate with renderer process
      serviceManager.on('log', ({ id, line }) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('log-line', { id, line });
        }
      });

      serviceManager.on('status-change', ({ id, status, pid }) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('status-change', { id, status, pid });
        }
        const data = serviceManager.loadData();
        const s = data.services.find(x => x.id === id);
        if (s) {
          s.status = status;
          serviceManager.saveData(data, `Status Change: ${s.name} is ${status}`, true);
        }
      });

      serviceManager.on('url-detected', ({ id, local, network }) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('url-detected', { id, local, network });
        }
        const data = serviceManager.loadData();
        const s = data.services.find(x => x.id === id);
        if (s) {
          if (local && !s.localUrl) s.localUrl = local;
          if (network && !s.networkUrl) s.networkUrl = network;
          if (local && !s.url) s.url = local;
          serviceManager.saveData(data, `URL Detected: ${s.name}`, true);
        }
      });

      serviceManager.on('services-updated', (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('services-updated', data);
        }
      });

      createWindow();
      startMcpHttpServer();
    });

    app.on('window-all-closed', () => app.quit());
  }
}

// ── MCP HTTP + SSE Server (Streamable HTTP Transport) ──────────────────────────
const http = require('http');

let sseServer = null;
let sseSessions = new Map();

function startMcpHttpServer() {
  const data = serviceManager.loadData();
  if (!data.mcpEnabled) {
    updateMcpStatusFrontend();
    return;
  }

  const port = data.mcpPort || 20263;
  sseServer = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(200, headers);
      res.end();
      return;
    }

    if (pathname === '/sse' && req.method === 'GET') {
      const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      
      res.writeHead(200, {
        ...headers,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      res.write(': keepalive\n\n');
      res.write(`event: endpoint\ndata: /message?sessionId=${sessionId}\n\n`);

      sseSessions.set(sessionId, res);
      updateMcpStatusFrontend();
      console.error(`[MCP Audit] SSE connection established: session ${sessionId} (IP: ${req.socket.remoteAddress})`);

      req.on('close', () => {
        sseSessions.delete(sessionId);
        updateMcpStatusFrontend();
        console.error(`[MCP Audit] SSE connection closed: session ${sessionId}`);
      });
      return;
    }

    if (pathname === '/message' && req.method === 'POST') {
      const sessionId = parsedUrl.searchParams.get('sessionId');
      const clientRes = sseSessions.get(sessionId);

      if (!clientRes) {
        res.writeHead(400, { 'Content-Type': 'text/plain', ...headers });
        res.end('Session not found or expired');
        return;
      }

      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const context = createMcpContext(req.socket.remoteAddress);
          const resp = await mcpHandler.handleMessage(payload, context);
          if (resp) {
            clientRes.write(`event: message\ndata: ${JSON.stringify(resp)}\n\n`);
          }
          res.writeHead(200, { 'Content-Type': 'text/plain', ...headers });
          res.end('OK');
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'text/plain', ...headers });
          res.end(`Invalid JSON payload: ${err.message}`);
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain', ...headers });
    res.end('Not Found');
  });

  sseServer.listen(port, '127.0.0.1', () => {
    console.error(`[MCP SSE Server] Listening on http://127.0.0.1:${port}/sse`);
    updateMcpStatusFrontend();
  });

  sseServer.on('error', (err) => {
    console.error(`[MCP SSE Server] HTTP Error: ${err.message}`);
    updateMcpStatusFrontend();
  });
}

function stopMcpHttpServer() {
  if (sseServer) {
    sseServer.close();
    sseServer = null;
  }
  for (const [sessionId, res] of sseSessions.entries()) {
    try { res.end(); } catch (e) {}
  }
  sseSessions.clear();
  updateMcpStatusFrontend();
}

function updateMcpStatusFrontend() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const data = serviceManager.loadData();
    mainWindow.webContents.send('mcp-status-change', {
      enabled: data.mcpEnabled,
      port: data.mcpPort || 20263,
      clientsCount: sseSessions.size
    });
  }
}

function createMcpContext(clientName) {
  return {
    listServices: async () => {
      const data = serviceManager.loadData();
      return data.services;
    },
    startService: async (id) => {
      const data = serviceManager.loadData();
      const s = data.services.find(x => x.id === id);
      if (!s) return false;
      console.error(`[MCP Audit] Client ${clientName} starting service: ${s.name}`);
      return serviceManager.startService(s);
    },
    stopService: async (id) => {
      const data = serviceManager.loadData();
      const s = data.services.find(x => x.id === id);
      if (!s) return;
      console.error(`[MCP Audit] Client ${clientName} stopping service: ${s.name}`);
      await serviceManager.stopService(id);
    },
    restartService: async (id) => {
      const data = serviceManager.loadData();
      const s = data.services.find(x => x.id === id);
      if (!s) return false;
      console.error(`[MCP Audit] Client ${clientName} restarting service: ${s.name}`);
      return serviceManager.restartService(s);
    },
    getLogs: async (id) => {
      return serviceManager.getLogs(id);
    },
    addService: async (serviceData) => {
      console.error(`[MCP Audit] Client ${clientName} adding service: ${serviceData.name}`);
      return serviceManager.addService(serviceData);
    },
    deleteService: async (id) => {
      const data = serviceManager.loadData();
      const s = data.services.find(x => x.id === id);
      if (!s) return;
      console.error(`[MCP Audit] Client ${clientName} deleting service: ${s.name}`);
      await serviceManager.deleteService(id);
    }
  };
}

// ── Window and Tray Management ────────────────────────────────────────────────
function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#202025',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#28272e',
      symbolColor: '#78787B',
      height: 44
    },
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip('DevLaunch');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show DevLaunch', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]));
  tray.on('click', () => {
    if (mainWindow?.isVisible()) { mainWindow.focus(); } else { mainWindow?.show(); }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('close', async (e) => {
    const runningIds = serviceManager.getRunningIds();
    if (runningIds.length > 0) {
      e.preventDefault();
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        buttons: ['Dừng tất cả & Thoát', 'Huỷ'],
        title: 'Cảnh báo',
        message: `Vẫn còn ${runningIds.length} service đang chạy. Bạn có muốn dừng tất cả và thoát không?`
      });

      if (choice === 0) {
        stopMcpHttpServer();
        await serviceManager.shutdown();
        app.exit();
      }
    } else {
      stopMcpHttpServer();
      await serviceManager.shutdown();
    }
  });
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('load-data', () => serviceManager.loadData());
ipcMain.handle('save-data', (_, data, desc, skipBackup) => { serviceManager.saveData(data, desc, skipBackup); return true; });
ipcMain.handle('start-service', (_, s) => { serviceManager.startService(s); return { ok: true }; });
ipcMain.handle('stop-service', async (_, id) => {
  await serviceManager.stopService(id);
  return { ok: true };
});
ipcMain.handle('restart-service', async (_, s) => {
  await serviceManager.stopService(s.id);
  serviceManager.startService(s);
  return { ok: true };
});
ipcMain.handle('get-logs', (_, id) => serviceManager.getLogs(id));
ipcMain.handle('get-running-ids', () => serviceManager.getRunningIds());
ipcMain.handle('send-input', (_, { id, text }) => {
  const entry = serviceManager.processes[id];
  if (entry?.proc && entry.proc.stdin) {
    entry.proc.stdin.write(text + '\n');
    return { ok: true };
  }
  return { ok: false };
});
ipcMain.handle('open-url', (_, url) => shell.openExternal(url));
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
ipcMain.handle('open-antigravity', async (_, dir) => {
  if (!dir) return;
  const cmd = process.platform === 'win32' ? 'cmd.exe' : 'sh';
  const args = process.platform === 'win32' ? ['/c', `antigravity "${dir}" || code "${dir}"`] : ['-c', `antigravity "${dir}" || code "${dir}"`];
  spawn(cmd, args, { shell: true });
});

// MCP GUI configuration APIs
ipcMain.handle('load-mcp-config', () => {
  const data = serviceManager.loadData();
  return {
    enabled: data.mcpEnabled,
    port: data.mcpPort || 20263,
    clientsCount: sseSessions.size
  };
});

ipcMain.handle('save-mcp-config', (_, { enabled, port }) => {
  const data = serviceManager.loadData();
  const mcpChanged = data.mcpEnabled !== enabled || data.mcpPort !== port;

  data.mcpEnabled = enabled;
  data.mcpPort = Number(port) || 20263;

  serviceManager.saveData(data, 'Save MCP Config');

  if (mcpChanged) {
    stopMcpHttpServer();
    if (enabled) {
      startMcpHttpServer();
    }
  } else {
    updateMcpStatusFrontend();
  }
  return { ok: true };
});
