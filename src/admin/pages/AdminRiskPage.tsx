import React, { useEffect, useState, useMemo } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Power,
  Lock,
  Unlock,
  AlertCircle,
  XCircle,
  Users,
  Search,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAdminRealtime } from '../context/AdminRealtimeContext';

interface AdminRiskPageProps {
  onNavigate: (path: string) => void;
}

export const AdminRiskPage: React.FC<AdminRiskPageProps> = ({ onNavigate }) => {
  const { isConnected, subscribe } = useAdminRealtime();
  const [riskData, setRiskData] = useState<any | null>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchRiskData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [summaryRes, positionsRes] = await Promise.all([
        adminApi.getRiskSummary(),
        adminApi.getRiskPositions(),
      ]);

      setRiskData((summaryRes as any)?.data || summaryRes || null);
      setPositions((positionsRes as any)?.data || positionsRes || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load risk metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRiskData();
  }, []);

  // Real-time subscriptions for RMS
  useEffect(() => {
    const unsubPos = subscribe('position.updated', (posPayload: any) => {
      setPositions((prev) => {
        if (posPayload.status === 'CLOSED' || Number(posPayload.quantity) === 0) {
          return prev.filter((p) => p.id !== posPayload.positionId && p.id !== posPayload.id);
        }
        const exists = prev.some((p) => p.id === (posPayload.positionId || posPayload.id));
        if (exists) {
          return prev.map((p) =>
            p.id === (posPayload.positionId || posPayload.id) ? { ...p, ...posPayload } : p
          );
        }
        return [posPayload, ...prev];
      });
    });

    const unsubTicks = subscribe('market.ticks', (ticksData: any) => {
      if (ticksData?.instruments) {
        const priceMap = new Map<string, number>();
        ticksData.instruments.forEach((inst: any) => {
          priceMap.set(inst.symbol, inst.lastPrice);
        });

        setPositions((prev) =>
          prev.map((pos) => {
            const ltp = priceMap.get(pos.symbol) || pos.currentPrice || pos.averagePrice;
            const avg = Number(pos.averagePrice || 0);
            const qty = Number(pos.quantity || 0);
            const isBuy = pos.side === 'BUY';
            const pnl = isBuy ? (ltp - avg) * qty : (avg - ltp) * qty;
            return {
              ...pos,
              currentPrice: ltp,
              unrealizedPnl: Number(pnl.toFixed(2)),
            };
          })
        );
      }
    });

    const unsubBreach = subscribe('risk.margin_breach', (breachPayload: any) => {
      setError(`RMS ALERT: Margin breach detected for client ${breachPayload.userId}! Margin utilization exceeded 100%.`);
      fetchRiskData();
    });

    return () => {
      unsubPos();
      unsubTicks();
      unsubBreach();
    };
  }, [subscribe]);

  const handleSquareOff = async (userId: string, positionId: string) => {
    try {
      setProcessingId(positionId);
      setActionSuccess(null);
      setError(null);

      await adminApi.squareOffPosition(userId, positionId);
      setActionSuccess(`Position ${positionId} squared off successfully.`);
      setPositions((prev) => prev.filter((p) => p.id !== positionId));
    } catch (err: any) {
      setError(err.message || 'Failed to square off position');
    } finally {
      setProcessingId(null);
    }
  };

  const handleToggleFreeze = async (userId: string, currentFrozen: boolean) => {
    try {
      setProcessingId(userId);
      setActionSuccess(null);
      setError(null);

      await adminApi.freezeClient(userId, !currentFrozen, 'Administrative RMS Intervention');
      setActionSuccess(`Client ${userId} ${!currentFrozen ? 'frozen' : 'unfrozen'} successfully.`);
      await fetchRiskData();
    } catch (err: any) {
      setError(err.message || 'Failed to toggle client freeze status');
    } finally {
      setProcessingId(null);
    }
  };

  // High risk accounts
  const highRiskClients = useMemo(() => {
    return riskData?.highRiskClients || [];
  }, [riskData]);

  // Filtered positions
  const filteredPositions = useMemo(() => {
    return positions.filter((p) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        (p.symbol && p.symbol.toLowerCase().includes(q)) ||
        (p.userId && p.userId.toLowerCase().includes(q)) ||
        (p.clientName && p.clientName.toLowerCase().includes(q))
      );
    });
  }, [positions, searchQuery]);

  const totalUnrealizedPnl = useMemo(() => {
    return positions.reduce((sum, p) => sum + Number(p.unrealizedPnl || 0), 0);
  }, [positions]);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <h2 className="text-xl font-bold text-slate-100">Risk Management System (RMS)</h2>
            {isConnected && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>RMS LIVE</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Real-time margin utilization monitoring, open exposure, emergency auto-square off, and account freeze desk.
          </p>
        </div>

        <button
          onClick={fetchRiskData}
          className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-xs font-semibold text-slate-300 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh RMS</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Top 4 RMS Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Total Open Exposure</span>
          <span className="text-xl font-mono font-bold text-white block">
            ₹{Number(riskData?.totalExposure || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block font-mono">
            {positions.length} open position contracts
          </span>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Total Used Margin</span>
          <span className="text-xl font-mono font-bold text-amber-400 block">
            ₹{Number(riskData?.usedMargin || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block font-mono">
            Available: ₹{Number(riskData?.availableMargin || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Net Platform MTM P&L</span>
          <span
            className={`text-xl font-mono font-bold block ${
              totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {totalUnrealizedPnl >= 0 ? '+' : ''}₹{totalUnrealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block">Live floating client P&L</span>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Accounts in Danger / Breach</span>
          <span
            className={`text-xl font-mono font-bold block ${
              highRiskClients.length > 0 ? 'text-rose-400 animate-pulse' : 'text-emerald-400'
            }`}
          >
            {highRiskClients.length} Accounts
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block">Margin utilization &gt; 70%</span>
        </div>
      </div>

      {/* High-Risk Accounts Warning Desk */}
      {highRiskClients.length > 0 && (
        <div className="bg-rose-950/20 border border-rose-800/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <h3 className="text-xs font-bold text-rose-200 uppercase tracking-wider">
                High Margin Utilization Accounts ({highRiskClients.length})
              </h3>
            </div>
            <span className="text-[10px] text-rose-300 font-semibold">Immediate RMS Action Recommended</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0b1120]/80 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="p-2.5">Client User</th>
                  <th className="p-2.5">Full Name</th>
                  <th className="p-2.5 text-right">Equity</th>
                  <th className="p-2.5 text-right">Used Margin</th>
                  <th className="p-2.5 text-right">Utilization %</th>
                  <th className="p-2.5 text-center">Risk Level</th>
                  <th className="p-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-900/30 font-mono">
                {highRiskClients.map((client: any) => (
                  <tr key={client.userId} className="hover:bg-rose-900/10">
                    <td className="p-2.5 font-bold text-blue-400">{client.userId}</td>
                    <td className="p-2.5 font-sans">{client.fullName}</td>
                    <td className="p-2.5 text-right text-white">₹{Number(client.equity || 0).toFixed(2)}</td>
                    <td className="p-2.5 text-right text-amber-400">₹{Number(client.usedMargin || 0).toFixed(2)}</td>
                    <td className="p-2.5 text-right font-bold text-rose-400">{client.marginUtilization}%</td>
                    <td className="p-2.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          client.riskStatus === 'BREACH'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {client.riskStatus || 'WARNING'}
                      </span>
                    </td>
                    <td className="p-2.5 text-right">
                      <button
                        onClick={() => handleToggleFreeze(client.userId, client.isFrozen)}
                        disabled={processingId === client.userId}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                          client.isFrozen
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-rose-600 hover:bg-rose-500 text-white'
                        }`}
                      >
                        {client.isFrozen ? 'Unfreeze' : 'Freeze Client'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Open Positions Master Book */}
      <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100">Live Client Open Positions Desk</h3>
            <p className="text-xs text-slate-400">Mark-to-market positions ticking live with one-click square off</p>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user, symbol..."
              className="pl-8 pr-3 py-1.5 bg-[#0b1120] border border-slate-700/60 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-48 sm:w-60"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#0b1120] text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3">Client User</th>
                <th className="p-3">Instrument</th>
                <th className="p-3">Side</th>
                <th className="p-3 text-right">Quantity</th>
                <th className="p-3 text-right">Avg Price</th>
                <th className="p-3 text-right">Live Price</th>
                <th className="p-3 text-right">Unrealized P&L</th>
                <th className="p-3 text-right">Margin Held</th>
                <th className="p-3 text-right">RMS Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {filteredPositions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500 font-sans">
                    {loading ? 'Loading open positions...' : 'No open positions across platform.'}
                  </td>
                </tr>
              ) : (
                filteredPositions.map((p) => {
                  const pnl = Number(p.unrealizedPnl || p.pnl || 0);
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-sans">
                        <button
                          onClick={() => onNavigate(`/admin/clients/${p.userId}`)}
                          className="font-semibold text-blue-400 hover:underline"
                        >
                          {p.userId}
                        </button>
                        <span className="block text-[10px] text-slate-500">{p.clientName}</span>
                      </td>
                      <td className="p-3 font-sans font-bold text-white">{p.symbol || p.instrument_id}</td>
                      <td className="p-3">
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            p.side === 'BUY'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {p.side}
                        </span>
                      </td>
                      <td className="p-3 text-right text-white font-bold">{p.quantity}</td>
                      <td className="p-3 text-right text-white">₹{Number(p.averagePrice || 0).toFixed(2)}</td>
                      <td className="p-3 text-right text-white font-bold">
                        ₹{Number(p.currentPrice || p.ltp || p.averagePrice || 0).toFixed(2)}
                      </td>
                      <td
                        className={`p-3 text-right font-bold ${
                          pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)}
                      </td>
                      <td className="p-3 text-right">₹{Number(p.marginUsed || 0).toFixed(2)}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleSquareOff(p.userId, p.id)}
                          disabled={processingId === p.id}
                          className="px-2.5 py-1 rounded bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 text-[10px] font-bold transition-colors"
                        >
                          {processingId === p.id ? 'Exiting...' : 'Square Off'}
                        </button>
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
