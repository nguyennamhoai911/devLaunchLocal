import React, { useEffect, useRef, useState } from 'react';
import { X, RotateCcw, Trash2, Download, ArrowDown } from 'lucide-react';
import useAppStore from '../store/appStore';
import clsx from 'clsx';

export default function LogViewer() {
  const { activeLogProcess, logs, closeLog, clearLogs, setActiveView, pm2Processes } = useAppStore();
  const scrollRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState('');

  const processLogs = (activeLogProcess ? logs[activeLogProcess] : []) || [];

  const filteredLogs = filter
    ? processLogs.filter((l) => l.text.toLowerCase().includes(filter.toLowerCase()))
    : processLogs;

  const processInfo = pm2Processes.find((p) => p.name === activeLogProcess);

  // Autoscroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(nearBottom);
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setAutoScroll(true);
    }
  };

  const downloadLogs = () => {
    const content = processLogs.map((l) => l.text).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeLogProcess}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getLogStyle = (line) => {
    const text = line.text;
    if (line.type === 'stderr') return 'text-red-400';
    if (text.includes('ERROR') || text.includes('error')) return 'text-red-400';
    if (text.includes('WARN') || text.includes('warn')) return 'text-yellow-400';
    if (text.includes('INFO') || text.includes('info')) return 'text-blue-400';
    if (text.includes('✓') || text.includes('success') || text.includes('ready')) return 'text-green-400';
    if (text.match(/\d{1,3}\.\d{1,3}\.\d{1,3}ms|\d+ms/)) return 'text-purple-400';
    return 'text-slate-300';
  };

  if (!activeLogProcess) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #1a1d26, #21263a)' }}
          >
            <span className="text-3xl">🖥️</span>
          </div>
          <h3 className="text-text-secondary font-medium mb-1">No log selected</h3>
          <p className="text-text-muted text-sm">Click "View Logs" on a process to see its output</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-bg-secondary flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                background: processInfo?.status === 'online' ? '#00ff9c' : '#ff4d4f',
                boxShadow: processInfo?.status === 'online' ? '0 0 6px #00ff9c88' : 'none',
              }}
            />
            <span className="text-sm font-semibold text-text-primary font-mono">{activeLogProcess}</span>
          </div>
          <span className="text-[10px] text-text-muted bg-bg-tertiary border border-border px-2 py-0.5 rounded-full">
            {filteredLogs.length} lines
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter */}
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter logs..."
            className="h-7 px-3 text-xs bg-bg-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 w-48 transition-colors font-mono"
          />

          {/* Download */}
          <button
            onClick={downloadLogs}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
            title="Download logs"
          >
            <Download size={14} />
          </button>

          {/* Clear */}
          <button
            onClick={() => clearLogs(activeLogProcess)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
            title="Clear logs"
          >
            <Trash2 size={14} />
          </button>

          {/* Close */}
          <button
            onClick={() => closeLog(activeLogProcess)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Log Content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 log-container bg-bg-primary"
        style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
      >
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-text-muted text-sm">Waiting for logs</div>
              <div className="flex gap-1 mt-3 justify-center">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredLogs.map((line, idx) => (
              <div
                key={idx}
                className={clsx(
                  'flex gap-3 py-0.5 px-2 rounded hover:bg-bg-secondary/50 group',
                  getLogStyle(line)
                )}
              >
                <span className="text-text-muted opacity-50 flex-shrink-0 select-none w-8 text-right text-[10px] leading-5">
                  {idx + 1}
                </span>
                <pre className="break-all whitespace-pre-wrap text-[12px] leading-5 flex-1 min-w-0">
                  {line.text}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with auto-scroll indicator */}
      <div className="flex items-center justify-between px-5 py-2 border-t border-border bg-bg-secondary flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-text-muted">
            {activeLogProcess} · realtime stream
          </span>
          <span
            className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"
            style={{ boxShadow: '0 0 4px #00ff9c88' }}
          />
        </div>
        {!autoScroll && (
          <button
            onClick={scrollToBottom}
            className="flex items-center gap-1.5 text-[11px] text-accent hover:text-accent-dark transition-colors"
          >
            <ArrowDown size={12} />
            Jump to bottom
          </button>
        )}
        {autoScroll && (
          <span className="text-[10px] text-text-muted">Auto-scroll on</span>
        )}
      </div>
    </div>
  );
}
