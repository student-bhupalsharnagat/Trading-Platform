import React, { useEffect, useState } from 'react';
import {
  Crown,
  Briefcase,
  GitBranch,
  Users,
  Coins,
  Activity,
  TrendingUp,
  ShieldAlert,
  Headphones,
  PlusCircle,
  Eye,
  ArrowUpRight,
  ArrowRight,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { AdminDashboardKPIs, ChartDataPoint, HierarchyNode } from '../types/adminTypes';
import { StatCard } from '../components/StatCard';
import { HierarchyBadge } from '../components/HierarchyBadge';
import { useAuth } from '../../context/AuthContext';

interface AdminDashboardProps {
  onNavigate: (path: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [kpis, setKpis] = useState<AdminDashboardKPIs | null>(null);
  const [charts, setCharts] = useState<ChartDataPoint[]>([]);
  const [recentClients, setRecentClients] = useState<HierarchyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await adminApi.getKPIs();
      setKpis(res.kpis);
      setCharts(res.charts);

      // Also grab scoped clients
      const clients = await adminApi.getClients();
      setRecentClients(clients.slice(0, 5));
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const formatCurrency = (val?: number) => {
    if (val === undefined || val === null) return '₹0';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-blue-900/40 via-slate-900 to-[#0f172a] border border-blue-800/30">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
              COMMERCIAL OVERVIEW
            </span>
            <span className="text-xs text-slate-400">Hierarchy Node: {user?.hierarchyPath || 'root'}</span>
          </div>
          <h2 className="text-xl font-bold text-slate-100">
            Welcome back, {user?.fullName}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time status of downstream Masters, Brokers, Sub-Brokers, and Client trading exposure.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {user?.role === 'SUPER_ADMIN' && (
            <button
              onClick={() => onNavigate('/admin/masters')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <Crown className="w-3.5 h-3.5" />
              <span>Create Master</span>
            </button>
          )}

          {['SUPER_ADMIN', 'MASTER'].includes(user?.role || '') && (
            <button
              onClick={() => onNavigate('/admin/brokers')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Create Broker</span>
            </button>
          )}

          <button
            onClick={() => onNavigate('/admin/clients')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Manage Clients</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* 8 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Masters"
          value={loading ? '...' : kpis?.totalMasters ?? 0}
          change="+1 this month"
          isPositive={true}
          icon={<Crown className="w-5 h-5 text-purple-400" />}
        />
        <StatCard
          title="Total Brokers"
          value={loading ? '...' : kpis?.totalBrokers ?? 0}
          change="+3 this month"
          isPositive={true}
          icon={<Briefcase className="w-5 h-5 text-blue-400" />}
        />
        <StatCard
          title="Total Clients"
          value={loading ? '...' : kpis?.totalClients ?? 0}
          subtitle={`${kpis?.activeClients ?? 0} active now`}
          change="+12% growth"
          isPositive={true}
          icon={<Users className="w-5 h-5 text-emerald-400" />}
        />
        <StatCard
          title="Commission Earned"
          value={loading ? '...' : formatCurrency(kpis?.commissionEarned)}
          change="+8.4% vs last week"
          isPositive={true}
          icon={<Coins className="w-5 h-5 text-amber-400" />}
        />
        <StatCard
          title="Today's Turnover"
          value={loading ? '...' : formatCurrency(kpis?.todayTurnover)}
          change="+15.2%"
          isPositive={true}
          icon={<Activity className="w-5 h-5 text-cyan-400" />}
        />
        <StatCard
          title="Total P&L"
          value={loading ? '...' : formatCurrency(kpis?.totalPnL)}
          change="Realized net"
          isPositive={true}
          icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
        />
        <StatCard
          title="Pending KYC"
          value={loading ? '...' : kpis?.pendingKyc ?? 0}
          subtitle="Verification pipeline"
          icon={<ShieldAlert className="w-5 h-5 text-orange-400" />}
        />
        <StatCard
          title="Open Tickets"
          value={loading ? '...' : kpis?.openTickets ?? 0}
          subtitle="Support desk"
          icon={<Headphones className="w-5 h-5 text-blue-400" />}
        />
      </div>

      {/* Visual Activity & Volume Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trading Volume & Growth Chart Mockup */}
        <div className="lg:col-span-2 bg-[#0f172a] border border-slate-800/80 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-100">Weekly Trading Volume & Commission</h3>
              <p className="text-xs text-slate-400">Aggregated throughput across downstream client accounts</p>
            </div>
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Live Feed
            </span>
          </div>

          <div className="h-56 flex items-end justify-between gap-2 pt-4 px-2">
            {charts.map((point, idx) => {
              const maxVol = 4000000;
              const heightPct = Math.round((point.volume / maxVol) * 100);
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
                  <div className="text-[10px] text-slate-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                    ₹{(point.volume / 100000).toFixed(1)}L
                  </div>
                  <div className="w-full max-w-[36px] bg-slate-800 rounded-t-sm flex flex-col justify-end overflow-hidden h-40">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full bg-gradient-to-t from-blue-700 to-cyan-500 rounded-t-sm transition-all duration-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">{point.date}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Review / Pending KYC Block */}
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-100">Pending KYC Reviews</h3>
              <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                {kpis?.pendingKyc ?? 0} Pending
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Trader identification documents requiring administrative verification before limit release.
            </p>

            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-[#0b1120] border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-200">Rajesh Sharma</p>
                  <p className="text-[10px] text-slate-400">PAN: ABCPS1234F • AADHAAR</p>
                </div>
                <button
                  onClick={() => onNavigate('/admin/kyc')}
                  className="px-2.5 py-1 text-xs rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 font-medium"
                >
                  Review
                </button>
              </div>

              <div className="p-3 rounded-lg bg-[#0b1120] border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-200">Meera Patel</p>
                  <p className="text-[10px] text-slate-400">PAN: BKLPM8921K • BANK SLIP</p>
                </div>
                <button
                  onClick={() => onNavigate('/admin/kyc')}
                  className="px-2.5 py-1 text-xs rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 font-medium"
                >
                  Review
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigate('/admin/kyc')}
            className="w-full mt-4 py-2 rounded-lg border border-slate-700/60 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5"
          >
            <span>View All Compliance Requests</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Downstream Trader Clients Table */}
      <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100">Downstream Trader Accounts</h3>
            <p className="text-xs text-slate-400">Active trader accounts mapped into your hierarchy node</p>
          </div>
          <button
            onClick={() => onNavigate('/admin/clients')}
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
          >
            <span>View All ({recentClients.length})</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-[#0b1120]/80 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800/80">
              <tr>
                <th className="px-4 py-3 font-semibold">User ID</th>
                <th className="px-4 py-3 font-semibold">Client Name</th>
                <th className="px-4 py-3 font-semibold">Mobile</th>
                <th className="px-4 py-3 font-semibold">Hierarchy Path</th>
                <th className="px-4 py-3 font-semibold">Virtual Balance</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {recentClients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-xs">
                    No downstream client accounts found.
                  </td>
                </tr>
              ) : (
                recentClients.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-mono text-xs text-blue-400 font-semibold">
                      {client.userId}
                    </td>
                    <td className="px-4 py-3 text-slate-200 font-medium">{client.fullName}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{client.mobile}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                      {client.hierarchyPath}
                    </td>
                    <td className="px-4 py-3 text-emerald-400 font-mono text-xs font-semibold">
                      {formatCurrency(client.balance)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          client.status === 'active'
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                            : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                        }`}
                      >
                        {client.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onNavigate(`/admin/clients/${client.id}`)}
                        className="p-1.5 rounded-lg border border-slate-700/60 hover:bg-slate-800 text-slate-300 hover:text-blue-400"
                        title="View Client Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
