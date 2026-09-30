import React, { useEffect, useState } from 'react';
import {
  Percent,
  Coins,
  TrendingUp,
  Building,
  RefreshCw,
  Search,
  CheckCircle2,
  Sliders,
  DollarSign,
  ArrowUpRight,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAdminRealtime } from '../context/AdminRealtimeContext';

interface AdminCommissionPageProps {
  onNavigate: (path: string) => void;
}

export const AdminCommissionPage: React.FC<AdminCommissionPageProps> = ({ onNavigate }) => {
  const { isConnected, subscribe } = useAdminRealtime();
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Standard Zerodha / Upstox Style Commercial Slabs
  const [commissionMatrix, setCommissionMatrix] = useState([
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
  ]);

  // Franchise Revenue Share Split
  const hierarchySplits = [
    { level: 'Super Admin (Platform Desk)', share: '40%', description: 'System infrastructure & clearing license' },
    { level: 'Master Franchise', share: '30%', description: 'Zonal hub & risk oversight' },
    { level: 'Broker / Branch Office', share: '20%', description: 'Territory acquisition & client servicing' },
    { level: 'Sub-Broker / Authorized Person (AP)', share: '10%', description: 'Direct relationship partner' },
  ];

  const fetchCommissionData = async () => {
    try {
      setLoading(true);
      setError(null);
      const tradesRes = await adminApi.getTrades();
      setTrades(tradesRes?.data?.trades || tradesRes?.data || tradesRes?.trades || []);
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

  const totalTurnover = trades.reduce((sum, t) => sum + Number(t.execution_value || 0), 0);
  const totalCommission = trades.reduce((sum, t) => sum + Number(t.fees || 20), 0);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

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
            Commission & Brokerage Matrix
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            SEBI compliant discount brokerage tariffs (Zerodha/Upstox standard) and multi-tier franchise revenue distribution.
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800">
          <p className="text-xs text-slate-400 font-medium">Total Trading Turnover</p>
          <p className="text-2xl font-bold font-mono text-cyan-400 mt-1">{formatCurrency(totalTurnover)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Across all downstream client executions</p>
        </div>

        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800">
          <p className="text-xs text-slate-400 font-medium">Aggregated Brokerage Earned</p>
          <p className="text-2xl font-bold font-mono text-amber-400 mt-1">{formatCurrency(totalCommission)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Total platform commission generated</p>
        </div>

        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800">
          <p className="text-xs text-slate-400 font-medium">Total Billable Trades</p>
          <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">{trades.length}</p>
          <p className="text-[10px] text-slate-500 mt-1">Orders filled at ₹20 / order or 0.03%</p>
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

      {/* Multi-Tier Hierarchy Revenue Sharing */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-100 mb-1">Franchise Hierarchy Commission Split</h3>
        <p className="text-xs text-slate-400 mb-4">
          Automated revenue distribution percentage on every client executed order across the commercial node hierarchy.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {hierarchySplits.map((split, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-slate-900 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-500">Tier {idx + 1}</span>
                <span className="text-lg font-mono font-bold text-amber-400">{split.share}</span>
              </div>
              <h4 className="text-xs font-bold text-slate-200">{split.level}</h4>
              <p className="text-[11px] text-slate-400">{split.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
