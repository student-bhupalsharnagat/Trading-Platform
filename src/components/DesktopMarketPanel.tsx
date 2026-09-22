import React from 'react';
import { Instrument, WalletFunds } from '../types.ts';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  Wallet,
  Star,
  Activity,
  Zap,
} from 'lucide-react';

interface DesktopMarketPanelProps {
  spotlightInstrument: Instrument;
  wallet?: WalletFunds;
  onOpenOrder: (inst: Instrument, type: 'BUY' | 'SELL') => void;
  onOpenChart: (inst: Instrument) => void;
  onOpenWallet: () => void;
}

export const DesktopMarketPanel: React.FC<DesktopMarketPanelProps> = ({
  spotlightInstrument,
  wallet,
  onOpenOrder,
  onOpenChart,
  onOpenWallet,
}) => {
  const isPositive = spotlightInstrument.change >= 0;
  const high = spotlightInstrument.high || spotlightInstrument.lastPrice * 1.015;
  const low = spotlightInstrument.low || spotlightInstrument.lastPrice * 0.985;
  const range = high - low;
  const currentPosPercent = range > 0 ? Math.min(100, Math.max(0, ((spotlightInstrument.lastPrice - low) / range) * 100)) : 50;

  const available = wallet?.availableBalance ?? 242680;
  const used = wallet?.usedMargin ?? 42320;
  const total = available + used;
  const marginUsedPercent = total > 0 ? Math.round((used / total) * 100) : 15;

  return (
    <div className="space-y-4">
      {/* 1. Spotlight Instrument Quick Terminal */}
      <div className="bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-[#1A2638] rounded-2xl p-4 shadow-sm space-y-4 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Live Spotlight Terminal
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] font-bold text-amber-600 dark:text-amber-400">
            {spotlightInstrument.category}
          </span>
        </div>

        {/* Instrument Title & Price */}
        <div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
              {spotlightInstrument.symbol}
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              {spotlightInstrument.expiry}
            </span>
          </div>

          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
              ₹{spotlightInstrument.lastPrice.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span
              className={`text-xs font-mono font-bold flex items-center gap-0.5 ${
                isPositive ? 'text-emerald-500' : 'text-rose-500'
              }`}
            >
              {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              {isPositive ? '+' : ''}
              {spotlightInstrument.change.toFixed(2)} ({spotlightInstrument.changePercent.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* 24h High / Low Bar */}
        <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-[#141E2E] text-[11px]">
          <div className="flex justify-between text-slate-500 dark:text-slate-400 font-mono">
            <span>L: ₹{low.toFixed(2)}</span>
            <span>24h Range</span>
            <span>H: ₹{high.toFixed(2)}</span>
          </div>
          <div className="h-1.5 w-full bg-slate-100 dark:bg-[#142032] rounded-full overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500 rounded-full"
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Bid / Ask Quick Box */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#060B13] border border-slate-200 dark:border-[#141E2E]">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase tracking-wider">
              Best Bid
            </span>
            <span className="text-sm font-mono font-bold text-emerald-500">
              ₹{(spotlightInstrument.lastPrice * 0.9998).toFixed(2)}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">10 Lots</span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#060B13] border border-slate-200 dark:border-[#141E2E] text-right">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold uppercase tracking-wider">
              Best Ask
            </span>
            <span className="text-sm font-mono font-bold text-rose-500">
              ₹{(spotlightInstrument.lastPrice * 1.0002).toFixed(2)}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">15 Lots</span>
          </div>
        </div>

        {/* Quick Order Actions */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenOrder(spotlightInstrument, 'BUY')}
            className="py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-sm transition-transform active:scale-95 cursor-pointer flex items-center justify-center gap-1"
          >
            <Zap className="w-3.5 h-3.5" />
            BUY
          </button>
          <button
            type="button"
            onClick={() => onOpenOrder(spotlightInstrument, 'SELL')}
            className="py-2.5 px-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-transform active:scale-95 cursor-pointer flex items-center justify-center gap-1"
          >
            <Zap className="w-3.5 h-3.5" />
            SELL
          </button>
        </div>

        {/* Full Chart Button */}
        <button
          type="button"
          onClick={() => onOpenChart(spotlightInstrument)}
          className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#142032] dark:hover:bg-[#1E2E44] text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 border border-slate-200 dark:border-[#1E2E44]"
        >
          <BarChart2 className="w-3.5 h-3.5 text-amber-500" />
          Open Technical Chart
        </button>
      </div>

      {/* 2. Key Market Indices */}
      <div className="bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-[#1A2638] rounded-2xl p-4 shadow-sm space-y-3 transition-colors">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#141E2E] pb-2">
          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-amber-500" /> Key Benchmarks
          </span>
          <span className="text-[10px] text-slate-500 font-mono">NSE · MCX · Global</span>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-[#060B13] border border-slate-100 dark:border-[#141E2E]">
            <div>
              <div className="font-bold text-slate-900 dark:text-white">NIFTY 50</div>
              <div className="text-[10px] text-slate-400">NSE Index</div>
            </div>
            <div className="text-right font-mono">
              <div className="font-bold text-slate-900 dark:text-white">24,850.20</div>
              <div className="text-[10px] text-emerald-500 font-bold">+142.60 (+0.58%)</div>
            </div>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-[#060B13] border border-slate-100 dark:border-[#141E2E]">
            <div>
              <div className="font-bold text-slate-900 dark:text-white">BANK NIFTY</div>
              <div className="text-[10px] text-slate-400">NSE Index</div>
            </div>
            <div className="text-right font-mono">
              <div className="font-bold text-slate-900 dark:text-white">51,200.40</div>
              <div className="text-[10px] text-emerald-500 font-bold">+310.15 (+0.61%)</div>
            </div>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-[#060B13] border border-slate-100 dark:border-[#141E2E]">
            <div>
              <div className="font-bold text-slate-900 dark:text-white">GOLD FUT (MCX)</div>
              <div className="text-[10px] text-slate-400">Per 10 Grams</div>
            </div>
            <div className="text-right font-mono">
              <div className="font-bold text-slate-900 dark:text-white">₹71,850.00</div>
              <div className="text-[10px] text-emerald-500 font-bold">+420.00 (+0.59%)</div>
            </div>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-[#060B13] border border-slate-100 dark:border-[#141E2E]">
            <div>
              <div className="font-bold text-slate-900 dark:text-white">CRUDE OIL (MCX)</div>
              <div className="text-[10px] text-slate-400">100 BBL</div>
            </div>
            <div className="text-right font-mono">
              <div className="font-bold text-slate-900 dark:text-white">₹6,450.00</div>
              <div className="text-[10px] text-rose-500 font-bold">-45.00 (-0.69%)</div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Account Margin Health Card */}
      <div className="bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-[#1A2638] rounded-2xl p-4 shadow-sm space-y-3 transition-colors">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-emerald-500" /> Margin Health
          </span>
          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
            {marginUsedPercent}% Used
          </span>
        </div>

        <div className="h-2 w-full bg-slate-100 dark:bg-[#142032] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              marginUsedPercent > 80
                ? 'bg-rose-500'
                : marginUsedPercent > 50
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            }`}
            style={{ width: `${marginUsedPercent}%` }}
          />
        </div>

        <div className="flex justify-between text-xs font-mono pt-1">
          <div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Available</span>
            <span className="font-bold text-slate-900 dark:text-white">
              ₹{available.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Used Margin</span>
            <span className="font-bold text-slate-700 dark:text-slate-300">
              ₹{used.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenWallet}
          className="w-full py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold transition-colors cursor-pointer text-center block active:scale-95"
        >
          Manage Wallet & Deposit
        </button>
      </div>
    </div>
  );
};
