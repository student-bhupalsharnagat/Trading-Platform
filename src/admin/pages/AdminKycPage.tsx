import React, { useEffect, useState, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Clock,
  User,
  CreditCard,
  FileCheck,
  Building,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAdminRealtime } from '../context/AdminRealtimeContext';

interface AdminKycPageProps {
  onNavigate: (path: string) => void;
}

export const AdminKycPage: React.FC<AdminKycPageProps> = ({ onNavigate }) => {
  const { isConnected, subscribe } = useAdminRealtime();
  const [pipeline, setPipeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'VERIFIED'>('ALL');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchKycPipeline = async () => {
    try {
      setLoading(true);
      setError(null);
      const data: any = await adminApi.getKycPipeline();
      setPipeline(data?.data || data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch KYC pipeline');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKycPipeline();
  }, []);

  // Real-time synchronization
  useEffect(() => {
    const unsubClient = subscribe('client.created', () => {
      fetchKycPipeline();
    });
    return () => {
      unsubClient();
    };
  }, [subscribe]);

  const handleVerify = async (userId: string, action: 'APPROVE' | 'REJECT') => {
    try {
      setProcessingId(userId);
      setError(null);
      await adminApi.verifyKyc(userId, action);
      setSuccessMsg(`Client ${userId} KYC ${action === 'APPROVE' ? 'Approved' : 'Rejected'} successfully!`);
      setTimeout(() => setSuccessMsg(null), 4000);
      await fetchKycPipeline();
      if (selectedUser?.userId === userId) {
        setSelectedUser((prev: any) => ({
          ...prev,
          isVerified: action === 'APPROVE',
          kycStatus: action === 'APPROVE' ? 'VERIFIED' : 'REJECTED',
        }));
      }
    } catch (err: any) {
      setError(err.message || 'Action failed');
    } finally {
      setProcessingId(null);
    }
  };

  const filteredPipeline = useMemo(() => {
    return pipeline.filter((client) => {
      const matchesSearch =
        !searchQuery ||
        client.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.userId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.mobile?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'VERIFIED' && client.isVerified) ||
        (statusFilter === 'PENDING' && !client.isVerified);

      return matchesSearch && matchesStatus;
    });
  }, [pipeline, searchQuery, statusFilter]);

  const pendingCount = pipeline.filter((c) => !c.isVerified).length;
  const verifiedCount = pipeline.filter((c) => c.isVerified).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0f172a] border border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              COMPLIANCE & VERIFICATION
            </span>
            {isConnected && (
              <span className="text-[10px] flex items-center gap-1 text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Sync
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            Client KYC Verification Desk
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Review SEBI/KYC compliance, PAN & Aadhaar details, and authorize downstream client trading clearances.
          </p>
        </div>

        <button
          onClick={fetchKycPipeline}
          disabled={loading}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Pipeline</span>
        </button>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Pending Verifications</p>
            <p className="text-2xl font-bold font-mono text-amber-400 mt-1">{pendingCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Clock className="w-5 h-5 text-amber-400" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Verified Accounts</p>
            <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">{verifiedCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0f172a] border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 font-medium">Total Registered Clients</p>
            <p className="text-2xl font-bold font-mono text-blue-400 mt-1">{pipeline.length}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <User className="w-5 h-5 text-blue-400" />
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-xl bg-[#0f172a] border border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by client name, client ID, mobile, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-hidden focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'ALL'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            All Clients ({pipeline.length})
          </button>
          <button
            onClick={() => setStatusFilter('PENDING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'PENDING'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            Pending Verification ({pendingCount})
          </button>
          <button
            onClick={() => setStatusFilter('VERIFIED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === 'VERIFIED'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            Approved ({verifiedCount})
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 uppercase font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Client Identity</th>
                <th className="py-3 px-4">Contact Info</th>
                <th className="py-3 px-4">Tax / PAN ID</th>
                <th className="py-3 px-4">Bank Verification</th>
                <th className="py-3 px-4">KYC Status</th>
                <th className="py-3 px-4 text-right">Clearance Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-500" />
                    Loading KYC verification records...
                  </td>
                </tr>
              ) : filteredPipeline.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No clients match the specified KYC filters.
                  </td>
                </tr>
              ) : (
                filteredPipeline.map((client) => {
                  const isPending = !client.isVerified;
                  return (
                    <tr key={client.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-300">
                            {client.fullName?.[0]?.toUpperCase() || 'U'}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-200">{client.fullName || 'Anonymous'}</p>
                            <p className="text-[10px] text-slate-400 font-mono">ID: {client.userId}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        <p>{client.mobile || 'No Mobile'}</p>
                        <p className="text-[10px] text-slate-400">{client.email}</p>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                          {client.panCard}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-0.5">Aadhaar: •••• {client.aadhaarLast4}</p>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Building className="w-3.5 h-3.5 text-slate-500" />
                          <span>{client.bankName}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{client.accountNumber}</p>
                      </td>

                      <td className="py-3.5 px-4">
                        {client.isVerified ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            VERIFIED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="w-3 h-3" />
                            PENDING REVIEW
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedUser(client)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                            title="View KYC Dossier"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {isPending ? (
                            <>
                              <button
                                onClick={() => handleVerify(client.userId, 'APPROVE')}
                                disabled={processingId === client.userId}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Approve</span>
                              </button>
                              <button
                                onClick={() => handleVerify(client.userId, 'REJECT')}
                                disabled={processingId === client.userId}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleVerify(client.userId, 'REJECT')}
                              disabled={processingId === client.userId}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 text-xs font-semibold transition-colors"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* KYC Dossier Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  CLIENT COMPLIANCE DOSSIER
                </span>
                <h3 className="text-lg font-bold text-slate-100 mt-1">{selectedUser.fullName}</h3>
                <p className="text-xs text-slate-400 font-mono">User ID: {selectedUser.userId}</p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 font-medium">PAN Number</span>
                <p className="font-mono font-bold text-slate-200 mt-0.5">{selectedUser.panCard}</p>
              </div>
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 font-medium">Aadhaar (UIDAI)</span>
                <p className="font-mono font-bold text-slate-200 mt-0.5">XXXX-XXXX-{selectedUser.aadhaarLast4}</p>
              </div>
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 font-medium">Bank Name</span>
                <p className="font-bold text-slate-200 mt-0.5">{selectedUser.bankName}</p>
              </div>
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 font-medium">Account Number</span>
                <p className="font-mono font-bold text-slate-200 mt-0.5">{selectedUser.accountNumber}</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900/60 rounded-xl border border-slate-800 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-400">
                <span>Account Status:</span>
                <span className="font-semibold text-slate-200">{selectedUser.status}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Registration Date:</span>
                <span className="font-mono text-slate-300">
                  {new Date(selectedUser.createdAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>SEBI KRA Verification:</span>
                <span className={selectedUser.isVerified ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                  {selectedUser.isVerified ? 'VERIFIED & ACTIVE' : 'PENDING APPROVAL'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Close
              </button>
              {!selectedUser.isVerified ? (
                <button
                  onClick={() => handleVerify(selectedUser.userId, 'APPROVE')}
                  disabled={processingId === selectedUser.userId}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Authorize & Approve KYC</span>
                </button>
              ) : (
                <button
                  onClick={() => handleVerify(selectedUser.userId, 'REJECT')}
                  disabled={processingId === selectedUser.userId}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors"
                >
                  Revoke KYC
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
