import React, { useEffect, useState, useMemo } from 'react';
import { BookOpen, RefreshCw, Search, ArrowDownLeft, ArrowUpRight, Filter } from 'lucide-react';
import { adminApi } from '../services/adminApi';

interface AdminLedgerPageProps {
  onNavigate: (path: string) => void;
}

export const AdminLedgerPage: React.FC<AdminLedgerPageProps> = ({ onNavigate }) => {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CREDIT' | 'DEBIT'>('ALL');

  const fetchLedger = async () => {
    try {
      setLoading(true);
      setError(null);
      const data: any = await adminApi.getLedger();
      setEntries(data?.data || data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load ledger records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, []);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const matchesType = typeFilter === 'ALL' || e.type === typeFilter;
      const matchesSearch =
        !searchQuery ||
        (e.id && e.id.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (e.user_id && e.user_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (e.clientName && e.clientName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (e.reference && e.reference.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (e.category && e.category.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesType && matchesSearch;
    });
  }, [entries, typeFilter, searchQuery]);

  const totalCredits = useMemo(() => {
    return entries
      .filter((e) => e.type === 'CREDIT')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [entries]);

  const totalDebits = useMemo(() => {
    return entries
      .filter((e) => e.type === 'DEBIT')
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [entries]);

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-bold text-slate-100">Financial Ledger (Audit Trail)</h2>
          </div>
          <p className="text-xs text-slate-400">
            Immutable double-entry transaction journal across all client deposits, withdrawals, trade settlements, and brokerage charges.
          </p>
        </div>

        <button
          onClick={fetchLedger}
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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Total Journal Entries</span>
          <span className="text-xl font-mono font-bold text-white block">{entries.length}</span>
          <span className="text-[10px] text-slate-500 mt-1 block">Immutable audit records</span>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Total Inflow (Credits)</span>
          <span className="text-xl font-mono font-bold text-emerald-400 block">
            ₹{totalCredits.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block">Deposits & gains</span>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Total Outflow (Debits)</span>
          <span className="text-xl font-mono font-bold text-rose-400 block">
            ₹{totalDebits.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block">Withdrawals & losses</span>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-4">
          <span className="text-xs text-slate-400 font-medium block mb-1">Net Balance Pool</span>
          <span
            className={`text-xl font-mono font-bold block ${
              totalCredits - totalDebits >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            ₹{(totalCredits - totalDebits).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
          <span className="text-[10px] text-slate-500 mt-1 block">Active tenant liquidity</span>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex gap-2">
          <button
            onClick={() => setTypeFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              typeFilter === 'ALL'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            All Types
          </button>
          <button
            onClick={() => setTypeFilter('CREDIT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              typeFilter === 'CREDIT'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Credits Only
          </button>
          <button
            onClick={() => setTypeFilter('DEBIT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              typeFilter === 'DEBIT'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Debits Only
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search user, category, reference..."
            className="pl-8 pr-3 py-1.5 bg-[#0f172a] border border-slate-700/60 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-56"
          />
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#0b1120] text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3">Entry ID</th>
                <th className="p-3">Client User</th>
                <th className="p-3">Type</th>
                <th className="p-3">Category</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3 text-right">Balance After</th>
                <th className="p-3">Reference / Description</th>
                <th className="p-3 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-sans">
                    {loading ? 'Loading ledger journal...' : 'No ledger records found.'}
                  </td>
                </tr>
              ) : (
                filteredEntries.map((e) => {
                  const isCredit = e.type === 'CREDIT';
                  return (
                    <tr key={e.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-semibold text-blue-400">{e.id}</td>
                      <td className="p-3 font-sans">
                        <button
                          onClick={() => onNavigate(`/admin/clients/${e.user_id}`)}
                          className="font-semibold text-white hover:text-blue-400 hover:underline"
                        >
                          {e.user_id}
                        </button>
                        <span className="block text-[10px] text-slate-500">{e.clientName}</span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            isCredit
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {isCredit ? <ArrowDownLeft className="w-2.5 h-2.5" /> : <ArrowUpRight className="w-2.5 h-2.5" />}
                          <span>{e.type}</span>
                        </span>
                      </td>
                      <td className="p-3 text-slate-300 font-sans">{e.category}</td>
                      <td
                        className={`p-3 text-right font-bold text-sm ${
                          isCredit ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isCredit ? '+' : '-'}₹{Number(e.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right text-white">
                        ₹{Number(e.balance_after || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 font-sans text-slate-400 max-w-xs truncate">
                        {e.reference || 'Automatic Transaction Entry'}
                      </td>
                      <td className="p-3 text-right text-slate-400">
                        {e.created_at ? new Date(e.created_at).toLocaleString('en-GB') : 'N/A'}
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
