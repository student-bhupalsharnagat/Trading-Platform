import React, { useEffect, useState, useMemo } from 'react';
import {
  Wallet,
  ArrowDownLeft,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Clock,
  Search,
  Copy,
  Check,
  Eye,
  AlertTriangle,
  QrCode,
  Building2,
  ExternalLink,
  ShieldCheck,
  Filter,
  CreditCard,
  Settings,
  Upload,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useAuth } from '../../context/AuthContext';

interface ManualDepositItem {
  id: string;
  tenant_id: string;
  user_id: string;
  user_name?: string | null;
  user_mobile?: string | null;
  amount: number;
  utr_number: string;
  payment_method: string;
  proof_image_url?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejection_reason?: string | null;
  approved_by?: string | null;
  created_at: string;
  updated_at: string;
}

interface AdminDepositRequestsPageProps {
  onNavigate?: (path: string) => void;
  initialTab?: 'PENDING' | 'ALL' | 'APPROVED' | 'REJECTED' | 'SETTINGS';
}

export const AdminDepositRequestsPage: React.FC<AdminDepositRequestsPageProps> = ({
  onNavigate,
  initialTab = 'PENDING',
}) => {
  const { showToast } = useAuth();

  const [activeTab, setActiveTab] = useState<'PENDING' | 'ALL' | 'APPROVED' | 'REJECTED' | 'SETTINGS'>(initialTab);
  const [requests, setRequests] = useState<ManualDepositItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Modals state
  const [approveModalItem, setApproveModalItem] = useState<ManualDepositItem | null>(null);
  const [rejectModalItem, setRejectModalItem] = useState<ManualDepositItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('Transaction reference not found in bank statement');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [actionProcessing, setActionProcessing] = useState(false);

  // Bank & QR Settings state
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [bankSettings, setBankSettings] = useState({
    bank_name: 'HDFC Bank Ltd',
    account_name: 'VERTEX TRADING TECHNOLOGIES PVT LTD',
    account_number: '50200084729103',
    ifsc_code: 'HDFC0001234',
    upi_id: 'vertextrading@hdfcbank',
    qr_code_url: '',
  });
  const [settingsSaving, setSettingsSaving] = useState(false);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminApi.getDepositRequests({
        status: activeTab === 'ALL' || activeTab === 'SETTINGS' ? undefined : activeTab,
        search: searchQuery.trim() || undefined,
        limit: 100,
      });
      setRequests(res.requests || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load deposit requests');
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      setSettingsLoading(true);
      const res = await adminApi.getPaymentSettings();
      if (res) {
        setBankSettings({
          bank_name: res.bank_name || '',
          account_name: res.account_name || '',
          account_number: res.account_number || '',
          ifsc_code: res.ifsc_code || '',
          upi_id: res.upi_id || '',
          qr_code_url: res.qr_code_url || '',
        });
      }
    } catch (err) {
      console.warn('Failed to load payment settings:', err);
    } finally {
      setSettingsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    fetchSettings();
  }, [activeTab]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedField(id);
    setTimeout(() => setCopiedField(null), 2000);
    showToast({
      type: 'info',
      title: 'Copied',
      description: `${text} copied to clipboard`,
      duration: 1500,
    });
  };

  const handleApproveConfirm = async () => {
    if (!approveModalItem) return;
    setActionProcessing(true);
    try {
      await adminApi.approveDepositRequest(approveModalItem.id);
      showToast({
        type: 'success',
        title: 'Deposit Approved',
        description: `₹${Number(approveModalItem.amount).toLocaleString('en-IN')} credited to ${approveModalItem.user_id}.`,
        duration: 4000,
      });
      setApproveModalItem(null);
      await fetchRequests();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Approval Failed',
        description: err.message || 'Could not approve deposit request.',
      });
    } finally {
      setActionProcessing(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectModalItem) return;
    setActionProcessing(true);
    try {
      await adminApi.rejectDepositRequest(rejectModalItem.id, rejectionReason.trim());
      showToast({
        type: 'info',
        title: 'Request Rejected',
        description: `Deposit request ${rejectModalItem.id} marked as rejected.`,
        duration: 3500,
      });
      setRejectModalItem(null);
      setRejectionReason('Transaction reference not found in bank statement');
      await fetchRequests();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Rejection Failed',
        description: err.message || 'Could not reject deposit request.',
      });
    } finally {
      setActionProcessing(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaving(true);
    try {
      await adminApi.updatePaymentSettings(bankSettings);
      showToast({
        type: 'success',
        title: 'Settings Saved',
        description: 'Bank account and QR Code details updated successfully.',
        duration: 3000,
      });
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Save Failed',
        description: err.message || 'Unable to update payment settings.',
      });
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      showToast({
        type: 'error',
        title: 'Invalid File',
        description: 'Only PNG, JPG, or WEBP images are supported for QR codes.',
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast({
        type: 'error',
        title: 'File Too Large',
        description: 'QR Code image must be smaller than 2MB.',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setBankSettings((prev) => ({ ...prev, qr_code_url: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  // Filtered requests by search
  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return requests;
    const q = searchQuery.toLowerCase().trim();
    return requests.filter((r) => {
      return (
        r.utr_number.toLowerCase().includes(q) ||
        r.user_id.toLowerCase().includes(q) ||
        (r.user_name && r.user_name.toLowerCase().includes(q)) ||
        (r.user_mobile && r.user_mobile.includes(q)) ||
        r.id.toLowerCase().includes(q)
      );
    });
  }, [requests, searchQuery]);

  // Summary counts
  const stats = useMemo(() => {
    const pending = requests.filter((r) => r.status === 'PENDING');
    const approved = requests.filter((r) => r.status === 'APPROVED');
    const rejected = requests.filter((r) => r.status === 'REJECTED');

    return {
      pendingCount: pending.length,
      pendingSum: pending.reduce((sum, r) => sum + Number(r.amount || 0), 0),
      approvedCount: approved.length,
      approvedSum: approved.reduce((sum, r) => sum + Number(r.amount || 0), 0),
      rejectedCount: rejected.length,
    };
  }, [requests]);

  return (
    <div className="space-y-6">
      {/* Header with Title and Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-emerald-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                Manual Deposit Desk
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  UTR & QR Verification
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Audit, verify UTR reference numbers, and atomically approve client bank transfer & QR deposits.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchRequests}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[#0E1726] hover:bg-[#152338] text-slate-300 border border-[#1E2E44] transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('SETTINGS')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'SETTINGS'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/40'
                : 'bg-[#162032] hover:bg-[#1E2D47] text-purple-300 border border-purple-500/30'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Bank & QR Settings</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Pending Requests */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#1C1605]/80 via-[#141208]/80 to-[#0B111C] border border-amber-500/30 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-300/90 uppercase tracking-wider">
              Awaiting Verification
            </span>
            <span className="flex h-2 w-2 relative">
              {stats.pendingCount > 0 && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              )}
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between">
            <p className="text-2xl font-black text-amber-400 font-mono">
              {stats.pendingCount}
            </p>
            <span className="text-xs font-mono font-bold text-amber-300/80">
              ₹{stats.pendingSum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Pending admin confirmation</p>
        </div>

        {/* Approved Total */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#061F18]/80 via-[#0A1620]/80 to-[#0B111C] border border-emerald-500/30 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-300/90 uppercase tracking-wider">
              Approved & Credited
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2.5 flex items-baseline justify-between">
            <p className="text-2xl font-black text-emerald-400 font-mono">
              {stats.approvedCount}
            </p>
            <span className="text-xs font-mono font-bold text-emerald-300/80">
              ₹{stats.approvedSum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Atomically added to trader margins</p>
        </div>

        {/* Rejected */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#240608]/80 via-[#1A0B0E]/80 to-[#0B111C] border border-rose-500/30 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-300/90 uppercase tracking-wider">
              Rejected Requests
            </span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2.5 flex items-baseline justify-between">
            <p className="text-2xl font-black text-rose-400 font-mono">
              {stats.rejectedCount}
            </p>
            <span className="text-xs font-mono text-rose-300/80">With audit rationale</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Invalid UTR or unmatched funds</p>
        </div>
      </div>

      {/* Tabs and Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Navigation Tabs */}
        <div className="flex items-center bg-[#060B13] p-1 rounded-xl border border-[#162234] overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('PENDING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'PENDING'
                ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-[#0E1726]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pending</span>
            {stats.pendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] bg-black text-amber-300 font-black">
                {stats.pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('APPROVED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'APPROVED'
                ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-[#0E1726]'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Approved</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('REJECTED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'REJECTED'
                ? 'bg-rose-500 text-white font-black shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-[#0E1726]'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Rejected</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ALL'
                ? 'bg-[#1E2E44] text-white font-black'
                : 'text-slate-400 hover:text-white hover:bg-[#0E1726]'
            }`}
          >
            All Requests
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('SETTINGS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'SETTINGS'
                ? 'bg-purple-600 text-white font-black shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-[#0E1726]'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Bank & QR Config</span>
          </button>
        </div>

        {/* Search Bar */}
        {activeTab !== 'SETTINGS' && (
          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Trader, ID, or UTR..."
              className="w-full bg-[#060B13] border border-[#1E2E44] rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500 transition-all font-mono"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-white"
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {activeTab === 'SETTINGS' ? (
        /* BANK & QR SETTINGS PANEL */
        <div className="bg-[#0B111C] border border-[#162234] rounded-2xl p-5 sm:p-6 shadow-xl">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-5 h-5 text-purple-400" />
              <div>
                <h2 className="text-base font-black text-white">Deposit Bank & QR Code Configuration</h2>
                <p className="text-xs text-slate-400">
                  These bank coordinates and QR code are displayed to clients when they select Manual Deposit in their platform wallet.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Bank Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Bank Name</label>
                  <input
                    type="text"
                    required
                    value={bankSettings.bank_name}
                    onChange={(e) => setBankSettings({ ...bankSettings, bank_name: e.target.value })}
                    placeholder="e.g. HDFC Bank Ltd"
                    className="w-full bg-[#060B13] border border-[#1E2E44] rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-purple-500"
                  />
                </div>

                {/* Account Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Account Holder Name</label>
                  <input
                    type="text"
                    required
                    value={bankSettings.account_name}
                    onChange={(e) => setBankSettings({ ...bankSettings, account_name: e.target.value })}
                    placeholder="e.g. VERTEX TRADING TECHNOLOGIES PVT LTD"
                    className="w-full bg-[#060B13] border border-[#1E2E44] rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-purple-500"
                  />
                </div>

                {/* Account Number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Account Number</label>
                  <input
                    type="text"
                    required
                    value={bankSettings.account_number}
                    onChange={(e) => setBankSettings({ ...bankSettings, account_number: e.target.value })}
                    placeholder="e.g. 50200084729103"
                    className="w-full bg-[#060B13] border border-[#1E2E44] rounded-xl px-3 py-2.5 text-xs text-white font-mono outline-none focus:border-purple-500"
                  />
                </div>

                {/* IFSC Code */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">IFSC Code</label>
                  <input
                    type="text"
                    required
                    value={bankSettings.ifsc_code}
                    onChange={(e) => setBankSettings({ ...bankSettings, ifsc_code: e.target.value.toUpperCase() })}
                    placeholder="e.g. HDFC0001234"
                    className="w-full bg-[#060B13] border border-[#1E2E44] rounded-xl px-3 py-2.5 text-xs text-white font-mono uppercase outline-none focus:border-purple-500"
                  />
                </div>

                {/* UPI ID */}
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-300">UPI ID / VPA</label>
                  <input
                    type="text"
                    required
                    value={bankSettings.upi_id}
                    onChange={(e) => setBankSettings({ ...bankSettings, upi_id: e.target.value })}
                    placeholder="e.g. vertextrading@hdfcbank"
                    className="w-full bg-[#060B13] border border-[#1E2E44] rounded-xl px-3 py-2.5 text-xs text-white font-mono outline-none focus:border-purple-500"
                  />
                </div>

                {/* QR Code URL & File Upload */}
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-300">
                    Payment QR Code (Upload Image or specify URL)
                  </label>
                  <div className="flex flex-col sm:flex-row items-start gap-4">
                    <div className="flex-1 w-full space-y-2">
                      <input
                        type="text"
                        value={bankSettings.qr_code_url}
                        onChange={(e) => setBankSettings({ ...bankSettings, qr_code_url: e.target.value })}
                        placeholder="https://... or upload QR image below"
                        className="w-full bg-[#060B13] border border-[#1E2E44] rounded-xl px-3 py-2 text-xs text-white font-mono outline-none focus:border-purple-500"
                      />
                      <label className="flex items-center justify-center gap-2 px-3 py-2 bg-[#121B2C] hover:bg-[#1A263D] border border-dashed border-[#24354E] rounded-xl text-xs text-slate-300 cursor-pointer transition-all">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload QR Code Image (PNG / JPG / WEBP)</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleQrUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Live Preview Box */}
                    <div className="w-32 h-32 flex-shrink-0 bg-white p-2 rounded-xl border border-slate-700 flex flex-col items-center justify-center shadow-md">
                      {bankSettings.qr_code_url ? (
                        <img
                          src={bankSettings.qr_code_url}
                          alt="Payment QR"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-center">
                          <QrCode className="w-8 h-8 text-slate-400 mx-auto" />
                          <span className="text-[9px] text-slate-500 block mt-1 font-sans">
                            Auto-generated UPI QR used if blank
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('PENDING')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-[#0E1726] border border-[#1E2E44]"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={settingsSaving}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 transition-all cursor-pointer shadow-lg shadow-purple-950/40 disabled:opacity-50"
                >
                  {settingsSaving ? 'Saving...' : 'Save Payment Coordinates'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        /* DEPOSIT REQUESTS TABLE */
        <div className="bg-[#0B111C] border border-[#162234] rounded-2xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="p-12 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-400 mb-2" />
              <p className="text-xs">Loading deposit requests...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-rose-400">
              <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
              <p className="text-sm font-bold">{error}</p>
              <button
                type="button"
                onClick={fetchRequests}
                className="mt-3 px-3 py-1.5 bg-[#142032] text-xs text-white rounded-lg hover:bg-[#1E2E44]"
              >
                Retry
              </button>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <CreditCard className="w-10 h-10 mx-auto text-slate-600 mb-3" />
              <p className="text-sm font-bold text-slate-300">No deposit requests found</p>
              <p className="text-xs text-slate-500 mt-1">
                {searchQuery
                  ? `No requests match "${searchQuery}".`
                  : activeTab === 'PENDING'
                  ? 'All pending deposit requests have been addressed.'
                  : `No ${activeTab.toLowerCase()} requests recorded.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#060B13] border-b border-[#162234] text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Request / Time</th>
                    <th className="py-3 px-4">Trader / Account</th>
                    <th className="py-3 px-4 text-right">Amount (₹)</th>
                    <th className="py-3 px-4">UTR / Txn ID</th>
                    <th className="py-3 px-4">Mode</th>
                    <th className="py-3 px-4 text-center">Proof</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141F30] text-xs">
                  {filteredRequests.map((req) => {
                    const isPending = req.status === 'PENDING';
                    const isApproved = req.status === 'APPROVED';
                    const isRejected = req.status === 'REJECTED';

                    return (
                      <tr
                        key={req.id}
                        className="hover:bg-[#0E1726]/60 transition-colors group"
                      >
                        {/* ID & Date */}
                        <td className="py-3.5 px-4 font-mono">
                          <span className="text-[11px] font-bold text-slate-300 block">
                            {req.id}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {new Date(req.created_at).toLocaleString('en-IN', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                        </td>

                        {/* Trader Details */}
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-white block truncate max-w-[150px]">
                            {req.user_name || req.user_id}
                          </span>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                            <span>ID: {req.user_id}</span>
                            {req.user_mobile && (
                              <span className="text-slate-500">({req.user_mobile})</span>
                            )}
                          </div>
                        </td>

                        {/* Amount */}
                        <td className="py-3.5 px-4 text-right">
                          <span className="font-mono text-sm font-black text-white block">
                            ₹{Number(req.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </td>

                        {/* UTR Number */}
                        <td className="py-3.5 px-4">
                          <div className="inline-flex items-center gap-1.5 bg-[#060B13] px-2 py-1 rounded-lg border border-[#1A283C]">
                            <span className="font-mono text-xs font-bold text-amber-300 select-all">
                              {req.utr_number}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(req.utr_number, `utr-${req.id}`)}
                              className="text-slate-400 hover:text-white cursor-pointer"
                              title="Copy UTR"
                            >
                              {copiedField === `utr-${req.id}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Payment Method */}
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#142032] text-slate-300 border border-[#22334C]">
                            {req.payment_method === 'QR_CODE' ? (
                              <QrCode className="w-3 h-3 text-purple-400" />
                            ) : (
                              <Building2 className="w-3 h-3 text-blue-400" />
                            )}
                            <span>{req.payment_method.replace('_', ' ')}</span>
                          </span>
                        </td>

                        {/* Screenshot Proof */}
                        <td className="py-3.5 px-4 text-center">
                          {req.proof_image_url ? (
                            <button
                              type="button"
                              onClick={() => setPreviewImage(req.proof_image_url || null)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-bold transition-all cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-500">None</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 text-center">
                          {isPending && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse">
                              <Clock className="w-3 h-3" />
                              PENDING
                            </span>
                          )}
                          {isApproved && (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" />
                                APPROVED
                              </span>
                              {req.approved_by && (
                                <span className="text-[9px] text-slate-500 block mt-0.5 truncate max-w-[110px]">
                                  by {req.approved_by}
                                </span>
                              )}
                            </div>
                          )}
                          {isRejected && (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                <XCircle className="w-3 h-3" />
                                REJECTED
                              </span>
                              {req.rejection_reason && (
                                <span
                                  className="text-[9px] text-rose-400/80 block mt-0.5 truncate max-w-[120px]"
                                  title={req.rejection_reason}
                                >
                                  {req.rejection_reason}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          {isPending ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Approve Button */}
                              <button
                                type="button"
                                onClick={() => setApproveModalItem(req)}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Approve</span>
                              </button>

                              {/* Reject Button */}
                              <button
                                type="button"
                                onClick={() => setRejectModalItem(req)}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                              >
                                <XCircle className="w-3 h-3" />
                                <span>Reject</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-mono">
                              Processed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: CONFIRM APPROVE */}
      {approveModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fadeIn">
          <div className="bg-[#0B111C] border border-emerald-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Confirm Deposit Approval</h3>
                <p className="text-xs text-slate-400">Atomic balance credit execution</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#060B13] border border-[#162234] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Trader / User:</span>
                <strong className="text-white font-mono">{approveModalItem.user_name || approveModalItem.user_id} ({approveModalItem.user_id})</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Amount to Credit:</span>
                <strong className="text-emerald-400 font-mono text-base font-black">
                  ₹{Number(approveModalItem.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">UTR / Ref:</span>
                <span className="font-mono text-amber-300 font-bold select-all">{approveModalItem.utr_number}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Payment Mode:</span>
                <span className="text-slate-300">{approveModalItem.payment_method}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 flex-shrink-0 text-emerald-400 mt-0.5" />
              <span>
                Approving this request will apply a database row lock, credit the user's available margin balance, and record an immutable ledger entry.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setApproveModalItem(null)}
                disabled={actionProcessing}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-[#0E1726] border border-[#1E2E44] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApproveConfirm}
                disabled={actionProcessing}
                className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-950/50 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {actionProcessing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Credit...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Confirm & Credit Balance</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRM REJECT */}
      {rejectModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-fadeIn">
          <div className="bg-[#0B111C] border border-rose-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Reject Deposit Request</h3>
                <p className="text-xs text-slate-400">Request will be marked REJECTED (no balance change)</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#060B13] border border-[#162234] space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Trader:</span>
                <span className="text-white font-mono">{rejectModalItem.user_id}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Amount:</span>
                <span className="font-mono text-white font-bold">₹{Number(rejectModalItem.amount).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>UTR:</span>
                <span className="font-mono text-amber-300 select-all">{rejectModalItem.utr_number}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 block">
                Rejection Reason (Visible to user)
              </label>
              <textarea
                rows={3}
                required
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Reason for rejection (e.g. UTR not found on statement, wrong amount, duplicate)"
                className="w-full bg-[#060B13] border border-[#1E2E44] rounded-xl p-3 text-xs text-white outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalItem(null)}
                disabled={actionProcessing}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-[#0E1726] border border-[#1E2E44] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectConfirm}
                disabled={actionProcessing || !rejectionReason.trim()}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-950/50 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {actionProcessing ? 'Processing...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: SCREENSHOT PREVIEW LIGHTBOX */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn cursor-pointer"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] bg-[#0B111C] p-3 rounded-2xl border border-slate-700 shadow-2xl cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-300">Payment Screenshot Proof</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="text-slate-400 hover:text-white text-sm px-2 py-0.5 rounded-lg bg-[#142032]"
              >
                ✕ Close
              </button>
            </div>
            <div className="mt-2 max-h-[80vh] overflow-auto flex items-center justify-center">
              <img
                src={previewImage}
                alt="Payment Screenshot Proof"
                className="max-w-full max-h-[75vh] object-contain rounded-xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDepositRequestsPage;
