import React, { useState } from 'react';
import { WalletFunds } from '../types.ts';
import { authApi } from '../services/authApi.ts';
import { useAuth } from '../hooks/useAuth.ts';
import {
  Wallet,
  X,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Building2,
  CreditCard,
  QrCode,
  Smartphone,
  RefreshCw,
  Clock,
  ShieldCheck,
  Zap,
  Info,
  Copy,
  Check,
  TrendingUp,
  Lock,
  ChevronRight,
  AlertCircle,
  Upload,
  XCircle,
  Eye,
} from 'lucide-react';

interface WalletModalProps {
  isOpen: boolean;
  wallet: WalletFunds;
  onClose: () => void;
  onRefresh?: () => void;
  initialTab?: 'DEPOSIT' | 'WITHDRAW' | 'HISTORY';
}

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  wallet,
  onClose,
  onRefresh,
  initialTab = 'DEPOSIT',
}) => {
  const { user, showToast } = useAuth();

  const [activeTab, setActiveTab] = useState<'DEPOSIT' | 'WITHDRAW' | 'HISTORY'>(initialTab);
  const [depositAmount, setDepositAmount] = useState<string>('50000');
  const [depositMethod, setDepositMethod] = useState<'UPI' | 'NETBANKING' | 'IMPS' | 'MANUAL'>('UPI');
  const [manualSubMethod, setManualSubMethod] = useState<'BANK_TRANSFER' | 'QR_CODE'>('BANK_TRANSFER');
  const [manualUtr, setManualUtr] = useState<string>('');
  const [manualProof, setManualProof] = useState<string | null>(null);
  const [manualProofFileName, setManualProofFileName] = useState<string>('');
  const [paymentSettings, setPaymentSettings] = useState<{
    bank_name: string;
    account_name: string;
    account_number: string;
    ifsc_code: string;
    upi_id: string;
    qr_code_url: string;
  } | null>(null);
  const [myManualRequests, setMyManualRequests] = useState<any[]>([]);
  const [manualViewTab, setManualViewTab] = useState<'FORM' | 'REQUESTS'>('FORM');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showUpiQr, setShowUpiQr] = useState<boolean>(false);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [selectedBank, setSelectedBank] = useState<'HDFC' | 'ICICI' | 'SBI' | 'AXIS' | 'KOTAK'>('HDFC');
  const [upiId, setUpiId] = useState<string>('');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'DEPOSIT' | 'WITHDRAWAL' | 'MARGIN_CREDIT'>('ALL');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Local & authoritative ledger transaction history
  const [history, setHistory] = useState<
    Array<{
      id: string;
      type: 'DEPOSIT' | 'WITHDRAWAL' | 'MARGIN_CREDIT' | 'MARGIN_BLOCKED';
      amount: number;
      method: string;
      status: 'SUCCESS' | 'PROCESSING' | 'REJECTED' | 'FAILED';
      time: string;
      refId: string;
    }>
  >(() => {
    try {
      const saved = localStorage.getItem('vtx_wallet_history');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const loadPaymentDetails = React.useCallback(async () => {
    try {
      const res = await authApi.getPaymentDetails();
      if (res && res.success && res.data) {
        setPaymentSettings(res.data);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadServerHistory = React.useCallback(async () => {
    try {
      const [res, ledgerRes, manualRes] = await Promise.all([
        authApi.getFunds().catch(() => ({ transactions: [] })),
        authApi.getLedger().catch(() => ({ ledger: [] })),
        authApi.getMyDepositRequests().catch(() => ({ data: [] })),
      ]);

      if (manualRes && manualRes.data && Array.isArray(manualRes.data)) {
        setMyManualRequests(manualRes.data);
      }

      const seenIds = new Set<string>();
      const mapped: Array<{
        id: string;
        type: 'DEPOSIT' | 'WITHDRAWAL' | 'MARGIN_CREDIT' | 'MARGIN_BLOCKED';
        amount: number;
        method: string;
        status: 'SUCCESS' | 'PROCESSING' | 'REJECTED' | 'FAILED';
        time: string;
        refId: string;
      }> = [];

      // 1. Process fund transactions (deposits & withdrawals)
      if (res && res.transactions && res.transactions.length > 0) {
        for (const t of res.transactions) {
          const rawStatus = String(t.status || '').toUpperCase();
          let status: 'SUCCESS' | 'PROCESSING' | 'REJECTED' | 'FAILED' = 'PROCESSING';
          if (['APPROVED', 'COMPLETED', 'SUCCESS'].includes(rawStatus)) {
            status = 'SUCCESS';
          } else if (['REJECTED'].includes(rawStatus)) {
            status = 'REJECTED';
          } else if (['FAILED', 'CANCELLED'].includes(rawStatus)) {
            status = 'FAILED';
          } else {
            status = 'PROCESSING';
          }

          const rawRef = t.reference_id || t.reference || t.refId || t.id || '';
          const isWdr = t.type === 'WITHDRAWAL' || t.transaction_type === 'WITHDRAWAL';
          const refId = rawRef && (rawRef.startsWith('WDR-') || rawRef.startsWith('DEP-') || rawRef.startsWith('TX-') || !rawRef.startsWith('HDFC'))
            ? rawRef
            : (isWdr ? `WDR-${Date.now()}` : `DEP-${Date.now()}`);

          const id = t.id || refId;
          seenIds.add(id);
          if (t.reference_id) seenIds.add(t.reference_id);

          mapped.push({
            id,
            type: (t.transaction_type || t.type || (isWdr ? 'WITHDRAWAL' : 'DEPOSIT')) as any,
            amount: Number(t.amount || 0),
            method: t.payment_method || t.method || (isWdr ? 'Bank Payout' : 'UPI Instant'),
            status,
            time: t.created_at ? new Date(t.created_at).toLocaleDateString('en-GB') + ' ' + new Date(t.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Today',
            refId,
          });
        }
      }

      // 2. Process trade debits/credits & ledger records
      if (ledgerRes && ledgerRes.ledger && ledgerRes.ledger.length > 0) {
        for (const entry of ledgerRes.ledger) {
          if (entry.transaction_id && seenIds.has(entry.transaction_id)) continue;
          if (entry.id && seenIds.has(entry.id)) continue;
          seenIds.add(entry.id);

          const isCredit = entry.type === 'CREDIT';
          const category = String(entry.category || '').toUpperCase();
          const mappedType: 'DEPOSIT' | 'WITHDRAWAL' | 'MARGIN_CREDIT' | 'MARGIN_BLOCKED' =
            category === 'DEPOSIT'
              ? 'DEPOSIT'
              : category === 'WITHDRAWAL'
              ? 'WITHDRAWAL'
              : isCredit
              ? 'MARGIN_CREDIT'
              : 'MARGIN_BLOCKED';

          mapped.push({
            id: entry.id,
            type: mappedType,
            amount: Number(entry.amount || 0),
            method: entry.reference || (isCredit ? 'Trade Credit / Realized P&L' : 'Trade Margin Debit'),
            status: 'SUCCESS',
            time: entry.created_at ? new Date(entry.created_at).toLocaleDateString('en-GB') + ' ' + new Date(entry.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Today',
            refId: entry.transaction_id || entry.id,
          });
        }
      }

      // 3. Process manual deposit requests
      if (manualRes && manualRes.data && Array.isArray(manualRes.data)) {
        for (const m of manualRes.data) {
          const reqId = `MANUAL-${m.id}`;
          if (seenIds.has(reqId) || (m.utr_number && seenIds.has(m.utr_number))) continue;
          seenIds.add(reqId);
          if (m.utr_number) seenIds.add(m.utr_number);

          const rawStatus = String(m.status || '').toUpperCase();
          const status = rawStatus === 'APPROVED' ? 'SUCCESS' : rawStatus === 'REJECTED' ? 'REJECTED' : 'PROCESSING';
          mapped.push({
            id: reqId,
            type: 'DEPOSIT',
            amount: Number(m.amount || 0),
            method: `Manual (${m.payment_method === 'QR_CODE' ? 'QR Code' : 'Bank Transfer'}) - UTR: ${m.utr_number}`,
            status,
            time: m.created_at ? new Date(m.created_at).toLocaleDateString('en-GB') + ' ' + new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Today',
            refId: m.utr_number,
          });
        }
      }

      if (mapped.length > 0) {
        setHistory(mapped);
        localStorage.setItem('vtx_wallet_history', JSON.stringify(mapped));
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      loadServerHistory();
      loadPaymentDetails();
    }
  }, [isOpen, initialTab, loadServerHistory, loadPaymentDetails]);

  React.useEffect(() => {
    const handleDepositUpdate = () => {
      loadServerHistory();
      if (onRefresh) onRefresh();
    };
    window.addEventListener('vtx_manual_deposit_updated', handleDepositUpdate);
    return () => window.removeEventListener('vtx_manual_deposit_updated', handleDepositUpdate);
  }, [loadServerHistory, onRefresh]);

  const handleProofFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast({
        type: 'error',
        title: 'Invalid File Format',
        description: 'Only JPG, PNG, and WEBP screenshot images are accepted.',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast({
        type: 'error',
        title: 'File Too Large',
        description: 'Screenshot size must not exceed 5MB.',
      });
      return;
    }

    setManualProofFileName(file.name);
    const reader = new FileReader();
    reader.onloadend = () => {
      setManualProof(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleManualDepositSubmit = async () => {
    const amount = Number(depositAmount);
    if (!amount || amount < 100) {
      showToast({
        type: 'error',
        title: 'Invalid Amount',
        description: 'Minimum manual deposit amount is ₹100.',
      });
      return;
    }
    const cleanUtr = manualUtr.trim();
    if (!cleanUtr || cleanUtr.length < 6) {
      showToast({
        type: 'error',
        title: 'Invalid UTR / Transaction ID',
        description: 'Please enter a valid Transaction Reference or UTR Number (minimum 6 characters).',
      });
      return;
    }

    setProcessing(true);
    try {
      const res = await authApi.submitManualDeposit({
        amount,
        utr_number: cleanUtr,
        payment_method: manualSubMethod,
        proof_image: manualProof,
      });

      if (res.success) {
        showToast({
          type: 'success',
          title: 'Manual Deposit Request Submitted',
          description: `UTR ${cleanUtr} submitted for ₹${amount.toLocaleString('en-IN')}. Our accounts desk will verify and credit your margin.`,
          duration: 5000,
        });
        setManualUtr('');
        setManualProof(null);
        setManualProofFileName('');
        setManualViewTab('REQUESTS');
        loadServerHistory();
        loadPaymentDetails();
      }
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Request Failed',
        description: err.message || 'Unable to submit manual deposit request.',
      });
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    showToast({
      type: 'info',
      title: 'Copied to Clipboard',
      description: `${text} copied.`,
      duration: 2000,
    });
  };

  const handleRefreshBalance = async () => {
    setIsRefreshing(true);
    if (onRefresh) await onRefresh();
    await loadServerHistory();
    setTimeout(() => {
      setIsRefreshing(false);
      showToast({
        type: 'info',
        title: 'Wallet Synced',
        description: 'Latest trading margin and balances updated from exchange server.',
        duration: 3000,
      });
    }, 400);
  };

  const handleDeposit = async () => {
    const amount = Number(depositAmount);
    if (!amount || amount < 100) {
      showToast({
        type: 'error',
        title: 'Invalid Amount',
        description: 'Minimum deposit amount is ₹100.',
      });
      return;
    }
    if (amount > 10000000) {
      showToast({
        type: 'error',
        title: 'Limit Exceeded',
        description: 'Maximum deposit limit per transaction is ₹1,00,00,000 (1 Crore).',
      });
      return;
    }

    setProcessing(true);
    try {
      const methodLabel =
        depositMethod === 'UPI'
          ? `UPI (${upiId || 'Instant'})`
          : depositMethod === 'NETBANKING'
          ? `Net Banking (${selectedBank})`
          : 'IMPS Virtual Account';

      const res: any = await authApi.depositFunds(amount, methodLabel);
      const txRef = res?.refId || res?.transactionId || `DEP-${Date.now().toString().slice(-6)}`;

      const newTxItem = {
        id: res?.transactionId || `TX-${Date.now().toString().slice(-4)}`,
        type: 'DEPOSIT' as const,
        amount,
        method: methodLabel,
        status: 'SUCCESS' as const,
        time: 'Just now',
        refId: txRef,
      };

      // Add to local history & persist immediately
      setHistory((prev) => {
        const next = [newTxItem, ...prev.filter((it) => it.id !== newTxItem.id)];
        localStorage.setItem('vtx_wallet_history', JSON.stringify(next));
        return next;
      });

      showToast({
        type: 'success',
        title: 'Funds Credited Successfully',
        description: `₹${amount.toLocaleString('en-IN')} has been added to your trading margin balance.`,
        duration: 4000,
      });

      if (onRefresh) onRefresh();
      loadServerHistory();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Deposit Failed',
        description: err.message || 'Unable to process deposit. Please try again.',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = Number(withdrawAmount);
    if (!amount || amount < 500) {
      showToast({
        type: 'error',
        title: 'Validation Error',
        description: 'Minimum withdrawal amount is ₹500.',
      });
      return;
    }

    if (amount > wallet.availableBalance) {
      showToast({
        type: 'error',
        title: 'Insufficient Margin',
        description: `Available to withdraw: ₹${wallet.availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      });
      return;
    }

    setProcessing(true);
    try {
      const res: any = await authApi.withdrawFunds(amount, 'HDFC Bank Ltd', '50100492818912');
      const txRef = res?.refId || res?.transactionId || `WDR-${Date.now().toString().slice(-6)}`;

      // Add pending withdrawal record to local history
      const newWdrItem = {
        id: res?.transactionId || `TX-${Date.now().toString().slice(-4)}`,
        type: 'WITHDRAWAL' as const,
        amount,
        method: 'IMPS to HDFC Bank (8912)',
        status: 'PROCESSING' as const,
        time: 'Just now',
        refId: txRef,
      };

      setHistory((prev) => {
        const next = [newWdrItem, ...prev.filter((it) => it.id !== newWdrItem.id)];
        localStorage.setItem('vtx_wallet_history', JSON.stringify(next));
        return next;
      });

      showToast({
        type: 'success',
        title: 'Payout Request Submitted',
        description: `₹${amount.toLocaleString('en-IN')} payout request submitted (ID: ${txRef}). Margin locked pending approval.`,
        duration: 4000,
      });

      setWithdrawAmount('');
      if (onRefresh) onRefresh();
      loadServerHistory();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Withdrawal Failed',
        description: err.message || 'Unable to process payout request.',
      });
    } finally {
      setProcessing(false);
    }
  };

  const numDepositAmt = Number(depositAmount) || 0;
  const simulatedNewBalance = wallet.availableBalance + numDepositAmt;
  const numWithdrawAmt = Number(withdrawAmount) || 0;
  const isWithdrawExceeded = numWithdrawAmt > wallet.availableBalance;
  const isWithdrawBelowMin = numWithdrawAmt > 0 && numWithdrawAmt < 500;

  const unrealizedPnL = typeof wallet.totalPnL === 'number' ? wallet.totalPnL : 0;
  const realizedPnL = typeof wallet.todayPnL === 'number' ? wallet.todayPnL : 0;
  const isUnrealizedPositive = unrealizedPnL >= 0;
  const isRealizedPositive = realizedPnL >= 0;

  const upiUri = `upi://pay?pa=vertex.trading@icici&pn=VERTEX%20Trading&am=${numDepositAmt}&cu=INR&tr=${user?.userId || 'VTX'}_${Date.now()}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(upiUri)}`;

  const filteredHistory = history.filter((item) => {
    if (historyFilter === 'ALL') return true;
    if (historyFilter === 'DEPOSIT') return item.type === 'DEPOSIT';
    if (historyFilter === 'WITHDRAWAL') return item.type === 'WITHDRAWAL';
    if (historyFilter === 'MARGIN_CREDIT') return item.type === 'MARGIN_CREDIT' || item.type === 'MARGIN_BLOCKED';
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-[#0B111C] border border-[#1E2E44] rounded-2xl sm:rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl relative text-slate-100 animate-scaleUp overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-[#162234] bg-[#080D16] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Wallet & Funds
                </h2>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Sync
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                <span>Client ID:</span>
                <strong className="text-amber-300 font-bold uppercase tracking-wider bg-[#142032] px-1.5 py-0.2 rounded border border-[#1E2E44]">
                  {user?.userId || 'VTX123'}
                </strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="wallet-refresh-btn"
              onClick={handleRefreshBalance}
              disabled={isRefreshing}
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-[#142032] hover:bg-[#1C2C44] border border-[#1E2E44] text-slate-300 hover:text-white transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 text-xs font-bold shadow-sm"
              title="Refresh Balance"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              type="button"
              id="wallet-modal-close-btn"
              onClick={onClose}
              className="p-2 rounded-xl bg-[#142032] hover:bg-[#1C2C44] border border-[#1E2E44] text-slate-400 hover:text-white transition-colors cursor-pointer"
              aria-label="Close Wallet"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto custom-scrollbar flex-1">
          {/* 2. Responsive 4-Grid Margin & Balance Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {/* Card 1: Available Margin */}
            <div
              className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#062417]/90 via-[#091C1E]/80 to-[#0B111C] border border-emerald-500/40 shadow-lg relative overflow-hidden min-w-0 flex flex-col justify-between"
              title={`₹${wallet.availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-300 uppercase tracking-wider truncate">
                  Available Margin
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              </div>
              <div className="my-1 sm:my-1.5">
                <p className="text-sm sm:text-base lg:text-lg font-mono font-black text-emerald-400 tracking-tight truncate">
                  ₹{wallet.availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <span className="text-[9px] sm:text-[10px] text-emerald-300/80 font-medium truncate block">
                Instant Trading Ready
              </span>
            </div>

            {/* Card 2: Used Margin */}
            <div
              className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#271505]/90 via-[#1A1412]/80 to-[#0B111C] border border-amber-500/40 shadow-lg relative overflow-hidden min-w-0 flex flex-col justify-between"
              title={`₹${wallet.usedMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-300 uppercase tracking-wider truncate">
                  Used Margin
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              </div>
              <div className="my-1 sm:my-1.5">
                <p className="text-sm sm:text-base lg:text-lg font-mono font-black text-amber-400 tracking-tight truncate">
                  ₹{wallet.usedMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <span className="text-[9px] sm:text-[10px] text-amber-300/80 font-medium truncate block">
                Active Exposure
              </span>
            </div>

            {/* Card 3: Unrealized MTM P&L */}
            <div
              className={`p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border shadow-lg relative overflow-hidden min-w-0 flex flex-col justify-between ${
                isUnrealizedPositive
                  ? 'bg-gradient-to-br from-[#061F18]/90 via-[#0A1620]/80 to-[#0B111C] border-emerald-500/30'
                  : 'bg-gradient-to-br from-[#240608]/90 via-[#1A0B0E]/80 to-[#0B111C] border-rose-500/30'
              }`}
              title={`${isUnrealizedPositive ? '+' : '-'}₹${Math.abs(unrealizedPnL).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-300 uppercase tracking-wider truncate">
                  Unrealized P&L
                </span>
                <TrendingUp className={`w-3 h-3 flex-shrink-0 ${isUnrealizedPositive ? 'text-emerald-400' : 'text-rose-400'}`} />
              </div>
              <div className="my-1 sm:my-1.5">
                <p className={`text-sm sm:text-base lg:text-lg font-mono font-black tracking-tight truncate flex items-center gap-0.5 ${
                  isUnrealizedPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  <span>{isUnrealizedPositive ? '+₹' : '-₹'}</span>
                  <span>{Math.abs(unrealizedPnL).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </p>
              </div>
              <span className={`text-[9px] sm:text-[10px] font-medium truncate block ${isUnrealizedPositive ? 'text-emerald-300/80' : 'text-rose-300/80'}`}>
                Open Positions
              </span>
            </div>

            {/* Card 4: Today's Realized P&L */}
            <div
              className={`p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border shadow-lg relative overflow-hidden min-w-0 flex flex-col justify-between ${
                isRealizedPositive
                  ? 'bg-gradient-to-br from-[#0B1A2C]/90 via-[#0A1220]/80 to-[#0B111C] border-blue-500/30'
                  : 'bg-gradient-to-br from-[#240608]/90 via-[#1A0B0E]/80 to-[#0B111C] border-rose-500/30'
              }`}
              title={`${isRealizedPositive ? '+' : '-'}₹${Math.abs(realizedPnL).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-300 uppercase tracking-wider truncate">
                  Today's P&L
                </span>
                <Clock className={`w-3 h-3 flex-shrink-0 ${isRealizedPositive ? 'text-blue-400' : 'text-rose-400'}`} />
              </div>
              <div className="my-1 sm:my-1.5">
                <p className={`text-sm sm:text-base lg:text-lg font-mono font-black tracking-tight truncate flex items-center gap-0.5 ${
                  isRealizedPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  <span>{isRealizedPositive ? '+₹' : '-₹'}</span>
                  <span>{Math.abs(realizedPnL).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </p>
              </div>
              <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium truncate block">
                Realized Today
              </span>
            </div>
          </div>

          {/* 3. Modern Segmented Tab Switcher */}
          <div className="grid grid-cols-3 gap-1.5 bg-[#060B13] p-1.5 rounded-2xl border border-[#162234]">
            <button
              type="button"
              id="wallet-tab-deposit-btn"
              onClick={() => setActiveTab('DEPOSIT')}
              className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2 ${
                activeTab === 'DEPOSIT'
                  ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-950/40 font-black scale-[1.01]'
                  : 'text-slate-400 hover:text-white hover:bg-[#0E1726]'
              }`}
            >
              <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
              <span>+ Add Funds</span>
            </button>

            <button
              type="button"
              id="wallet-tab-withdraw-btn"
              onClick={() => setActiveTab('WITHDRAW')}
              className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2 ${
                activeTab === 'WITHDRAW'
                  ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-950/40 font-black scale-[1.01]'
                  : 'text-slate-400 hover:text-white hover:bg-[#0E1726]'
              }`}
            >
              <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
              <span>- Withdraw</span>
            </button>

            <button
              type="button"
              id="wallet-tab-history-btn"
              onClick={() => setActiveTab('HISTORY')}
              className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2 ${
                activeTab === 'HISTORY'
                  ? 'bg-[#1E2E44] text-white shadow-lg border border-[#2D4566] font-black scale-[1.01]'
                  : 'text-slate-400 hover:text-white hover:bg-[#0E1726]'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>History</span>
            </button>
          </div>

          {/* 4. Tab Body Content */}

          {/* TAB 1: ADD FUNDS (DEPOSIT) */}
          {activeTab === 'DEPOSIT' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Quick Preset Buttons */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">
                    Select or Enter Deposit Amount (₹)
                  </label>
                  <span className="text-[11px] text-emerald-400 font-mono font-bold">
                    Zero Fee • Instant 24x7
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2">
                  {[
                    { val: '5000', label: '+₹5k' },
                    { val: '10000', label: '+₹10k' },
                    { val: '25000', label: '+₹25k' },
                    { val: '50000', label: '+₹50k' },
                    { val: '100000', label: '+₹1 Lakh' },
                    { val: '500000', label: '+₹5 Lakh' },
                  ].map((item) => {
                    const isSelected = depositAmount === item.val;
                    return (
                      <button
                        key={item.val}
                        type="button"
                        onClick={() => setDepositAmount(item.val)}
                        className={`py-2 px-1 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer text-center ${
                          isSelected
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm ring-1 ring-emerald-500/40'
                            : 'bg-[#060B13] border-[#1E2E44] text-slate-400 hover:text-white hover:border-[#2E4566]'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                {/* Amount Input */}
                <div className="relative mt-2">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400 font-mono">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="100"
                    step="500"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="Enter deposit amount (min ₹100)"
                    className="w-full bg-[#060B13] border border-[#1E2E44] rounded-xl pl-9 pr-24 py-3 text-base sm:text-lg font-mono font-black text-white outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                  />
                  {numDepositAmt > 0 && (
                    <button
                      type="button"
                      onClick={() => setDepositAmount('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 hover:text-slate-300 px-2 py-1 bg-[#142032] rounded-lg cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Live Margin Calculation Preview */}
                {numDepositAmt > 0 && (
                  <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>New Available Margin after credit:</span>
                    </span>
                    <strong className="font-mono text-sm font-black text-emerald-400">
                      ₹{simulatedNewBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                )}
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block">
                  Choose Payment Mode
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                  {/* UPI */}
                  <button
                    type="button"
                    onClick={() => setDepositMethod('UPI')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 relative ${
                      depositMethod === 'UPI'
                        ? 'border-emerald-500 bg-gradient-to-br from-emerald-950/50 to-[#0A1624] text-emerald-400 shadow-md ring-1 ring-emerald-500/40'
                        : 'border-[#1E2E44] bg-[#060B13] text-slate-400 hover:text-white hover:border-[#2D4566]'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <Smartphone className="w-5 h-5" />
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        RECOMMENDED
                      </span>
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-black text-white">UPI Instant</div>
                      <span className="text-[10px] text-emerald-400 font-mono">Zero Fee • GPay, PhonePe</span>
                    </div>
                  </button>

                  {/* Net Banking */}
                  <button
                    type="button"
                    onClick={() => setDepositMethod('NETBANKING')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                      depositMethod === 'NETBANKING'
                        ? 'border-emerald-500 bg-gradient-to-br from-emerald-950/50 to-[#0A1624] text-emerald-400 shadow-md ring-1 ring-emerald-500/40'
                        : 'border-[#1E2E44] bg-[#060B13] text-slate-400 hover:text-white hover:border-[#2D4566]'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <Building2 className="w-5 h-5" />
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#142032] text-slate-300">
                        40+ Banks
                      </span>
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-black text-white">Net Banking</div>
                      <span className="text-[10px] text-slate-400">All Major Indian Banks</span>
                    </div>
                  </button>

                  {/* IMPS / NEFT */}
                  <button
                    type="button"
                    onClick={() => setDepositMethod('IMPS')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                      depositMethod === 'IMPS'
                        ? 'border-emerald-500 bg-gradient-to-br from-emerald-950/50 to-[#0A1624] text-emerald-400 shadow-md ring-1 ring-emerald-500/40'
                        : 'border-[#1E2E44] bg-[#060B13] text-slate-400 hover:text-white hover:border-[#2D4566]'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <CreditCard className="w-5 h-5" />
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#142032] text-slate-300">
                        RTGS / IMPS
                      </span>
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-black text-white">Virtual Account</div>
                      <span className="text-[10px] text-slate-400">Direct Bank Transfer</span>
                    </div>
                  </button>

                  {/* Manual Deposit */}
                  <button
                    type="button"
                    id="wallet-method-manual-btn"
                    onClick={() => setDepositMethod('MANUAL')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 relative ${
                      depositMethod === 'MANUAL'
                        ? 'border-amber-500 bg-gradient-to-br from-amber-950/50 to-[#14120C] text-amber-400 shadow-md ring-1 ring-amber-500/40'
                        : 'border-[#1E2E44] bg-[#060B13] text-slate-400 hover:text-white hover:border-[#2D4566]'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <ShieldCheck className="w-5 h-5 text-amber-400" />
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        ADMIN VERIF
                      </span>
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-black text-white">Manual Deposit</div>
                      <span className="text-[10px] text-amber-400/90 font-mono">Bank/QR with UTR</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* UPI Mode Details */}
              {depositMethod === 'UPI' && (
                <div className="p-3.5 sm:p-4 bg-[#060B13] border border-[#162234] rounded-2xl space-y-3">
                  <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                    <span className="text-slate-400 font-medium">Supported UPI Apps:</span>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold flex-wrap">
                      {['GPay', 'PhonePe', 'Paytm', 'BHIM', 'CRED'].map((app) => (
                        <span key={app} className="px-2 py-0.5 rounded-md bg-[#121D2C] border border-[#1E2E44] text-slate-300">
                          {app}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-300 block">
                      Enter UPI ID / VPA
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. yourname@okhdfcbank or yourname@ibl"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      className="w-full bg-[#0B111C] border border-[#1E2E44] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono text-white outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* QR Code toggle option */}
                  <div className="pt-2 border-t border-[#121D2C] flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowUpiQr(!showUpiQr)}
                      className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>{showUpiQr ? 'Hide Instant Dynamic QR Code' : 'Or Scan Dynamic QR Code to Pay'}</span>
                    </button>
                  </div>

                  {showUpiQr && (
                    <div className="p-4 bg-[#0A121E] border border-amber-500/30 rounded-xl flex flex-col items-center justify-center space-y-3 animate-fadeIn">
                      <div className="w-44 h-44 bg-white p-2.5 rounded-2xl flex items-center justify-center shadow-2xl relative">
                        <img
                          src={qrCodeUrl}
                          alt={`Scan to Pay ₹${numDepositAmt.toLocaleString('en-IN')}`}
                          className="w-full h-full object-contain rounded-lg"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                            const fallback = document.getElementById('upi-qr-fallback');
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                        <div
                          id="upi-qr-fallback"
                          style={{ display: 'none' }}
                          className="w-full h-full flex flex-col items-center justify-center text-slate-900 text-center p-2"
                        >
                          <QrCode className="w-16 h-16 text-slate-900 mb-1" />
                          <span className="text-[10px] font-mono font-black">vertex.trading@icici</span>
                        </div>
                      </div>

                      <div className="text-center space-y-1">
                        <p className="text-xs text-slate-200 font-semibold">
                          Scan with <strong className="text-amber-400">GPay, PhonePe, Paytm, BHIM</strong>
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono">
                          Amount: <strong className="text-emerald-400 font-bold">₹{numDepositAmt.toLocaleString('en-IN')}</strong> • Zero Gateway Fee
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopy('vertex.trading@icici', 'upi_vpa')}
                          className="px-2.5 py-1 rounded-lg bg-[#142032] hover:bg-[#1E2E44] text-slate-300 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer border border-[#1E2E44]"
                        >
                          {copiedField === 'upi_vpa' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedField === 'upi_vpa' ? 'UPI Copied' : 'Copy VPA'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(upiUri, 'upi_intent')}
                          className="px-2.5 py-1 rounded-lg bg-[#142032] hover:bg-[#1E2E44] text-slate-300 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer border border-[#1E2E44]"
                        >
                          {copiedField === 'upi_intent' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedField === 'upi_intent' ? 'URI Copied' : 'Copy Payment URI'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Net Banking Mode Details */}
              {depositMethod === 'NETBANKING' && (
                <div className="p-3.5 sm:p-4 bg-[#060B13] border border-[#162234] rounded-2xl space-y-3">
                  <span className="text-xs text-slate-300 block font-bold">Select Bank:</span>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {(['HDFC', 'ICICI', 'SBI', 'AXIS', 'KOTAK'] as const).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setSelectedBank(b)}
                        className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                          selectedBank === b
                            ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-sm ring-1 ring-emerald-500/40'
                            : 'border-[#1E2E44] bg-[#060B13] text-slate-400 hover:text-white'
                        }`}
                      >
                        {b} Bank
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    You will be securely routed to {selectedBank} Bank's verified 256-bit SSL gateway.
                  </p>
                </div>
              )}

              {/* IMPS Virtual Account Details */}
              {depositMethod === 'IMPS' && (
                <div className="p-3.5 sm:p-4 bg-[#060B13] border border-[#162234] rounded-2xl space-y-2.5 text-xs">
                  <div className="flex items-center justify-between text-slate-300 font-bold border-b border-[#141E2E] pb-2">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" /> Dedicated Virtual Trading Account
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">Instant Auto-Reconcile</span>
                  </div>

                  <div className="space-y-2 text-slate-300 font-mono">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-[#0B111C] border border-[#1E2E44]">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase font-sans">Virtual Account Number</span>
                        <span className="font-bold text-white text-sm">VTX{user?.userId || '12345'}99</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(`VTX${user?.userId || '12345'}99`, 'ac')}
                        className="px-2.5 py-1 rounded-md bg-[#142032] hover:bg-[#1E2E44] text-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedField === 'ac' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedField === 'ac' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-[#0B111C] border border-[#1E2E44]">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase font-sans">IFSC Code</span>
                        <span className="font-bold text-white text-sm">HDFC0000123</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy('HDFC0000123', 'ifsc')}
                        className="px-2.5 py-1 rounded-md bg-[#142032] hover:bg-[#1E2E44] text-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        {copiedField === 'ifsc' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedField === 'ifsc' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <div className="flex justify-between items-center px-1">
                      <span className="text-slate-400 font-sans text-xs">Beneficiary Name</span>
                      <span className="font-bold text-emerald-400 text-xs">VERTEX CLEARING CORP LTD</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Manual Deposit Flow */}
              {depositMethod === 'MANUAL' && (
                <div className="space-y-4">
                  {/* Sub-navigation: Form vs My Requests */}
                  <div className="flex items-center justify-between p-1 bg-[#060B13] rounded-xl border border-[#162234]">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        id="manual-tab-form-btn"
                        onClick={() => setManualViewTab('FORM')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          manualViewTab === 'FORM'
                            ? 'bg-amber-500 text-slate-950 font-black'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        1. Bank & QR Transfer
                      </button>
                      <button
                        type="button"
                        id="manual-tab-requests-btn"
                        onClick={() => setManualViewTab('REQUESTS')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          manualViewTab === 'REQUESTS'
                            ? 'bg-amber-500 text-slate-950 font-black'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <span>2. My Requests</span>
                        {myManualRequests.filter((r) => r.status === 'PENDING').length > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                            {myManualRequests.filter((r) => r.status === 'PENDING').length}
                          </span>
                        )}
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono pr-2 hidden sm:inline">
                      Approval time: ~5-15 mins
                    </span>
                  </div>

                  {manualViewTab === 'FORM' && (
                    <div className="space-y-4 animate-fadeIn">
                      {/* Sub-method switch */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          id="manual-submethod-bank-btn"
                          onClick={() => setManualSubMethod('BANK_TRANSFER')}
                          className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex items-center justify-center gap-2 ${
                            manualSubMethod === 'BANK_TRANSFER'
                              ? 'border-amber-500 bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30 font-bold'
                              : 'border-[#1E2E44] bg-[#060B13] text-slate-400 hover:text-white'
                          }`}
                        >
                          <Building2 className="w-4 h-4" />
                          <span className="text-xs">Bank Transfer (NEFT/RTGS/IMPS)</span>
                        </button>
                        <button
                          type="button"
                          id="manual-submethod-qr-btn"
                          onClick={() => setManualSubMethod('QR_CODE')}
                          className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex items-center justify-center gap-2 ${
                            manualSubMethod === 'QR_CODE'
                              ? 'border-amber-500 bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30 font-bold'
                              : 'border-[#1E2E44] bg-[#060B13] text-slate-400 hover:text-white'
                          }`}
                        >
                          <QrCode className="w-4 h-4" />
                          <span className="text-xs">Official QR Code (UPI)</span>
                        </button>
                      </div>

                      {/* Bank Details Display */}
                      {manualSubMethod === 'BANK_TRANSFER' && (
                        <div className="p-4 bg-[#060B13] border border-[#162234] rounded-2xl space-y-3">
                          <div className="flex items-center justify-between pb-2 border-b border-[#141E2E]">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-amber-400" />
                              <span className="text-xs font-black text-white uppercase tracking-wider">
                                Official Company Bank Account
                              </span>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold">
                              Verified Merchant
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                            <div className="p-2.5 rounded-xl bg-[#0B111C] border border-[#1E2E44] flex items-center justify-between">
                              <div>
                                <span className="text-[10px] text-slate-500 uppercase font-sans block">Bank Name</span>
                                <span className="font-bold text-white text-xs">{paymentSettings?.bank_name || 'HDFC Bank Ltd'}</span>
                              </div>
                            </div>

                            <div className="p-2.5 rounded-xl bg-[#0B111C] border border-[#1E2E44] flex items-center justify-between">
                              <div>
                                <span className="text-[10px] text-slate-500 uppercase font-sans block">Account Holder Name</span>
                                <span className="font-bold text-white text-xs">{paymentSettings?.account_name || 'VERTEX TRADING CORP'}</span>
                              </div>
                            </div>

                            <div className="p-2.5 rounded-xl bg-[#0B111C] border border-[#1E2E44] flex items-center justify-between">
                              <div>
                                <span className="text-[10px] text-slate-500 uppercase font-sans block">Account Number</span>
                                <span className="font-bold text-amber-300 text-sm tracking-wider">{paymentSettings?.account_number || '50200088991122'}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopy(paymentSettings?.account_number || '50200088991122', 'manual_ac')}
                                className="px-2 py-1 rounded-md bg-[#142032] hover:bg-[#1E2E44] text-slate-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                {copiedField === 'manual_ac' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                <span>{copiedField === 'manual_ac' ? 'Copied' : 'Copy'}</span>
                              </button>
                            </div>

                            <div className="p-2.5 rounded-xl bg-[#0B111C] border border-[#1E2E44] flex items-center justify-between">
                              <div>
                                <span className="text-[10px] text-slate-500 uppercase font-sans block">IFSC Code</span>
                                <span className="font-bold text-white text-sm">{paymentSettings?.ifsc_code || 'HDFC0000123'}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopy(paymentSettings?.ifsc_code || 'HDFC0000123', 'manual_ifsc')}
                                className="px-2 py-1 rounded-md bg-[#142032] hover:bg-[#1E2E44] text-slate-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                {copiedField === 'manual_ifsc' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                <span>{copiedField === 'manual_ifsc' ? 'Copied' : 'Copy'}</span>
                              </button>
                            </div>
                          </div>

                          {paymentSettings?.upi_id && (
                            <div className="p-2.5 rounded-xl bg-[#0B111C] border border-[#1E2E44] flex items-center justify-between text-xs font-mono">
                              <div>
                                <span className="text-[10px] text-slate-500 uppercase font-sans block">Direct UPI ID / VPA</span>
                                <span className="font-bold text-emerald-400">{paymentSettings.upi_id}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopy(paymentSettings.upi_id, 'manual_upi')}
                                className="px-2.5 py-1 rounded-md bg-[#142032] hover:bg-[#1E2E44] text-slate-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                {copiedField === 'manual_upi' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                <span>{copiedField === 'manual_upi' ? 'Copied' : 'Copy'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* QR Code Display */}
                      {manualSubMethod === 'QR_CODE' && (
                        <div className="p-4 bg-[#060B13] border border-[#162234] rounded-2xl flex flex-col items-center justify-center space-y-3">
                          <div className="w-48 h-48 bg-white p-2.5 rounded-2xl flex items-center justify-center shadow-2xl relative">
                            {paymentSettings?.qr_code_url ? (
                              <img
                                src={paymentSettings.qr_code_url}
                                alt="Admin Deposit QR Code"
                                className="w-full h-full object-contain rounded-lg"
                                onError={(e) => {
                                  (e.currentTarget as HTMLElement).style.display = 'none';
                                  const fallback = document.getElementById('manual-qr-fallback');
                                  if (fallback) fallback.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div
                              id="manual-qr-fallback"
                              style={{ display: paymentSettings?.qr_code_url ? 'none' : 'flex' }}
                              className="w-full h-full flex flex-col items-center justify-center text-slate-900 text-center p-2"
                            >
                              <QrCode className="w-20 h-20 text-slate-900 mb-1" />
                              <span className="text-[10px] font-mono font-black">{paymentSettings?.upi_id || 'vertex.clearing@hdfcbank'}</span>
                            </div>
                          </div>

                          <div className="text-center space-y-1">
                            <p className="text-xs text-slate-200 font-semibold">
                              Scan using <strong className="text-amber-400">PhonePe, Google Pay, Paytm, or BHIM</strong>
                            </p>
                            {paymentSettings?.upi_id && (
                              <div className="flex items-center justify-center gap-2 pt-1">
                                <span className="font-mono text-xs text-emerald-400 font-bold">{paymentSettings.upi_id}</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(paymentSettings.upi_id, 'manual_qr_upi')}
                                  className="px-2 py-0.5 rounded bg-[#142032] hover:bg-[#1E2E44] text-slate-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  {copiedField === 'manual_qr_upi' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                  <span>{copiedField === 'manual_qr_upi' ? 'Copied' : 'Copy UPI'}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* User Input: UTR & Proof Upload */}
                      <div className="p-4 bg-[#060B13] border border-[#162234] rounded-2xl space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-white flex items-center justify-between">
                            <span>Transaction ID / 12-digit UTR Number <strong className="text-rose-400">*</strong></span>
                            <span className="text-[10px] text-slate-400 font-normal">Found on bank/UPI receipt</span>
                          </label>
                          <input
                            type="text"
                            id="manual-utr-input"
                            value={manualUtr}
                            onChange={(e) => setManualUtr(e.target.value.toUpperCase())}
                            placeholder="e.g. 331456789012 or IMPS2024110198"
                            className="w-full bg-[#0B111C] border border-[#1E2E44] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono text-white outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40 uppercase"
                          />
                        </div>

                        {/* Screenshot / Payment Proof Upload */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-white flex items-center justify-between">
                            <span>Payment Screenshot / Receipt <span className="text-slate-500 font-normal">(Optional, speeds verification)</span></span>
                            <span className="text-[10px] text-slate-400 font-normal">JPG, PNG, WEBP (Max 5MB)</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-[#0B111C] border border-dashed border-[#1E2E44] hover:border-amber-500/50 rounded-xl cursor-pointer text-xs text-slate-300 hover:text-white transition-all">
                              <Upload className="w-4 h-4 text-amber-400" />
                              <span className="truncate">{manualProofFileName ? manualProofFileName : 'Click to upload payment screenshot'}</span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={handleProofFileUpload}
                                className="hidden"
                              />
                            </label>
                            {manualProof && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setPreviewImage(manualProof)}
                                  className="p-2.5 rounded-xl bg-[#142032] hover:bg-[#1E2E44] text-amber-400 border border-[#1E2E44] cursor-pointer"
                                  title="Preview Screenshot"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setManualProof(null);
                                    setManualProofFileName('');
                                  }}
                                  className="p-2.5 rounded-xl bg-[#142032] hover:bg-rose-500/20 text-rose-400 border border-[#1E2E44] cursor-pointer"
                                  title="Remove File"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-[11px] text-amber-300 leading-relaxed">
                          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                          <span>
                            <strong>Notice:</strong> Please enter the authentic UTR generated from your banking app. Once submitted, our accounts desk validates the receipt and credits your wallet atomically.
                          </span>
                        </div>
                      </div>

                      {/* Manual Submit Button */}
                      <button
                        type="button"
                        id="manual-deposit-submit-btn"
                        disabled={processing || numDepositAmt <= 0 || !manualUtr.trim()}
                        onClick={handleManualDepositSubmit}
                        className="w-full py-4 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black rounded-2xl text-sm sm:text-base transition-all cursor-pointer shadow-xl shadow-amber-950/50 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99]"
                      >
                        {processing ? (
                          <>
                            <RefreshCw className="w-5 h-5 animate-spin" />
                            <span>Submitting Deposit Request...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-5 h-5 text-slate-950" />
                            <span>Submit Request for ₹{numDepositAmt.toLocaleString('en-IN')} (UTR: {manualUtr.trim() || 'Required'})</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Tab 2: Track Existing Manual Requests */}
                  {manualViewTab === 'REQUESTS' && (
                    <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar animate-fadeIn">
                      {myManualRequests.length === 0 ? (
                        <div className="p-8 text-center bg-[#060B13] border border-[#162234] rounded-2xl space-y-2">
                          <Clock className="w-8 h-8 text-slate-600 mx-auto" />
                          <p className="text-xs text-slate-400 font-bold">No Manual Deposit Requests Found</p>
                          <p className="text-[11px] text-slate-500">Transfer funds to our bank account or scan the QR code to submit a request.</p>
                          <button
                            type="button"
                            onClick={() => setManualViewTab('FORM')}
                            className="mt-2 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs"
                          >
                            Submit New Request
                          </button>
                        </div>
                      ) : (
                        myManualRequests.map((req) => (
                          <div
                            key={req.id}
                            className="p-3 bg-[#060B13] border border-[#162234] rounded-xl flex items-center justify-between text-xs gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-white text-sm">
                                  ₹{Number(req.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                    req.status === 'APPROVED'
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                      : req.status === 'REJECTED'
                                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  }`}
                                >
                                  {req.status === 'APPROVED' ? 'APPROVED & CREDITED' : req.status === 'REJECTED' ? 'REJECTED' : 'PENDING REVIEW'}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                UTR: <strong className="text-slate-200">{req.utr_number}</strong> • {req.payment_method === 'QR_CODE' ? 'QR Code' : 'Bank Transfer'}
                              </div>
                              {req.rejection_reason && (
                                <div className="text-[10px] text-rose-400 font-medium">
                                  Reason: {req.rejection_reason}
                                </div>
                              )}
                              <div className="text-[9px] text-slate-500 font-mono">
                                {new Date(req.created_at).toLocaleString('en-IN')}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {req.proof_image_url && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewImage(req.proof_image_url)}
                                  className="px-2 py-1 rounded bg-[#142032] hover:bg-[#1E2E44] text-amber-400 text-[10px] font-bold flex items-center gap-1"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Receipt</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Deposit Submit Button for Instant Gateways */}
              {depositMethod !== 'MANUAL' && (
                <>
                  <button
                    type="button"
                    id="wallet-deposit-submit-btn"
                    disabled={processing || numDepositAmt <= 0}
                    onClick={handleDeposit}
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black rounded-2xl text-sm sm:text-base transition-all cursor-pointer shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99]"
                  >
                    {processing ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>Processing Secure Gateway...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-5 h-5 fill-current" />
                        <span>Pay & Credit ₹{numDepositAmt.toLocaleString('en-IN')} Instantly</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-center gap-2 text-[11px] text-slate-400 text-center">
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>256-bit SSL Bank-Grade Encryption • SEBI & RBI Regulated Gateway</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: WITHDRAW FUNDS */}
          {activeTab === 'WITHDRAW' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Available to Withdraw Hero Box */}
              <div className="p-4 sm:p-5 bg-gradient-to-br from-amber-500/15 via-[#1E150C]/60 to-[#0B111C] border border-amber-500/40 rounded-2xl space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="text-xs font-bold text-amber-300 uppercase tracking-wider block">
                      Withdrawable Margin
                    </span>
                    <p className="text-xl sm:text-2xl lg:text-3xl font-mono font-black text-white mt-0.5">
                      ₹{wallet.availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold font-mono">
                    T+0 Instant Payout
                  </span>
                </div>

                {/* Percentage Quick Fill Pills */}
                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-amber-500/20">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        const calculated = Math.floor((wallet.availableBalance * pct) / 100);
                        setWithdrawAmount(calculated.toString());
                      }}
                      className="py-1.5 rounded-lg bg-[#0B111C]/80 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold transition-colors cursor-pointer text-center"
                    >
                      {pct === 100 ? '100% (MAX)' : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">
                    Enter Payout Amount (₹)
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">Min ₹500</span>
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400 font-mono">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="500"
                    step="500"
                    placeholder={`Min ₹500 - Max ₹${wallet.availableBalance.toFixed(0)}`}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className={`w-full bg-[#060B13] border rounded-xl pl-9 pr-4 py-3 text-base sm:text-lg font-mono font-black text-white outline-none transition-all ${
                      isWithdrawExceeded || isWithdrawBelowMin
                        ? 'border-rose-500 ring-1 ring-rose-500/40 text-rose-300'
                        : 'border-[#1E2E44] focus:border-amber-500'
                    }`}
                  />
                </div>

                {isWithdrawBelowMin && (
                  <p className="text-xs text-rose-400 font-semibold flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Minimum withdrawal amount is ₹500.
                  </p>
                )}

                {isWithdrawExceeded && (
                  <p className="text-xs text-rose-400 font-semibold flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Amount exceeds available withdrawable balance of ₹{wallet.availableBalance.toLocaleString('en-IN')}.
                  </p>
                )}
              </div>

              {/* Linked Bank Account Card */}
              <div className="p-4 bg-[#060B13] border border-[#162234] rounded-2xl space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-emerald-400" /> Primary Beneficiary Account
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Verified KYC
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-400 pt-1.5 border-t border-[#121D2C]">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Bank Name</span>
                    <span className="text-xs font-bold text-slate-200">HDFC Bank Ltd</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Account Number</span>
                    <span className="text-xs font-mono font-bold text-slate-200">XXXXXXXX8912</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">IFSC Code</span>
                    <span className="text-xs font-mono text-slate-200">HDFC0001234</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Transfer Speed</span>
                    <span className="text-xs font-bold text-emerald-400">IMPS 24x7 (Instant)</span>
                  </div>
                </div>
              </div>

              {/* Withdraw Submit Button */}
              <button
                type="button"
                id="wallet-withdraw-submit-btn"
                disabled={processing}
                onClick={handleWithdraw}
                className="w-full py-4 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black rounded-2xl text-sm sm:text-base transition-all cursor-pointer shadow-xl shadow-amber-950/50 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99]"
              >
                {processing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Submitting Payout Request...</span>
                  </>
                ) : (
                  <>
                    <ArrowUpRight className="w-5 h-5 stroke-[3]" />
                    <span>
                      Request Payout of ₹
                      {numWithdrawAmt > 0
                        ? numWithdrawAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })
                        : '0.00'}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 3: TRANSACTION HISTORY */}
          {activeTab === 'HISTORY' && (
            <div className="space-y-3 animate-fadeIn">
              {/* History Filter Pills */}
              <div className="flex items-center gap-1.5 p-1 bg-[#060B13] rounded-xl border border-[#162234] w-fit">
                {(['ALL', 'DEPOSIT', 'WITHDRAWAL', 'MARGIN_CREDIT'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setHistoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      historyFilter === cat
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat === 'ALL'
                      ? 'All'
                      : cat === 'DEPOSIT'
                      ? 'Deposits'
                      : cat === 'WITHDRAWAL'
                      ? 'Payouts'
                      : 'Trades & Margin'}
                  </button>
                ))}
              </div>

              {/* Ledger List */}
              <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                {filteredHistory.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-3 sm:p-3.5 bg-[#060B13] border border-[#162234] hover:border-[#23354E] rounded-xl flex items-center justify-between text-xs transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          tx.type === 'DEPOSIT' || tx.type === 'MARGIN_CREDIT'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {tx.type === 'DEPOSIT' || tx.type === 'MARGIN_CREDIT' ? (
                          <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-white text-xs sm:text-sm">{tx.method}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {tx.refId} • {tx.time}
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div
                        className={`font-mono font-black text-sm sm:text-base ${
                          tx.type === 'DEPOSIT' || tx.type === 'MARGIN_CREDIT'
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {tx.type === 'DEPOSIT' || tx.type === 'MARGIN_CREDIT' ? '+' : '-'}₹
                        {tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold border mt-0.5 inline-block ${
                          tx.status === 'SUCCESS'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : tx.status === 'REJECTED' || tx.status === 'FAILED'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </div>
                  </div>
                ))}

                {filteredHistory.length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    No transactions found for this filter.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Lightbox / Proof Image Preview Modal */}
        {previewImage && (
          <div
            className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4 animate-fadeIn"
            onClick={() => setPreviewImage(null)}
          >
            <div
              className="relative max-w-xl max-h-[85vh] bg-[#0B111C] border border-[#1E2E44] rounded-2xl p-2 overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/90 z-10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <img
                src={previewImage}
                alt="Payment Receipt Preview"
                className="w-full h-auto max-h-[75vh] object-contain rounded-xl"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
