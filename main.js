const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage } = require('electron');
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
  process.stderr.write('[DEBUG] runMcpCli started\n');
  const userDataPath = app.getPath('userData');
  const serviceManager = new ServiceManager(userDataPath);
  const data = serviceManager.loadData();
  const port = data.mcpPort || 20263;

  process.stderr.write(`[DEBUG] Attempting proxy connection to 127.0.0.1:${port}...\n`);
  
  let fallbackTriggered = false;
  const triggerFallback = () => {
    if (fallbackTriggered) return;
    fallbackTriggered = true;
    client.destroy();
    process.stderr.write('[DEBUG] Proxy connection failed. Starting Standalone Headless Master Mode...\n');
    runStandaloneHeadless(serviceManager);
  };

  const client = net.createConnection({ port, host: '127.0.0.1' });
  client.setTimeout(500); // 500ms timeout to detect GUI presence quickly

  client.on('connect', () => {
    process.stderr.write('[DEBUG] Proxy connection established with GUI instance!\n');
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', (line) => {
      client.write(line + '\n');
    });

    client.on('data', (chunk) => {
      process.stdout.write(chunk);
    });

    client.on('end', () => {
      process.exit(0);
    });

    client.on('error', () => {
      process.exit(1);
    });
  });

  client.on('timeout', () => {
    triggerFallback();
  });

  client.on('error', (err) => {
    process.stderr.write(`[DEBUG] TCP connection error: ${err.message}\n`);
    triggerFallback();
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
  const gotTheLock = app.requestSingleInstanceLock();

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
      startMcpTcpServer();
    });

    app.on('window-all-closed', () => app.quit());
  }
}

// ── MCP TCP Server (Internal Bridge) ──────────────────────────────────────────
function startMcpTcpServer() {
  const data = serviceManager.loadData();
  if (!data.mcpEnabled) {
    updateMcpStatusFrontend();
    return;
  }

  const port = data.mcpPort || 20263;
  tcpServer = net.createServer((socket) => {
    mcpClients.push(socket);
    updateMcpStatusFrontend();

    const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    console.error(`[MCP Audit] Client connected from ${clientAddr}`);

    const rl = readline.createInterface({ input: socket });
    rl.on('line', async (line) => {
      try {
        const req = JSON.parse(line);
        const context = createMcpContext(clientAddr);
        const resp = await mcpHandler.handleMessage(req, context);
        if (resp) {
          socket.write(JSON.stringify(resp) + '\n');
        }
      } catch (err) {
        console.error(`[MCP Error] Failed processing TCP message: ${err.message}`);
      }
    });

    socket.on('error', () => {});
    socket.on('close', () => {
      mcpClients = mcpClients.filter(c => c !== socket);
      updateMcpStatusFrontend();
      console.error(`[MCP Audit] Client disconnected: ${clientAddr}`);
    });
  });

  tcpServer.listen(port, '127.0.0.1', () => {
    console.error(`[MCP Server] Listening on 127.0.0.1:${port}`);
    updateMcpStatusFrontend();
  });

  tcpServer.on('error', (err) => {
    console.error(`[MCP Server] TCP Error: ${err.message}`);
    updateMcpStatusFrontend();
  });
}

function stopMcpTcpServer() {
  if (tcpServer) {
    tcpServer.close();
    tcpServer = null;
  }
  mcpClients.forEach(c => c.destroy());
  mcpClients = [];
  updateMcpStatusFrontend();
}

function updateMcpStatusFrontend() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const data = serviceManager.loadData();
    mainWindow.webContents.send('mcp-status-change', {
      enabled: data.mcpEnabled,
      port: data.mcpPort || 20263,
      requireApproval: data.mcpRequireApproval,
      clientsCount: mcpClients.length
    });
  }
}

// ── MCP Approval Flow ─────────────────────────────────────────────────────────
function requestApproval(clientName, action, targetName) {
  const data = serviceManager.loadData();
  if (!data.mcpRequireApproval) {
    return Promise.resolve(true);
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    return Promise.resolve(false);
  }

  const approvalId = nextApprovalId++;
  return new Promise((resolve) => {
    console.error(`[MCP Audit] Client ${clientName} requested sensitive action: ${action} on ${targetName}. Prompting user...`);
    mainWindow.webContents.send('mcp-approve-request', {
      approvalId,
      client: clientName,
      action,
      target: targetName
    });

    const timer = setTimeout(() => {
      if (pendingApprovals.has(approvalId)) {
        pendingApprovals.delete(approvalId);
        console.error(`[MCP Audit] Approval ID ${approvalId} timed out. Request denied automatically.`);
        resolve(false);
      }
    }, 60000);

    pendingApprovals.set(approvalId, { resolve, timer });
  });
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
      const approved = await requestApproval(clientName, 'Start Service', s.name);
      if (!approved) return false;
      return serviceManager.startService(s);
    },
    stopService: async (id) => {
      const data = serviceManager.loadData();
      const s = data.services.find(x => x.id === id);
      if (!s) return;
      const approved = await requestApproval(clientName, 'Stop Service', s.name);
      if (!approved) return;
      await serviceManager.stopService(id);
    },
    restartService: async (id) => {
      const data = serviceManager.loadData();
      const s = data.services.find(x => x.id === id);
      if (!s) return false;
      const approved = await requestApproval(clientName, 'Restart Service', s.name);
      if (!approved) return false;
      await serviceManager.stopService(id);
      return serviceManager.startService(s);
    },
    getLogs: async (id) => {
      return serviceManager.getLogs(id);
    },
    addService: async (serviceData) => {
      const data = serviceManager.loadData();
      const approved = await requestApproval(clientName, 'Add Service', serviceData.name);
      if (!approved) return null;

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
      const s = data.services.find(x => x.id === id);
      if (!s) return;
      const approved = await requestApproval(clientName, 'Delete Service', s.name);
      if (!approved) return;

      await serviceManager.stopService(id);
      data.services = data.services.filter(x => x.id !== id);
      serviceManager.saveData(data, `Delete service ${s.name}`);
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
        stopMcpTcpServer();
        await serviceManager.shutdown();
        app.exit();
      }
    } else {
      stopMcpTcpServer();
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
    requireApproval: data.mcpRequireApproval,
    clientsCount: mcpClients.length
  };
});

ipcMain.handle('save-mcp-config', (_, { enabled, port, requireApproval }) => {
  const data = serviceManager.loadData();
  const mcpChanged = data.mcpEnabled !== enabled || data.mcpPort !== port;

  data.mcpEnabled = enabled;
  data.mcpPort = Number(port) || 20263;
  data.mcpRequireApproval = requireApproval;

  serviceManager.saveData(data, 'Save MCP Config');

  if (mcpChanged) {
    stopMcpTcpServer();
    if (enabled) {
      startMcpTcpServer();
    }
  } else {
    updateMcpStatusFrontend();
  }
  return { ok: true };
});

ipcMain.handle('mcp-approve-reply', (_, { approvalId, approved }) => {
  const pending = pendingApprovals.get(approvalId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingApprovals.delete(approvalId);
    pending.resolve(approved);
  }
  return { ok: true };
});
