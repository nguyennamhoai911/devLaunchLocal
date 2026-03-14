const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // PM2 Process Management
  listProcesses: () => ipcRenderer.invoke('pm2:list'),
  startProcess: (procConfig) => ipcRenderer.invoke('pm2:start', procConfig),
  stopProcess: (name) => ipcRenderer.invoke('pm2:stop', name),
  restartProcess: (name) => ipcRenderer.invoke('pm2:restart', name),
  deleteProcess: (name) => ipcRenderer.invoke('pm2:delete', name),
  flushLogs: (name) => ipcRenderer.invoke('pm2:flush', name),

  // Project Config Management
  getProjects: () => ipcRenderer.invoke('projects:get'),
  addProject: (project) => ipcRenderer.invoke('projects:add', project),
  updateProject: (name, updates) => ipcRenderer.invoke('projects:update', name, updates),
  deleteProject: (name) => ipcRenderer.invoke('projects:delete', name),

  // Logs streaming
  onLogData: (callback) => {
    ipcRenderer.on('log:data', (_, data) => callback(data));
  },
  startLogStream: (name) => ipcRenderer.invoke('log:start', name),
  stopLogStream: (name) => ipcRenderer.invoke('log:stop', name),

  // App controls
  openInBrowser: (url) => ipcRenderer.invoke('app:openBrowser', url),
  openFolder: (path) => ipcRenderer.invoke('app:openFolder', path),
  minimizeWindow: () => ipcRenderer.invoke('app:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('app:maximize'),
  closeWindow: () => ipcRenderer.invoke('app:close'),

  // Event listeners
  onProcessUpdate: (callback) => {
    ipcRenderer.on('process:update', (_, data) => callback(data));
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
