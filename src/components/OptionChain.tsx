import React, { useState } from 'react';
import { Instrument } from '../types.ts';
import { X, TrendingUp, TrendingDown, Layers, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface OptionChainProps {
  instrument: Instrument;
  onClose: () => void;
  onSelectOption: (optionSymbol: string, strikePrice: number, optionType: 'CE' | 'PE', price: number) => void;
}

export const OptionChain: React.FC<OptionChainProps> = ({
  instrument,
  onClose,
  onSelectOption,
}) => {
  const [selectedExpiry, setSelectedExpiry] = useState<string>(instrument.expiry || '31 Aug');
  const basePrice = instrument.lastPrice || 1000;

  // Generate strike step based on instrument price
  const step = basePrice > 50000 ? 500 : basePrice > 10000 ? 100 : basePrice > 1000 ? 50 : 5;
  const atmStrike = Math.round(basePrice / step) * step;

  // Generate strikes around ATM
  const strikes = [];
  for (let i = -6; i <= 6; i++) {
    const strike = atmStrike + i * step;
    const diff = strike - basePrice;
    
    // Call pricing model approx (Black-Scholes heuristic for UI simulation)
    const callIntrinsic = Math.max(0, basePrice - strike);
    const timeValue = Math.max(10, step * 0.45 * Math.exp(-Math.abs(diff) / (step * 3)));
    const callPrice = Number((callIntrinsic + timeValue).toFixed(2));
    
    // Put pricing
    const putIntrinsic = Math.max(0, strike - basePrice);
    const putPrice = Number((putIntrinsic + timeValue).toFixed(2));

    const callOI = Math.floor(12000 + Math.random() * 45000 - Math.abs(diff) * 15);
    const putOI = Math.floor(14000 + Math.random() * 48000 - Math.abs(diff) * 15);

    const callIV = Number((14.2 + (Math.abs(diff) / step) * 0.3).toFixed(1));
    const putIV = Number((15.1 + (Math.abs(diff) / step) * 0.3).toFixed(1));

    strikes.push({
      strike,
      isATM: i === 0,
      call: {
        price: Math.max(0.5, callPrice),
        change: Number(((callPrice * (instrument.change >= 0 ? 0.05 : -0.05))).toFixed(2)),
        changePercent: instrument.change >= 0 ? 4.2 : -5.1,
        oi: Math.max(1000, callOI),
        iv: callIV,
      },
      put: {
        price: Math.max(0.5, putPrice),
        change: Number(((putPrice * (instrument.change >= 0 ? -0.05 : 0.05))).toFixed(2)),
        changePercent: instrument.change >= 0 ? -4.8 : 5.4,
        oi: Math.max(1000, putOI),
        iv: putIV,
      },
    });
  }

  return (
    <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-[#080E18] border border-[#1A2638] rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="p-3 sm:p-4 bg-[#0B111C] border-b border-[#141E2E] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base md:text-lg font-black text-white truncate">{instrument.symbol} Option Chain</h2>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono shrink-0">
                  Spot: ₹{basePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">Select any Strike to trade Calls (CE) or Puts (PE)</p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
            {/* Expiry Selector */}
            <div className="flex items-center gap-1 bg-[#101928] p-1 rounded-lg border border-[#1E2E44] overflow-x-auto no-scrollbar">
              {['31 Aug', '07 Sep', '14 Sep', '28 Sep'].map((exp) => (
                <button
                  key={exp}
                  type="button"
                  onClick={() => setSelectedExpiry(exp)}
                  className={`px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-bold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    selectedExpiry === exp
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {exp}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-[#142032] hover:bg-slate-800 border border-[#223652] text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
          <table className="w-full min-w-[680px] text-xs text-left border-collapse font-mono">
            {/* Table Head */}
            <thead className="sticky top-0 z-10 bg-[#0E1726] border-b border-[#1E2E44] text-slate-400 text-[11px] uppercase tracking-wider">
              <tr>
                <th colSpan={4} className="py-2 px-3 text-center bg-emerald-950/30 text-emerald-400 border-r border-[#1E2E44]">
                  CALLS (CE)
                </th>
                <th className="py-2 px-3 text-center bg-slate-900 text-amber-400 border-r border-[#1E2E44]">
                  STRIKE
                </th>
                <th colSpan={4} className="py-2 px-3 text-center bg-rose-950/30 text-rose-400">
                  PUTS (PE)
                </th>
              </tr>
              <tr className="bg-[#0A101C] text-slate-400 text-[10px]">
                <th className="py-1.5 px-3">OI</th>
                <th className="py-1.5 px-3">IV%</th>
                <th className="py-1.5 px-3">LTP (₹)</th>
                <th className="py-1.5 px-3 border-r border-[#1E2E44] text-center">TRADE</th>
                <th className="py-1.5 px-3 text-center bg-slate-900/80 text-amber-300 border-r border-[#1E2E44]">
                  PRICE
                </th>
                <th className="py-1.5 px-3 text-center">TRADE</th>
                <th className="py-1.5 px-3 text-right">LTP (₹)</th>
                <th className="py-1.5 px-3 text-right">IV%</th>
                <th className="py-1.5 px-3 text-right">OI</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-[#141F30]">
              {strikes.map((row) => {
                const isITMCall = row.strike < basePrice;
                const isITMPut = row.strike > basePrice;

                return (
                  <tr
                    key={row.strike}
                    className={`hover:bg-[#121B2A] transition-colors ${
                      row.isATM ? 'bg-amber-500/10 font-bold' : ''
                    }`}
                  >
                    {/* CE Side */}
                    <td className={`py-2 px-3 text-slate-400 ${isITMCall ? 'bg-emerald-950/15' : ''}`}>
                      {row.call.oi.toLocaleString('en-IN')}
                    </td>
                    <td className={`py-2 px-3 text-slate-400 ${isITMCall ? 'bg-emerald-950/15' : ''}`}>
                      {row.call.iv}%
                    </td>
                    <td className={`py-2 px-3 font-bold text-emerald-400 ${isITMCall ? 'bg-emerald-950/15' : ''}`}>
                      ₹{row.call.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`py-2 px-2 border-r border-[#1E2E44] text-center ${isITMCall ? 'bg-emerald-950/15' : ''}`}>
                      <button
                        type="button"
                        onClick={() =>
                          onSelectOption(
                            `${instrument.symbol} ${row.strike} CE`,
                            row.strike,
                            'CE',
                            row.call.price
                          )
                        }
                        className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-[10px] rounded transition-colors cursor-pointer"
                      >
                        BUY CE
                      </button>
                    </td>

                    {/* STRIKE PRICE */}
                    <td className={`py-2 px-3 text-center border-r border-[#1E2E44] font-black ${
                      row.isATM ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-900/60 text-white'
                    }`}>
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                        {row.strike.toLocaleString('en-IN')}
                        {row.isATM && <span className="ml-1 text-[9px] text-amber-400">ATM</span>}
                      </span>
                    </td>

                    {/* PE Side */}
                    <td className={`py-2 px-2 text-center ${isITMPut ? 'bg-rose-950/15' : ''}`}>
                      <button
                        type="button"
                        onClick={() =>
                          onSelectOption(
                            `${instrument.symbol} ${row.strike} PE`,
                            row.strike,
                            'PE',
                            row.put.price
                          )
                        }
                        className="px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white font-black text-[10px] rounded transition-colors cursor-pointer"
                      >
                        BUY PE
                      </button>
                    </td>
                    <td className={`py-2 px-3 text-right font-bold text-rose-400 ${isITMPut ? 'bg-rose-950/15' : ''}`}>
                      ₹{row.put.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className={`py-2 px-3 text-right text-slate-400 ${isITMPut ? 'bg-rose-950/15' : ''}`}>
                      {row.put.iv}%
                    </td>
                    <td className={`py-2 px-3 text-right text-slate-400 ${isITMPut ? 'bg-rose-950/15' : ''}`}>
                      {row.put.oi.toLocaleString('en-IN')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#0B111C] border-t border-[#141E2E] flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-emerald-950/40 border border-emerald-500/30" /> In The Money (ITM)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-amber-500/20 border border-amber-500/50" /> At The Money (ATM)
            </span>
          </div>
          <span className="font-mono text-slate-500">Real-time Greeks & Volatility</span>
        </div>
      </div>
    </div>
  );
};
