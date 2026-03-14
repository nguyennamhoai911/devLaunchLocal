import { create } from 'zustand';

const isElectron = typeof window !== 'undefined' && window.electron;

const useAppStore = create((set, get) => ({
  // ─── State ─────────────────────────────────────────────────────────────────
  projects: [],
  pm2Processes: [],
  selectedProcesses: new Set(),
  activeView: 'dashboard', // 'dashboard' | 'logs' | 'settings'
  activeLogProcess: null,
  logs: {},   // { [processName]: [{ text, type, timestamp }] }
  isLoading: false,
  isRefreshing: false,
  notifications: [],
  sidebarCollapsed: false,
  searchQuery: '',

  // ─── Actions ───────────────────────────────────────────────────────────────
  setActiveView: (view) => set({ activeView: view }),
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  // ─── Load Projects Config ───────────────────────────────────────────────────
  loadProjects: async () => {
    if (!isElectron) {
      // Demo mode
      set({ projects: getDemoProjects() });
      return;
    }
    try {
      const projects = await window.electron.getProjects();
      set({ projects });
    } catch (err) {
      console.error('Failed to load projects:', err);
      get().addNotification('error', 'Failed to load project config');
    }
  },

  // ─── Load PM2 Processes ────────────────────────────────────────────────────
  loadProcesses: async () => {
    set({ isRefreshing: true });
    if (!isElectron) {
      set({ pm2Processes: getDemoProcesses(), isRefreshing: false });
      return;
    }
    try {
      const processes = await window.electron.listProcesses();
      set({ pm2Processes: processes, isRefreshing: false });
    } catch (err) {
      console.error('Failed to load processes:', err);
      set({ isRefreshing: false });
    }
  },

  // ─── Update from polling ───────────────────────────────────────────────────
  updateProcesses: (processes) => set({ pm2Processes: processes }),

  // ─── Process Actions ───────────────────────────────────────────────────────
  startProcess: async (procConfig) => {
    const { addNotification } = get();
    if (!isElectron) {
      addNotification('success', `Started: ${procConfig.name}`);
      return;
    }
    try {
      await window.electron.startProcess(procConfig);
      addNotification('success', `✓ Started: ${procConfig.displayName || procConfig.name}`);
      await get().loadProcesses();
    } catch (err) {
      addNotification('error', `Failed to start ${procConfig.name}: ${err.message}`);
    }
  },

  stopProcess: async (name, displayName) => {
    const { addNotification } = get();
    if (!isElectron) {
      addNotification('info', `Stopped: ${displayName || name}`);
      return;
    }
    try {
      await window.electron.stopProcess(name);
      addNotification('info', `⬛ Stopped: ${displayName || name}`);
      await get().loadProcesses();
    } catch (err) {
      addNotification('error', `Failed to stop ${name}: ${err.message}`);
    }
  },

  restartProcess: async (name, displayName) => {
    const { addNotification } = get();
    if (!isElectron) {
      addNotification('success', `Restarted: ${displayName || name}`);
      return;
    }
    try {
      await window.electron.restartProcess(name);
      addNotification('success', `↻ Restarted: ${displayName || name}`);
      await get().loadProcesses();
    } catch (err) {
      addNotification('error', `Failed to restart ${name}: ${err.message}`);
    }
  },

  deleteProcess: async (name) => {
    const { addNotification } = get();
    if (!isElectron) return;
    try {
      await window.electron.deleteProcess(name);
      addNotification('info', `Deleted: ${name}`);
      await get().loadProcesses();
    } catch (err) {
      addNotification('error', `Failed to delete ${name}: ${err.message}`);
    }
  },

  // ─── Bulk Actions ──────────────────────────────────────────────────────────
  startProject: async (project) => {
    const { startProcess, addNotification } = get();
    addNotification('info', `Starting all ${project.displayName || project.name} services...`);
    for (const proc of project.processes) {
      await startProcess(proc);
    }
  },

  stopProject: async (project) => {
    const { stopProcess, addNotification } = get();
    addNotification('info', `Stopping all ${project.displayName || project.name} services...`);
    for (const proc of project.processes) {
      await stopProcess(proc.name, proc.displayName);
    }
  },

  restartProject: async (project) => {
    const { restartProcess, addNotification } = get();
    addNotification('info', `Restarting all ${project.displayName || project.name} services...`);
    for (const proc of project.processes) {
      await restartProcess(proc.name, proc.displayName);
    }
  },

  // ─── Multi-select ──────────────────────────────────────────────────────────
  toggleSelectProcess: (name) => {
    const selected = new Set(get().selectedProcesses);
    if (selected.has(name)) {
      selected.delete(name);
    } else {
      selected.add(name);
    }
    set({ selectedProcesses: selected });
  },

  clearSelection: () => set({ selectedProcesses: new Set() }),

  restartSelected: async () => {
    const { selectedProcesses, restartProcess, clearSelection } = get();
    for (const name of selectedProcesses) {
      await restartProcess(name, name);
    }
    clearSelection();
  },

  stopSelected: async () => {
    const { selectedProcesses, stopProcess, clearSelection } = get();
    for (const name of selectedProcesses) {
      await stopProcess(name, name);
    }
    clearSelection();
  },

  // ─── Logs ──────────────────────────────────────────────────────────────────
  openLog: async (processName) => {
    const { activeLogProcess, closeLog } = get();
    if (activeLogProcess && activeLogProcess !== processName) {
      await closeLog(activeLogProcess);
    }

    set({
      activeLogProcess: processName,
      activeView: 'logs',
      logs: { ...get().logs, [processName]: [] },
    });

    if (isElectron) {
      await window.electron.startLogStream(processName);
    }
  },

  closeLog: async (processName) => {
    if (isElectron) {
      await window.electron.stopLogStream(processName);
    }
    set({ activeLogProcess: null, activeView: 'dashboard' });
  },

  appendLog: (data) => {
    const { name, text, type } = data;
    const existing = get().logs[name] || [];
    const lines = text.split('\n').filter((l) => l.trim());
    const newLines = lines.map((text) => ({
      text,
      type,
      timestamp: Date.now(),
    }));
    // Keep last 500 lines
    const all = [...existing, ...newLines].slice(-500);
    set({ logs: { ...get().logs, [name]: all } });
  },

  clearLogs: (name) => {
    set({ logs: { ...get().logs, [name]: [] } });
  },

  // ─── Notifications ─────────────────────────────────────────────────────────
  addNotification: (type, message) => {
    const id = Date.now() + Math.random();
    const notification = { id, type, message, timestamp: Date.now() };
    set({ notifications: [...get().notifications, notification] });
    setTimeout(() => {
      set({ notifications: get().notifications.filter((n) => n.id !== id) });
    }, 4000);
  },

  dismissNotification: (id) => {
    set({ notifications: get().notifications.filter((n) => n.id !== id) });
  },

  // ─── Helper: get PM2 process by name ───────────────────────────────────────
  getProcessStatus: (name) => {
    const proc = get().pm2Processes.find((p) => p.name === name);
    return proc?.status || 'stopped';
  },

  getProcessInfo: (name) => {
    return get().pm2Processes.find((p) => p.name === name) || null;
  },
}));

