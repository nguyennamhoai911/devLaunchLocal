const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  startService: (service) => ipcRenderer.invoke('start-service', service),
  stopService: (id) => ipcRenderer.invoke('stop-service', id),
  restartService: (service) => ipcRenderer.invoke('restart-service', service),
  getLogs: (id) => ipcRenderer.invoke('get-logs', id),
  getRunningIds: () => ipcRenderer.invoke('get-running-ids'),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  openFolder: (dir) => ipcRenderer.invoke('open-folder', dir),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  exportBackup: (data) => ipcRenderer.invoke('export-backup', data),
  importBackup: () => ipcRenderer.invoke('import-backup'),
  sendInput: (id, text) => ipcRenderer.invoke('send-input', { id, text }),
  openAntigravity: (path) => ipcRenderer.invoke('open-antigravity', path),
  onLogLine: (cb) => ipcRenderer.on('log-line', (_, d) => cb(d)),
  onStatusChange: (cb) => ipcRenderer.on('status-change', (_, d) => cb(d)),
  onUrlDetected: (cb) => ipcRenderer.on('url-detected', (_, d) => cb(d)),
  removeAllListeners: (ch) => ipcRenderer.removeAllListeners(ch)
});
