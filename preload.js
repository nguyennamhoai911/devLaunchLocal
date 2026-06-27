const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data, desc, skipBackup) => ipcRenderer.invoke('save-data', data, desc, skipBackup),
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
  removeAllListeners: (ch) => ipcRenderer.removeAllListeners(ch),

  // MCP APIs
  loadMcpConfig: () => ipcRenderer.invoke('load-mcp-config'),
  saveMcpConfig: (config) => ipcRenderer.invoke('save-mcp-config', config),
  onMcpStatusChange: (cb) => ipcRenderer.on('mcp-status-change', (_, d) => cb(d)),
  onServicesUpdated: (cb) => ipcRenderer.on('services-updated', (_, d) => cb(d)),
  onMcpApproveRequest: (cb) => ipcRenderer.on('mcp-approve-request', (_, d) => cb(d)),
  replyMcpApprove: (approvalId, approved) => ipcRenderer.invoke('mcp-approve-reply', { approvalId, approved })
});

