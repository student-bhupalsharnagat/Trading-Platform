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
} from 'lucide-react';

interface WalletModalProps {
  isOpen: boolean;
  wallet: WalletFunds;
  onClose: () => void;
  onRefresh?: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  wallet,
  onClose,
  onRefresh,
}) => {
  const { user, showToast } = useAuth();

  const [activeTab, setActiveTab] = useState<'DEPOSIT' | 'WITHDRAW' | 'HISTORY'>('DEPOSIT');
  const [depositAmount, setDepositAmount] = useState<string>('50000');
  const [depositMethod, setDepositMethod] = useState<'UPI' | 'NETBANKING' | 'IMPS'>('UPI');
  const [showUpiQr, setShowUpiQr] = useState<boolean>(false);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [selectedBank, setSelectedBank] = useState<'HDFC' | 'ICICI' | 'SBI' | 'AXIS' | 'KOTAK'>('HDFC');
  const [upiId, setUpiId] = useState<string>('');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'DEPOSIT' | 'WITHDRAWAL' | 'MARGIN_CREDIT'>('ALL');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Local simulated ledger history
  const [history, setHistory] = useState<
    Array<{
      id: string;
      type: 'DEPOSIT' | 'WITHDRAWAL' | 'MARGIN_CREDIT' | 'MARGIN_BLOCKED';
      amount: number;
      method: string;
      status: 'SUCCESS' | 'PROCESSING';
      time: string;
      refId: string;
    }>
  >([
    {
      id: 'TX-901',
      type: 'DEPOSIT',
      amount: 50000,
      method: 'UPI Instant (GPay)',
      status: 'SUCCESS',
      time: 'Today, 10:45 AM',
      refId: 'UPI/2026/892183',
    },
    {
      id: 'TX-902',
      type: 'MARGIN_CREDIT',
      amount: 14200,
      method: 'Position Exit Realized P&L',
      status: 'SUCCESS',
      time: 'Today, 02:15 PM',
      refId: 'TRD/2026/091244',
    },
    {
      id: 'TX-903',
      type: 'DEPOSIT',
      amount: 100000,
      method: 'Net Banking (HDFC)',
      status: 'SUCCESS',
      time: 'Yesterday, 09:12 AM',
      refId: 'NB/2026/410291',
    },
    {
      id: 'TX-904',
      type: 'WITHDRAWAL',
      amount: 25000,
      method: 'IMPS to HDFC Bank (8912)',
      status: 'SUCCESS',
      time: '28 Aug, 04:30 PM',
      refId: 'WDR/2026/184910',
    },
  ]);

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

    setProcessing(true);
    try {
      const methodLabel =
        depositMethod === 'UPI'
          ? `UPI (${upiId || 'Instant'})`
          : depositMethod === 'NETBANKING'
          ? `Net Banking (${selectedBank})`
          : 'IMPS Virtual Account';

      await authApi.depositFunds(amount, methodLabel);

      // Add to local history
      setHistory((prev) => [
        {
          id: `TX-${Date.now().toString().slice(-4)}`,
          type: 'DEPOSIT',
          amount,
          method: methodLabel,
          status: 'SUCCESS',
          time: 'Just now',
          refId: `DEP/${new Date().getFullYear()}/${Math.floor(100000 + Math.random() * 900000)}`,
        },
        ...prev,
      ]);

      showToast({
        type: 'success',
        title: 'Funds Credited Successfully',
        description: `₹${amount.toLocaleString('en-IN')} has been added to your trading margin balance.`,
        duration: 4000,
      });

      if (onRefresh) onRefresh();
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
        title: 'Invalid Amount',
        description: 'Minimum withdrawal amount is ₹500.',
      });
      return;
    }

    if (amount > wallet.availableBalance) {
      showToast({
        type: 'error',
        title: 'Insufficient Margin',
        description: `Available to withdraw: ₹${wallet.availableBalance.toLocaleString('en-IN')}`,
      });
      return;
    }

    setProcessing(true);
    try {
      await authApi.withdrawFunds(amount, 'HDFC Bank Ltd', '50100492818912');

      // Add to local history
      setHistory((prev) => [
        {
          id: `TX-${Date.now().toString().slice(-4)}`,
          type: 'WITHDRAWAL',
          amount,
          method: 'IMPS to HDFC Bank (8912)',
          status: 'SUCCESS',
          time: 'Just now',
          refId: `WDR/${new Date().getFullYear()}/${Math.floor(100000 + Math.random() * 900000)}`,
        },
        ...prev,
      ]);

      showToast({
        type: 'success',
        title: 'Payout Request Submitted',
        description: `₹${amount.toLocaleString('en-IN')} will be credited to HDFC Bank A/C ending in 8912.`,
        duration: 4000,
      });

      setWithdrawAmount('');
      if (onRefresh) onRefresh();
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

  const filteredHistory = history.filter((item) => {
    if (historyFilter === 'ALL') return true;
    if (historyFilter === 'DEPOSIT') return item.type === 'DEPOSIT';
    if (historyFilter === 'WITHDRAWAL') return item.type === 'WITHDRAWAL';
    if (historyFilter === 'MARGIN_CREDIT') return item.type === 'MARGIN_CREDIT';
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
              className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#061F18]/90 via-[#0A1620]/80 to-[#0B111C] border border-emerald-500/30 shadow-lg relative overflow-hidden min-w-0 flex flex-col justify-between"
              title={`+₹${(wallet.totalPnL || 34386.86).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-300 uppercase tracking-wider truncate">
                  Unrealized P&L
                </span>
                <TrendingUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
              </div>
              <div className="my-1 sm:my-1.5">
                <p className="text-sm sm:text-base lg:text-lg font-mono font-black text-emerald-400 tracking-tight truncate flex items-center gap-0.5">
                  <span>+₹</span>
                  <span>{(wallet.totalPnL || 34386.86).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </p>
              </div>
              <span className="text-[9px] sm:text-[10px] text-emerald-300/80 font-medium truncate block">
                Open Positions
              </span>
            </div>

            {/* Card 4: Today's Realized P&L */}
            <div
              className="p-3 sm:p-3.5 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#0B1A2C]/90 via-[#0A1220]/80 to-[#0B111C] border border-blue-500/30 shadow-lg relative overflow-hidden min-w-0 flex flex-col justify-between"
              title={`+₹${(wallet.todayPnL || 504.52).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-300 uppercase tracking-wider truncate">
                  Today's P&L
                </span>
                <Clock className="w-3 h-3 text-blue-400 flex-shrink-0" />
              </div>
              <div className="my-1 sm:my-1.5">
                <p className="text-sm sm:text-base lg:text-lg font-mono font-black text-emerald-400 tracking-tight truncate flex items-center gap-0.5">
                  <span>+₹</span>
                  <span>{(wallet.todayPnL || 504.52).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5">
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
                </div>
              </div>

              {/* UPI Mode Details */}
              {depositMethod === 'UPI' && (
                <div className="p-3.5 sm:p-4 bg-[#060B13] border border-[#162234] rounded-2xl space-y-3">
                  <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                    <span className="text-slate-400 font-medium">Supported UPI Apps:</span>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold">
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
                    <div className="p-4 bg-[#0A121E] border border-amber-500/30 rounded-xl flex flex-col items-center justify-center space-y-2 animate-fadeIn">
                      <div className="w-36 h-36 bg-white p-2 rounded-xl flex items-center justify-center shadow-lg">
                        <div className="w-full h-full border-2 border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-900 text-center p-1">
                          <QrCode className="w-16 h-16 text-slate-900 mb-1" />
                          <span className="text-[9px] font-mono font-black">UPI QR ₹{numDepositAmt.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-300 text-center">
                        Scan with any UPI app on your phone to approve transfer of <strong>₹{numDepositAmt.toLocaleString('en-IN')}</strong>
                      </p>
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
                            : 'border-[#1E2E44] bg-[#0B111C] text-slate-400 hover:text-white'
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

              {/* Deposit Submit Button */}
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
                      isWithdrawExceeded
                        ? 'border-rose-500 ring-1 ring-rose-500/40 text-rose-300'
                        : 'border-[#1E2E44] focus:border-amber-500'
                    }`}
                  />
                </div>

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
                disabled={processing || !numWithdrawAmt || isWithdrawExceeded || numWithdrawAmt < 500}
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
                      : 'P&L Credits'}
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
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 mt-0.5 inline-block">
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
      </div>
    </div>
  );
};
