import React from 'react';
import { MarketHoursInfo } from '../utils/marketHours.ts';

interface MarketClosedModalProps {
  isOpen: boolean;
  onClose: () => void;
  info?: MarketHoursInfo;
}

export const MarketClosedModal: React.FC<MarketClosedModalProps> = ({
  isOpen,
  onClose,
  info,
}) => {
  if (!isOpen) return null;

  const exchangeName = info?.exchange || 'MCX';
  const tradingHours = info?.tradingHours || '09:00 - 23:30';
  const days = info?.days || 'Mon - Fri';
  const timeZone = info?.timeZone || 'IST';

  return (
    <div className="fixed inset-0 z-70 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white dark:bg-[#0D1524] border border-slate-200 dark:border-[#1E2B40] rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden p-6 sm:p-7 flex flex-col items-center text-center animate-scaleUp">
        {/* Glowing Clock Icon Badge matching Screenshot */}
        <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-[#34141B] border border-rose-500/40 flex items-center justify-center shadow-lg shadow-rose-950/20">
          <div className="w-8 h-8 rounded-full bg-slate-200 border-2 border-slate-700 relative flex items-center justify-center shadow-inner">
            {/* Clock center pin */}
            <div className="w-1.5 h-1.5 rounded-full bg-rose-600 z-10" />
            {/* Hour hand */}
            <div className="absolute top-1.5 w-0.5 h-2.5 bg-slate-900 rounded-full transform origin-bottom rotate-45" />
            {/* Minute hand */}
            <div className="absolute top-1 w-0.5 h-3 bg-slate-900 rounded-full transform origin-bottom -rotate-45" />
            {/* Second hand accent */}
            <div className="absolute top-0.5 w-0.5 h-3.5 bg-rose-500 rounded-full transform origin-bottom rotate-12" />
          </div>
        </div>

        {/* Title */}
        <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight mt-4">
          Market Closed
        </h3>

        {/* Description */}
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-normal leading-relaxed mt-2.5 px-1">
          The stock market is currently closed. Trading is available only during official market hours. Please try again when the market opens.
        </p>

        {/* Info Box matching Screenshot */}
        <div className="w-full bg-slate-50 dark:bg-[#080E18] border border-slate-200 dark:border-[#162234] rounded-xl p-3 sm:p-3.5 text-center mt-5">
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 font-mono">
            {exchangeName} trading hours:{' '}
            <span className="text-amber-600 dark:text-amber-400 font-bold">{tradingHours}</span>
          </div>
          <div className="text-xs font-semibold mt-1">
            <span className="text-amber-600 dark:text-amber-400 font-bold">{timeZone}</span>
            <span className="text-slate-400 dark:text-slate-500"> • </span>
            <span className="text-slate-600 dark:text-slate-400">{days}</span>
          </div>
        </div>

        {/* Action Buttons matching Screenshot */}
        <div className="grid grid-cols-2 gap-3 w-full mt-6">
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#142032] dark:hover:bg-[#1B2B44] border border-slate-200 dark:border-[#203450] text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white font-bold text-sm transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 rounded-xl bg-[#F97316] hover:bg-[#EA580C] active:bg-[#C2410C] text-white font-black text-sm transition-all cursor-pointer shadow-lg shadow-orange-950/40"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
