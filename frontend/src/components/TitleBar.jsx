import React from 'react';
import { Minus, Square, X, Cpu, Activity } from 'lucide-react';
import useAppStore from '../store/appStore';

const isElectron = typeof window !== 'undefined' && window.electron;

export default function TitleBar() {
    const pm2Processes = useAppStore((s) => s.pm2Processes);
    const onlineCount = pm2Processes.filter((p) => p.status === 'online').length;
    const totalCount = pm2Processes.length;

    const handleMinimize = () => isElectron && window.electron.minimizeWindow();
    const handleMaximize = () => isElectron && window.electron.maximizeWindow();
    const handleClose = () => isElectron && window.electron.closeWindow();

    return (
        <div
            className="drag-region h-11 bg-bg-secondary border-b border-border flex items-center justify-between px-4 flex-shrink-0 z-50"
            style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.3)' }}
        >
            {/* Left: App info */}
            <div className="flex items-center gap-3 no-drag">
                <div className="flex items-center gap-2">
                    <div
                        className="w-6 h-6 rounded-md flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #00ff9c, #00a86b)' }}
                    >
                        <Activity size={14} className="text-bg-primary" />
                    </div>
                    <span className="text-sm font-semibold text-text-primary">Dev Manager</span>
                </div>
                <div className="h-4 border-l border-border" />
                <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                    <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                            background: onlineCount > 0 ? '#00ff9c' : '#ff4d4f',
                            boxShadow: onlineCount > 0 ? '0 0 4px #00ff9c88' : 'none'
                        }}
                    />
                    <span>
                        <span className="text-accent font-medium">{onlineCount}</span>
                        <span>/{totalCount} running</span>
                    </span>
                </div>
            </div>

            {/* Center: App title */}
            <div className="absolute left-1/2 -translate-x-1/2 text-xs text-text-muted pointer-events-none">
                PM2 Project Manager
            </div>

            {/* Right: Window controls */}
            <div className="flex items-center gap-1 no-drag">
                <button
                    onClick={handleMinimize}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                >
                    <Minus size={13} />
                </button>
                <button
                    onClick={handleMaximize}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                >
                    <Square size={11} />
                </button>
                <button
                    onClick={handleClose}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-white hover:bg-danger transition-colors"
                >
                    <X size={13} />
                </button>
            </div>
        </div>
    );
}