// ─── Demo Data (when not in Electron) ─────────────────────────────────────────
function getDemoProjects() {
  return [
    {
      name: 'reusebase',
      displayName: 'Reusebase',
      color: '#00ff9c',
      processes: [
        { name: 'reusebase-backend', displayName: 'Backend', cwd: 'C:/code/reusebase/backend', script: 'bun', args: 'run dev', port: 3000 },
        { name: 'reusebase-admin', displayName: 'Admin', cwd: 'C:/code/reusebase/admin', script: 'npm', args: 'run dev', port: 3001 },
        { name: 'reusebase-user', displayName: 'User App', cwd: 'C:/code/reusebase/user', script: 'npm', args: 'run dev', port: 3002 },
      ],
    },
    {
      name: 'worddd',
      displayName: 'Worddd',
      color: '#a855f7',
      processes: [
        { name: 'worddd-backend', displayName: 'Backend', cwd: 'C:/code/worddd/backend', script: 'npm', args: 'run start:dev', port: 4000 },
        { name: 'worddd-frontend', displayName: 'Frontend', cwd: 'C:/code/worddd/frontend', script: 'npm', args: 'run dev', port: 4001 },
        { name: 'worddd-admin', displayName: 'Admin', cwd: 'C:/code/worddd/admin', script: 'npm', args: 'run dev', port: 4002 },
      ],
    },
  ];
}

function getDemoProcesses() {
  return [
    { name: 'reusebase-backend', status: 'online', cpu: 2.1, memory: 85234688, uptime: 3600000, restarts: 0 },
    { name: 'reusebase-admin', status: 'online', cpu: 0.5, memory: 52428800, uptime: 3500000, restarts: 1 },
    { name: 'reusebase-user', status: 'stopped', cpu: 0, memory: 0, uptime: 0, restarts: 0 },
    { name: 'worddd-backend', status: 'online', cpu: 4.2, memory: 134217728, uptime: 7200000, restarts: 0 },
    { name: 'worddd-frontend', status: 'starting', cpu: 0.8, memory: 62914560, uptime: 30000, restarts: 0 },
    { name: 'worddd-admin', status: 'online', cpu: 0.3, memory: 41943040, uptime: 7100000, restarts: 2 },
  ];
}

export default useAppStore;
