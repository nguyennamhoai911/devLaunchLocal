import React from 'react';
import clsx from 'clsx';

// ─── Status Badge ──────────────────────────────────────────────────────────────
export function StatusBadge({ status, size = 'md' }) {
    const config = {
        online: { dot: 'bg-status-online shadow-[0_0_6px_rgba(0,255,156,0.6)]', text: 'text-status-online', label: 'online', animate: true },
        stopped: { dot: 'bg-status-stopped', text: 'text-status-stopped', label: 'stopped', animate: false },
        starting: { dot: 'bg-status-starting shadow-[0_0_6px_rgba(245,158,11,0.6)]', text: 'text-status-starting', label: 'starting', animate: true },
        errored: { dot: 'bg-status-errored', text: 'text-status-errored', label: 'errored', animate: false },
        stopping: { dot: 'bg-status-stopped animate-pulse', text: 'text-status-stopped', label: 'stopping', animate: true },
    };

    const c = config[status] || config.stopped;

    const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
    const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';

    return (
        <span className={clsx('flex items-center gap-1.5', textSize, c.text)}>
            <span
                className={clsx(
                    'rounded-full flex-shrink-0 transition-all',
                    dotSize,
                    c.dot,
                    c.animate && 'status-online'
                )}
            />
            {c.label}
        </span>
    );
}

// ─── Status Dot Only ──────────────────────────────────────────────────────────
export function StatusDot({ status, size = 8 }) {
    const colors = {
        online: '#00ff9c',
        stopped: '#ff4d4f',
        starting: '#f59e0b',
        errored: '#ff6b6b',
        stopping: '#ff4d4f',
    };

    const color = colors[status] || colors.stopped;
    const isAnimated = status === 'online' || status === 'starting';

    return (
        <span
            className={clsx('rounded-full inline-block flex-shrink-0', isAnimated && 'status-online')}
            style={{
                width: size,
                height: size,
                background: color,
                boxShadow: isAnimated ? `0 0 6px ${color}99` : 'none',
            }}
        />
    );
}

// ─── Metric Card ──────────────────────────────────────────────────────────────
export function MetricCard({ label, value, icon: Icon, color = '#00ff9c', suffix = '' }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[10px] text-text-muted uppercase tracking-wider flex items-center gap-1">
                {Icon && <Icon size={10} />}
                {label}
            </span>
            <span className="text-sm font-semibold font-mono" style={{ color }}>
                {value}
                {suffix && <span className="text-xs text-text-muted ml-0.5">{suffix}</span>}
            </span>
        </div>
    );
}

// ─── Button ───────────────────────────────────────────────────────────────────
export function Button({ children, variant = 'secondary', size = 'sm', onClick, disabled, className, icon: Icon, loading }) {
    const variants = {
        primary: 'bg-accent text-bg-primary hover:bg-accent-dark font-semibold',
        secondary: 'bg-bg-tertiary text-text-primary border border-border hover:border-border-light',
        danger: 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20',
        ghost: 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary',
        outline: 'border border-border text-text-secondary hover:border-border-light hover:text-text-primary',
    };

    const sizes = {
        xs: 'px-2 py-1 text-[10px] rounded-md',
        sm: 'px-2.5 py-1.5 text-xs rounded-lg',
        md: 'px-4 py-2 text-sm rounded-xl',
        lg: 'px-6 py-3 text-base rounded-xl',
    };

    return (
        <button
            onClick={onClick}
            disabled={disabled || loading}
            className={clsx(
                'flex items-center gap-1.5 font-medium transition-all duration-150 cursor-pointer select-none',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                'active:scale-95',
                variants[variant],
                sizes[size],
                className
            )}
        >
            {loading ? (
                <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            ) : (
                Icon && <Icon size={size === 'xs' ? 10 : size === 'sm' ? 12 : 14} />
            )}
            {children}
        </button>
    );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ children, color = '#00ff9c' }) {
    return (
        <span
            className="px-2 py-0.5 rounded-full text-[10px] font-medium border"
            style={{
                color,
                borderColor: `${color}44`,
                background: `${color}11`,
            }}
        >
            {children}
        </span>
    );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
export function Tooltip({ children, content }) {
    const [show, setShow] = React.useState(false);

    return (
        <div
            className="relative inline-flex"
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
        >
            {children}
            {show && content && (
                <div className="tooltip bottom-full left-1/2 -translate-x-1/2 mb-2 animate-fade-in">
                    {content}
                </div>
            )}
        </div>
    );
}

// ─── Separator ────────────────────────────────────────────────────────────────
export function Separator({ className }) {
    return <div className={clsx('border-t border-border', className)} />;
}

// ─── Empty State ─────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            {Icon && <Icon size={48} className="text-text-muted opacity-50" />}
            <h3 className="text-text-secondary font-medium">{title}</h3>
            {description && <p className="text-text-muted text-sm max-w-sm">{description}</p>}
        </div>
    );
}

// ─── Loading Spinner ──────────────────────────────────────────────────────────
export function Spinner({ size = 16, color = '#00ff9c' }) {
    return (
        <span
            className="rounded-full border-2 border-t-transparent animate-spin inline-block"
            style={{
                width: size,
                height: size,
                borderColor: `${color}44`,
                borderTopColor: 'transparent',
                borderRightColor: color,
            }}
        />
    );
}
