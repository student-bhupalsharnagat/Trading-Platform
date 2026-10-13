import React, { useEffect, useState } from 'react';
import { ArrowLeft, Users, Wallet, TrendingUp, BookOpen, Clock, RefreshCw, ShieldAlert } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { HierarchyBadge } from '../components/HierarchyBadge';

interface ClientDetailsProps {
  id: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
}

export const ClientDetails: React.FC<ClientDetailsProps> = ({ id, onBack, onNavigate }) => {
  const [accountData, setAccountData] = useState<any | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'POSITIONS' | 'ORDERS' | 'TRADES'>('OVERVIEW');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAllClientData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [acc, ordData, trdData, posData] = await Promise.all([
        adminApi.getClientAccount(id).catch(() => null),
        adminApi.getClientOrders(id).catch(() => ({ orders: [] })),
        adminApi.getClientTrades(id).catch(() => ({ trades: [] })),
        adminApi.getClientPositions(id).catch(() => ({ positions: [] })),
      ]);

      if (acc) setAccountData(acc);
      setOrders(ordData?.orders || []);
      setTrades(trdData?.trades || []);
      setPositions(posData?.positions || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load client details');
    } fontFinally: {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllClientData();
  }, [id]);

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
        <span>Loading authoritative client records...</span>
      </div>
    );
  }

  if (error || !accountData) {
    return (
      <div className="p-6 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs space-y-3">
        <div className="flex items-center gap-2 font-bold text-sm text-rose-200">
          <ShieldAlert className="w-4 h-4" />
          <span>Client Details Unavailable</span>
        </div>
        <p>{error || `Client record '${id}' could not be retrieved from tenant context.`}</p>
        <button
          onClick={onBack}
          className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
        >
          Return to Clients List
        </button>
      </div>
    );
  }

  const { identity, account } = accountData;

  const formatINR = (num?: number) => {
    const val = Number(num || 0);
    return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg border border-slate-700/60 hover:bg-slate-800 text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <HierarchyBadge role="CLIENT" />
              <span className="text-xs font-mono text-slate-400">Path: {identity?.hierarchy_path}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-100">{identity?.full_name}</h2>
          </div>
        </div>

        <button
          onClick={loadAllClientData}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-xs font-semibold text-slate-300 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Account Highlights Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Total Equity</span>
          <span className="text-lg font-mono font-bold text-white block">{formatINR(account?.equity)}</span>
          <span className="text-[10px] text-slate-500 font-mono mt-1 block">
            Wallet Balance: {formatINR(account?.balance)}
          </span>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Available Margin</span>
          <span className="text-lg font-mono font-bold text-emerald-400 block">
            {formatINR(account?.available_margin)}
          </span>
          <span className="text-[10px] text-slate-500 font-mono mt-1 block">
            Used: {formatINR(account?.used_margin)}
          </span>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Total Realized P&L</span>
          <span
            className={`text-lg font-mono font-bold block ${
              (account?.realized_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {(account?.realized_pnl || 0) >= 0 ? '+' : ''}
            {formatINR(account?.realized_pnl)}
          </span>
          <span className="text-[10px] text-slate-500 font-mono mt-1 block">
            Executed Trades: {account?.total_trades_count ?? 0}
          </span>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Open Unrealized P&L</span>
          <span
            className={`text-lg font-mono font-bold block ${
              (account?.unrealized_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {(account?.unrealized_pnl || 0) >= 0 ? '+' : ''}
            {formatINR(account?.unrealized_pnl)}
          </span>
          <span className="text-[10px] text-slate-500 font-mono mt-1 block">
            Open Positions: {account?.open_positions_count ?? 0}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('OVERVIEW')}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'OVERVIEW'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          Profile & Account
        </button>
        <button
          onClick={() => setActiveTab('POSITIONS')}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'POSITIONS'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Positions ({positions.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('ORDERS')}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'ORDERS'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Orders ({orders.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('TRADES')}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'TRADES'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Trades ({trades.length})</span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'OVERVIEW' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* PROFILE CARD */}
          <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              <span>Trader Profile</span>
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block mb-0.5">Client / User ID</span>
                <span className="font-mono font-bold text-blue-400">{identity?.user_id}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Full Name</span>
                <span className="font-semibold text-white">{identity?.full_name}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Mobile Number</span>
                <span className="text-slate-300 font-mono">{identity?.mobile || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Email Address</span>
                <span className="text-slate-300">{identity?.email || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Account Status</span>
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                  {identity?.status || 'ACTIVE'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Registration Date</span>
                <span className="text-slate-300 font-mono">
                  {identity?.created_at ? new Date(identity.created_at).toLocaleDateString('en-GB') : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* ACCOUNT CARD */}
          <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-400" />
              <span>Financial Account Summary</span>
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div>
                <span className="text-slate-500 block mb-0.5">Available Balance</span>
                <span className="text-white font-bold">{formatINR(account?.wallet_available_balance)}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Blocked Balance</span>
                <span className="text-slate-300">{formatINR(account?.wallet_blocked_balance)}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Used Margin</span>
                <span className="text-slate-300">{formatINR(account?.used_margin)}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Free Margin</span>
                <span className="text-emerald-400 font-bold">{formatINR(account?.free_margin)}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Margin Utilization</span>
                <span className="text-amber-400 font-bold">{account?.margin_utilization ?? 0}%</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Total Turnover</span>
                <span className="text-cyan-400 font-bold">{formatINR(account?.total_turnover)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'POSITIONS' && (
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Open & Closed Positions</h3>
            <span className="text-xs text-slate-400 font-mono">{positions.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0b1120] text-slate-400 uppercase tracking-wider font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3">Instrument</th>
                  <th className="p-3">Side</th>
                  <th className="p-3 text-right">Quantity</th>
                  <th className="p-3 text-right">Avg Price</th>
                  <th className="p-3 text-right">Current Price</th>
                  <th className="p-3 text-right">Unrealized P&L</th>
                  <th className="p-3 text-right">Margin Used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 font-sans">
                      No open or closed positions recorded for this account.
                    </td>
                  </tr>
                ) : (
                  positions.map((p) => {
                    const unPnl = Number(p.unrealized_pnl || p.pnl || 0);
                    return (
                      <tr key={p.id} className="hover:bg-slate-800/50">
                        <td className="p-3 font-sans font-bold text-white">{p.instrument_id || p.symbol}</td>
                        <td className="p-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              (p.side || p.type) === 'BUY'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {p.side || p.type}
                          </span>
                        </td>
                        <td className="p-3 text-right">{p.quantity}</td>
                        <td className="p-3 text-right">₹{Number(p.average_price || p.avgPrice || 0).toFixed(2)}</td>
                        <td className="p-3 text-right text-white">₹{Number(p.current_price || p.ltp || 0).toFixed(2)}</td>
                        <td
                          className={`p-3 text-right font-bold ${
                            unPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {unPnl >= 0 ? '+' : ''}₹{unPnl.toFixed(2)}
                        </td>
                        <td className="p-3 text-right">₹{Number(p.margin_used || 0).toFixed(2)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'ORDERS' && (
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Submitted & Executed Orders</h3>
            <span className="text-xs text-slate-400 font-mono">{orders.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0b1120] text-slate-400 uppercase tracking-wider font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3">Order ID</th>
                  <th className="p-3">Instrument</th>
                  <th className="p-3">Side</th>
                  <th className="p-3">Type</th>
                  <th className="p-3 text-right">Quantity</th>
                  <th className="p-3 text-right">Price</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Created Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 font-sans">
                      No order records found for this client.
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-800/50">
                      <td className="p-3 text-blue-400">{o.id}</td>
                      <td className="p-3 font-sans font-bold text-white">{o.instrument_id || o.symbol}</td>
                      <td className="p-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            o.side === 'BUY'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {o.side}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400">{o.order_type || o.orderType}</td>
                      <td className="p-3 text-right">{o.quantity || o.qty}</td>
                      <td className="p-3 text-right">₹{Number(o.price || 0).toFixed(2)}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-200">
                          {o.status}
                        </span>
                      </td>
                      <td className="p-3 text-right text-slate-400">
                        {o.created_at ? new Date(o.created_at).toLocaleString('en-GB') : 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'TRADES' && (
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Executed Trade History</h3>
            <span className="text-xs text-slate-400 font-mono">{trades.length} records</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0b1120] text-slate-400 uppercase tracking-wider font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3">Trade ID</th>
                  <th className="p-3">Order ID</th>
                  <th className="p-3">Instrument</th>
                  <th className="p-3">Side</th>
                  <th className="p-3 text-right">Quantity</th>
                  <th className="p-3 text-right">Exec Price</th>
                  <th className="p-3 text-right">Execution Value</th>
                  <th className="p-3 text-right">Executed Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {trades.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500 font-sans">
                      No executed trades recorded for this client.
                    </td>
                  </tr>
                ) : (
                  trades.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-800/50">
                      <td className="p-3 text-emerald-400">{t.id}</td>
                      <td className="p-3 text-slate-400">{t.order_id}</td>
                      <td className="p-3 font-sans font-bold text-white">{t.instrument_id}</td>
                      <td className="p-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            t.side === 'BUY'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {t.side}
                        </span>
                      </td>
                      <td className="p-3 text-right">{t.quantity}</td>
                      <td className="p-3 text-right">₹{Number(t.execution_price || 0).toFixed(2)}</td>
                      <td className="p-3 text-right text-white font-bold">
                        ₹{Number(t.execution_value || 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-right text-slate-400">
                        {t.executed_at ? new Date(t.executed_at).toLocaleString('en-GB') : 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
