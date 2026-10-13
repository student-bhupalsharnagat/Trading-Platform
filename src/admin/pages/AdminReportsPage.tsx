import React, { useEffect, useState } from 'react';
import {
  FileText,
  TrendingUp,
  TrendingDown,
  Download,
  Calendar,
  RefreshCw,
  Search,
  Filter,
  Activity,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAdminRealtime } from '../context/AdminRealtimeContext';

interface AdminReportsPageProps {
  onNavigate: (path: string) => void;
}

export const AdminReportsPage: React.FC<AdminReportsPageProps> = ({ onNavigate }) => {
  const { isConnected, subscribe } = useAdminRealtime();
  const [trades, setTrades] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'ALL'>('ALL');

  const fetchReportsData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [tradesRes, positionsRes, clientsRes] = await Promise.all([
        adminApi.getTrades(),
        adminApi.getRiskPositions().catch(() => []),
        adminApi.getClients(),
      ]);

      setTrades((tradesRes as any)?.data?.trades || (tradesRes as any)?.data || (tradesRes as any)?.trades || []);
      setPositions((positionsRes as any)?.data || positionsRes || []);
      setClients(clientsRes || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load platform reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportsData();
  }, []);

  // Real-time synchronization
  useEffect(() => {
    const unsubTrade = subscribe('trade.executed', (newTrade: any) => {
      setTrades((prev) => [newTrade, ...prev.filter((t) => t.id !== newTrade.id)]);
    });
    const unsubPos = subscribe('position.updated', (newPos: any) => {
      setPositions((prev) => [newPos, ...prev.filter((p) => p.id !== newPos.id)]);
    });
    return () => {
      unsubTrade();
      unsubPos();
    };
  }, [subscribe]);

  const totalRealizedPnl = positions.reduce((sum, p) => sum + Number(p.realized_pnl || 0), 0);
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + Number(p.unrealized_pnl || 0), 0);
  const netPlatformPnl = totalRealizedPnl + totalUnrealizedPnl;
  const totalTurnover = trades.reduce((sum, t) => sum + Number(t.execution_value || 0), 0);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(val);
  };

  const handleExportCSV = () => {
    const headers = ['Trade ID', 'Order ID', 'Client ID', 'Symbol', 'Side', 'Quantity', 'Execution Price', 'Total Value', 'Executed At'];
    const rows = trades.map((t) => [
      t.id,
      t.order_id,
      t.user_id,
      t.instrument_id,
      t.side,
      t.quantity,
      t.execution_price,
      t.execution_value,
      t.executed_at,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Vertex_Trades_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0f172a] border border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
              AUDIT & TAXATION REPORTS
            </span>
            {isConnected && (
              <span className="text-[10px] flex items-center gap-1 text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Sync
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-400" />
            Platform P&L & Turnover Statements
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            SEBI & Tax audit compliant tradebook registers, contract notes reconciliation, and aggregate P&L reports.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={trades.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={fetchReportsData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800">
          <p className="text-xs text-slate-400 font-medium">Net Realized P&L</p>
          <p className={`text-2xl font-bold font-mono mt-1 ${totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatCurrency(totalRealizedPnl)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">Booked from closed client positions</p>
        </div>

        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800">
          <p className="text-xs text-slate-400 font-medium">Unrealized MTM P&L</p>
          <p className={`text-2xl font-bold font-mono mt-1 ${totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatCurrency(totalUnrealizedPnl)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">Live mark-to-market open risk</p>
        </div>

        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800">
          <p className="text-xs text-slate-400 font-medium">Total Trading Turnover</p>
          <p className="text-2xl font-bold font-mono text-cyan-400 mt-1">{formatCurrency(totalTurnover)}</p>
          <p className="text-[10px] text-slate-500 mt-1">Across {trades.length} executed fills</p>
        </div>

        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800">
          <p className="text-xs text-slate-400 font-medium">Active Trading Accounts</p>
          <p className="text-2xl font-bold font-mono text-purple-400 mt-1">{clients.length}</p>
          <p className="text-[10px] text-slate-500 mt-1">Downstream verified client base</p>
        </div>
      </div>

      {/* Executed Trades Ledger Table */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100">Trade Register & Contract Ledger</h3>
            <p className="text-xs text-slate-400">Chronological fill records with execution prices and fill timestamps</p>
          </div>
          <span className="text-[11px] font-mono text-slate-400">Total Fills: {trades.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Trade ID</th>
                <th className="py-3 px-4">Client ID</th>
                <th className="py-3 px-4">Instrument</th>
                <th className="py-3 px-4">Side</th>
                <th className="py-3 px-4">Quantity</th>
                <th className="py-3 px-4">Exec Price</th>
                <th className="py-3 px-4">Exec Value</th>
                <th className="py-3 px-4">Executed Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-500" />
                    Loading trade records...
                  </td>
                </tr>
              ) : trades.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No executed trades recorded on this platform yet.
                  </td>
                </tr>
              ) : (
                trades.map((trade) => {
                  const isBuy = trade.side === 'BUY';
                  return (
                    <tr key={trade.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-200">{trade.id}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">{trade.user_id}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-100">{trade.instrument_id}</td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                          isBuy
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {trade.side}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-200">{trade.quantity}</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-100">₹{Number(trade.execution_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">₹{Number(trade.execution_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                        {new Date(trade.executed_at).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
