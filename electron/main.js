const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const pm2Service = require('./pm2Service');
const projectService = require('./projectService');
const { execFile, spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let logStreams = {};
let pollInterval = null;

const isDev = process.env.NODE_ENV !== 'production';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopPolling();
    pm2Service.disconnect();
  });
}

// ─── Poll PM2 Status ─────────────────────────────────────────────────────────
function startPolling() {
  pollInterval = setInterval(async () => {
    if (!mainWindow) return;
    try {
      const processes = await pm2Service.listProcesses();
      mainWindow.webContents.send('process:update', processes);
    } catch (err) {
      // Silently handle
    }
  }, 2000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

// PM2
ipcMain.handle('pm2:list', async () => {
  try {
    return await pm2Service.listProcesses();
  } catch (err) {
    console.error('pm2:list error', err);
    return [];
  }
});

ipcMain.handle('pm2:start', async (_, procConfig) => {
  try {
    return await pm2Service.startProcess(procConfig);
  } catch (err) {
    throw err;
  }
});

ipcMain.handle('pm2:stop', async (_, name) => {
  try {
    return await pm2Service.stopProcess(name);
  } catch (err) {
    throw err;
  }
});

ipcMain.handle('pm2:restart', async (_, name) => {
  try {
    return await pm2Service.restartProcess(name);
  } catch (err) {
    throw err;
  }
});

ipcMain.handle('pm2:delete', async (_, name) => {
  try {
    return await pm2Service.deleteProcess(name);
  } catch (err) {
    throw err;
  }
});

ipcMain.handle('pm2:flush', async (_, name) => {
  try {
    return await pm2Service.flushLogs(name);
  } catch (err) {
    throw err;
  }
});

// Projects
ipcMain.handle('projects:get', () => {
  return projectService.getProjects();
});

ipcMain.handle('projects:add', (_, project) => {
  return projectService.addProject(project);
});

ipcMain.handle('projects:update', (_, name, updates) => {
  return projectService.updateProject(name, updates);
});

ipcMain.handle('projects:delete', (_, name) => {
  return projectService.deleteProject(name);
});

// Logs streaming via pm2 logs command
ipcMain.handle('log:start', (_, name) => {
  if (logStreams[name]) {
    logStreams[name].kill();
    delete logStreams[name];
  }

  const pm2Bin = path.join(__dirname, '..', 'node_modules', '.bin', 'pm2');
  const child = spawn(pm2Bin, ['logs', name, '--lines', '50', '--raw'], {
    shell: true,
  });

  child.stdout.on('data', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('log:data', {
        name,
        text: data.toString(),
        type: 'stdout',
      });
    }
  });

  child.stderr.on('data', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('log:data', {
        name,
        text: data.toString(),
        type: 'stderr',
      });
    }
  });

  logStreams[name] = child;
  return { started: true };
});

ipcMain.handle('log:stop', (_, name) => {
  if (logStreams[name]) {
    logStreams[name].kill();
    delete logStreams[name];
  }
  return { stopped: true };
});

// App controls
ipcMain.handle('app:openBrowser', (_, url) => {
  shell.openExternal(url);
});

ipcMain.handle('app:openFolder', (_, folderPath) => {
  shell.openPath(folderPath);
});

ipcMain.handle('app:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('app:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('app:close', () => {
  app.quit();
});

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  startPolling();
});

app.on('window-all-closed', () => {
  stopPolling();
  Object.values(logStreams).forEach((s) => s.kill());
  pm2Service.disconnect();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
