import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.ts';
import { authApi } from '../services/authApi.ts';
import { Instrument, PortfolioData } from '../types.ts';
import {
  Wallet,
  Bell,
  Sun,
  Search,
  Star,
  TrendingUp,
  TrendingDown,
  LogOut,
  SlidersHorizontal,
  ChevronDown,
  ShieldCheck,
  CheckCircle,
  Activity,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
} from 'lucide-react';

interface DashboardProps {
  onNavigate: (route: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { user, logout, showToast } = useAuth();

  const [activeTab, setActiveTab] = useState<'ALL' | 'CRYPTO' | 'EQUITY' | 'FOREX' | 'COMMODITY' | 'INDEX'>('ALL');
  const [activeNav, setActiveNav] = useState<'watchlist' | 'orders' | 'positions' | 'profile'>('watchlist');
  const [searchQuery, setSearchQuery] = useState('');
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({
    gold_fut: true,
    silver_fut: true,
  });
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [orderModalInstrument, setOrderModalInstrument] = useState<Instrument | null>(null);
  const [orderType, setOrderType] = useState<'BUY' | 'SELL'>('BUY');
  const [orderQty, setOrderQty] = useState(1);
  const [orderSuccess, setOrderSuccess] = useState(false);

  // Load live instruments and portfolio
  const fetchData = async () => {
    try {
      const [instRes, portRes] = await Promise.all([
        authApi.getInstruments(),
        authApi.getPortfolio(),
      ]);
      if (instRes.instruments) setInstruments(instRes.instruments);
      if (portRes) setPortfolio(portRes);
    } catch (err) {
      console.error('Failed to load market data:', err);
    }
  };

  useEffect(() => {
    fetchData();
    // Live quote polling
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await logout();
    onNavigate('/login');
  };

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePlaceOrder = () => {
    setOrderSuccess(true);
    setTimeout(() => {
      setOrderSuccess(false);
      setOrderModalInstrument(null);
      showToast({
        type: 'success',
        title: 'Order Executed',
        description: `${orderType} order for ${orderQty} lot(s) of ${orderModalInstrument?.symbol} placed successfully.`,
      });
    }, 800);
  };

  // Filter instruments
  const filteredInstruments = instruments.filter((inst) => {
    const matchesCategory = activeTab === 'ALL' || inst.category === activeTab;
    const matchesSearch =
      inst.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inst.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const isDemo = user?.status === 'demo' || user?.userId === 'vtx123';

  return (
    <div className="min-h-screen bg-[#060B13] text-slate-100 flex flex-col font-sans selection:bg-orange-500/30">
      {/* Top Header Bar matching Screenshot 2 */}
      <header className="sticky top-0 z-30 bg-[#0B111C]/95 border-b border-[#1A2638] px-4 py-3 backdrop-blur-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* User Profile Badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center font-bold font-mono text-sm text-slate-950 shadow-md shadow-orange-950/40">
              VX
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">Hello</span>
                <span className="text-sm font-bold text-white tracking-tight">
                  {user?.fullName || 'Trader'}
                </span>
                <span className="text-xs text-orange-400 font-mono">
                  ({user?.userId ? user.userId.toUpperCase() : 'VTX123'})
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Account Status:</span>
                <span className="text-emerald-400 font-medium flex items-center gap-0.5">
                  <CheckCircle className="w-3 h-3 inline" /> Verified
                </span>
                {isDemo && (
                  <span className="ml-1 px-1.5 py-0.2 bg-amber-500/20 border border-amber-500/40 rounded text-[10px] font-bold text-amber-400 tracking-wider">
                    DEMO
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Wallet Button */}
            <button
              type="button"
              onClick={() => setIsWalletOpen(!isWalletOpen)}
              className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:text-amber-300 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Wallet</span>
            </button>

            {/* Notification Bell */}
            <button
              type="button"
              className="w-8 h-8 rounded-lg bg-[#0E1626] hover:bg-slate-800 border border-slate-700/60 flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer relative"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full" />
            </button>

            {/* Logout Button */}
            <button
              type="button"
              onClick={handleLogout}
              className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:text-rose-300 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Wallet Balance Drawer / Dropdown */}
      {isWalletOpen && (
        <div className="bg-[#0E1726] border-b border-[#1E293B] px-4 py-4 animate-fadeIn">
          <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-[#080E18] rounded-xl border border-[#1A2638]">
              <span className="text-[11px] text-slate-400">Available Funds</span>
              <p className="text-base font-mono font-bold text-orange-400 mt-0.5">
                ₹{portfolio?.wallet?.availableBalance?.toLocaleString('en-IN') || '10,00,000.00'}
              </p>
            </div>
            <div className="p-3 bg-[#080E18] rounded-xl border border-[#1A2638]">
              <span className="text-[11px] text-slate-400">Used Margin</span>
              <p className="text-base font-mono font-bold text-slate-200 mt-0.5">
                ₹{portfolio?.wallet?.usedMargin?.toLocaleString('en-IN') || '3,12,520.00'}
              </p>
            </div>
            <div className="p-3 bg-[#080E18] rounded-xl border border-[#1A2638]">
              <span className="text-[11px] text-slate-400">Total Unrealized P&L</span>
              <p className="text-base font-mono font-bold text-emerald-400 mt-0.5 flex items-center gap-1">
                <ArrowUpRight className="w-4 h-4" /> +₹
                {portfolio?.wallet?.totalPnL?.toLocaleString('en-IN') || '34,386.86'}
              </p>
            </div>
            <div className="p-3 bg-[#080E18] rounded-xl border border-[#1A2638]">
              <span className="text-[11px] text-slate-400">Today's P&L</span>
              <p className="text-base font-mono font-bold text-emerald-400 mt-0.5 flex items-center gap-1">
                <ArrowUpRight className="w-4 h-4" /> +₹
                {portfolio?.wallet?.todayPnL?.toLocaleString('en-IN') || '4,386.86'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-5 pb-24">
        {/* Verification & Welcome Banner */}
        <div className="mb-5 p-4 rounded-xl bg-gradient-to-r from-[#0E1726] to-[#0A1220] border border-[#1E2E44] flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                Welcome, {user?.fullName || 'Trader'}
              </h2>
              <p className="text-xs text-slate-400">
                User ID: <span className="text-orange-400 font-mono">{user?.userId}</span> • Status:{' '}
                <span className="text-emerald-400 font-medium">Verified</span>
                {isDemo && ' (Demo Virtual Trading)'}
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>NSE/MCX Live Feed</span>
          </div>
        </div>

        {/* Watchlist View */}
        {activeNav === 'watchlist' && (
          <div className="space-y-4">
            {/* Title with Live Indicator */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-1.5">
                  Watchlist <ChevronDown className="w-4 h-4 text-slate-400" />
                </h2>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>• Live</span>
              </div>
            </div>

            {/* Category Tabs matching screenshot: ALL, CRYPTO, EQUITY, FOREX, COMMODITY, INDEX */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar border-b border-[#1E293B]">
              {(['ALL', 'CRYPTO', 'EQUITY', 'FOREX', 'COMMODITY', 'INDEX'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-3.5 py-1.5 text-xs font-bold tracking-wider rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === tab
                      ? 'text-orange-400 border-b-2 border-orange-500 bg-orange-500/10'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Instrument Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search instruments... e.g. NIFTY, GOLD, BTC"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#080E18] border border-[#1B273A] focus:border-orange-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 outline-none transition-all"
              />
            </div>

            {/* Instrument Rows matching Screenshot 2 */}
            <div className="space-y-2.5">
              {filteredInstruments.map((inst) => {
                const isPositive = inst.change >= 0;
                return (
                  <div
                    key={inst.id}
                    onClick={() => setOrderModalInstrument(inst)}
                    className="p-4 bg-[#0B111C] hover:bg-[#0F1726] border border-[#182334] hover:border-slate-700 rounded-xl transition-all duration-150 cursor-pointer shadow-md group relative overflow-hidden"
                  >
                    {/* Category Label Header */}
                    <div className="text-[10px] font-bold text-slate-500 tracking-wider uppercase mb-1.5">
                      {inst.category}
                    </div>

                    <div className="flex items-center justify-between">
                      {/* Left: Star, Symbol, Expiry, Intraday, Holding */}
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={(e) => toggleFavorite(inst.id, e)}
                          className="mt-1 text-slate-600 hover:text-amber-400 transition-colors"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              favorites[inst.id]
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-600'
                            }`}
                          />
                        </button>

                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-white tracking-wide">
                              {inst.symbol}
                            </h3>
                            <span className="text-[11px] text-slate-400 font-medium">
                              {inst.expiry}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-[11px] mt-1">
                            <span className="text-slate-400">
                              Intraday:{' '}
                              <span className="text-slate-200 font-mono">
                                ₹{inst.intraday.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </span>
                            <span className="text-slate-400">
                              Holding:{' '}
                              <span className="text-slate-200 font-mono">
                                ₹{inst.holding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Sparkline Mini Chart & Price */}
                      <div className="flex items-center gap-4">
                        {/* Sparkline gradient block matching screenshot */}
                        <div
                          className={`hidden sm:block w-20 h-6 rounded ${
                            isPositive
                              ? 'bg-gradient-to-t from-emerald-500/20 to-transparent border-b-2 border-emerald-500'
                              : 'bg-gradient-to-t from-rose-500/20 to-transparent border-b-2 border-rose-500'
                          }`}
                        />

                        {/* Price Details */}
                        <div className="text-right">
                          <div className="font-mono font-bold text-sm sm:text-base text-white tracking-tight">
                            ₹{inst.lastPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                          <div
                            className={`font-mono text-xs flex items-center justify-end gap-1 font-semibold ${
                              isPositive ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isPositive ? (
                              <TrendingUp className="w-3.5 h-3.5" />
                            ) : (
                              <TrendingDown className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {isPositive ? '+' : ''}
                              {inst.change.toFixed(4)}
                            </span>
                            <span>
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

        {/* Positions View */}
        {activeNav === 'positions' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white">Active Positions</h2>
            {portfolio?.positions?.map((pos, idx) => (
              <div
                key={idx}
                className="p-4 bg-[#0B111C] border border-[#1A2638] rounded-xl flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        pos.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {pos.type}
                    </span>
                    <h3 className="font-bold text-sm text-white">{pos.symbol}</h3>
                    <span className="text-xs text-slate-400">Qty: {pos.qty}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 font-mono">
                    Avg: ₹{pos.avgPrice} • LTP: ₹{pos.ltp}
                  </p>
                </div>
                <div className="text-right font-mono font-bold">
                  <div className={pos.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {pos.pnl >= 0 ? '+' : ''}₹{pos.pnl.toLocaleString('en-IN')}
                  </div>
                  <div className="text-xs text-slate-400">({pos.pnlPercent}%)</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Orders View */}
        {activeNav === 'orders' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white">Order Book</h2>
            {portfolio?.orders?.map((ord) => (
              <div
                key={ord.id}
                className="p-4 bg-[#0B111C] border border-[#1A2638] rounded-xl flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        ord.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {ord.type}
                    </span>
                    <h3 className="font-bold text-sm text-white">{ord.symbol}</h3>
                    <span className="text-xs text-slate-400">{ord.id}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 font-mono">
                    Qty: {ord.qty} • Price: ₹{ord.price} • Time: {ord.time}
                  </p>
                </div>
                <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-xs font-semibold font-mono">
                  {ord.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Profile View */}
        {activeNav === 'profile' && (
          <div className="space-y-4 max-w-md mx-auto">
            <h2 className="text-lg font-bold text-white">Account Profile</h2>
            <div className="bg-[#0B111C] border border-[#1A2638] rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3 pb-4 border-b border-[#1E293B]">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-lg font-bold text-slate-950 font-mono">
                  VX
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">{user?.fullName}</h3>
                  <p className="text-xs text-orange-400 font-mono">@{user?.userId}</p>
                </div>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1.5 border-b border-[#141E2E]">
                  <span className="text-slate-400">Mobile Number:</span>
                  <span className="font-mono text-slate-200">
                    {user?.countryCode} {user?.mobile}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#141E2E]">
                  <span className="text-slate-400">Verification Status:</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Verified
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#141E2E]">
                  <span className="text-slate-400">Referral Code:</span>
                  <span className="font-mono text-orange-400 font-bold">
                    {user?.referralCode || 'VERTEXPRO'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Account Type:</span>
                  <span className="text-slate-200 uppercase font-semibold">
                    {user?.status === 'demo' ? 'Virtual Trading Demo' : 'Live Trading Account'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full mt-4 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Quick Buy/Sell Trading Modal */}
      {orderModalInstrument && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0B111C] border border-[#1E2E44] rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base text-white">
                  {orderModalInstrument.symbol}
                </h3>
                <p className="text-xs text-slate-400">{orderModalInstrument.category} • {orderModalInstrument.expiry}</p>
              </div>
              <div className="text-right font-mono">
                <span className="text-sm font-bold text-white">
                  ₹{orderModalInstrument.lastPrice.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Buy / Sell Switch */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#080E18] rounded-xl mb-4">
              <button
                type="button"
                onClick={() => setOrderType('BUY')}
                className={`py-2 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                  orderType === 'BUY'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => setOrderType('SELL')}
                className={`py-2 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                  orderType === 'SELL'
                    ? 'bg-rose-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                SELL
              </button>
            </div>

            {/* Quantity */}
            <div className="mb-4">
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Quantity (Lots)
              </label>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setOrderQty(Math.max(1, orderQty - 1))}
                  className="w-10 h-10 bg-[#080E18] border border-[#1A2638] rounded-l-xl text-slate-300 font-bold hover:bg-slate-800"
                >
                  -
                </button>
                <input
                  type="number"
                  min={1}
                  value={orderQty}
                  onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full h-10 bg-[#080E18] border-y border-[#1A2638] text-center font-mono font-bold text-white outline-none"
                />
                <button
                  type="button"
                  onClick={() => setOrderQty(orderQty + 1)}
                  className="w-10 h-10 bg-[#080E18] border border-[#1A2638] rounded-r-xl text-slate-300 font-bold hover:bg-slate-800"
                >
                  +
                </button>
              </div>
            </div>

            <div className="p-3 bg-[#080E18] rounded-xl border border-[#1A2638] text-xs space-y-1 mb-5">
              <div className="flex justify-between text-slate-400">
                <span>Estimated Margin:</span>
                <span className="font-mono text-slate-200">
                  ₹{(orderModalInstrument.lastPrice * orderQty * 0.15).toLocaleString('en-IN', {
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Charges & Taxes:</span>
                <span className="font-mono text-slate-200">₹24.50</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOrderModalInstrument(null)}
                className="w-1/3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePlaceOrder}
                className={`w-2/3 py-2.5 text-xs font-bold rounded-xl transition-all shadow-lg cursor-pointer ${
                  orderType === 'BUY'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                }`}
              >
                {orderSuccess ? 'Executing...' : `Place ${orderType} Order`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sticky Navigation Bar matching Screenshot 2 */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-[#080E18]/95 border-t border-[#1A2638] backdrop-blur-md">
        <div className="max-w-md mx-auto grid grid-cols-4 py-2 px-3">
          <button
            type="button"
            onClick={() => setActiveNav('watchlist')}
            className={`flex flex-col items-center gap-1 py-1 transition-colors cursor-pointer ${
              activeNav === 'watchlist' ? 'text-orange-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div
              className={`w-4 h-4 border-2 ${
                activeNav === 'watchlist' ? 'border-orange-400' : 'border-slate-400'
              } rounded-xs flex items-center justify-center`}
            >
              <div
                className={`w-1.5 h-1.5 ${
                  activeNav === 'watchlist' ? 'bg-orange-400' : 'bg-transparent'
                } rounded-xs`}
              />
            </div>
            <span className="text-[10px] font-semibold tracking-wider">Watchlist</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav('orders')}
            className={`flex flex-col items-center gap-1 py-1 transition-colors cursor-pointer ${
              activeNav === 'orders' ? 'text-orange-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span className="text-[10px] font-semibold tracking-wider">Orders</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav('positions')}
            className={`flex flex-col items-center gap-1 py-1 transition-colors cursor-pointer ${
              activeNav === 'positions' ? 'text-orange-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span className="text-[10px] font-semibold tracking-wider">Positions</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav('profile')}
            className={`flex flex-col items-center gap-1 py-1 transition-colors cursor-pointer ${
              activeNav === 'profile' ? 'text-orange-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[8px] font-bold font-mono">
              U
            </div>
            <span className="text-[10px] font-semibold tracking-wider font-mono">
              {user?.userId ? user.userId.toUpperCase() : 'VTX123'}
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
};
