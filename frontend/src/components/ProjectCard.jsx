import React, { useState, useRef } from 'react';
import clsx from 'clsx';
import {
  Play, Square, RotateCcw, Terminal, Cpu, MemoryStick,
  Clock, ExternalLink, Folder, CheckSquare, Square as SquareIcon,
  ChevronDown, ChevronUp, Globe, GripVertical, Pencil, Check, X,
} from 'lucide-react';
import { StatusDot, StatusBadge, Button, Tooltip } from './ui';
import useAppStore from '../store/appStore';

function formatMemory(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function formatUptime(ms) {
  if (!ms) return '--';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

// ─── Logo Editor Popup ────────────────────────────────────────────────────────
// Quick emoji/text picker shown inline when clicking the logo
const PRESET_EMOJIS = [
  '🚀','⚡','🌊','🧩','🎯','🦄','🔥','💎',
  '🌟','🛸','🧠','🎮','🦋','🌈','🗝️','⚙️',
  '🐉','🌴','🎪','🦊','🐳','🦅','🎸','🏆',
];

function LogoEditor({ currentLogo, projectColor, onSave, onClose }) {
  const [value, setValue] = useState(currentLogo || '');
  const inputRef = useRef(null);

  return (
    <div
      className="absolute left-0 top-full mt-2 z-50 p-3 rounded-xl border shadow-2xl"
      style={{
        background: '#1a1d26',
        borderColor: `${projectColor}44`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${projectColor}22`,
        width: 280,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2 font-semibold">
        Project Logo (emoji or 1–2 chars)
      </div>

      {/* Input */}
      <div className="flex gap-2 mb-3">
        <input
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 4))}
          placeholder="e.g. 🚀 or RB"
          className="flex-1 h-8 px-2 text-sm bg-bg-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 font-mono"
        />
        <button
          onClick={() => { onSave(value.trim()); onClose(); }}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-status-online hover:bg-status-online/10 transition-all border border-status-online/30"
        >
          <Check size={14} />
        </button>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-all"
        >
          <X size={14} />
        </button>
      </div>

      {/* Preset emojis */}
      <div className="grid grid-cols-8 gap-1">
        {PRESET_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => { onSave(emoji); onClose(); }}
            className={clsx(
              'w-8 h-8 flex items-center justify-center rounded-lg text-base transition-all hover:scale-110',
              'hover:bg-bg-tertiary border border-transparent hover:border-border',
              value === emoji && 'bg-bg-tertiary border-border'
            )}
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Project Logo Display ─────────────────────────────────────────────────────
function ProjectLogo({ project, projectColor, onlineCount }) {
  const [editing, setEditing] = useState(false);
  const { updateProjectLogo } = useAppStore();
  const logo = project.logo;
  const initials = (project.displayName || project.name).substring(0, 2).toUpperCase();

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setEditing((v) => !v)}
        className={clsx(
          'group relative w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold transition-all duration-200',
          'hover:scale-105 cursor-pointer'
        )}
        style={{
          background: logo ? 'transparent' : `${projectColor}18`,
          border: `2px solid ${projectColor}${onlineCount > 0 ? 'aa' : '44'}`,
          boxShadow: onlineCount > 0 ? `0 0 12px ${projectColor}44` : 'none',
          lineHeight: 1,
        }}
        title="Click to change logo"
      >
        {logo ? (
          <span className="leading-none select-none" style={{ fontSize: logo.length > 2 ? '0.65rem' : '1.1rem' }}>
            {logo}
          </span>
        ) : (
          <span
            className="text-xs font-bold tracking-tight select-none"
            style={{ color: projectColor }}
          >
            {initials}
          </span>
        )}
        {/* Overlay pencil */}
        <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
          <Pencil size={12} className="text-white" />
        </span>
      </button>

      {editing && (
        <LogoEditor
          currentLogo={logo}
          projectColor={projectColor}
          onSave={(newLogo) => updateProjectLogo(project.name, newLogo)}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// ─── Single Process Row ───────────────────────────────────────────────────────
function ProcessItem({ procConfig, projectColor }) {
  const {
    startProcess, stopProcess, restartProcess,
    openLog, getProcessInfo, getProcessStatus,
    selectedProcesses, toggleSelectProcess,
  } = useAppStore();

  const [isActing, setIsActing] = useState(false);

  const status = getProcessStatus(procConfig.name);
  const info = getProcessInfo(procConfig.name);
  const isOnline = status === 'online';
  const isStopped = status === 'stopped';
  const isSelected = selectedProcesses.has(procConfig.name);

  const act = async (fn, ...args) => {
    setIsActing(true);
    try { await fn(...args); } finally { setIsActing(false); }
  };

  const cpuColor = (cpu) => {
    if (cpu > 80) return '#ff4d4f';
    if (cpu > 50) return '#f59e0b';
    return '#00ff9c';
  };

  const memColor = (bytes) => {
    const mb = (bytes || 0) / 1024 / 1024;
    if (mb > 500) return '#ff4d4f';
    if (mb > 200) return '#f59e0b';
    return '#8892a4';
  };

  return (
    <div
      className={clsx(
        'group flex items-center gap-3 px-4 py-3 transition-all duration-150',
        'border-b border-border/50 last:border-b-0',
        'hover:bg-bg-tertiary/50',
        isSelected && 'bg-accent/5 border-l-2 border-l-accent',
        !isSelected && 'border-l-2 border-l-transparent'
      )}
    >
      {/* Checkbox */}
      <button
        onClick={() => toggleSelectProcess(procConfig.name)}
        className="text-text-muted hover:text-accent transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
        style={{ opacity: isSelected ? 1 : undefined }}
      >
        {isSelected ? (
          <CheckSquare size={14} className="text-accent" />
        ) : (
          <SquareIcon size={14} />
        )}
      </button>

      {/* Status + Name */}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <StatusDot status={status} size={8} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary truncate">
              {procConfig.displayName || procConfig.name}
            </span>
            {procConfig.port && isOnline && (
              <Tooltip content={`localhost:${procConfig.port}`}>
                <button
                  onClick={() => window.electron?.openInBrowser(`http://localhost:${procConfig.port}`)}
                  className="text-text-muted hover:text-accent transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Globe size={11} />
                </button>
              </Tooltip>
            )}
          </div>
          <div className="text-[10px] text-text-muted truncate font-mono">
            {procConfig.script} {procConfig.args}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="hidden sm:flex items-center gap-5 flex-shrink-0">
        {info && isOnline ? (
          <>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[10px] text-text-muted">CPU</span>
              <span className="text-xs font-mono font-medium" style={{ color: cpuColor(info.cpu) }}>
                {info.cpu?.toFixed(1) || '0'}%
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[10px] text-text-muted">RAM</span>
              <span className="text-xs font-mono font-medium" style={{ color: memColor(info.memory) }}>
                {formatMemory(info.memory)}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[10px] text-text-muted">Uptime</span>
              <span className="text-xs font-mono font-medium text-text-secondary">
                {formatUptime(info.uptime)}
              </span>
            </div>
          </>
        ) : (
          <div className="w-32" />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Logs */}
        <Tooltip content="View Logs">
          <button
            onClick={() => openLog(procConfig.name)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-all"
          >
            <Terminal size={13} />
          </button>
        </Tooltip>

        {/* Open folder */}
        {procConfig.cwd && (
          <Tooltip content="Open Folder">
            <button
              onClick={() => window.electron?.openFolder(procConfig.cwd)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-all"
            >
              <Folder size={13} />
            </button>
          </Tooltip>
        )}

        {/* Start / Stop */}
        {isStopped ? (
          <Tooltip content="Start">
            <button
              disabled={isActing}
              onClick={() => act(startProcess, procConfig)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-status-online hover:bg-status-online/10 transition-all disabled:opacity-40"
              style={{ boxShadow: isActing ? 'none' : undefined }}
            >
              {isActing ? (
                <span className="w-3 h-3 border border-status-online border-t-transparent rounded-full animate-spin" />
              ) : (
                <Play size={13} />
              )}
            </button>
          </Tooltip>
        ) : (
          <Tooltip content="Stop">
            <button
              disabled={isActing}
              onClick={() => act(stopProcess, procConfig.name, procConfig.displayName)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-danger hover:bg-danger/10 transition-all disabled:opacity-40"
            >
              {isActing ? (
                <span className="w-3 h-3 border border-danger border-t-transparent rounded-full animate-spin" />
              ) : (
                <Square size={13} />
              )}
            </button>
          </Tooltip>
        )}

        {/* Restart */}
        {isOnline && (
          <Tooltip content="Restart">
            <button
              disabled={isActing}
              onClick={() => act(restartProcess, procConfig.name, procConfig.displayName)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-warning hover:bg-warning/10 transition-all disabled:opacity-40"
            >
              {isActing ? (
                <span className="w-3 h-3 border border-warning border-t-transparent rounded-full animate-spin" />
              ) : (
                <RotateCcw size={13} />
              )}
            </button>
          </Tooltip>
        )}
      </div>

      {/* Always-visible status */}
      <div className="w-16 flex justify-end flex-shrink-0">
        <StatusBadge status={status} size="sm" />
      </div>
    </div>
  );
}

// ─── Project Card ─────────────────────────────────────────────────────────────
export default function ProjectCard({ project, isDragging, onDragStart, onDragEnd, canReorder }) {
  const [collapsed, setCollapsed] = useState(false);
  const [isActing, setIsActing] = useState(null); // 'start' | 'stop' | 'restart'

  const { startProject, stopProject, restartProject, pm2Processes } = useAppStore();

  const projectProcesses = pm2Processes.filter(
    (p) => project.processes.some((proc) => proc.name === p.name)
  );

  const onlineCount = projectProcesses.filter((p) => p.status === 'online').length;
  const total = project.processes.length;
  const allOnline = onlineCount === total;
  const allStopped = onlineCount === 0;
  const projectColor = project.color || '#00ff9c';

  const act = async (action, fn) => {
    setIsActing(action);
    try { await fn(project); } finally { setIsActing(null); }
  };

  const totalCpu = projectProcesses.reduce((sum, p) => sum + (p.cpu || 0), 0);
  const totalMem = projectProcesses.reduce((sum, p) => sum + (p.memory || 0), 0);

  return (
    <div
      className={clsx(
        'card-base overflow-hidden transition-all duration-200 hover:shadow-card-hover animate-fade-in',
        isDragging && 'ring-2 ring-accent/40',
      )}
      style={{
        boxShadow: onlineCount > 0 ? `0 0 0 1px ${projectColor}22, 0 4px 24px rgba(0,0,0,0.4)` : undefined,
      }}
      draggable={false}
    >
      {/* Card Header */}
      <div
        className="flex items-center justify-between px-4 py-4 border-b border-border"
        style={{
          background: `linear-gradient(135deg, ${projectColor}08, transparent)`,
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Drag Handle */}
          {canReorder && (
            <div
              draggable="true"
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              className={clsx(
                'flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg cursor-grab active:cursor-grabbing',
                'text-text-muted hover:text-text-secondary hover:bg-bg-tertiary transition-all',
                'opacity-0 group-hover:opacity-100',
              )}
              title="Drag to reorder"
              style={{ opacity: undefined }} // override inline so group-hover works
            >
              <GripVertical size={14} />
            </div>
          )}

          {/* Logo */}
          <ProjectLogo project={project} projectColor={projectColor} onlineCount={onlineCount} />

          {/* Name + stats */}
          <div className="min-w-0">
            <h3 className="text-base font-bold text-text-primary leading-tight">
              {project.displayName || project.name}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-text-muted">
                <span style={{ color: projectColor }} className="font-semibold">{onlineCount}</span>
                <span>/{total} services</span>
              </span>
              {(totalCpu > 0 || totalMem > 0) && (
                <>
                  <span className="text-border">·</span>
                  <span className="text-[11px] text-text-muted font-mono">
                    {totalCpu.toFixed(1)}% CPU · {formatMemory(totalMem)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Bulk controls */}
          <div className="flex items-center gap-1 mr-2">
            {!allOnline && (
              <button
                disabled={isActing !== null}
                onClick={() => act('start', startProject)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-status-online border border-status-online/30 hover:bg-status-online/10 hover:border-status-online/50 transition-all disabled:opacity-40"
                style={{ boxShadow: isActing === 'start' ? 'none' : '0 0 8px rgba(0,255,156,0.1)' }}
              >
                {isActing === 'start' ? (
                  <span className="w-3 h-3 border border-status-online border-t-transparent rounded-full animate-spin" />
                ) : <Play size={11} />}
                Start All
              </button>
            )}
            {!allStopped && (
              <>
                <button
                  disabled={isActing !== null}
                  onClick={() => act('restart', restartProject)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-warning border border-warning/30 hover:bg-warning/10 transition-all disabled:opacity-40"
                >
                  {isActing === 'restart' ? (
                    <span className="w-3 h-3 border border-warning border-t-transparent rounded-full animate-spin" />
                  ) : <RotateCcw size={11} />}
                  Restart All
                </button>
                <button
                  disabled={isActing !== null}
                  onClick={() => act('stop', stopProject)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-danger border border-danger/30 hover:bg-danger/10 transition-all disabled:opacity-40"
                >
                  {isActing === 'stop' ? (
                    <span className="w-3 h-3 border border-danger border-t-transparent rounded-full animate-spin" />
                  ) : <Square size={11} />}
                  Stop All
                </button>
              </>
            )}
          </div>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-all"
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {/* Processes list */}
      {!collapsed && (
        <div className="divide-y divide-border/30">
          {project.processes.map((proc) => (
            <ProcessItem
              key={proc.name}
              procConfig={proc}
              projectColor={projectColor}
            />
          ))}
        </div>
      )}

      {/* Progress bar at bottom */}
      {!collapsed && total > 0 && (
        <div
          className="h-0.5 transition-all duration-700"
          style={{
            background: `linear-gradient(to right, ${projectColor} ${(onlineCount / total) * 100}%, #2a2f3a ${(onlineCount / total) * 100}%)`,
          }}
        />
      )}
    </div>
  );
}
