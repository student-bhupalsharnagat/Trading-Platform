import React, { useEffect, useState, useMemo } from 'react';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plus,
  AlertCircle,
  Clock,
  Search,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAdminRealtime } from '../context/AdminRealtimeContext';

interface AdminFundsPageProps {
  onNavigate: (path: string) => void;
}

export const AdminFundsPage: React.FC<AdminFundsPageProps> = ({ onNavigate }) => {
  const { isConnected, subscribe } = useAdminRealtime();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Filter tabs
  const [activeTab, setActiveTab] = useState<'PENDING' | 'ALL' | 'DEPOSITS' | 'WITHDRAWALS'>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');

  // Manual transaction modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualUserId, setManualUserId] = useState('');
  const [manualType, setManualType] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [manualAmount, setManualAmount] = useState('');
  const [manualNote, setManualNote] = useState('');

  const fetchFunds = async () => {
    try {
      setLoading(true);
      setError(null);
      const data: any = await adminApi.getFunds();
      setTransactions(data?.data || data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load fund transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFunds();
  }, []);

  // Real-time subscriptions for funds
  useEffect(() => {
    const unsubFund = subscribe('fund.requested', (tx: any) => {
      setTransactions((prev) => [tx, ...prev.filter((t) => t.id !== tx.id)]);
      setSuccessMsg(`New ${tx.type || tx.transaction_type} request received for ${tx.userId}!`);
    });

    const unsubProcessed = subscribe('fund.processed', (tx: any) => {
      setTransactions((prev) =>
        prev.map((t) => (t.id === tx.id ? { ...t, ...tx, status: tx.status } : t))
      );
    });

    return () => {
      unsubFund();
      unsubProcessed();
    };
  }, [subscribe]);

  const handleProcess = async (txId: string, action: 'APPROVE' | 'REJECT') => {
    try {
      setProcessingId(txId);
      setError(null);
      setSuccessMsg(null);

      await adminApi.processFundTransaction(txId, action);
      setSuccessMsg(`Transaction ${txId} ${action === 'APPROVE' ? 'approved' : 'rejected'} successfully.`);
      await fetchFunds();
    } catch (err: any) {
      setError(err.message || 'Failed to process transaction');
    } finally {
      setProcessingId(null);
    }
  };

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUserId || !manualAmount) return;

    try {
      setLoading(true);
      setError(null);
      await adminApi.requestFundTransaction({
        userId: manualUserId.trim(),
        type: manualType,
        amount: Number(manualAmount),
        paymentMethod: 'ADMIN_MANUAL_ADJUSTMENT',
        referenceId: manualNote || 'Admin Manual Adjustment',
      });

      setSuccessMsg(`Manual ${manualType} transaction for ${manualUserId} created!`);
      setShowManualModal(false);
      setManualUserId('');
      setManualAmount('');
      setManualNote('');
      await fetchFunds();
    } catch (err: any) {
      setError(err.message || 'Failed to create transaction');
    } finally {
      setLoading(false);
    }
  };

  // Filtered transactions
  const filteredTxs = useMemo(() => {
    return transactions.filter((t) => {
      const type = t.transaction_type || t.type;
      const status = t.status;

      const matchesTab =
        activeTab === 'ALL' ||
        (activeTab === 'PENDING' && status === 'PENDING') ||
        (activeTab === 'DEPOSITS' && type === 'DEPOSIT') ||
        (activeTab === 'WITHDRAWALS' && type === 'WITHDRAWAL');

      const matchesSearch =
        !searchQuery ||
        (t.id && t.id.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.user_id && t.user_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.clientName && t.clientName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.reference_id && t.reference_id.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesTab && matchesSearch;
    });
  }, [transactions, activeTab, searchQuery]);

  const pendingDeposits = useMemo(() => {
    return transactions
      .filter((t) => (t.transaction_type || t.type) === 'DEPOSIT' && t.status === 'PENDING')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [transactions]);

  const pendingWithdrawals = useMemo(() => {
    return transactions
      .filter((t) => (t.transaction_type || t.type) === 'WITHDRAWAL' && t.status === 'PENDING')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  }, [transactions]);

  const pendingCount = useMemo(() => {
    return transactions.filter((t) => t.status === 'PENDING').length;
  }, [transactions]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-slate-100">Funds Management Desk</h2>
            {isConnected && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>FUNDS LIVE</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Real-time deposit and withdrawal verification, wallet credit approvals, and manual adjustments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowManualModal(true)}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Manual Adjustment</span>
          </button>
          <button
            onClick={fetchFunds}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-xs font-semibold text-slate-300 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Pending Approvals</span>
          <span
            className={`text-xl font-mono font-bold block ${
              pendingCount > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-400'
            }`}
          >
            {pendingCount} Requests
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block">Awaiting admin action</span>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Pending Deposits</span>
          <span className="text-xl font-mono font-bold text-emerald-400 block">
            ₹{pendingDeposits.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block">Incoming client funds</span>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Pending Withdrawals</span>
          <span className="text-xl font-mono font-bold text-rose-400 block">
            ₹{pendingWithdrawals.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block">Requested payouts</span>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Total Transactions</span>
          <span className="text-xl font-mono font-bold text-cyan-400 block">{transactions.length}</span>
          <span className="text-[10px] text-slate-500 mt-1 block">All-time settled entries</span>
        </div>
      </div>

      {/* Tabs and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('PENDING')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'PENDING'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Pending Queue ({pendingCount})
          </button>
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'ALL'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            All History ({transactions.length})
          </button>
          <button
            onClick={() => setActiveTab('DEPOSITS')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'DEPOSITS'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Deposits
          </button>
          <button
            onClick={() => setActiveTab('WITHDRAWALS')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              activeTab === 'WITHDRAWALS'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Withdrawals
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search user, ID, reference..."
            className="pl-8 pr-3 py-1.5 bg-[#0f172a] border border-slate-700/60 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-56"
          />
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#0b1120] text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3">Tx ID</th>
                <th className="p-3">Client User</th>
                <th className="p-3">Type</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3">Method / Ref</th>
                <th className="p-3">Status</th>
                <th className="p-3">Timestamp</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {filteredTxs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-sans">
                    {loading ? 'Loading funds queue...' : 'No transactions matching filter.'}
                  </td>
                </tr>
              ) : (
                filteredTxs.map((t) => {
                  const type = t.transaction_type || t.type;
                  const isDeposit = type === 'DEPOSIT';
                  return (
                    <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-semibold text-blue-400">{t.id}</td>
                      <td className="p-3 font-sans">
                        <button
                          onClick={() => onNavigate(`/admin/clients/${t.user_id}`)}
                          className="font-semibold text-white hover:text-blue-400 hover:underline"
                        >
                          {t.user_id}
                        </button>
                        <span className="block text-[10px] text-slate-500">{t.clientName}</span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            isDeposit
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {isDeposit ? <ArrowDownLeft className="w-2.5 h-2.5" /> : <ArrowUpRight className="w-2.5 h-2.5" />}
                          <span>{type}</span>
                        </span>
                      </td>
                      <td
                        className={`p-3 text-right font-bold text-sm ${
                          isDeposit ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isDeposit ? '+' : '-'}₹{Number(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 font-sans text-slate-400">
                        <span>{t.payment_method || 'BANK_TRANSFER'}</span>
                        {t.reference_id && <span className="block text-[10px] font-mono text-slate-500">{t.reference_id}</span>}
                      </td>
                      <td className="p-3 font-sans">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            t.status === 'APPROVED' || t.status === 'COMPLETED'
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                              : t.status === 'PENDING'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60 animate-pulse'
                              : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                          }`}
                        >
                          {t.status === 'APPROVED' || t.status === 'COMPLETED' ? (
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                          ) : t.status === 'PENDING' ? (
                            <Clock className="w-2.5 h-2.5 text-amber-400" />
                          ) : (
                            <XCircle className="w-2.5 h-2.5 text-rose-400" />
                          )}
                          <span>{t.status}</span>
                        </span>
                      </td>
                      <td className="p-3 text-slate-400">
                        {t.created_at ? new Date(t.created_at).toLocaleString('en-GB') : 'N/A'}
                      </td>
                      <td className="p-3 text-right">
                        {t.status === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleProcess(t.id, 'APPROVE')}
                              disabled={processingId === t.id}
                              className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] transition-colors shadow-xs"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleProcess(t.id, 'REJECT')}
                              disabled={processingId === t.id}
                              className="px-2 py-1 rounded bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 font-bold text-[10px] transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-sans">Settled</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Fund Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-400" />
              <span>Manual Fund Adjustment</span>
            </h3>
            <p className="text-xs text-slate-400">
              Directly credit or debit a client trading wallet with immutable ledger audit trail.
            </p>

            <form onSubmit={handleCreateManual} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Client User ID *</label>
                <input
                  type="text"
                  required
                  value={manualUserId}
                  onChange={(e) => setManualUserId(e.target.value)}
                  placeholder="e.g. trader_123"
                  className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Adjustment Type</label>
                  <select
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="DEPOSIT">Credit (Deposit)</option>
                    <option value="WITHDRAWAL">Debit (Withdrawal)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Amount (INR) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Reference / Note</label>
                <input
                  type="text"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="e.g. Bank Wire Ref #99214"
                  className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs"
                >
                  Confirm Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
