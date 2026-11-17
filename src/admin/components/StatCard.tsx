import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  id?: string;
  title: string;
  value: string | number;
  change?: string | number | null;
  stats?: { change?: string | number | null; [key: string]: any } | null;
  metrics?: { [key: string]: any } | null;
  isPositive?: boolean;
  subtitle?: string;
  icon?: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({
  id,
  title,
  value,
  change,
  stats,
  metrics,
  isPositive,
  subtitle,
  icon,
}) => {
  const effectiveChange = change ?? stats?.change ?? metrics?.change ?? null;
  const displayChange = effectiveChange != null ? String(effectiveChange) : null;

  return (
    <div
      id={id}
      className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-5 hover:border-slate-700/80 transition-colors shadow-sm flex flex-col justify-between"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-slate-100 tracking-tight">{value}</h3>
        </div>
        {icon && <div className="p-2.5 rounded-lg bg-slate-800/60 text-blue-400 border border-slate-700/40">{icon}</div>}
      </div>

      {(displayChange || subtitle) && (
        <div className="mt-4 flex items-center gap-2 text-xs">
          {displayChange && (
            <span
              className={`inline-flex items-center gap-0.5 font-semibold ${
                isPositive ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {displayChange}
            </span>
          )}
          {subtitle && <span className="text-slate-500">{subtitle}</span>}
        </div>
      )}
    </div>
  );
};
