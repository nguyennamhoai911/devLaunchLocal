import React from 'react';
import clsx from 'clsx';
import {
    LayoutDashboard,
    Terminal,
    Settings,
    ChevronLeft,
    ChevronRight,
    FolderOpen,
    Activity,
    Zap,
} from 'lucide-react';
import useAppStore from '../store/appStore';

const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'logs', label: 'Log Viewer', icon: Terminal },
    { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
    const { activeView, setActiveView, sidebarCollapsed, setSidebarCollapsed, projects, pm2Processes } = useAppStore();

    const onlineCount = pm2Processes.filter((p) => p.status === 'online').length;

    return (
        <aside
            className={clsx(
                'flex flex-col bg-bg-secondary border-r border-border transition-all duration-300 flex-shrink-0',
                sidebarCollapsed ? 'w-16' : 'w-56'
            )}
        >
            {/* Nav items */}
            <nav className="flex flex-col gap-1 p-3 flex-1">
                {navItems.map(({ id, label, icon: Icon }) => {
                    const active = activeView === id;
                    return (
                        <button
                            key={id}
                            onClick={() => setActiveView(id)}
                            className={clsx(
                                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer text-left group relative',
                                active
                                    ? 'bg-accent/10 text-accent border border-accent/20'
                                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary border border-transparent'
                            )}
                        >
                            <Icon
                                size={18}
                                className={clsx(
                                    'flex-shrink-0 transition-colors',
                                    active ? 'text-accent' : 'text-text-muted group-hover:text-text-secondary'
                                )}
                            />
                            {!sidebarCollapsed && (
                                <span className="text-sm font-medium">{label}</span>
                            )}
                            {sidebarCollapsed && (
                                <div className="absolute left-full ml-3 px-2 py-1 bg-bg-tertiary border border-border rounded-lg text-xs text-text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                                    {label}
                                </div>
                            )}
                            {active && !sidebarCollapsed && (
                                <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-accent" style={{ boxShadow: '0 0 6px #00ff9c88' }} />
                            )}
                        </button>
                    );
                })}

                {/* Projects list */}
                {!sidebarCollapsed && (
                    <div className="mt-4">
                        <div className="flex items-center gap-2 px-3 mb-2">
                            <FolderOpen size={12} className="text-text-muted" />
                            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Projects</span>
                        </div>
                        {projects.map((project) => {
                            const projectProcesses = pm2Processes.filter(
                                (p) => project.processes.some((proc) => proc.name === p.name)
                            );
                            const onlineInProject = projectProcesses.filter((p) => p.status === 'online').length;
                            const total = project.processes.length;

                            return (
                                <button
                                    key={project.name}
                                    onClick={() => setActiveView('dashboard')}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-bg-tertiary text-left transition-colors group"
                                >
                                    <span
                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{
                                            background: project.color || '#00ff9c',
                                            boxShadow: onlineInProject > 0 ? `0 0 6px ${project.color || '#00ff9c'}88` : 'none',
                                        }}
                                    />
                                    <span className="text-xs text-text-secondary group-hover:text-text-primary flex-1 truncate">
                                        {project.displayName || project.name}
                                    </span>
                                    <span className="text-[10px] text-text-muted flex-shrink-0">
                                        {onlineInProject}/{total}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </nav>

            {/* Bottom stats + collapse */}
            <div className="p-3 border-t border-border">
                {!sidebarCollapsed && (
                    <div
                        className="flex items-center gap-2 px-3 py-2 mb-2 rounded-xl"
                        style={{ background: 'linear-gradient(135deg, rgba(0,255,156,0.05), rgba(0,255,156,0.02))' }}
                    >
                        <Activity size={14} className="text-accent" />
                        <div className="flex-1 min-w-0">
                            <div className="text-xs text-text-secondary">
                                <span className="text-accent font-semibold">{onlineCount}</span> online
                            </div>
                            <div className="text-[10px] text-text-muted">
                                {pm2Processes.length} total processes
                            </div>
                        </div>
                        <Zap size={12} className="text-accent opacity-60" />
                    </div>
                )}
                <button
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                >
                    {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    {!sidebarCollapsed && <span className="text-xs">Collapse</span>}
                </button>
            </div>
        </aside>
    );
}
