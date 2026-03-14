import React from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import clsx from 'clsx';
import useAppStore from '../store/appStore';

const icons = {
    success: CheckCircle,
    error: XCircle,
    info: Info,
    warning: AlertTriangle,
};

const styles = {
    success: 'border-status-online/30 bg-status-online/5 text-status-online',
    error: 'border-danger/30 bg-danger/5 text-danger',
    info: 'border-blue-400/30 bg-blue-400/5 text-blue-400',
    warning: 'border-warning/30 bg-warning/5 text-warning',
};

export default function NotificationStack() {
    const { notifications, dismissNotification } = useAppStore();

    if (notifications.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
            {notifications.map((n) => {
                const Icon = icons[n.type] || Info;
                return (
                    <div
                        key={n.id}
                        className={clsx(
                            'flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm animate-slide-right pointer-events-auto',
                            'shadow-[0_8px_32px_rgba(0,0,0,0.6)]',
                            styles[n.type] || styles.info
                        )}
                    >
                        <Icon size={15} className="flex-shrink-0 mt-0.5" />
                        <span className="text-xs font-medium flex-1 text-text-primary">{n.message}</span>
                        <button
                            onClick={() => dismissNotification(n.id)}
                            className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
                        >
                            <X size={12} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
