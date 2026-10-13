import React, { useEffect, useState, useMemo } from 'react';
import { LineChart, ArrowUpRight, ArrowDownRight, RefreshCw, Search, Filter, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAdminRealtime } from '../context/AdminRealtimeContext';

interface AdminOrdersPageProps {
  onNavigate: (path: string) => void;
}

export const AdminOrdersPage: React.FC<AdminOrdersPageProps> = ({ onNavigate }) => {
  const { isConnected, subscribe } = useAdminRealtime();
  const [activeTab, setActiveTab] = useState<'ORDERS' | 'TRADES'>('ORDERS');
  const [orders, setOrders] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'EXECUTED' | 'PENDING' | 'CANCELLED'>('ALL');
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');

  const fetchOrdersAndTrades = async () => {
    try {
      setLoading(true);
      setError(null);
      const [ordersRes, tradesRes] = await Promise.all([
        adminApi.getOrders(),
        adminApi.getTrades(),
      ]);

      setOrders(ordersRes?.data?.orders || ordersRes?.data || ordersRes?.orders || []);
      setTrades(tradesRes?.data?.trades || tradesRes?.data || tradesRes?.trades || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load platform orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdersAndTrades();
  }, []);

  // Subscribe to real-time order and trade events
  useEffect(() => {
    const unsubOrderCreated = subscribe('order.created', (newOrder: any) => {
      setOrders((prev) => [newOrder, ...prev.filter((o) => o.id !== newOrder.id)]);
    });

    const unsubOrderCancelled = subscribe('order.cancelled', (cancelledOrder: any) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === cancelledOrder.id ? { ...o, status: 'CANCELLED' } : o))
      );
    });

    const unsubTradeExecuted = subscribe('trade.executed', (newTrade: any) => {
      setTrades((prev) => [newTrade, ...prev.filter((t) => t.id !== newTrade.id)]);
      // Also update order status if matching
      setOrders((prev) =>
        prev.map((o) => (o.id === newTrade.order_id ? { ...o, status: 'EXECUTED' } : o))
      );
    });

    return () => {
      unsubOrderCreated();
      unsubOrderCancelled();
      unsubTradeExecuted();
    };
  }, [subscribe]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchesSearch =
        !searchQuery ||
        (o.id && o.id.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (o.user_id && o.user_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (o.instrument_id && o.instrument_id.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus = statusFilter === 'ALL' || o.status === statusFilter;
      const matchesSide = sideFilter === 'ALL' || o.side === sideFilter;

      return matchesSearch && matchesStatus && matchesSide;
    });
  }, [orders, searchQuery, statusFilter, sideFilter]);

  // Filtered trades
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      const matchesSearch =
        !searchQuery ||
        (t.id && t.id.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.order_id && t.order_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.user_id && t.user_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.instrument_id && t.instrument_id.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesSide = sideFilter === 'ALL' || t.side === sideFilter;

      return matchesSearch && matchesSide;
    });
  }, [trades, searchQuery, sideFilter]);

  const totalExecutedVolume = useMemo(() => {
    return trades.reduce((sum, t) => sum + Number(t.execution_value || (t.quantity * t.execution_price) || 0), 0);
  }, [trades]);

  const pendingOrdersCount = useMemo(() => {
    return orders.filter((o) => o.status === 'PENDING' || o.status === 'OPEN').length;
  }, [orders]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <LineChart className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-bold text-slate-100">Live Orders & Executed Trades</h2>
            {isConnected && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>STREAMING</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Real-time multi-tenant order book and transaction fills across all active traders.
          </p>
        </div>

        <button
          onClick={fetchOrdersAndTrades}
          className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-xs font-semibold text-slate-300 flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Total Orders</span>
          <span className="text-xl font-mono font-bold text-white block">{orders.length}</span>
          <span className="text-[10px] text-slate-500 mt-1 block font-mono">
            {pendingOrdersCount} currently open / pending
          </span>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Executed Trades</span>
          <span className="text-xl font-mono font-bold text-emerald-400 block">{trades.length}</span>
          <span className="text-[10px] text-slate-500 mt-1 block font-mono">
            {orders.length > 0 ? Math.round((trades.length / orders.length) * 100) : 0}% fill completion
          </span>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Total Trading Volume</span>
          <span className="text-xl font-mono font-bold text-cyan-400 block">
            ₹{totalExecutedVolume.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block">Platform aggregated turnover</span>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Active Pending Orders</span>
          <span
            className={`text-xl font-mono font-bold block ${
              pendingOrdersCount > 0 ? 'text-amber-400' : 'text-slate-400'
            }`}
          >
            {pendingOrdersCount}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block">Awaiting market execution</span>
        </div>
      </div>

      {/* Tabs and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('ORDERS')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'ORDERS'
                ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/20'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Orders Book ({orders.length})
          </button>
          <button
            onClick={() => setActiveTab('TRADES')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'TRADES'
                ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/20'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Executed Trades ({trades.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user, symbol, ID..."
              className="pl-8 pr-3 py-1.5 bg-[#0f172a] border border-slate-700/60 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-48 sm:w-56"
            />
          </div>

          {/* Status Filter (Orders tab only) */}
          {activeTab === 'ORDERS' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-2.5 py-1.5 bg-[#0f172a] border border-slate-700/60 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Status</option>
              <option value="EXECUTED">Executed</option>
              <option value="PENDING">Pending</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          )}

          {/* Side Filter */}
          <select
            value={sideFilter}
            onChange={(e) => setSideFilter(e.target.value as any)}
            className="px-2.5 py-1.5 bg-[#0f172a] border border-slate-700/60 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Sides</option>
            <option value="BUY">BUY Only</option>
            <option value="SELL">SELL Only</option>
          </select>
        </div>
      </div>

      {/* Table Content */}
      <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
        {activeTab === 'ORDERS' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0b1120] text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-3">Order ID</th>
                  <th className="p-3">Client User</th>
                  <th className="p-3">Instrument</th>
                  <th className="p-3">Side</th>
                  <th className="p-3">Type</th>
                  <th className="p-3 text-right">Quantity</th>
                  <th className="p-3 text-right">Price</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500 font-sans">
                      {loading ? 'Loading live orders...' : 'No orders matching current filter criteria.'}
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-semibold text-blue-400">{o.id}</td>
                      <td className="p-3 font-sans">
                        <button
                          onClick={() => onNavigate(`/admin/clients/${o.user_id}`)}
                          className="text-slate-200 hover:text-blue-400 font-semibold underline-offset-2 hover:underline"
                        >
                          {o.user_id}
                        </button>
                      </td>
                      <td className="p-3 font-sans font-bold text-white">{o.instrument_id || o.symbol}</td>
                      <td className="p-3">
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            o.side === 'BUY'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {o.side}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400">{o.order_type || o.orderType || 'MARKET'}</td>
                      <td className="p-3 text-right text-white font-bold">{o.quantity}</td>
                      <td className="p-3 text-right text-white">₹{Number(o.price || 0).toFixed(2)}</td>
                      <td className="p-3 font-sans">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            o.status === 'EXECUTED'
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                              : o.status === 'PENDING'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60 animate-pulse'
                              : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                          }`}
                        >
                          {o.status === 'EXECUTED' ? (
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                          ) : o.status === 'PENDING' ? (
                            <Clock className="w-2.5 h-2.5 text-amber-400" />
                          ) : (
                            <XCircle className="w-2.5 h-2.5 text-rose-400" />
                          )}
                          <span>{o.status}</span>
                        </span>
                      </td>
                      <td className="p-3 text-right text-slate-400">
                        {o.created_at ? new Date(o.created_at).toLocaleTimeString('en-GB') : 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0b1120] text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-3">Trade ID</th>
                  <th className="p-3">Order ID</th>
                  <th className="p-3">Client User</th>
                  <th className="p-3">Instrument</th>
                  <th className="p-3">Side</th>
                  <th className="p-3 text-right">Quantity</th>
                  <th className="p-3 text-right">Exec Price</th>
                  <th className="p-3 text-right">Turnover</th>
                  <th className="p-3 text-right">Executed Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {filteredTrades.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500 font-sans">
                      {loading ? 'Loading trade fills...' : 'No trade fills matching current filter criteria.'}
                    </td>
                  </tr>
                ) : (
                  filteredTrades.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-semibold text-emerald-400">{t.id}</td>
                      <td className="p-3 text-slate-400">{t.order_id}</td>
                      <td className="p-3 font-sans">
                        <button
                          onClick={() => onNavigate(`/admin/clients/${t.user_id}`)}
                          className="text-slate-200 hover:text-blue-400 font-semibold underline-offset-2 hover:underline"
                        >
                          {t.user_id}
                        </button>
                      </td>
                      <td className="p-3 font-sans font-bold text-white">{t.instrument_id}</td>
                      <td className="p-3">
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            t.side === 'BUY'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {t.side}
                        </span>
                      </td>
                      <td className="p-3 text-right text-white font-bold">{t.quantity}</td>
                      <td className="p-3 text-right text-white">₹{Number(t.execution_price || 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-bold text-cyan-400">
                        ₹{Number(t.execution_value || (t.quantity * t.execution_price) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right text-slate-400">
                        {t.executed_at ? new Date(t.executed_at).toLocaleTimeString('en-GB') : 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
