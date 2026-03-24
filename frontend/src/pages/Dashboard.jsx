import React, { useMemo, useState, useRef, useCallback } from 'react';
import {
  Activity, Cpu, HardDrive, Zap, RefreshCw,
  CheckCircle, XCircle, RotateCcw, Play, Square,
  Search, X,
} from 'lucide-react';
import ProjectCard from '../components/ProjectCard';
import { Spinner } from '../components/ui';
import useAppStore from '../store/appStore';
import clsx from 'clsx';

function formatMemory(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function StatCard({ label, value, icon: Icon, color, sublabel }) {
  return (
    <div
      className="card-base px-5 py-4 flex items-center gap-4 hover:border-border-light transition-colors"
      style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}15`, border: `1px solid ${color}30` }}
      >
        <Icon size={18} style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold text-text-primary tabular-nums">{value}</div>
        <div className="text-xs text-text-muted">{label}</div>
        {sublabel && (
          <div className="text-[10px] text-text-muted mt-0.5">{sublabel}</div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const {
    projects, pm2Processes, isRefreshing, loadProcesses,
    selectedProcesses, restartSelected, stopSelected, clearSelection,
    searchQuery, setSearchQuery, reorderProjects,
  } = useAppStore();

  const stats = useMemo(() => {
    const online = pm2Processes.filter((p) => p.status === 'online');
    const stopped = pm2Processes.filter((p) => p.status === 'stopped');
    const totalCpu = pm2Processes.reduce((s, p) => s + (p.cpu || 0), 0);
    const totalMem = pm2Processes.reduce((s, p) => s + (p.memory || 0), 0);
    return { online: online.length, stopped: stopped.length, totalCpu, totalMem };
  }, [pm2Processes]);

  // Filter projects by search query
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.displayName?.toLowerCase().includes(q) ||
        p.processes.some(
          (proc) =>
            proc.name.toLowerCase().includes(q) ||
            proc.displayName?.toLowerCase().includes(q)
        )
    );
  }, [projects, searchQuery]);

  // ─── Drag-and-drop state ───────────────────────────────────────────────────
  const [dragIndex, setDragIndex]       = useState(null); // index trong filteredProjects
  const [dropIndex, setDropIndex]       = useState(null); // vị trí drop indicator (0..n)
  const [isDragging, setIsDragging]     = useState(false);
  const dragNodeIndex                   = useRef(null);

  const handleDragStart = useCallback((e, idx) => {
    dragNodeIndex.current = idx;
    setDragIndex(idx);
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    // Ghost image nhỏ hơn, dùng element của chính nó
    e.dataTransfer.setDragImage(e.currentTarget.closest('[data-project-card]'), 20, 20);
  }, []);

  const handleDragOver = useCallback((e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Xác định vị trí indicator: trên hoặc dưới card
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const indicator = e.clientY < midY ? idx : idx + 1;
    setDropIndex(indicator);
  }, []);

  const handleDragLeave = useCallback((e) => {
    // Chỉ clear nếu rời khỏi list hoàn toàn
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDropIndex(null);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const from = dragNodeIndex.current;
    if (from === null || dropIndex === null) return;

    // Chỉ áp dụng trên filteredProjects (khi search đang rỗng hoặc toàn bộ)
    const arr = [...filteredProjects];
    const item = arr[from];
    arr.splice(from, 1);

    const insertAt = dropIndex > from ? dropIndex - 1 : dropIndex;
    arr.splice(insertAt, 0, item);

    // Tái tạo toàn bộ danh sách theo thứ tự mới (cho cả projects không được filter)
    if (!searchQuery.trim()) {
      reorderProjects(arr.map((p) => p.name));
    }

    setDragIndex(null);
    setDropIndex(null);
    setIsDragging(false);
    dragNodeIndex.current = null;
  }, [filteredProjects, dropIndex, reorderProjects, searchQuery]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
    setIsDragging(false);
    dragNodeIndex.current = null;
  }, []);

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 flex-shrink-0 border-b border-border/50">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-xs text-text-muted mt-0.5">
            {projects.length} projects · {pm2Processes.length} processes tracked
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="h-8 pl-8 pr-8 text-xs bg-bg-secondary border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 w-52 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Refresh */}
          <button
            onClick={() => loadProcesses()}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs text-text-secondary border border-border hover:border-border-light hover:text-text-primary transition-all disabled:opacity-40"
          >
            <RefreshCw size={12} className={clsx(isRefreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Online"
            value={stats.online}
            icon={CheckCircle}
            color="#00ff9c"
            sublabel="processes running"
          />
          <StatCard
            label="Stopped"
            value={stats.stopped}
            icon={XCircle}
            color="#ff4d4f"
            sublabel="processes idle"
          />
          <StatCard
            label="Total CPU"
            value={`${stats.totalCpu.toFixed(1)}%`}
            icon={Cpu}
            color="#3b82f6"
            sublabel="across all processes"
          />
          <StatCard
            label="Total RAM"
            value={formatMemory(stats.totalMem)}
            icon={HardDrive}
            color="#a855f7"
            sublabel="across all processes"
          />
        </div>

        {/* Multi-select action bar */}
        {selectedProcesses.size > 0 && (
          <div
            className="flex items-center justify-between px-5 py-3 rounded-xl border animate-slide-bottom"
            style={{
              background: 'linear-gradient(135deg, rgba(0,255,156,0.05), rgba(0,255,156,0.02))',
              borderColor: 'rgba(0,255,156,0.2)',
            }}
          >
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-accent" />
              <span className="text-sm font-medium text-text-primary">
                <span className="text-accent">{selectedProcesses.size}</span> process{selectedProcesses.size > 1 ? 'es' : ''} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={restartSelected}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-warning border border-warning/30 hover:bg-warning/10 transition-all"
              >
                <RotateCcw size={12} /> Restart Selected
              </button>
              <button
                onClick={stopSelected}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-danger border border-danger/30 hover:bg-danger/10 transition-all"
              >
                <Square size={12} /> Stop Selected
              </button>
              <button
                onClick={clearSelection}
                className="text-xs text-text-muted hover:text-text-primary px-2 py-1.5 rounded-lg hover:bg-bg-tertiary transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Project Cards */}
        {filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-bg-secondary border border-border flex items-center justify-center">
              <Activity size={24} className="text-text-muted" />
            </div>
            <h3 className="text-text-secondary font-medium">
              {searchQuery ? 'No matching projects' : 'No projects configured'}
            </h3>
            <p className="text-text-muted text-sm text-center max-w-sm">
              {searchQuery
                ? `No projects match "${searchQuery}"`
                : 'Add projects to config/projects.config.json to get started'}
            </p>
          </div>
        ) : (
          <div
            className="space-y-0 select-none"
            onDragLeave={handleDragLeave}
          >
            {filteredProjects.map((project, idx) => (
              <div
                key={project.name}
                data-project-card="true"
                className="relative"
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={handleDrop}
              >
                {/* Drop indicator BEFORE this card */}
                <DropIndicator visible={isDragging && dropIndex === idx} />

                <div
                  className={clsx(
                    'mb-4 transition-all duration-150',
                    dragIndex === idx && 'opacity-40 scale-[0.98]',
                  )}
                >
                  <ProjectCard
                    project={project}
                    isDragging={dragIndex === idx}
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragEnd={handleDragEnd}
                    canReorder={!isSearching}
                  />
                </div>
              </div>
            ))}

            {/* Drop indicator AFTER last card */}
            <div
              data-project-card="true"
              onDragOver={(e) => {
                e.preventDefault();
                setDropIndex(filteredProjects.length);
              }}
              onDrop={handleDrop}
              className="h-2"
            >
              <DropIndicator visible={isDragging && dropIndex === filteredProjects.length} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DropIndicator({ visible }) {
  return (
    <div
      className={clsx(
        'transition-all duration-150 overflow-hidden',
        visible ? 'h-8 opacity-100' : 'h-0 opacity-0 pointer-events-none'
      )}
    >
      <div className="flex items-center gap-3 px-2 h-full">
        <div
          className="flex-1 h-0.5 rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent, #00ff9c, transparent)',
            boxShadow: '0 0 8px rgba(0,255,156,0.6)',
          }}
        />
        <div
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
          style={{
            color: '#00ff9c',
            background: 'rgba(0,255,156,0.1)',
            border: '1px solid rgba(0,255,156,0.3)',
            boxShadow: '0 0 6px rgba(0,255,156,0.2)',
          }}
        >
          Drop here
        </div>
        <div
          className="flex-1 h-0.5 rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent, #00ff9c, transparent)',
            boxShadow: '0 0 8px rgba(0,255,156,0.6)',
          }}
        />
      </div>
    </div>
  );
}
