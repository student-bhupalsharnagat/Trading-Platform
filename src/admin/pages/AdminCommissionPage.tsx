import React, { useEffect, useState, useMemo } from 'react';
import {
  Percent,
  Coins,
  TrendingUp,
  Building,
  RefreshCw,
  Search,
  CheckCircle2,
  DollarSign,
  ArrowUpRight,
  TrendingDown,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAdminRealtime } from '../context/AdminRealtimeContext';

interface AdminCommissionPageProps {
  onNavigate?: (path: string) => void;
}

export const AdminCommissionPage: React.FC<AdminCommissionPageProps> = () => {
  const { isConnected, subscribe } = useAdminRealtime();
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'PROFIT' | 'LOSS'>('ALL');

  // Standard Zerodha / Upstox Style Commercial Slabs
  const commissionMatrix = [
    {
      segment: 'NSE Equity Delivery (CNC)',
      rate: '0.00% (Zero Brokerage)',
      stt: '0.1% on Buy & Sell',
      exchangeTxn: '0.00297%',
      gst: '18% on Brokerage & Txn',
      sebiCharges: '₹10 / crore',
      stampDuty: '0.015% (Buy only)',
    },
    {
      segment: 'NSE Equity Intraday (MIS)',
      rate: '0.03% or ₹20 / order (Lower)',
      stt: '0.025% on Sell',
      exchangeTxn: '0.00297%',
      gst: '18% on Brokerage & Txn',
      sebiCharges: '₹10 / crore',
      stampDuty: '0.003% (Buy only)',
    },
    {
      segment: 'NSE Equity Futures',
      rate: '0.02% or ₹20 / order (Lower)',
      stt: '0.02% on Sell',
      exchangeTxn: '0.00173%',
      gst: '18% on Brokerage & Txn',
      sebiCharges: '₹10 / crore',
      stampDuty: '0.002% (Buy only)',
    },
    {
      segment: 'NSE Equity Options',
      rate: '₹20 Flat per Executed Order',
      stt: '0.1% on Sell of premium',
      exchangeTxn: '0.03503% (on premium)',
      gst: '18% on Brokerage & Txn',
      sebiCharges: '₹10 / crore',
      stampDuty: '0.003% (Buy only)',
    },
    {
      segment: 'MCX Commodities Futures',
      rate: '0.02% or ₹20 / order (Lower)',
      stt: '0.01% on Sell (Non-Agri)',
      exchangeTxn: '0.0021%',
      gst: '18% on Brokerage & Txn',
      sebiCharges: '₹10 / crore',
      stampDuty: '0.002% (Buy only)',
    },
    {
      segment: 'MCX Commodities Options',
      rate: '₹20 Flat per Executed Order',
      stt: '0.05% on Sell (on premium)',
      exchangeTxn: '0.0418%',
      gst: '18% on Brokerage & Txn',
      sebiCharges: '₹10 / crore',
      stampDuty: '0.003% (Buy only)',
    },
  ];

  // Franchise Revenue Share Split
  const hierarchySplits = [
    { level: 'Super Admin (Platform Desk)', percentage: 0.4, share: '40%', description: 'System infrastructure & clearing license' },
    { level: 'Master Franchise', percentage: 0.3, share: '30%', description: 'Zonal hub & risk oversight' },
    { level: 'Broker / Branch Office', percentage: 0.2, share: '20%', description: 'Territory acquisition & client servicing' },
    { level: 'Sub-Broker / Authorized Person (AP)', percentage: 0.1, share: '10%', description: 'Direct relationship partner' },
  ];

  const fetchCommissionData = async () => {
    try {
      setLoading(true);
      setError(null);
      const tradesRes = await adminApi.getTrades();
      const list = Array.isArray(tradesRes)
        ? tradesRes
        : (tradesRes?.trades || tradesRes?.data?.trades || tradesRes?.data || []);
      setTrades(Array.isArray(list) ? list : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load commission data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommissionData();
  }, []);

  // Real-time updates when trade executed
  useEffect(() => {
    const unsubTrade = subscribe('trade.executed', (newTrade: any) => {
      setTrades((prev) => [newTrade, ...prev.filter((t) => t.id !== newTrade.id)]);
    });
    return () => {
      unsubTrade();
    };
  }, [subscribe]);

  // Aggregate Calculations
  const calculations = useMemo(() => {
    let turnover = 0;
    let brokerage = 0;
    let totalClientProfit = 0;
    let totalClientLoss = 0;
    let profitShareCommission = 0;

    for (const t of trades) {
      const val = Number(
        t.execution_value ||
        t.total_value ||
        t.executionValue ||
        (Number(t.price || t.execution_price || t.executionPrice || 0) * Number(t.quantity || t.qty || 0)) ||
        0
      );
      turnover += val;

      const fee = Number(
        t.fees != null && t.fees !== ''
          ? t.fees
          : t.commission != null && t.commission !== ''
          ? t.commission
          : 20
      );
      brokerage += fee > 0 ? fee : 20;

      const pnl = Number(t.realized_pnl != null ? t.realized_pnl : (t.realizedPnl != null ? t.realizedPnl : 0));
      if (pnl > 0) {
        totalClientProfit += pnl;
        // Platform earns 20% commission on trading platform profit
        profitShareCommission += pnl * 0.2;
      } else if (pnl < 0) {
        totalClientLoss += Math.abs(pnl);
      }
    }

    const totalRevenue = brokerage + profitShareCommission;

    return {
      totalTurnover: turnover,
      brokerageCommission: brokerage,
      totalClientProfit,
      totalClientLoss,
      profitShareCommission,
      totalRevenue,
      billableTrades: trades.length,
    };
  }, [trades]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatDecimalCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  // Filtered trades for table
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      const pnl = Number(t.realized_pnl != null ? t.realized_pnl : (t.realizedPnl != null ? t.realizedPnl : 0));
      if (filterType === 'PROFIT' && pnl <= 0) return false;
      if (filterType === 'LOSS' && pnl >= 0) return false;

      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const symbol = (t.symbol || t.instrument_id || '').toLowerCase();
      const tradeId = (t.id || t.trade_id || '').toLowerCase();
      const clientName = (t.client_name || t.clientName || '').toLowerCase();
      const clientCode = (t.client_id || t.trading_user_id || t.userId || '').toLowerCase();
      return symbol.includes(q) || tradeId.includes(q) || clientName.includes(q) || clientCode.includes(q);
    });
  }, [trades, searchQuery, filterType]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0f172a] border border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              REVENUE & BROKERAGE CONFIGURATION
            </span>
            {isConnected && (
              <span className="text-[10px] flex items-center gap-1 text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Sync
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Percent className="w-5 h-5 text-amber-400" />
            Commission & Profit Share Matrix
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time tracking of platform profit commission (20% share on client realized profit), discount brokerage tariffs, and franchise split distribution.
          </p>
        </div>

        <button
          onClick={fetchCommissionData}
          disabled={loading}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* KPI Cards: Revenue & Calculations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Turnover */}
        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800">
          <p className="text-xs text-slate-400 font-medium">Total Trading Turnover</p>
          <p className="text-xl font-bold font-mono text-cyan-400 mt-1">{formatCurrency(calculations.totalTurnover)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{calculations.billableTrades} executed order(s)</p>
        </div>

        {/* Client Realized Profit */}
        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800">
          <p className="text-xs text-slate-400 font-medium">Trading Platform Profit</p>
          <p className="text-xl font-bold font-mono text-emerald-400 mt-1">+{formatCurrency(calculations.totalClientProfit)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Gross client realized gains</p>
        </div>

        {/* Commission from Trading Platform Profit */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-amber-950/40 to-slate-900 border border-amber-600/40 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-300 font-semibold">Profit Commission (20%)</p>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              SHARE
            </span>
          </div>
          <p className="text-xl font-bold font-mono text-amber-400 mt-1">{formatCurrency(calculations.profitShareCommission)}</p>
          <p className="text-[10px] text-amber-300/80 mt-1">Earned on client trading profits</p>
        </div>

        {/* Brokerage Commission */}
        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800">
          <p className="text-xs text-slate-400 font-medium">Brokerage Commission</p>
          <p className="text-xl font-bold font-mono text-slate-200 mt-1">{formatCurrency(calculations.brokerageCommission)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Standard ₹20 flat or 0.03%</p>
        </div>

        {/* Total Platform Commission Revenue */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/40 to-slate-900 border border-emerald-600/40 shadow-sm">
          <p className="text-xs text-emerald-300 font-semibold">Net Platform Revenue</p>
          <p className="text-xl font-bold font-mono text-emerald-300 mt-1">{formatCurrency(calculations.totalRevenue)}</p>
          <p className="text-[10px] text-emerald-400/80 mt-1">Brokerage + Profit Commission</p>
        </div>
      </div>

      {/* Multi-Tier Hierarchy Revenue Sharing */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-100">Franchise Hierarchy Commission Distribution</h3>
            <p className="text-xs text-slate-400">
              Automated waterfall revenue allocation computed directly from net platform commission ({formatCurrency(calculations.totalRevenue)}).
            </p>
          </div>
          <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20 w-fit">
            100% Commission Allocated
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {hierarchySplits.map((split, idx) => {
            const rupeeShare = calculations.totalRevenue * split.percentage;
            return (
              <div key={idx} className="p-4 rounded-xl bg-slate-900 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-slate-500">Tier {idx + 1}</span>
                  <span className="text-base font-mono font-bold text-amber-400">{split.share}</span>
                </div>
                <h4 className="text-xs font-bold text-slate-200">{split.level}</h4>
                <div className="pt-1 border-t border-slate-800/60">
                  <p className="text-[10px] text-slate-400">Earned Payout:</p>
                  <p className="text-sm font-mono font-bold text-emerald-400">{formatCurrency(rupeeShare)}</p>
                </div>
                <p className="text-[11px] text-slate-500">{split.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Executed Trades & Profit-Share Commission Ledger */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400" />
              Executed Trades & Profit-Share Commission Breakdown
            </h3>
            <p className="text-xs text-slate-400">
              Trade-level itemization of client profit, brokerage charged, and 20% platform profit-share commission.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Buttons */}
            <div className="flex rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setFilterType('ALL')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  filterType === 'ALL' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({trades.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('PROFIT')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  filterType === 'PROFIT' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Profits Only
              </button>
            </div>

            {/* Search Box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search symbol, client..."
                className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-hidden focus:border-amber-400/50 w-48"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Trade / Time</th>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Symbol & Side</th>
                <th className="py-3 px-4">Qty & Price</th>
                <th className="py-3 px-4">Turnover</th>
                <th className="py-3 px-4 text-right">Realized P&L</th>
                <th className="py-3 px-4 text-right">Brokerage</th>
                <th className="py-3 px-4 text-right">Profit Comm. (20%)</th>
                <th className="py-3 px-4 text-right">Net Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    No executed trades found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredTrades.map((t, idx) => {
                  const qty = Number(t.quantity || t.qty || 0);
                  const price = Number(t.price || t.execution_price || t.executionPrice || 0);
                  const turnover = Number(t.execution_value || t.total_value || t.executionValue || qty * price);
                  const brokerage = Number(
                    t.fees != null && t.fees !== ''
                      ? t.fees
                      : t.commission != null && t.commission !== ''
                      ? t.commission
                      : 20
                  );
                  const pnl = Number(t.realized_pnl != null ? t.realized_pnl : (t.realizedPnl != null ? t.realizedPnl : 0));
                  const profitComm = pnl > 0 ? pnl * 0.2 : 0;
                  const netTradeRevenue = (brokerage > 0 ? brokerage : 20) + profitComm;
                  const timeStr = t.executed_at ? new Date(t.executed_at).toLocaleTimeString() : 'Just now';

                  return (
                    <tr key={t.id || idx} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-mono text-[11px] text-slate-300 font-semibold">{t.id || t.trade_id || `TRD-${idx}`}</div>
                        <div className="text-[10px] text-slate-500">{timeStr}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200">{t.client_name || t.clientName || 'Trader'}</div>
                        <div className="text-[10px] font-mono text-slate-500">{t.client_id || t.trading_user_id || t.user_id || 'ID-N/A'}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200">{t.symbol || t.instrument_id}</div>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            (t.side || '').toUpperCase() === 'BUY'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {t.side}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-300">
                        {qty} @ ₹{price.toFixed(2)}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-300">
                        {formatCurrency(turnover)}
                      </td>

                      <td className="py-3 px-4 font-mono text-right font-bold">
                        {pnl > 0 ? (
                          <span className="text-emerald-400 flex items-center justify-end gap-1">
                            <TrendingUp className="w-3 h-3" />+{formatDecimalCurrency(pnl)}
                          </span>
                        ) : pnl < 0 ? (
                          <span className="text-rose-400 flex items-center justify-end gap-1">
                            <TrendingDown className="w-3 h-3" />-{formatDecimalCurrency(Math.abs(pnl))}
                          </span>
                        ) : (
                          <span className="text-slate-500">₹0.00</span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-right text-slate-300">
                        {formatDecimalCurrency(brokerage > 0 ? brokerage : 20)}
                      </td>

                      <td className="py-3 px-4 font-mono text-right font-bold">
                        {profitComm > 0 ? (
                          <span className="text-amber-400">+{formatDecimalCurrency(profitComm)}</span>
                        ) : (
                          <span className="text-slate-600">₹0.00</span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-right font-bold text-emerald-300">
                        {formatDecimalCurrency(netTradeRevenue)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tariff Matrix Table */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100">Standard Discount Brokerage Slabs</h3>
            <p className="text-xs text-slate-400">Fixed rate and regulatory exchange pass-through fee schedule</p>
          </div>
          <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
            Active Tariff Plan
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Segment / Market</th>
                <th className="py-3 px-4">Brokerage Fee</th>
                <th className="py-3 px-4">STT / CTT</th>
                <th className="py-3 px-4">Exchange Txn</th>
                <th className="py-3 px-4">GST</th>
                <th className="py-3 px-4">SEBI Turnover</th>
                <th className="py-3 px-4">Stamp Duty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {commissionMatrix.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-slate-200">{item.segment}</td>
                  <td className="py-3.5 px-4 font-bold text-amber-400">{item.rate}</td>
                  <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px]">{item.stt}</td>
                  <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px]">{item.exchangeTxn}</td>
                  <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px]">{item.gst}</td>
                  <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px]">{item.sebiCharges}</td>
                  <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px]">{item.stampDuty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
