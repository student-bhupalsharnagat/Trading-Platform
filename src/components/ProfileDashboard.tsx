import React, { useState } from 'react';
import { User, WalletFunds, SupportTicket, AppNotification } from '../types.ts';
import { useAuth } from '../hooks/useAuth.ts';
import { authApi } from '../services/authApi.ts';
import { SupportTicketsSection } from './SupportTicketsSection.tsx';
import { WalletModal } from './WalletModal.tsx';
import {
  User as UserIcon,
  Wallet,
  Bell,
  Headphones,
  Settings,
  FileText,
  LogOut,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  CreditCard,
  Building2,
  Lock,
  Smartphone,
  Send,
  RefreshCw,
  Plus,
} from 'lucide-react';

interface ProfileDashboardProps {
  user: User;
  wallet: WalletFunds;
  onRefreshPortfolio?: () => void;
}

export const ProfileDashboard: React.FC<ProfileDashboardProps> = ({
  user,
  wallet,
  onRefreshPortfolio,
}) => {
  const { logout, showToast } = useAuth();

  // Active modal state
  const [activeModal, setActiveModal] = useState<
    'NONE' | 'PROFILE' | 'WALLET' | 'NOTIFICATIONS' | 'TICKETS' | 'SETTINGS' | 'TERMS'
  >('NONE');

  // Tickets state
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [newTicketSubject, setNewTicketSubject] = useState('');
  const [newTicketCategory, setNewTicketCategory] = useState<'Trading' | 'Billing' | 'KYC' | 'Technical'>('Trading');
  const [newTicketMessage, setNewTicketMessage] = useState('');
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);

  // Notifications state
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  // Settings state
  const [orderConfirmation, setOrderConfirmation] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [twoFactorAuth, setTwoFactorAuth] = useState(true);
  const [hapticFeedback, setHapticFeedback] = useState(true);

  const openTicketsModal = async () => {
    setActiveModal('TICKETS');
    setLoadingTickets(true);
    try {
      const res = await authApi.getTickets();
      if (res.tickets) setTickets(res.tickets);
    } catch {
      // fallback
    } finally {
      setLoadingTickets(false);
    }
  };

  const openNotifsModal = async () => {
    setActiveModal('NOTIFICATIONS');
    setLoadingNotifs(true);
    try {
      const res = await authApi.getNotifications();
      if (res.notifications) setNotifications(res.notifications);
    } catch {
      // fallback
    } finally {
      setLoadingNotifs(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicketSubject || !newTicketMessage) return;

    try {
      const res = await authApi.createTicket({
        subject: newTicketSubject,
        category: newTicketCategory,
        message: newTicketMessage,
      });
      if (res.ticket) {
        setTickets([res.ticket, ...tickets]);
        setShowNewTicketForm(false);
        setNewTicketSubject('');
        setNewTicketMessage('');
        showToast({ type: 'success', title: 'Ticket Created', description: 'Support agent will reply shortly.' });
      }
    } catch (err: any) {
      showToast({ type: 'error', title: 'Failed to create ticket', description: err.message });
    }
  };

  const handleMarkAllNotifsRead = async () => {
    try {
      await authApi.markNotificationsRead();
      setNotifications(notifications.map((n) => ({ ...n, read: true })));
      showToast({ type: 'info', title: 'Notifications', description: 'All alerts marked as read.' });
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-4 sm:py-6 space-y-4 animate-fadeIn">
      {/* Profile Header Card matching Screenshot 3 */}
      <div className="bg-[#0B111C] border border-[#1A2638] rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex items-center gap-3.5">
          {/* Avatar Icon */}
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-slate-950 font-black text-base shadow-md shadow-amber-500/20">
            VX
          </div>

          {/* Name & ID */}
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-extrabold text-white truncate">
              {user.fullName || 'Demo User'}
            </h2>
            <div className="text-xs text-slate-400 font-mono truncate">
              {user.userId} · {user.email || 'demo@vertex.io'}
            </div>
          </div>

          {/* Badges matching Screenshot 3 */}
          <div className="flex flex-col sm:flex-row items-end gap-1.5">
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> KYC Verified
            </span>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold">
              MCX · NSE
            </span>
          </div>
        </div>

        {/* 3-Column Stats Card matching Screenshot 3 */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-[#141E2E] text-center">
          {/* Portfolio */}
          <div className="p-2 bg-[#060B13] border border-[#141E2E] rounded-xl">
            <span className="text-[10px] font-bold text-slate-400 tracking-wider block">Portfolio</span>
            <span className="text-xs sm:text-sm font-mono font-bold text-white mt-0.5 block">
              ₹{wallet.availableBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
          </div>

          {/* Open PnL */}
          <div className="p-2 bg-[#060B13] border border-[#141E2E] rounded-xl">
            <span className="text-[10px] font-bold text-slate-400 tracking-wider block">Open PnL</span>
            <span className="text-xs sm:text-sm font-mono font-bold text-emerald-400 mt-0.5 block">
              +₹{wallet.todayPnL ? wallet.todayPnL.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '504.52'}
            </span>
          </div>

          {/* Margin Used */}
          <div className="p-2 bg-[#060B13] border border-[#141E2E] rounded-xl">
            <span className="text-[10px] font-bold text-slate-400 tracking-wider block">Margin Used</span>
            <span className="text-xs sm:text-sm font-mono font-bold text-slate-200 mt-0.5 block">
              ₹{wallet.usedMargin ? wallet.usedMargin.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '38,210'}
            </span>
          </div>
        </div>
      </div>

      {/* Menu List Options matching Screenshot 3 */}
      <div className="bg-[#0B111C] border border-[#1A2638] rounded-2xl divide-y divide-[#141E2E] overflow-hidden shadow-xl">
        {/* 1. Profile */}
        <button
          type="button"
          onClick={() => setActiveModal('PROFILE')}
          className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-[#101928] transition-colors text-left cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#142032] border border-[#1E2E44] flex items-center justify-center text-amber-400 group-hover:text-white transition-colors">
              <UserIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Profile</div>
              <div className="text-xs text-slate-400 font-mono">
                {user.userId} · {user.fullName || 'Demo User'}
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
        </button>

        {/* 2. Wallet & Funds */}
        <button
          type="button"
          onClick={() => setActiveModal('WALLET')}
          className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-[#101928] transition-colors text-left cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#142032] border border-[#1E2E44] flex items-center justify-center text-emerald-400 group-hover:text-white transition-colors">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Wallet & Funds</div>
              <div className="text-xs text-slate-400 font-mono">
                ₹{wallet.availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })} available margin
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
        </button>

        {/* 3. Notifications */}
        <button
          type="button"
          onClick={openNotifsModal}
          className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-[#101928] transition-colors text-left cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#142032] border border-[#1E2E44] flex items-center justify-center text-sky-400 group-hover:text-white transition-colors">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Notifications</div>
              <div className="text-xs text-slate-400">3 unread alerts</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
        </button>

        {/* 4. Support Tickets */}
        <button
          type="button"
          onClick={openTicketsModal}
          className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-[#101928] transition-colors text-left cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#142032] border border-[#1E2E44] flex items-center justify-center text-purple-400 group-hover:text-white transition-colors">
              <Headphones className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Support Tickets</div>
              <div className="text-xs text-slate-400">2 open tickets</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
        </button>

        {/* 5. Settings */}
        <button
          type="button"
          onClick={() => setActiveModal('SETTINGS')}
          className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-[#101928] transition-colors text-left cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#142032] border border-[#1E2E44] flex items-center justify-center text-indigo-400 group-hover:text-white transition-colors">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Settings</div>
              <div className="text-xs text-slate-400">Security, preferences</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
        </button>

        {/* 6. Terms & Privacy */}
        <button
          type="button"
          onClick={() => setActiveModal('TERMS')}
          className="w-full p-3.5 sm:p-4 flex items-center justify-between hover:bg-[#101928] transition-colors text-left cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#142032] border border-[#1E2E44] flex items-center justify-center text-amber-400 group-hover:text-white transition-colors">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Terms & Privacy</div>
              <div className="text-xs text-slate-400">Legal documents</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
        </button>
      </div>

      {/* Sign Out Button matching Screenshot 3 */}
      <button
        type="button"
        id="profile-sign-out-btn"
        onClick={logout}
        className="w-full p-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:text-rose-300 font-extrabold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-rose-950/20"
      >
        <LogOut className="w-4 h-4" />
        <span>Sign Out</span>
      </button>

      {/* Interactive Sub-Modals */}

      {/* 1. Profile Modal */}
      {activeModal === 'PROFILE' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0B111C] border border-[#1E2E44] rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-[#141E2E] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-amber-400" /> Account Profile
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                className="p-1 rounded-lg bg-[#142032] text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-[#060B13] border border-[#141E2E] rounded-xl space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Full Name</span>
                  <span className="font-bold text-white">{user.fullName || 'Demo User'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Client ID</span>
                  <span className="font-mono font-bold text-amber-400">{user.userId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Mobile</span>
                  <span className="font-mono text-slate-200">+{user.countryCode || '91'} {user.mobile || '9876543210'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">PAN Number</span>
                  <span className="font-mono text-slate-200">ABCDE1234F</span>
                </div>
              </div>

              <div className="p-3 bg-[#060B13] border border-[#141E2E] rounded-xl space-y-2">
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-emerald-400" /> Linked Bank Account
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Bank</span>
                  <span className="font-semibold text-white">HDFC Bank Ltd</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Account No.</span>
                  <span className="font-mono text-white">XXXXXXXX8912</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>IFSC Code</span>
                  <span className="font-mono text-white">HDFC0001234</span>
                </div>
              </div>

              <div className="p-3 bg-[#060B13] border border-[#141E2E] rounded-xl space-y-1.5">
                <span className="font-bold text-slate-300 block">Active Exchange Segments</span>
                <div className="flex gap-1.5 flex-wrap">
                  {['NSE Equity', 'NSE Futures', 'MCX Commodity', 'BSE Currency', 'Crypto Spot'].map((seg) => (
                    <span key={seg} className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                      ✓ {seg}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Wallet & Funds Modal */}
      <WalletModal
        isOpen={activeModal === 'WALLET'}
        wallet={wallet}
        onClose={() => setActiveModal('NONE')}
        onRefresh={onRefreshPortfolio}
      />

      {/* 3. Notifications Modal */}
      {activeModal === 'NOTIFICATIONS' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0B111C] border border-[#1E2E44] rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-[#141E2E] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-sky-400" /> Alerts & Notifications
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleMarkAllNotifsRead}
                  className="text-[11px] font-bold text-sky-400 hover:underline cursor-pointer"
                >
                  Mark read
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal('NONE')}
                  className="p-1 rounded-lg bg-[#142032] text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">No notifications yet.</div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3 rounded-xl border text-xs space-y-1 transition-colors ${
                      n.read
                        ? 'bg-[#060B13] border-[#141E2E] text-slate-400'
                        : 'bg-[#101928] border-sky-500/30 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        {!n.read && <span className="w-2 h-2 rounded-full bg-sky-400" />}
                        {n.title}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">{n.time}</span>
                    </div>
                    <p className="text-slate-300">{n.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Support Tickets Section matching all 5 screenshots */}
      {activeModal === 'TICKETS' && (
        <div className="fixed inset-0 z-50 bg-[#060B13] overflow-y-auto custom-scrollbar animate-fadeIn">
          <SupportTicketsSection onBack={() => setActiveModal('NONE')} />
        </div>
      )}

      {/* 5. Settings Modal */}
      {activeModal === 'SETTINGS' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0B111C] border border-[#1E2E44] rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-[#141E2E] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-indigo-400" /> Platform Preferences
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                className="p-1 rounded-lg bg-[#142032] text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 bg-[#060B13] border border-[#141E2E] rounded-xl">
                <div>
                  <div className="font-bold text-white">Order Confirmation Prompt</div>
                  <div className="text-[11px] text-slate-400">Ask before executing orders</div>
                </div>
                <button
                  type="button"
                  onClick={() => setOrderConfirmation(!orderConfirmation)}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                    orderConfirmation ? 'bg-indigo-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform absolute top-0.75 ${orderConfirmation ? 'left-5.5' : 'left-1'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-[#060B13] border border-[#141E2E] rounded-xl">
                <div>
                  <div className="font-bold text-white">Sound & Audio Alerts</div>
                  <div className="text-[11px] text-slate-400">Play chime on order filled</div>
                </div>
                <button
                  type="button"
                  onClick={() => setSoundEffects(!soundEffects)}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                    soundEffects ? 'bg-indigo-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform absolute top-0.75 ${soundEffects ? 'left-5.5' : 'left-1'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-[#060B13] border border-[#141E2E] rounded-xl">
                <div>
                  <div className="font-bold text-white">Two-Factor Authentication</div>
                  <div className="text-[11px] text-slate-400">Require OTP for large orders</div>
                </div>
                <button
                  type="button"
                  onClick={() => setTwoFactorAuth(!twoFactorAuth)}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                    twoFactorAuth ? 'bg-indigo-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform absolute top-0.75 ${twoFactorAuth ? 'left-5.5' : 'left-1'}`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Terms & Privacy Modal */}
      {activeModal === 'TERMS' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0B111C] border border-[#1E2E44] rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-[#141E2E] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" /> Terms of Service & Risk Disclosure
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal('NONE')}
                className="p-1 rounded-lg bg-[#142032] text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 max-h-72 overflow-y-auto custom-scrollbar pr-1">
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300">
                <strong>Mandatory Risk Disclosure:</strong> 9 out of 10 individual traders in equity Futures and Options Segment incurred net losses. On average, loss makers registered net trading loss close to ₹50,000.
              </div>
              <p>
                VERTEX provides simulated execution and financial market routing services. All orders placed are subject to margin availability and market volatility.
              </p>
              <p>
                Ensure adequate stop loss protections are placed on high leverage intraday positions.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
