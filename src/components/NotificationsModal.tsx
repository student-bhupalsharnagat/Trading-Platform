import React, { useState } from 'react';
import { AppNotification } from '../types.ts';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Shield,
  X,
  Check,
  Trash2,
  Clock,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onMarkAsRead: (id: string) => void;
  onClearAll?: () => void;
  onSelectNotification?: (notif: AppNotification) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllRead,
  onMarkAsRead,
  onClearAll,
  onSelectNotification,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'ORDER' | 'PRICE_ALERT' | 'MARGIN' | 'SYSTEM'>('ALL');

  if (!isOpen) return null;

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'ALL') return true;
    return n.type === filter;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const getIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'ORDER':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'PRICE_ALERT':
        return <TrendingUp className="w-4 h-4 text-amber-500" />;
      case 'MARGIN':
        return <AlertTriangle className="w-4 h-4 text-sky-500" />;
      case 'SYSTEM':
      default:
        return <Shield className="w-4 h-4 text-indigo-500" />;
    }
  };

  const getTypeBadge = (type: AppNotification['type']) => {
    switch (type) {
      case 'ORDER':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'PRICE_ALERT':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'MARGIN':
        return 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20';
      case 'SYSTEM':
      default:
        return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:justify-end bg-black/60 dark:bg-black/75 backdrop-blur-xs animate-fadeIn p-0 sm:p-4">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer / Modal Container */}
      <div className="relative w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:rounded-2xl bg-white dark:bg-[#0B111C] border-0 sm:border border-slate-200 dark:border-[#1E2B40] shadow-2xl flex flex-col z-10 overflow-hidden animate-slideDown">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-[#162234] bg-slate-50/70 dark:bg-[#080E18] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Notifications</h2>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-amber-500 text-slate-950 shadow-xs">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Trading activity, order updates & alerts</p>
            </div>
          </div>

          <button
            type="button"
            id="close-notifications-btn"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-[#142032] hover:bg-slate-200 dark:hover:bg-[#1E2E44] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Bar (Mark all read / Clear) */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-[#090F1B] border-b border-slate-100 dark:border-[#162234] flex items-center justify-between">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            {(['ALL', 'ORDER', 'PRICE_ALERT', 'MARGIN'] as const).map((tab) => {
              const label =
                tab === 'ALL'
                  ? 'All'
                  : tab === 'ORDER'
                  ? 'Orders'
                  : tab === 'PRICE_ALERT'
                  ? 'Price Alerts'
                  : 'Margin';
              const isSelected = filter === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800/60'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
            {unreadCount > 0 && (
              <button
                type="button"
                id="mark-all-read-btn"
                onClick={onMarkAllRead}
                className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap"
                title="Mark all notifications as read"
              >
                <Check className="w-3 h-3" />
                <span>Mark read</span>
              </button>
            )}

            {onClearAll && notifications.length > 0 && (
              <button
                type="button"
                id="clear-all-notifs-btn"
                onClick={onClearAll}
                className="text-slate-400 hover:text-rose-500 transition-colors p-1 rounded-md"
                title="Clear all notifications"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Notifications List Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 custom-scrollbar">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-[#121B2A] border border-slate-200 dark:border-[#1E2E44] flex items-center justify-center text-slate-400 mb-3">
                <Bell className="w-6 h-6 opacity-60" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No notifications found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                {filter === 'ALL'
                  ? "You're all caught up! Updates about trades, orders, and price alerts will appear here."
                  : `No ${filter.toLowerCase().replace('_', ' ')} notifications right now.`}
              </p>
            </div>
          ) : (
            filteredNotifications.map((n) => (
              <div
                key={n.id}
                onClick={() => {
                  if (!n.read) onMarkAsRead(n.id);
                  onSelectNotification?.(n);
                }}
                className={`p-3 sm:p-3.5 rounded-xl border transition-all cursor-pointer relative group ${
                  n.read
                    ? 'bg-slate-50/70 hover:bg-slate-100 dark:bg-[#0A101C] dark:hover:bg-[#0E1626] border-slate-200/80 dark:border-[#162234]'
                    : 'bg-white hover:bg-amber-50/40 dark:bg-[#0E1729] dark:hover:bg-[#121D33] border-amber-500/40 dark:border-amber-500/30 shadow-xs'
                }`}
              >
                {/* Unread indicator dot */}
                {!n.read && (
                  <span className="absolute top-3.5 right-3.5 w-2 h-2 rounded-full bg-amber-500 ring-4 ring-amber-500/20" />
                )}

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-slate-100 dark:bg-[#142032] border border-slate-200 dark:border-slate-800 shrink-0 mt-0.5">
                    {getIcon(n.type)}
                  </div>

                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                        {n.title}
                      </h4>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded border font-medium uppercase ${getTypeBadge(n.type)}`}>
                        {n.type.replace('_', ' ')}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words">
                      {n.message}
                    </p>

                    <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400 font-mono">
                      <Clock className="w-3 h-3" />
                      <span>{n.time}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Summary */}
        <div className="p-3 border-t border-slate-100 dark:border-[#162234] bg-slate-50/80 dark:bg-[#080E18] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>{notifications.length} total notifications</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-[#142032] hover:bg-slate-300 dark:hover:bg-[#1E2E44] text-slate-800 dark:text-slate-200 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
