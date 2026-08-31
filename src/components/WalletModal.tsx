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
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [selectedBank, setSelectedBank] = useState<'HDFC' | 'ICICI' | 'SBI'>('HDFC');
  const [upiId, setUpiId] = useState<string>('');
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

  const handleRefreshBalance = async () => {
    setIsRefreshing(true);
    if (onRefresh) await onRefresh();
    setTimeout(() => {
      setIsRefreshing(false);
      showToast({
        type: 'info',
        title: 'Wallet Synced',
        description: 'Latest margin and available funds updated from exchange.',
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
        title: 'Funds Added Successfully',
        description: `₹${amount.toLocaleString('en-IN')} has been credited to your trading margin balance.`,
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
        title: 'Payout Initiated',
        description: `₹${amount.toLocaleString('en-IN')} will be credited to your verified bank account shortly.`,
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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#0B111C] border border-[#1A2638] rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto relative text-slate-100 animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Modal Header */}
        <div className="flex items-center justify-between border-b border-[#141E2E] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                Wallet & Funds
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                Client ID: <strong className="text-slate-200">{user?.userId || 'VTX123'}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefreshBalance}
              disabled={isRefreshing}
              className="p-2 rounded-lg bg-[#142032] hover:bg-[#1C2C44] border border-[#1E2E44] text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh Balance"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
            </button>
            <button
              type="button"
              id="wallet-modal-close-btn"
              onClick={onClose}
              className="p-2 rounded-lg bg-[#142032] hover:bg-[#1C2C44] border border-[#1E2E44] text-slate-400 hover:text-white transition-colors cursor-pointer"
              aria-label="Close Wallet"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Margin & Balance Overview Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Available Margin */}
          <div className="p-3 bg-[#060B13] border border-[#1A2638] rounded-xl relative overflow-hidden">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Available Margin
            </span>
            <p className="text-base sm:text-lg font-mono font-black text-emerald-400 mt-1">
              ₹{wallet.availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[9px] text-emerald-500/80 font-medium block mt-0.5">
              Instant Trading Ready
            </span>
          </div>

          {/* Used Margin */}
          <div className="p-3 bg-[#060B13] border border-[#1A2638] rounded-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Used Margin
            </span>
            <p className="text-base sm:text-lg font-mono font-black text-amber-400 mt-1">
              ₹{wallet.usedMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[9px] text-slate-500 font-medium block mt-0.5">
              Active Trade Exposure
            </span>
          </div>

          {/* Unrealized P&L */}
          <div className="p-3 bg-[#060B13] border border-[#1A2638] rounded-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Unrealized P&L
            </span>
            <p className="text-base sm:text-lg font-mono font-black text-emerald-400 mt-1 flex items-center gap-0.5">
              <ArrowUpRight className="w-4 h-4" /> +₹
              {(wallet.totalPnL || 34386.86).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[9px] text-emerald-500/80 font-medium block mt-0.5">
              Open Positions
            </span>
          </div>

          {/* Today's Realized */}
          <div className="p-3 bg-[#060B13] border border-[#1A2638] rounded-xl">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Today's P&L
            </span>
            <p className="text-base sm:text-lg font-mono font-black text-emerald-400 mt-1 flex items-center gap-0.5">
              <ArrowUpRight className="w-4 h-4" /> +₹
              {(wallet.todayPnL || 504.52).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[9px] text-slate-500 font-medium block mt-0.5">
              Realized Today
            </span>
          </div>
        </div>

        {/* 3. Tab Switcher */}
        <div className="grid grid-cols-3 gap-1.5 bg-[#060B13] p-1 rounded-xl border border-[#141E2E]">
          <button
            type="button"
            id="wallet-tab-deposit-btn"
            onClick={() => setActiveTab('DEPOSIT')}
            className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'DEPOSIT'
                ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span>+ Add Funds</span>
          </button>

          <button
            type="button"
            id="wallet-tab-withdraw-btn"
            onClick={() => setActiveTab('WITHDRAW')}
            className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'WITHDRAW'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>- Withdraw</span>
          </button>

          <button
            type="button"
            id="wallet-tab-history-btn"
            onClick={() => setActiveTab('HISTORY')}
            className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'HISTORY'
                ? 'bg-[#1E2E44] text-white shadow-md font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>History</span>
          </button>
        </div>

        {/* 4. Tab Body */}

        {/* TAB 1: ADD FUNDS (DEPOSIT) */}
        {activeTab === 'DEPOSIT' && (
          <div className="space-y-3.5 animate-fadeIn">
            {/* Quick Preset Buttons */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5">
                Select or Enter Deposit Amount (₹)
              </label>
              <div className="grid grid-cols-5 gap-1.5 mb-2">
                {['5000', '10000', '25000', '50000', '100000'].map((amt) => {
                  const isSelected = depositAmount === amt;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setDepositAmount(amt)}
                      className={`py-1.5 px-1 rounded-lg border text-xs font-mono font-bold transition-colors cursor-pointer text-center ${
                        isSelected
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                          : 'bg-[#060B13] border-[#1E2E44] text-slate-400 hover:text-white'
                      }`}
                    >
                      +{Number(amt) >= 100000 ? '₹1L' : `₹${Number(amt) / 1000}k`}
                    </button>
                  );
                })}
              </div>

              {/* Amount Input */}
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-base font-bold text-slate-400 font-mono">
                  ₹
                </span>
                <input
                  type="number"
                  min="100"
                  step="500"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="Enter amount (min ₹100)"
                  className="w-full bg-[#060B13] border border-[#1E2E44] rounded-xl pl-8 pr-4 py-2.5 text-base font-mono font-black text-white outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5">
                Choose Payment Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                {/* UPI */}
                <button
                  type="button"
                  onClick={() => setDepositMethod('UPI')}
                  className={`p-2.5 rounded-xl border text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-1 ${
                    depositMethod === 'UPI'
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                      : 'border-[#1E2E44] bg-[#060B13] text-slate-400 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  <span className="text-xs font-bold">UPI Instant</span>
                  <span className="text-[9px] text-emerald-400 font-mono">Zero Fee</span>
                </button>

                {/* Net Banking */}
                <button
                  type="button"
                  onClick={() => setDepositMethod('NETBANKING')}
                  className={`p-2.5 rounded-xl border text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-1 ${
                    depositMethod === 'NETBANKING'
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                      : 'border-[#1E2E44] bg-[#060B13] text-slate-400 hover:text-white'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  <span className="text-xs font-bold">Net Banking</span>
                  <span className="text-[9px] text-slate-400">All Banks</span>
                </button>

                {/* IMPS / NEFT */}
                <button
                  type="button"
                  onClick={() => setDepositMethod('IMPS')}
                  className={`p-2.5 rounded-xl border text-center transition-colors cursor-pointer flex flex-col items-center justify-center gap-1 ${
                    depositMethod === 'IMPS'
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                      : 'border-[#1E2E44] bg-[#060B13] text-slate-400 hover:text-white'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span className="text-xs font-bold">IMPS / NEFT</span>
                  <span className="text-[9px] text-slate-400">Virtual A/C</span>
                </button>
              </div>
            </div>

            {/* UPI Details or Bank Selection */}
            {depositMethod === 'UPI' && (
              <div className="p-3 bg-[#060B13] border border-[#141E2E] rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Supported Apps:</span>
                  <span className="text-slate-300 font-bold">GPay • PhonePe • Paytm • BHIM</span>
                </div>
                <input
                  type="text"
                  placeholder="Enter UPI VPA (e.g. user@oksbi) or leave blank for QR"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  className="w-full bg-[#0B111C] border border-[#1E2E44] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>
            )}

            {depositMethod === 'NETBANKING' && (
              <div className="p-3 bg-[#060B13] border border-[#141E2E] rounded-xl space-y-2">
                <span className="text-xs text-slate-400 block font-bold">Select Bank:</span>
                <div className="grid grid-cols-3 gap-2">
                  {(['HDFC', 'ICICI', 'SBI'] as const).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setSelectedBank(b)}
                      className={`py-1.5 px-2 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                        selectedBank === b
                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                          : 'border-[#1E2E44] bg-[#0B111C] text-slate-400'
                      }`}
                    >
                      {b} Bank
                    </button>
                  ))}
                </div>
              </div>
            )}

            {depositMethod === 'IMPS' && (
              <div className="p-3 bg-[#060B13] border border-[#141E2E] rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Virtual Account</span>
                  <span className="font-mono font-bold text-white">VTX{user?.userId || '12345'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">IFSC Code</span>
                  <span className="font-mono font-bold text-white">HDFC0000123</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Beneficiary</span>
                  <span className="font-bold text-emerald-400">VERTEX Clearing Corp</span>
                </div>
              </div>
            )}

            {/* Deposit Submit Button */}
            <button
              type="button"
              id="wallet-deposit-submit-btn"
              disabled={processing}
              onClick={handleDeposit}
              className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-slate-950 font-black rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {processing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing Payment...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-current" />
                  <span>Pay & Credit ₹{Number(depositAmount || 0).toLocaleString('en-IN')} Instantly</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* TAB 2: WITHDRAW FUNDS */}
        {activeTab === 'WITHDRAW' && (
          <div className="space-y-3.5 animate-fadeIn">
            {/* Available to Withdraw Banner */}
            <div className="p-3 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-[11px] text-amber-300 font-bold block">Available to Withdraw</span>
                <span className="text-base font-mono font-black text-white">
                  ₹{wallet.availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setWithdrawAmount(wallet.availableBalance.toString())}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold cursor-pointer"
              >
                Withdraw MAX
              </button>
            </div>

            {/* Amount Input */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Enter Payout Amount (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-base font-bold text-slate-400 font-mono">
                  ₹
                </span>
                <input
                  type="number"
                  min="500"
                  step="500"
                  placeholder={`Min ₹500 - Max ₹${wallet.availableBalance.toFixed(0)}`}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full bg-[#060B13] border border-[#1E2E44] rounded-xl pl-8 pr-4 py-2.5 text-base font-mono font-black text-white outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>

            {/* Linked Bank Account Card */}
            <div className="p-3.5 bg-[#060B13] border border-[#141E2E] rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-emerald-400" /> Linked Primary Bank
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Verified
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-400 pt-1">
                <div>
                  <span className="text-[10px] text-slate-500 block">Bank Name</span>
                  <span className="text-xs font-bold text-slate-200">HDFC Bank Ltd</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Account Number</span>
                  <span className="text-xs font-mono font-bold text-slate-200">XXXXXXXX8912</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">IFSC Code</span>
                  <span className="text-xs font-mono text-slate-200">HDFC0001234</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Transfer Mode</span>
                  <span className="text-xs font-bold text-emerald-400">IMPS 24x7 (2-4 hrs)</span>
                </div>
              </div>
            </div>

            {/* Withdraw Submit Button */}
            <button
              type="button"
              id="wallet-withdraw-submit-btn"
              disabled={processing || !withdrawAmount}
              onClick={handleWithdraw}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-black rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-amber-950/40 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {processing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Submitting Payout Request...</span>
                </>
              ) : (
                <>
                  <ArrowUpRight className="w-4 h-4 stroke-[3]" />
                  <span>
                    Request Payout of ₹
                    {Number(withdrawAmount || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </>
              )}
            </button>
          </div>
        )}

        {/* TAB 3: TRANSACTION HISTORY */}
        {activeTab === 'HISTORY' && (
          <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar animate-fadeIn">
            {history.map((tx) => (
              <div
                key={tx.id}
                className="p-3 bg-[#060B13] border border-[#141E2E] rounded-xl flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      tx.type === 'DEPOSIT' || tx.type === 'MARGIN_CREDIT'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {tx.type === 'DEPOSIT' || tx.type === 'MARGIN_CREDIT' ? (
                      <ArrowDownLeft className="w-4 h-4" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <div className="font-bold text-white">{tx.method}</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {tx.refId} • {tx.time}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`font-mono font-bold text-sm ${
                      tx.type === 'DEPOSIT' || tx.type === 'MARGIN_CREDIT'
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {tx.type === 'DEPOSIT' || tx.type === 'MARGIN_CREDIT' ? '+' : '-'}₹
                    {tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {tx.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
