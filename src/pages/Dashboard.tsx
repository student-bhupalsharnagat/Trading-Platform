import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.ts';
import { authApi } from '../services/authApi.ts';
import { Instrument, PortfolioData } from '../types.ts';
import { DEFAULT_INSTRUMENTS } from '../data/defaultInstruments.ts';
import { OrderWindow } from '../components/OrderWindow.tsx';
import { LiveChart } from '../components/LiveChart.tsx';
import { ProfileDashboard } from '../components/ProfileDashboard.tsx';
import { MarketClosedModal } from '../components/MarketClosedModal.tsx';
import { WalletModal } from '../components/WalletModal.tsx';
import { LanguageSelector } from '../components/LanguageSelector.tsx';
import { QuickTour } from '../components/QuickTour.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { getMarketHoursInfo, MarketHoursInfo } from '../utils/marketHours.ts';
import {
  Wallet,
  Bell,
  Search,
  Star,
  TrendingUp,
  TrendingDown,
  LogOut,
  ChevronDown,
  ShieldCheck,
  CheckCircle,
  Activity,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  X,
  LayoutGrid,
  Menu,
  BookOpen,
  User as UserIcon,
  Clock,
} from 'lucide-react';

interface DashboardProps {
  onNavigate: (route: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { user, logout, showToast } = useAuth();
  const { t } = useLanguage();

  // Navigation & Sub-views
  const [activeNav, setActiveNav] = useState<'watchlist' | 'orders' | 'positions' | 'history' | 'profile'>('watchlist');
  const [activeTab, setActiveTab] = useState<'ALL' | 'CRYPTO' | 'EQUITY' | 'FOREX' | 'COMMODITY' | 'INDEX'>('ALL');
  const [positionFilter, setPositionFilter] = useState<'ALL' | 'INTRADAY' | 'HOLDING'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Active Instrument for Live Chart or Order Window
  const [selectedChartInstrument, setSelectedChartInstrument] = useState<Instrument | null>(null);
  const [orderWindowInstrument, setOrderWindowInstrument] = useState<Instrument | null>(null);
  const [orderWindowInitialType, setOrderWindowInitialType] = useState<'BUY' | 'SELL'>('BUY');

  // Market Closed modal and override state
  const [marketClosedOverride, setMarketClosedOverride] = useState<boolean | null>(null);
  const [showMarketClosedModal, setShowMarketClosedModal] = useState(false);
  const [marketHoursInfo, setMarketHoursInfo] = useState<MarketHoursInfo | undefined>(undefined);

  // Market & Portfolio Data
  const [instruments, setInstruments] = useState<Instrument[]>(DEFAULT_INSTRUMENTS);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({
    gold_fut: true,
    silver_fut: true,
    btc_usdt: true,
  });
  const [isWalletDrawerOpen, setIsWalletDrawerOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);

  // Quick Tour states
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  // Trigger quick tour upon sign in / demo login or first-time visit
  useEffect(() => {
    const shouldShowFromLogin = sessionStorage.getItem('goldfut_show_tour') === 'true';
    const hasCompletedBefore = localStorage.getItem('goldfut_tour_completed') === 'true';
    if (shouldShowFromLogin || !hasCompletedBefore) {
      setIsTourOpen(true);
      sessionStorage.removeItem('goldfut_show_tour');
    }
  }, []);

  const handleOpenInstrumentForTour = () => {
    const inst = filteredInstruments[0] || instruments[0];
    if (inst) {
      setOrderWindowInstrument(inst);
      setOrderWindowInitialType('BUY');
    }
  };

  const handleCloseInstrumentForTour = () => {
    setOrderWindowInstrument(null);
  };

  // Fetch live market data and user portfolio
  const fetchData = async () => {
    try {
      const [instRes, portRes] = await Promise.all([
        authApi.getInstruments(),
        authApi.getPortfolio(),
      ]);
      if (instRes.instruments) {
        setInstruments(instRes.instruments);
        // Keep selected instruments updated with live ticks
        if (selectedChartInstrument) {
          const updatedChart = instRes.instruments.find((i) => i.id === selectedChartInstrument.id);
          if (updatedChart) setSelectedChartInstrument(updatedChart);
        }
        if (orderWindowInstrument) {
          const updatedOrder = instRes.instruments.find((i) => i.id === orderWindowInstrument.id);
          if (updatedOrder) setOrderWindowInstrument(updatedOrder);
        }
      }
      if (portRes) setPortfolio(portRes);
    } catch (err) {
      console.error('Failed to load market data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [selectedChartInstrument?.id, orderWindowInstrument?.id]);

  const handleLogout = async () => {
    await logout();
    onNavigate('/login');
  };

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpenOrder = (inst: Instrument, type: 'BUY' | 'SELL' = 'BUY') => {
    setOrderWindowInstrument(inst);
    setOrderWindowInitialType(type);
  };

  const handleOpenChart = (inst: Instrument) => {
    setSelectedChartInstrument(inst);
  };

  const handleSquareOffPosition = async (positionId: string, symbol: string) => {
    setClosingPositionId(positionId);
    try {
      const res = await authApi.closePosition(positionId);
      showToast({
        type: 'success',
        title: 'Position Squared Off',
        description: `Successfully closed ${symbol} position.`,
      });
      fetchData();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Failed to close position',
        description: err.message || 'Error occurred.',
      });
    } finally {
      setClosingPositionId(null);
    }
  };

  // Filter instruments based on search and category tab
  const filteredInstruments = instruments.filter((inst) => {
    const matchesCategory = activeTab === 'ALL' || inst.category === activeTab;
    const matchesSearch =
      inst.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inst.name && inst.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      inst.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const isDemo = user?.status === 'demo' || user?.userId === 'vtx123';

  // If Live Chart is active, render full live chart view matching Screenshot 2
  if (selectedChartInstrument) {
    return (
      <div className="min-h-screen bg-[#060B13]">
        <LiveChart
          instrument={selectedChartInstrument}
          marketClosedOverride={marketClosedOverride}
          onBack={() => setSelectedChartInstrument(null)}
          onOpenOrderWindow={(inst, type) => handleOpenOrder(inst, type)}
          onOpenWallet={() => setIsWalletModalOpen(true)}
          walletBalance={portfolio?.wallet?.availableBalance || 142840}
        />

        {/* Modal Order Window overlay if triggered from chart */}
        {orderWindowInstrument && (
          <OrderWindow
            instrument={orderWindowInstrument}
            initialType={orderWindowInitialType}
            marketClosedOverride={marketClosedOverride}
            onClose={() => setOrderWindowInstrument(null)}
            onOpenLiveChart={(inst) => {
              setOrderWindowInstrument(null);
              setSelectedChartInstrument(inst);
            }}
            onOrderPlaced={() => {
              setOrderWindowInstrument(null);
              setSelectedChartInstrument(null);
              setActiveNav('positions');
              fetchData();
            }}
          />
        )}

        {/* Global Wallet Modal accessible from Live Chart */}
        <WalletModal
          isOpen={isWalletModalOpen}
          wallet={
            portfolio?.wallet || {
              availableBalance: 142840,
              usedMargin: 38210,
              totalPnL: 34386.86,
              todayPnL: 504.52,
              deposited: 200000,
              withdrawn: 50000,
            }
          }
          onClose={() => setIsWalletModalOpen(false)}
          onRefresh={fetchData}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060B13] text-slate-100 flex flex-col font-sans selection:bg-orange-500/30">
      {/* Top Header Bar matching Screenshot 1 & 2 */}
      <header className="sticky top-0 z-30 bg-[#0B111C]/95 border-b border-[#1A2638] px-3 sm:px-4 py-2.5 backdrop-blur-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* Brand Logo & Name matching Screenshot 1 & 2: "GF" + "GoldFut" */}
          <div
            onClick={() => setActiveNav('watchlist')}
            className="flex items-center gap-2.5 cursor-pointer select-none group"
            title="GoldFut Trading"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center font-black text-slate-950 text-sm shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
              GF
            </div>
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-black text-amber-400 tracking-tight leading-none group-hover:text-amber-300 transition-colors">
                GoldFut
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                Trading Platform
              </span>
            </div>
          </div>

          {/* Action Buttons: Language Selector + Notifications + User Avatar */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Language Selector Dropdown in top right side corner matching Screenshot 1 & 2 */}
            <LanguageSelector />

            {/* Wallet Funds Button */}
            <button
              type="button"
              id="header-wallet-btn"
              onClick={() => setIsWalletModalOpen(true)}
              className="hidden sm:flex px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:text-amber-300 font-semibold text-xs items-center gap-1.5 transition-colors cursor-pointer shadow-sm active:scale-95"
              title="Open Wallet & Funds"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>{t('wallet')}</span>
            </button>

            {/* Notification Bell */}
            <button
              type="button"
              id="header-notification-btn"
              onClick={() => setActiveNav('profile')}
              className="w-8 h-8 rounded-xl bg-[#0E1626] hover:bg-slate-800 border border-slate-700/60 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer relative active:scale-95"
              aria-label="Notifications"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full" />
            </button>

            {/* User Avatar Circle (e.g. RK) matching Screenshot 1 & 2 */}
            <button
              type="button"
              id="header-profile-avatar-btn"
              onClick={() => setActiveNav('profile')}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-xs font-black text-slate-950 shadow-md cursor-pointer hover:ring-2 hover:ring-amber-400/50 transition-all font-mono active:scale-95"
              title={`Profile: ${user?.fullName || 'User'}`}
            >
              {user?.fullName
                ? user.fullName
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
                : 'RK'}
            </button>
          </div>
        </div>
      </header>

      {/* Wallet Balance Drawer */}
      {isWalletDrawerOpen && (
        <div className="bg-[#0E1726] border-b border-[#1E293B] px-4 py-4 animate-fadeIn shadow-xl">
          <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-[#080E18] rounded-xl border border-[#1A2638]">
              <span className="text-[11px] text-slate-400">Available Funds</span>
              <p className="text-base font-mono font-bold text-amber-400 mt-0.5">
                ₹{portfolio?.wallet?.availableBalance?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '1,42,840.00'}
              </p>
            </div>
            <div className="p-3 bg-[#080E18] rounded-xl border border-[#1A2638]">
              <span className="text-[11px] text-slate-400">Used Margin</span>
              <p className="text-base font-mono font-bold text-slate-200 mt-0.5">
                ₹{portfolio?.wallet?.usedMargin?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '38,210.00'}
              </p>
            </div>
            <div className="p-3 bg-[#080E18] rounded-xl border border-[#1A2638]">
              <span className="text-[11px] text-slate-400">Total Unrealized P&L</span>
              <p className="text-base font-mono font-bold text-emerald-400 mt-0.5 flex items-center gap-1">
                <ArrowUpRight className="w-4 h-4" /> +₹
                {portfolio?.wallet?.totalPnL?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '34,386.86'}
              </p>
            </div>
            <div className="p-3 bg-[#080E18] rounded-xl border border-[#1A2638]">
              <span className="text-[11px] text-slate-400">Today's P&L</span>
              <p className="text-base font-mono font-bold text-emerald-400 mt-0.5 flex items-center gap-1">
                <ArrowUpRight className="w-4 h-4" /> +₹
                {portfolio?.wallet?.todayPnL?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '504.52'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-4 py-4 pb-24">
        {/* Verification & Live NSE/MCX Feed Banner */}
        <div className="mb-4 p-3 sm:p-4 rounded-xl bg-gradient-to-r from-[#0E1726] to-[#0A1220] border border-[#1E2E44] flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-semibold text-white">
                Trading Console • {user?.fullName || 'Demo User'}
              </h2>
              <p className="text-[11px] text-slate-400">
                User ID: <span className="text-amber-400 font-mono font-bold">{user?.userId}</span> • KYC:{' '}
                <span className="text-emerald-400 font-medium">Verified (MCX & NSE Active)</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Market Hours Status Badge with Quick Simulation Selector */}
            <button
              type="button"
              onClick={() => {
                // Cycle: null (Auto IST) -> true (Force Closed) -> false (Force Open)
                if (marketClosedOverride === null) {
                  setMarketClosedOverride(true);
                  const info = getMarketHoursInfo('COMMODITY', true);
                  setMarketHoursInfo(info);
                  setShowMarketClosedModal(true);
                } else if (marketClosedOverride === true) {
                  setMarketClosedOverride(false);
                  showToast({
                    type: 'success',
                    title: 'Market Set to OPEN',
                    description: 'Simulating official open trading hours.',
                  });
                } else {
                  setMarketClosedOverride(null);
                  showToast({
                    type: 'info',
                    title: 'Market Set to AUTO',
                    description: 'Real-time Indian Standard Time (IST) market hours active.',
                  });
                }
              }}
              className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                marketClosedOverride === true
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
              title="Click to toggle Market Status simulation (Auto / Closed / Open)"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>
                {marketClosedOverride === true
                  ? 'Market: CLOSED (Demo)'
                  : marketClosedOverride === false
                  ? 'Market: OPEN (Demo)'
                  : 'Market: LIVE (IST)'}
              </span>
            </button>
          </div>
        </div>

        {/* 1. WATCHLIST TAB matching Screenshot 1 */}
        {activeNav === 'watchlist' && (
          <div className="space-y-3.5">
            {/* 3-Metric Summary Bar matching Screenshot 1 */}
            <div className="grid grid-cols-3 gap-2 py-3 px-3.5 sm:px-4 rounded-2xl bg-[#0B111C] border border-[#1A2638] text-center shadow-md">
              {/* Available Margin */}
              <button
                type="button"
                onClick={() => setIsWalletModalOpen(true)}
                className="text-left cursor-pointer hover:opacity-90 transition-opacity"
                title="Click to view Wallet & Funds"
              >
                <div className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">
                  {t('availableMargin')}
                </div>
                <div className="text-sm sm:text-base lg:text-lg font-mono font-black text-white tracking-tight mt-0.5 truncate">
                  ₹{(portfolio?.wallet?.availableBalance ?? 242680).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </div>
              </button>

              {/* Today's P&L */}
              <div className="text-center">
                <div className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">
                  {t('todayPnl')}
                </div>
                <div className="text-sm sm:text-base lg:text-lg font-mono font-black text-emerald-400 tracking-tight mt-0.5 truncate">
                  +₹{(portfolio?.wallet?.todayPnL ?? 4820).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </div>
              </div>

              {/* Overall P&L */}
              <div className="text-right">
                <div className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">
                  {t('overallPnl')}
                </div>
                <div className="text-sm sm:text-base lg:text-lg font-mono font-black text-emerald-400 tracking-tight mt-0.5 truncate">
                  +₹{(portfolio?.wallet?.totalPnL ?? 21268).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>

            {/* Instrument Search Bar matching Screenshot 1 */}
            <div id="tour-target-search" className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#080E18] border border-[#1B273A] focus:border-amber-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 outline-none transition-all font-sans"
              />
            </div>

            {/* Category Filter Pills matching Screenshot 1: ALL, CRYPTO, EQUITY, FOREX, COMMODITY */}
            <div id="tour-target-categories" className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {(['ALL', 'CRYPTO', 'EQUITY', 'FOREX', 'COMMODITY'] as const).map((tab) => {
                const isSelected = activeTab === tab;
                const tabKey = tab.toLowerCase();
                const label = t(tabKey) || tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`px-3.5 sm:px-4 py-1.5 text-xs font-bold tracking-wider rounded-lg transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                        : 'bg-[#0B111C] border border-[#1E2E44] text-slate-400 hover:text-white hover:border-slate-600'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Watchlist Subheader matching Screenshot 1 */}
            <div className="flex items-center justify-between pt-1">
              <h2 className="text-xs sm:text-sm font-black text-slate-400 tracking-wider uppercase">
                {t('watchlist')}
              </h2>
              <span className="text-xs text-slate-500 font-mono">
                {filteredInstruments.length} {t('instruments')}
              </span>
            </div>

            {/* Instrument Cards List matching Screenshot 1 */}
            <div id="tour-target-watchlist" className="space-y-4">
              {filteredInstruments.map((inst, index) => {
                const isPositive = inst.change >= 0;
                const isFav = favorites[inst.id] || false;

                return (
                  <div key={inst.id} className="space-y-1.5">
                    {/* Category Header matching Screenshot 3: "COMMODITY", "INDEX", etc. */}
                    <div className="text-[11px] font-bold text-slate-500 tracking-wider uppercase px-1">
                      {inst.category}
                    </div>

                    {/* Instrument Card */}
                    <div
                      id={index === 0 ? 'tour-target-first-instrument' : undefined}
                      onClick={() => handleOpenOrder(inst, 'BUY')}
                      className="p-4 sm:p-5 bg-[#0A101C] hover:bg-[#0E1626] border border-[#162234] hover:border-[#223550] rounded-2xl transition-all duration-150 shadow-lg cursor-pointer select-none group"
                    >
                      <div className="flex items-center justify-between gap-4">
                        {/* Left: Star + Symbol + Expiry + Intraday/Holding */}
                        <div className="flex flex-col min-w-0">
                          {/* Row 1: Star icon + Symbol + Expiry badge */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => toggleFavorite(inst.id, e)}
                              className="text-amber-400 hover:scale-110 transition-transform cursor-pointer"
                            >
                              <Star
                                className={`w-4 h-4 ${
                                  isFav
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'fill-amber-400/80 text-amber-400'
                                }`}
                              />
                            </button>
                            <h3 className="font-black text-sm sm:text-base text-white tracking-wide group-hover:text-amber-400 transition-colors">
                              {inst.symbol}
                            </h3>
                            <span className="text-[11px] font-semibold text-slate-400 ml-1">
                              {inst.expiry}
                            </span>
                          </div>

                          {/* Row 2: Intraday and Holding values */}
                          <div className="flex items-center gap-3 text-xs mt-2 text-slate-400">
                            <span>
                              Intraday:{' '}
                              <span className="font-mono font-bold text-slate-300">
                                ₹{inst.intraday.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </span>
                            <span>
                              Holding:{' '}
                              <span className="font-mono font-bold text-slate-300">
                                ₹{inst.holding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </span>
                          </div>
                        </div>

                        {/* Center: Sparkline Bar indicator matching Screenshot 3 */}
                        <div className="hidden sm:flex items-center justify-center px-4 flex-1 max-w-[200px]">
                          <div
                            className={`w-full h-4 rounded-xs opacity-75 ${
                              isPositive
                                ? 'bg-gradient-to-t from-transparent to-emerald-500/30 border-b border-emerald-500/50'
                                : 'bg-gradient-to-t from-transparent to-rose-500/30 border-b border-rose-500/50'
                            }`}
                          />
                        </div>

                        {/* Right: Live Price & Absolute / Percentage Change matching Screenshot 3 */}
                        <div className="text-right flex flex-col items-end shrink-0">
                          {/* Row 1: Last Price */}
                          <div className="font-mono font-black text-base sm:text-lg text-white tracking-tight">
                            ₹{inst.lastPrice < 10
                              ? inst.lastPrice.toFixed(4)
                              : inst.lastPrice.toLocaleString('en-IN', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                          </div>
                          {/* Row 2: Direction Arrow & Combined Change: ↘ -1139.0000 (-0.72%) */}
                          <div
                            className={`font-mono text-xs sm:text-sm flex items-center gap-1 font-bold mt-0.5 ${
                              isPositive ? 'text-emerald-400' : 'text-rose-500'
                            }`}
                          >
                            <span>{isPositive ? '↗' : '↘'}</span>
                            <span>
                              {isPositive ? '+' : '-'}
                              {Math.abs(inst.change).toFixed(
                                inst.lastPrice < 10 ? 4 : 4
                              )}{' '}
                              ({isPositive ? '+' : ''}
                              {inst.changePercent.toFixed(2)}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredInstruments.length === 0 && (
                <div className="text-center py-12 text-slate-500 text-xs">
                  No instruments found matching your search.
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. ORDERS TAB */}
        {activeNav === 'orders' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Order Book</h2>
              <span className="text-xs text-slate-400 font-mono">
                {portfolio?.orders?.length || 0} Orders
              </span>
            </div>

            <div className="space-y-2.5">
              {portfolio?.orders?.map((ord) => (
                <div
                  key={ord.id}
                  className="p-4 bg-[#0B111C] border border-[#1A2638] rounded-xl flex items-center justify-between flex-wrap gap-2"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          ord.type === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        }`}
                      >
                        {ord.type}
                      </span>
                      <h3 className="font-extrabold text-sm text-white">{ord.symbol}</h3>
                      <span className="text-xs text-slate-400 font-mono">#{ord.id}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 font-mono">
                      Lots: <span className="text-white font-bold">{ord.lots || 1}</span> ({ord.qty} Qty) • Exec Price: ₹
                      {ord.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })} • Product: {ord.product || 'INTRADAY'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-xs font-bold font-mono">
                      {ord.status}
                    </span>
                    <div className="text-[10px] text-slate-500 font-mono mt-1">
                      {ord.time} · {ord.date}
                    </div>
                  </div>
                </div>
              ))}

              {(!portfolio?.orders || portfolio.orders.length === 0) && (
                <div className="text-center py-12 text-slate-500 text-xs">
                  No orders placed today yet.
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. POSITIONS TAB */}
        {activeNav === 'positions' && (() => {
          const positionsList = portfolio?.positions || [];
          const filteredPosList = positionsList.filter((pos) => {
            if (positionFilter === 'INTRADAY') return pos.product === 'INTRADAY';
            if (positionFilter === 'HOLDING') return pos.product === 'HOLDING';
            return true;
          });

          const totalUnrealizedPnL = positionsList.reduce((sum, pos) => sum + (pos.pnl || 0), 0);
          const totalInvestedMargin = positionsList.reduce((sum, pos) => sum + (pos.avgPrice * pos.qty), 0);
          const overallPnLPercent = totalInvestedMargin > 0
            ? Number(((totalUnrealizedPnL / totalInvestedMargin) * 100).toFixed(2))
            : 0;
          const isProfit = totalUnrealizedPnL >= 0;
          const todayPnL = portfolio?.wallet?.todayPnL || 504.52;
          const isTodayProfit = todayPnL >= 0;

          return (
            <div className="space-y-4 animate-fadeIn">
              {/* Positions Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                    <span>Positions</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-mono font-bold">
                      {positionsList.length} ACTIVE
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Real-time market mark-to-market (MTM) P&L tracking
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveNav('watchlist')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Trade More</span>
                  </button>
                </div>
              </div>

              {/* 🌟 BIG HIGHLIGHT HERO CARD FOR PROFIT & LOSS */}
              <div
                className={`rounded-2xl p-5 sm:p-6 border-2 transition-all shadow-2xl relative overflow-hidden ${
                  isProfit
                    ? 'bg-gradient-to-br from-[#062417]/95 via-[#081720]/95 to-[#080E18] border-emerald-500/50 shadow-emerald-950/40'
                    : 'bg-gradient-to-br from-[#270D14]/95 via-[#180C16]/95 to-[#080E18] border-rose-500/50 shadow-rose-950/40'
                }`}
              >
                {/* Background Glow Effect */}
                <div
                  className={`absolute -right-12 -top-12 w-48 h-48 rounded-full blur-3xl opacity-30 pointer-events-none ${
                    isProfit ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                />

                <div className="relative z-10">
                  {/* Top Badge & Subtitle */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs sm:text-sm font-bold tracking-wider uppercase text-slate-300 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-amber-400" />
                      <span>Total Unrealized P&L</span>
                    </span>

                    {/* High-visibility Profit/Loss Badge */}
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase flex items-center gap-1.5 shadow-md ${
                        isProfit
                          ? 'bg-emerald-500 text-[#061810] border border-emerald-300'
                          : 'bg-rose-500 text-white border border-rose-300'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      <span>{isProfit ? 'PROFIT' : 'LOSS'}</span>
                      <span>({isProfit ? '+' : ''}{overallPnLPercent}%)</span>
                    </div>
                  </div>

                  {/* 🚀 MASSIVE PROFIT / LOSS BIG TEXT HIGHLIGHT */}
                  <div className="my-3 sm:my-4 flex items-baseline flex-wrap gap-2 sm:gap-3">
                    <div
                      id="big-pnl-highlight"
                      className={`text-3xl sm:text-4xl lg:text-5xl font-black font-mono tracking-tight ${
                        isProfit
                          ? 'text-emerald-400 drop-shadow-[0_2px_14px_rgba(16,185,129,0.45)]'
                          : 'text-rose-400 drop-shadow-[0_2px_14px_rgba(244,63,94,0.45)]'
                      }`}
                    >
                      {isProfit ? '+' : ''}₹{totalUnrealizedPnL.toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>

                    <div className="text-xs sm:text-sm font-bold text-slate-300">
                      Unrealized Gain / Loss
                    </div>
                  </div>

                  {/* Secondary Metrics Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3.5 border-t border-white/10 text-xs">
                    <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                      <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wide">
                        Today Realized P&L
                      </span>
                      <span
                        className={`text-sm font-mono font-black mt-0.5 block ${
                          isTodayProfit ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isTodayProfit ? '+' : ''}₹{todayPnL.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                      <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wide">
                        Used Margin
                      </span>
                      <span className="text-sm font-mono font-bold text-white mt-0.5 block">
                        ₹{(portfolio?.wallet?.usedMargin || 38210).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                      <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wide">
                        Available Balance
                      </span>
                      <span className="text-sm font-mono font-bold text-amber-400 mt-0.5 block">
                        ₹{(portfolio?.wallet?.availableBalance || 142840).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                      <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wide">
                        Active Contracts
                      </span>
                      <span className="text-sm font-mono font-bold text-slate-200 mt-0.5 block">
                        {positionsList.length} Open Positions
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Filter Pills (All / Intraday MIS / Holding CNC) */}
              <div className="flex items-center gap-1.5 p-1 bg-[#0A101C] rounded-xl border border-[#1A2638] w-fit">
                <button
                  type="button"
                  onClick={() => setPositionFilter('ALL')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    positionFilter === 'ALL'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All ({positionsList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPositionFilter('INTRADAY')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    positionFilter === 'INTRADAY'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Intraday MIS ({positionsList.filter((p) => p.product === 'INTRADAY').length})
                </button>
                <button
                  type="button"
                  onClick={() => setPositionFilter('HOLDING')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    positionFilter === 'HOLDING'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Holding CNC ({positionsList.filter((p) => p.product === 'HOLDING').length})
                </button>
              </div>

              {/* 📊 INDIVIDUAL POSITIONS LIST WITH PROMINENT P&L HIGHLIGHT */}
              <div className="space-y-3">
                {filteredPosList.map((pos) => {
                  const isPosProfit = pos.pnl >= 0;
                  const inst = instruments.find((i) => i.symbol === pos.symbol);

                  return (
                    <div
                      key={pos.id}
                      className="p-4 sm:p-5 bg-[#0B111C] border border-[#1D2B40] hover:border-[#2D4566] rounded-2xl transition-all shadow-xl space-y-3"
                    >
                      {/* Row 1: Symbol, Type, Lots & Square Off Button */}
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                pos.type === 'BUY'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                              }`}
                            >
                              {pos.type}
                            </span>
                            <h3 className="font-black text-base sm:text-lg text-white">
                              {pos.symbol}
                            </h3>
                            <span className="px-1.5 py-0.5 rounded bg-[#162234] border border-[#233650] text-[10px] font-mono text-slate-300 font-bold">
                              {pos.product || 'INTRADAY'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-mono font-bold">
                              {pos.lots || 1} Lot ({pos.qty} Qty)
                            </span>
                          </div>
                        </div>

                        {/* Square Off / Exit Button */}
                        <div className="flex items-center gap-2">
                          {inst && (
                            <button
                              type="button"
                              onClick={() => setSelectedChartInstrument(inst)}
                              className="px-2.5 py-1 rounded-lg bg-[#142032] hover:bg-[#1E2E44] border border-[#23354E] text-slate-300 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                              title="View Live Chart"
                            >
                              <BarChart2 className="w-3.5 h-3.5 text-amber-400" />
                              <span>Chart</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={closingPositionId === pos.id}
                            onClick={() => handleSquareOffPosition(pos.id, pos.symbol)}
                            className="px-3.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 active:bg-rose-500/40 border border-rose-500/50 text-rose-300 text-xs font-black transition-all cursor-pointer disabled:opacity-50 shadow-sm flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>{closingPositionId === pos.id ? 'Closing...' : 'Exit Position'}</span>
                          </button>
                        </div>
                      </div>

                      {/* 🌟 DEDICATED BIG P&L HIGHLIGHT BOX PER POSITION */}
                      <div
                        className={`p-3.5 sm:p-4 rounded-xl border-2 transition-all flex items-center justify-between flex-wrap gap-2 ${
                          isPosProfit
                            ? 'bg-gradient-to-r from-emerald-950/70 via-[#0B2117]/80 to-[#0A1813] border-emerald-500/50 shadow-inner'
                            : 'bg-gradient-to-r from-rose-950/70 via-[#240C12]/80 to-[#180A0E] border-rose-500/50 shadow-inner'
                        }`}
                      >
                        <div>
                          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            {isPosProfit ? (
                              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                            )}
                            <span>{isPosProfit ? 'PROFIT' : 'LOSS'} (UNREALIZED)</span>
                          </span>

                          <div
                            className={`text-2xl sm:text-3xl font-black font-mono tracking-tight mt-0.5 ${
                              isPosProfit
                                ? 'text-emerald-400 drop-shadow-[0_2px_8px_rgba(16,185,129,0.35)]'
                                : 'text-rose-400 drop-shadow-[0_2px_8px_rgba(244,63,94,0.35)]'
                            }`}
                          >
                            {isPosProfit ? '+' : ''}₹{pos.pnl.toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </div>

                        {/* Percentage Return Badge */}
                        <div
                          className={`px-3 py-1.5 rounded-lg text-sm font-mono font-black border flex items-center gap-1 ${
                            isPosProfit
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                              : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                          }`}
                        >
                          <span>{isPosProfit ? '↗' : '↘'}</span>
                          <span>{isPosProfit ? '+' : ''}{pos.pnlPercent}%</span>
                        </div>
                      </div>

                      {/* Trade Details Bar */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#162234] text-xs font-mono text-slate-400">
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase block">Avg Buy/Sell Price</span>
                          <span className="text-slate-200 font-bold">
                            ₹{pos.avgPrice?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase block">Current LTP</span>
                          <span className="text-white font-bold">
                            ₹{pos.ltp?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase block">Total Exposure</span>
                          <span className="text-slate-200 font-bold">
                            ₹{(pos.avgPrice * pos.qty).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase block">Position ID</span>
                          <span className="text-slate-400">#{pos.id}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredPosList.length === 0 && (
                  <div className="text-center py-12 px-4 bg-[#0B111C] border border-[#1A2638] rounded-2xl">
                    <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 mb-3">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-bold text-white">No Open Positions</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      You do not have any active positions in this view. Choose an instrument from the Watchlist to place a trade.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveNav('watchlist')}
                      className="mt-4 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition-all cursor-pointer shadow-lg active:scale-95"
                    >
                      Go to Watchlist
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* 4. HISTORY TAB */}
        {activeNav === 'history' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{t('history')} & Trades</h2>
              <button
                type="button"
                onClick={() => setIsWalletModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Wallet Ledger</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {portfolio?.orders?.map((ord) => (
                <div
                  key={ord.id}
                  className="p-4 bg-[#0B111C] border border-[#1A2638] rounded-xl flex items-center justify-between flex-wrap gap-2"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          ord.type === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        }`}
                      >
                        {ord.type}
                      </span>
                      <h3 className="font-extrabold text-sm text-white">{ord.symbol}</h3>
                      <span className="text-xs text-slate-400 font-mono">#{ord.id}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 font-mono">
                      Lots: <span className="text-white font-bold">{ord.lots || 1}</span> ({ord.qty} Qty) • Rate: ₹
                      {ord.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-xs font-bold font-mono">
                      {ord.status}
                    </span>
                    <div className="text-[10px] text-slate-500 font-mono mt-1">
                      {ord.time} · {ord.date}
                    </div>
                  </div>
                </div>
              ))}

              {(!portfolio?.orders || portfolio.orders.length === 0) && (
                <div className="text-center py-12 px-4 bg-[#0B111C] border border-[#1A2638] rounded-2xl">
                  <Clock className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-sm font-bold text-white">No Trade History Yet</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Your executed orders and transaction logs will be listed here.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. USER DASHBOARD / PROFILE TAB matching Screenshot 3 */}
        {activeNav === 'profile' && user && (
          <ProfileDashboard
            user={user}
            wallet={portfolio?.wallet || {
              availableBalance: 142840,
              usedMargin: 38210,
              totalPnL: 34386.86,
              todayPnL: 504.52,
              deposited: 200000,
              withdrawn: 50000,
            }}
            onRefreshPortfolio={fetchData}
          />
        )}
      </main>

      {/* Interactive Order Window Modal matching Screenshot 1 */}
      {orderWindowInstrument && (
        <OrderWindow
          instrument={orderWindowInstrument}
          initialType={orderWindowInitialType}
          marketClosedOverride={marketClosedOverride}
          onClose={() => setOrderWindowInstrument(null)}
          onOpenLiveChart={(inst) => {
            setOrderWindowInstrument(null);
            setSelectedChartInstrument(inst);
          }}
          onOrderPlaced={() => {
            setOrderWindowInstrument(null);
            setSelectedChartInstrument(null);
            setActiveNav('positions');
            fetchData();
          }}
        />
      )}

      {/* Bottom Sticky Navigation Bar matching Screenshot 1 */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-[#080E18]/95 border-t border-[#1A2638] backdrop-blur-md">
        <div className="max-w-lg mx-auto grid grid-cols-5 py-2 px-2">
          {/* Watchlist */}
          <button
            type="button"
            id="nav-watchlist-btn"
            onClick={() => setActiveNav('watchlist')}
            className={`flex flex-col items-center gap-1 py-1 transition-colors cursor-pointer relative ${
              activeNav === 'watchlist' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {activeNav === 'watchlist' && (
              <span className="absolute -top-2 w-8 h-1 bg-amber-400 rounded-full" />
            )}
            <Star className={`w-4 h-4 ${activeNav === 'watchlist' ? 'fill-amber-400' : ''}`} />
            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase truncate max-w-[64px]">
              {t('watchlist')}
            </span>
          </button>

          {/* Orders */}
          <button
            type="button"
            id="nav-orders-btn"
            onClick={() => setActiveNav('orders')}
            className={`flex flex-col items-center gap-1 py-1 transition-colors cursor-pointer relative ${
              activeNav === 'orders' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {activeNav === 'orders' && (
              <span className="absolute -top-2 w-8 h-1 bg-amber-400 rounded-full" />
            )}
            <BookOpen className="w-4 h-4" />
            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase truncate max-w-[64px]">
              {t('orders')}
            </span>
          </button>

          {/* Portfolio (Positions) */}
          <button
            type="button"
            id="nav-portfolio-btn"
            onClick={() => setActiveNav('positions')}
            className={`flex flex-col items-center gap-1 py-1 transition-colors cursor-pointer relative ${
              activeNav === 'positions' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {activeNav === 'positions' && (
              <span className="absolute -top-2 w-8 h-1 bg-amber-400 rounded-full" />
            )}
            <TrendingUp className="w-4 h-4" />
            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase truncate max-w-[64px]">
              {t('portfolio')}
            </span>
          </button>

          {/* History */}
          <button
            type="button"
            id="nav-history-btn"
            onClick={() => setActiveNav('history')}
            className={`flex flex-col items-center gap-1 py-1 transition-colors cursor-pointer relative ${
              activeNav === 'history' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {activeNav === 'history' && (
              <span className="absolute -top-2 w-8 h-1 bg-amber-400 rounded-full" />
            )}
            <Clock className="w-4 h-4" />
            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase truncate max-w-[64px]">
              {t('history')}
            </span>
          </button>

          {/* Profile */}
          <button
            type="button"
            id="nav-profile-btn"
            onClick={() => setActiveNav('profile')}
            className={`flex flex-col items-center gap-1 py-1 transition-colors cursor-pointer relative ${
              activeNav === 'profile' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {activeNav === 'profile' && (
              <span className="absolute -top-2 w-8 h-1 bg-amber-400 rounded-full" />
            )}
            <UserIcon className="w-4 h-4" />
            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase truncate max-w-[64px]">
              {t('profile')}
            </span>
          </button>
        </div>
      </nav>

      {/* Modal Order Window overlay if triggered from Watchlist */}
      {orderWindowInstrument && (
        <OrderWindow
          instrument={orderWindowInstrument}
          initialType={orderWindowInitialType}
          marketClosedOverride={marketClosedOverride}
          tourStep={tourStep}
          onClose={() => setOrderWindowInstrument(null)}
          onOpenLiveChart={(inst) => {
            setOrderWindowInstrument(null);
            setSelectedChartInstrument(inst);
          }}
          onOrderPlaced={() => {
            setOrderWindowInstrument(null);
            setSelectedChartInstrument(null);
            setActiveNav('positions');
            fetchData();
          }}
        />
      )}

      {/* Market Closed Modal */}
      <MarketClosedModal
        isOpen={showMarketClosedModal}
        onClose={() => setShowMarketClosedModal(false)}
        info={marketHoursInfo}
      />

      {/* Global Wallet Modal */}
      <WalletModal
        isOpen={isWalletModalOpen}
        wallet={
          portfolio?.wallet || {
            availableBalance: 142840,
            usedMargin: 38210,
            totalPnL: 34386.86,
            todayPnL: 504.52,
            deposited: 200000,
            withdrawn: 50000,
          }
        }
        onClose={() => setIsWalletModalOpen(false)}
        onRefresh={fetchData}
      />

      {/* Quick Tour Guided Feature matching Screenshots */}
      <QuickTour
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        onStepChange={(step) => setTourStep(step)}
        onOpenInstrumentForTour={handleOpenInstrumentForTour}
        onCloseInstrumentForTour={handleCloseInstrumentForTour}
      />

      {/* Floating Help / Tour Button matching Screenshots 1, 7, 8, 9 */}
      {!isTourOpen && (
        <button
          type="button"
          id="quick-tour-floating-help-btn"
          onClick={() => {
            setIsTourOpen(true);
            setTourStep(0);
          }}
          className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white hover:bg-slate-100 text-slate-950 font-bold text-base shadow-2xl flex items-center justify-center border border-slate-200 z-30 cursor-pointer transition-transform hover:scale-110 active:scale-95 select-none"
          title="How to use GoldFut Platform - Guided Tour"
          aria-label="Platform Tour & Help"
        >
          ?
        </button>
      )}
    </div>
  );
};
