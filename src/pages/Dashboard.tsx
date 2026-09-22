import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../hooks/useAuth.ts';
import { authApi } from '../services/authApi.ts';
import { Instrument, PortfolioData, AppNotification } from '../types.ts';
import { DEFAULT_INSTRUMENTS } from '../data/defaultInstruments.ts';
import { OrderWindow } from '../components/OrderWindow.tsx';
import { LiveChart } from '../components/LiveChart.tsx';
import { ProfileDashboard } from '../components/ProfileDashboard.tsx';
import { MarketClosedModal } from '../components/MarketClosedModal.tsx';
import { WalletModal } from '../components/WalletModal.tsx';
import { LanguageSelector } from '../components/LanguageSelector.tsx';
import { QuickTour } from '../components/QuickTour.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { NotificationsModal } from '../components/NotificationsModal.tsx';
import { DesktopMarketPanel } from '../components/DesktopMarketPanel.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';
import { useTenant } from '../context/TenantContext.tsx';
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
  HelpCircle,
  Shield,
  RefreshCw,
  AlertTriangle,
  Filter,
  ArrowRight,
  RotateCcw,
  FileText,
  Check,
  SlidersHorizontal,
  Plus,
  Percent,
} from 'lucide-react';

interface DashboardProps {
  onNavigate: (route: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { user, logout, showToast } = useAuth();
  const { t } = useLanguage();
  const { branding, isTradingEnabled } = useTenant();

  // Navigation & Sub-views
  const [activeNav, setActiveNav] = useState<'watchlist' | 'orders' | 'positions' | 'history' | 'profile'>('watchlist');
  const [activeTab, setActiveTab] = useState<'ALL' | 'EQUITY' | 'COMMODITY' | 'INDEX' | 'CRYPTO' | 'FOREX'>('ALL');
  const [equitySectorFilter, setEquitySectorFilter] = useState<'ALL' | 'NIFTY50' | 'BANKING' | 'IT' | 'AUTO' | 'ENERGY' | 'FMCG_RETAIL' | 'PHARMA' | 'PSU_DEFENCE' | 'FUTURES'>('ALL');
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

  // Orders Sub-Tab and Filter State (Zerodha Kite & Upstox Level)
  const [orderFilterTab, setOrderFilterTab] = useState<'ALL' | 'EXECUTED' | 'PENDING' | 'CANCELLED'>('ALL');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderSideFilter, setOrderSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<any | null>(null);

  // Portfolio Sub-Tab State (Positions vs Holdings)
  const [portfolioSubTab, setPortfolioSubTab] = useState<'POSITIONS' | 'HOLDINGS'>('POSITIONS');
  const [showExitAllModal, setShowExitAllModal] = useState(false);
  const [isExitingAll, setIsExitingAll] = useState(false);

  // Notifications states
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  // Desktop Spotlight featured instrument
  const [spotlightInstrumentId, setSpotlightInstrumentId] = useState<string>('gold_fut');

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

  // Fetch live market data, user portfolio, and notifications
  const fetchData = async () => {
    try {
      const [instRes, portRes, notifRes] = await Promise.all([
        authApi.getInstruments(),
        authApi.getPortfolio(),
        authApi.getNotifications().catch(() => ({ success: false, notifications: [] as AppNotification[] })),
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
      if (notifRes && notifRes.notifications) {
        setNotifications(notifRes.notifications);
        setUnreadNotificationsCount(notifRes.notifications.filter((n) => !n.read).length);
      }
    } catch (err) {
      console.error('Failed to load market data:', err);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await authApi.markNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadNotificationsCount(0);
      showToast({ type: 'info', title: 'Notifications', description: 'All alerts marked as read.' });
    } catch {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadNotificationsCount(0);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await authApi.markNotificationsRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadNotificationsCount((prev) => Math.max(0, prev - 1));
    } catch {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadNotificationsCount((prev) => Math.max(0, prev - 1));
    }
  };

  const handleClearNotifications = async () => {
    try {
      await authApi.clearNotifications();
      setNotifications([]);
      setUnreadNotificationsCount(0);
      showToast({ type: 'info', title: 'Notifications', description: 'All alerts cleared.' });
    } catch {
      setNotifications([]);
      setUnreadNotificationsCount(0);
    }
  };

  const selectedChartInstrumentRef = useRef(selectedChartInstrument);
  selectedChartInstrumentRef.current = selectedChartInstrument;
  const orderWindowInstrumentRef = useRef(orderWindowInstrument);
  orderWindowInstrumentRef.current = orderWindowInstrument;

  // Connect to Live Trading WebSocket for instantaneous updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let isMounted = true;

    const connectWs = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          // Connected to trading stream
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.event === 'market.ticks' && data.payload?.instruments) {
              setInstruments(data.payload.instruments);
              if (selectedChartInstrumentRef.current) {
                const updatedChart = data.payload.instruments.find(
                  (i: Instrument) => i.id === selectedChartInstrumentRef.current?.id
                );
                if (updatedChart) setSelectedChartInstrument(updatedChart);
              }
              if (orderWindowInstrumentRef.current) {
                const updatedOrder = data.payload.instruments.find(
                  (i: Instrument) => i.id === orderWindowInstrumentRef.current?.id
                );
                if (updatedOrder) setOrderWindowInstrument(updatedOrder);
              }
            } else if (data.event === 'portfolio.mtm' && data.payload) {
              setPortfolio((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  positions: data.payload.positions || prev.positions,
                  wallet: data.payload.wallet ? { ...prev.wallet, ...data.payload.wallet } : prev.wallet,
                };
              });
            } else if (
              data.event === 'order.created' ||
              data.event === 'trade.executed' ||
              data.event === 'position.updated' ||
              data.event === 'wallet.updated' ||
              data.event === 'order.cancelled'
            ) {
              fetchData();
            }
          } catch {}
        };

        ws.onclose = () => {
          if (isMounted) {
            reconnectTimeout = setTimeout(connectWs, 3000);
          }
        };

        ws.onerror = () => {
          // Fallback to active interval polling
        };
      } catch {}
    };

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 1000);
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

  const handleOpenOrder = (inst: Instrument, type: 'BUY' | 'SELL' = 'BUY') => {
    setOrderWindowInstrument(inst);
    setOrderWindowInitialType(type);
  };

  const handleOpenChart = (inst: Instrument) => {
    setSelectedChartInstrument(inst);
  };

  const handleOrderPlaced = (orderRes?: any) => {
    setOrderWindowInstrument(null);
    setSelectedChartInstrument(null);
    setActiveNav('positions');

    if (orderRes) {
      setPortfolio((prev) => {
        if (!prev) return prev;
        const newOrders = orderRes.order
          ? [orderRes.order, ...(prev.orders || []).filter((o: any) => o.id !== orderRes.order.id)]
          : prev.orders;
        const newPositions = orderRes.positions || prev.positions;
        const newWallet = orderRes.wallet ? { ...prev.wallet, ...orderRes.wallet } : prev.wallet;
        return {
          ...prev,
          orders: newOrders,
          positions: newPositions,
          wallet: newWallet,
        };
      });
    }
    fetchData();
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
      // Optimistic update
      setPortfolio((prev) => {
        if (!prev) return prev;
        const newPositions = (prev.positions || []).filter((p) => p.id !== positionId && p.symbol !== positionId);
        const newWallet = res.wallet ? { ...prev.wallet, ...res.wallet } : prev.wallet;
        return {
          ...prev,
          positions: newPositions,
          wallet: newWallet,
        };
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

  const handleCancelOrder = async (orderId: string) => {
    setCancellingOrderId(orderId);
    try {
      await authApi.cancelOrder(orderId);
      showToast({
        type: 'info',
        title: 'Order Cancelled',
        description: `Order #${orderId} was cancelled.`,
      });
      setPortfolio((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          orders: (prev.orders || []).map((o: any) =>
            o.id === orderId ? { ...o, status: 'CANCELLED' } : o
          ),
        };
      });
      fetchData();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Failed to cancel order',
        description: err.message || 'Could not cancel order.',
      });
    } finally {
      setCancellingOrderId(null);
    }
  };

  const handleExitAllPositions = async () => {
    setIsExitingAll(true);
    try {
      const res = await authApi.closeAllPositions();
      showToast({
        type: 'success',
        title: 'All Positions Exited',
        description: res.message || 'All positions squared off successfully.',
      });
      setShowExitAllModal(false);
      setPortfolio((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          positions: [],
          wallet: res.wallet ? { ...prev.wallet, ...res.wallet } : prev.wallet,
        };
      });
      fetchData();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Failed to exit all positions',
        description: err.message || 'Error occurred.',
      });
    } finally {
      setIsExitingAll(false);
    }
  };

  // Filter instruments based on search, category tab, and equity sector
  const filteredInstruments = instruments.filter((inst) => {
    const isEquity =
      inst.category === 'EQUITY' ||
      inst.sectionName?.includes('EQUITY') ||
      inst.sectionName?.includes('NSE') ||
      inst.sectionName?.includes('BSE');

    const matchesCategory =
      activeTab === 'ALL' ||
      (activeTab === 'EQUITY' ? isEquity : inst.category === activeTab);

    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      inst.symbol.toLowerCase().includes(q) ||
      (inst.name && inst.name.toLowerCase().includes(q)) ||
      inst.category.toLowerCase().includes(q) ||
      (inst.sectionName && inst.sectionName.toLowerCase().includes(q));

    if (!matchesCategory || !matchesSearch) return false;

    // Optional equity sector filter when activeTab === 'EQUITY'
    if (activeTab === 'EQUITY' && equitySectorFilter !== 'ALL') {
      if (equitySectorFilter === 'FUTURES') {
        return inst.symbol.includes('FUT') || inst.sectionName === 'NSE FUT';
      }
      if (equitySectorFilter === 'NIFTY50') {
        const niftyTop = [
          'RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY', 'SBIN', 'BHARTIARTL',
          'ITC', 'HINDUNILVR', 'LT', 'BAJFINANCE', 'MARUTI', 'TATAMOTORS', 'TATASTEEL',
          'KOTAKBANK', 'AXISBANK', 'SUNPHARMA', 'TITAN', 'ADANIENT', 'ADANIPORTS',
          'WIPRO', 'HCLTECH', 'NTPC', 'POWERGRID', 'ONGC', 'COALINDIA', 'ASIANPAINT',
          'ULTRACEMCO', 'BAJAJFINSV', 'NESTLEIND'
        ];
        return niftyTop.some((sym) => inst.symbol.startsWith(sym));
      }
      if (equitySectorFilter === 'BANKING') {
        const banks = [
          'HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'INDUSINDBK',
          'PNB', 'BANKBARODA', 'CANBK', 'YESBANK', 'BAJFINANCE', 'BAJAJFINSV',
          'JIOFIN', 'CHOLAFIN', 'SHRIRAMFIN', 'MUTHOOTFIN', 'LICI', 'HDFCLIFE', 'SBILIFE'
        ];
        return banks.some((sym) => inst.symbol.startsWith(sym));
      }
      if (equitySectorFilter === 'IT') {
        const it = ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM', 'TATAELXSI', 'KPITTECH', 'PERSISTENT', 'COFORGE'];
        return it.some((sym) => inst.symbol.startsWith(sym));
      }
      if (equitySectorFilter === 'AUTO') {
        const auto = ['MARUTI', 'TATAMOTORS', 'BAJAJ-AUTO', 'HEROMOTOCO', 'EICHERMOT', 'ASHOKLEY', 'BOSCHLTD', 'MRF'];
        return auto.some((sym) => inst.symbol.startsWith(sym));
      }
      if (equitySectorFilter === 'ENERGY') {
        const energy = ['RELIANCE', 'NTPC', 'POWERGRID', 'ONGC', 'COALINDIA', 'IOC', 'BPCL', 'TATAPOWER', 'NHPC', 'SUZLON', 'IREDA'];
        return energy.some((sym) => inst.symbol.startsWith(sym));
      }
      if (equitySectorFilter === 'PHARMA') {
        const pharma = ['SUNPHARMA', 'CIPLA', 'DRREDDY', 'DIVISLAB', 'APOLLOHOSP', 'LUPIN', 'AUROPHARMA', 'TORNTPHARM', 'ALKEM', 'ZYDUSLIFE'];
        return pharma.some((sym) => inst.symbol.startsWith(sym));
      }
      if (equitySectorFilter === 'FMCG_RETAIL') {
        const fmcg = ['ITC', 'HINDUNILVR', 'NESTLEIND', 'BRITANNIA', 'TATACONSUM', 'VBL', 'DABUR', 'MARICO', 'COLPAL', 'GODREJCP', 'TRENT', 'DMART', 'PAGEIND', 'JUBLFOOD', 'ZOMATO'];
        return fmcg.some((sym) => inst.symbol.startsWith(sym));
      }
      if (equitySectorFilter === 'PSU_DEFENCE') {
        const psu = ['BEL', 'HAL', 'MAZDOCK', 'COCHINSHIP', 'RVNL', 'BHEL', 'IRCTC', 'SBIN', 'PNB', 'BANKBARODA', 'CANBK', 'RECLTD', 'PFC', 'ONGC', 'IOC', 'BPCL', 'COALINDIA', 'NTPC', 'POWERGRID'];
        return psu.some((sym) => inst.symbol.startsWith(sym));
      }
    }

    return true;
  });

  const isDemo = user?.status === 'demo' || user?.userId === 'vtx123';

  // Live dynamic Mark-to-Market calculation using live ticking instruments
  const livePositions = useMemo(() => {
    return (portfolio?.positions || []).map((pos) => {
      const liveInst = instruments.find((i) => i.symbol === pos.symbol);
      const ltp = liveInst ? liveInst.lastPrice : pos.ltp;
      const pnl = pos.type === 'BUY'
        ? (ltp - pos.avgPrice) * pos.qty
        : (pos.avgPrice - ltp) * pos.qty;
      const pnlPercent = (pos.avgPrice * pos.qty) > 0
        ? Number(((pnl / (pos.avgPrice * pos.qty)) * 100).toFixed(2))
        : 0;
      return {
        ...pos,
        ltp,
        pnl: Number(pnl.toFixed(2)),
        pnlPercent,
        category: liveInst?.category || pos.category || 'COMMODITY',
        lotSize: liveInst?.lotSize || pos.lotSize || 100,
      };
    });
  }, [portfolio?.positions, instruments]);

  const intradayPositions = useMemo(
    () => livePositions.filter((p) => p.product === 'INTRADAY' || !p.product),
    [livePositions]
  );
  const holdingPositions = useMemo(
    () => livePositions.filter((p) => p.product === 'HOLDING'),
    [livePositions]
  );

  const displayedPositions = useMemo(() => {
    return positionFilter === 'INTRADAY'
      ? intradayPositions
      : positionFilter === 'HOLDING'
      ? holdingPositions
      : livePositions;
  }, [positionFilter, intradayPositions, holdingPositions, livePositions]);

  const totalUnrealizedPnL = useMemo(() => {
    return livePositions.reduce((sum, pos) => sum + (pos.pnl || 0), 0);
  }, [livePositions]);

  const totalInvestedMargin = useMemo(() => {
    return livePositions.reduce((sum, pos) => sum + (pos.avgPrice * pos.qty), 0);
  }, [livePositions]);

  const overallPnLPercent = totalInvestedMargin > 0
    ? Number(((totalUnrealizedPnL / totalInvestedMargin) * 100).toFixed(2))
    : 0;
  const isProfit = totalUnrealizedPnL >= 0;

  const todayRealizedPnL = portfolio?.wallet?.todayPnL || 0;
  const isTodayProfit = todayRealizedPnL >= 0;
  const netPnL = Number((todayRealizedPnL + totalUnrealizedPnL).toFixed(2));
  const isNetProfit = netPnL >= 0;

  // Holdings calculations
  const totalHoldingInvestment = useMemo(
    () => holdingPositions.reduce((sum, h) => sum + (h.avgPrice * h.qty), 0),
    [holdingPositions]
  );
  const totalHoldingCurrentVal = useMemo(
    () => holdingPositions.reduce((sum, h) => sum + (h.ltp * h.qty), 0),
    [holdingPositions]
  );
  const totalHoldingPnL = totalHoldingCurrentVal - totalHoldingInvestment;
  const isHoldingProfit = totalHoldingPnL >= 0;

  // Visual flash effect on live PnL tick
  const [pnlTickDirection, setPnlTickDirection] = useState<'UP' | 'DOWN' | null>(null);
  const prevPnlRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevPnlRef.current !== null && totalUnrealizedPnL !== prevPnlRef.current) {
      setPnlTickDirection(totalUnrealizedPnL > prevPnlRef.current ? 'UP' : 'DOWN');
      const timer = setTimeout(() => setPnlTickDirection(null), 800);
      return () => clearTimeout(timer);
    }
    prevPnlRef.current = totalUnrealizedPnL;
  }, [totalUnrealizedPnL]);

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
            onOrderPlaced={handleOrderPlaced}
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
    <div className="min-h-screen bg-slate-50 dark:bg-[#060B13] text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-amber-500/30 transition-colors duration-150">
      {/* Top Header Bar matching Screenshot 1 & 2 */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#0B111C]/95 border-b border-slate-200 dark:border-[#1A2638] px-3 sm:px-4 lg:px-6 py-2.5 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Brand Logo & Name */}
          <div
            onClick={() => setActiveNav('watchlist')}
            className="flex items-center gap-2.5 cursor-pointer select-none group shrink-0"
            title={`${branding.brandName || 'VERTEX'} Trading Platform`}
          >
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.brandName}
                className="h-9 w-auto object-contain rounded-xl group-hover:scale-105 transition-transform"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-slate-950 text-sm shadow-md group-hover:scale-105 transition-transform"
                style={{
                  background: `linear-gradient(135deg, ${branding.primaryColor || '#F59E0B'}, ${branding.secondaryColor || '#D97706'})`,
                  boxShadow: `0 4px 12px ${branding.primaryColor || '#F59E0B'}40`,
                }}
              >
                {branding.shortName || 'VX'}
              </div>
            )}
            <div className="flex flex-col">
              <span
                className="text-base sm:text-lg font-black tracking-tight leading-none transition-colors"
                style={{ color: branding.primaryColor || '#F59E0B' }}
              >
                {branding.brandName || 'VERTEX'}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[140px]">
                {branding.tagline || 'Trading Platform'}
              </span>
            </div>
          </div>

          {/* Desktop Navigation Tabs for Wide Screens (lg:flex) */}
          <nav className="hidden lg:flex items-center gap-1 bg-slate-100 dark:bg-[#080E18] p-1 rounded-xl border border-slate-200 dark:border-[#162234]">
            <button
              type="button"
              onClick={() => setActiveNav('watchlist')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeNav === 'watchlist'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${activeNav === 'watchlist' ? 'fill-slate-950' : ''}`} />
              <span>{t('watchlist')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('orders')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeNav === 'orders'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{t('orders')}</span>
              {portfolio?.orders?.length ? (
                <span className="text-[10px] px-1 rounded-full bg-slate-200 dark:bg-[#142032] font-mono">
                  {portfolio.orders.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('positions')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeNav === 'positions'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{t('portfolio')}</span>
              {portfolio?.positions?.length ? (
                <span className="text-[10px] px-1 rounded-full bg-slate-200 dark:bg-[#142032] font-mono">
                  {portfolio.positions.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('history')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeNav === 'history'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{t('history')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('profile')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeNav === 'profile'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span>{t('profile')}</span>
            </button>
          </nav>

          {/* Action Buttons: Theme Toggle + Language Selector + Wallet + Notifications + User Avatar */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Theme Toggle (Dark / Light Mode) */}
            <ThemeToggle />

            {/* Language Selector Dropdown in top right side corner matching Screenshot 1 & 2 */}
            <LanguageSelector />

            {/* Wallet Funds Button */}
            <button
              type="button"
              id="header-wallet-btn"
              onClick={() => setIsWalletModalOpen(true)}
              className="hidden sm:flex px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-semibold text-xs items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:scale-95"
              title="Open Wallet & Funds"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>{t('wallet')}</span>
            </button>

            {/* Notification Bell */}
            <button
              type="button"
              id="header-notification-btn"
              onClick={() => setIsNotificationsOpen(true)}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#0E1626] dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white transition-colors cursor-pointer relative active:scale-95"
              aria-label="Notifications"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadNotificationsCount > 0 ? (
                <span className="absolute -top-1 -right-1 px-1.5 min-w-[16px] h-4 text-[9px] font-mono font-bold rounded-full bg-amber-500 text-slate-950 flex items-center justify-center ring-2 ring-white dark:ring-[#0B111C]">
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              ) : (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-slate-400 dark:bg-slate-600 rounded-full" />
              )}
            </button>

            {/* Commercial Admin Desk Quick Launch (for Super Admin, Master, Broker, Sub-Broker) */}
            {user?.role && ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'].includes(user.role) && (
              <button
                type="button"
                id="header-admin-desk-btn"
                onClick={() => onNavigate('/admin/dashboard')}
                className="hidden md:flex px-2.5 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-600 dark:text-purple-300 font-semibold text-xs items-center gap-1.5 transition-colors cursor-pointer active:scale-95 shadow-xs"
                title="Switch to Commercial Admin Desk"
              >
                <Shield className="w-3.5 h-3.5 text-purple-400" />
                <span>Admin Desk</span>
              </button>
            )}

            {/* Quick Tour / How to trade guide button */}
            <button
              type="button"
              id="header-quick-tour-btn"
              onClick={() => setIsTourOpen(true)}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#0E1626] dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white transition-colors cursor-pointer active:scale-95"
              aria-label="Platform Tour"
              title="How to trade / Quick Tour"
            >
              <HelpCircle className="w-4 h-4 text-amber-500" />
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
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <span>Total Unrealized P&L</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </span>
              <p
                className={`text-base font-mono font-bold mt-0.5 flex items-center gap-1 ${
                  isProfit ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isProfit ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                {isProfit ? '+' : ''}₹
                {totalUnrealizedPnL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-3 bg-[#080E18] rounded-xl border border-[#1A2638]">
              <span className="text-[11px] text-slate-400">Today's P&L</span>
              <p
                className={`text-base font-mono font-bold mt-0.5 flex items-center gap-1 ${
                  isNetProfit ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isNetProfit ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                {isNetProfit ? '+' : ''}₹
                {netPnL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 lg:px-6 py-4 pb-24">
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
        {activeNav === 'watchlist' && (() => {
          const featuredSpotlightInst =
            instruments.find((i) => i.id === spotlightInstrumentId) ||
            filteredInstruments[0] ||
            instruments[0];

          return (
            <div className="lg:grid lg:grid-cols-12 lg:gap-6 items-start">
              {/* Main Watchlist Column (8 cols on lg) */}
              <div className="lg:col-span-8 space-y-3.5">
                {/* 3-Metric Summary Bar matching Screenshot 1 */}
                <div className="grid grid-cols-3 gap-2 py-3 px-3.5 sm:px-4 rounded-2xl bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-[#1A2638] text-center shadow-xs transition-colors">
                  {/* Available Margin */}
                  <button
                    type="button"
                    onClick={() => setIsWalletModalOpen(true)}
                    className="text-left cursor-pointer hover:opacity-90 transition-opacity"
                    title="Click to view Wallet & Funds"
                  >
                    <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                      {t('availableMargin')}
                    </div>
                    <div className="text-sm sm:text-base lg:text-lg font-mono font-black text-slate-900 dark:text-white tracking-tight mt-0.5 truncate">
                      ₹{(portfolio?.wallet?.availableBalance ?? 242680).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </div>
                  </button>

                  {/* Today's P&L */}
                  <div className="text-center">
                    <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate flex items-center justify-center gap-1">
                      <span>{t('todayPnl')}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                    <div
                      className={`text-sm sm:text-base lg:text-lg font-mono font-black tracking-tight mt-0.5 truncate transition-colors duration-200 ${
                        isProfit ? 'text-emerald-500' : 'text-rose-500'
                      }`}
                    >
                      {isProfit ? '+' : ''}₹
                      {totalUnrealizedPnL.toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>

                  {/* Overall P&L */}
                  <div className="text-right">
                    <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
                      {t('overallPnl')}
                    </div>
                    <div
                      className={`text-sm sm:text-base lg:text-lg font-mono font-black tracking-tight mt-0.5 truncate transition-colors duration-200 ${
                        isNetProfit ? 'text-emerald-500' : 'text-rose-500'
                      }`}
                    >
                      {isNetProfit ? '+' : ''}₹
                      {netPnL.toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                </div>

                {/* Instrument Search Bar matching Screenshot 1 */}
                <div id="tour-target-search" className="relative">
                  <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder={t('searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white dark:bg-[#080E18] border border-slate-200 dark:border-[#1B273A] focus:border-amber-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 outline-none transition-all font-sans shadow-xs"
                  />
                </div>

                {/* Category Filter Pills: ALL, EQUITY, COMMODITY, INDEX, CRYPTO, FOREX */}
                <div id="tour-target-categories" className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {(['ALL', 'EQUITY', 'COMMODITY', 'INDEX', 'CRYPTO', 'FOREX'] as const).map((tab) => {
                    const isSelected = activeTab === tab;
                    const tabKey = tab.toLowerCase();
                    const label = t(tabKey) || tab;
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => {
                          setActiveTab(tab);
                          if (tab !== 'EQUITY') {
                            setEquitySectorFilter('ALL');
                          }
                        }}
                        className={`px-3.5 sm:px-4 py-1.5 text-xs font-bold tracking-wider rounded-lg transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                            : 'bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-[#1E2E44] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        {label} {tab === 'EQUITY' && `(${instruments.filter(i => i.category === 'EQUITY').length})`}
                      </button>
                    );
                  })}
                </div>

                {/* Sub-sector filtering when EQUITY tab is active */}
                {activeTab === 'EQUITY' && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-0.5">
                    {[
                      { key: 'ALL', label: `All Shares (${instruments.filter(i => i.category === 'EQUITY').length})` },
                      { key: 'NIFTY50', label: 'Nifty 50' },
                      { key: 'BANKING', label: 'Banking & Fin' },
                      { key: 'IT', label: 'IT & Tech' },
                      { key: 'AUTO', label: 'Auto & EV' },
                      { key: 'ENERGY', label: 'Energy & Power' },
                      { key: 'FMCG_RETAIL', label: 'FMCG & Retail' },
                      { key: 'PHARMA', label: 'Pharma & Health' },
                      { key: 'PSU_DEFENCE', label: 'PSU & Defence' },
                      { key: 'FUTURES', label: 'Stock Futures' },
                    ].map((sec) => (
                      <button
                        key={sec.key}
                        type="button"
                        onClick={() => setEquitySectorFilter(sec.key as any)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                          equitySectorFilter === sec.key
                            ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/50'
                            : 'bg-slate-100 dark:bg-[#121B2B] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
                        }`}
                      >
                        {sec.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Watchlist Subheader */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs sm:text-sm font-black text-slate-500 dark:text-slate-400 tracking-wider uppercase">
                      {activeTab === 'EQUITY' ? 'Indian Equities (NSE / BSE)' : t('watchlist')}
                    </h2>
                    {activeTab === 'EQUITY' && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        Cash & Derivatives
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500 font-mono">
                    {filteredInstruments.length} {t('instruments')}
                  </span>
                </div>

                {/* Instrument Cards List matching Screenshot 1 (Responsive grid on tablets/desktops) */}
                <div id="tour-target-watchlist" className="space-y-4">
                  {filteredInstruments.map((inst, index) => {
                    const isPositive = inst.change >= 0;
                    const isFav = favorites[inst.id] || false;
                    const isSpotlight = spotlightInstrumentId === inst.id;

                    return (
                      <div key={inst.id} className="space-y-1.5">
                        {/* Category Header matching Screenshot 3 */}
                        <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase px-1">
                          {inst.category}
                        </div>

                        {/* Instrument Card */}
                        <div
                          id={index === 0 ? 'tour-target-first-instrument' : undefined}
                          onClick={() => {
                            setSpotlightInstrumentId(inst.id);
                            handleOpenOrder(inst, 'BUY');
                          }}
                          className={`p-4 sm:p-5 rounded-2xl transition-all duration-150 shadow-xs hover:shadow-md cursor-pointer select-none group border ${
                            isSpotlight
                              ? 'bg-amber-50/50 dark:bg-[#0E1626] border-amber-500/50 dark:border-amber-500/40 ring-1 ring-amber-500/30'
                              : 'bg-white dark:bg-[#0A101C] hover:bg-slate-50 dark:hover:bg-[#0E1626] border-slate-200 dark:border-[#162234] hover:border-amber-500/40 dark:hover:border-[#223550]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4">
                            {/* Left: Star + Symbol + Expiry + Intraday/Holding */}
                            <div className="flex flex-col min-w-0">
                              {/* Row 1: Star icon + Symbol + Expiry badge */}
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => toggleFavorite(inst.id, e)}
                                  className="text-amber-500 hover:scale-110 transition-transform cursor-pointer"
                                >
                                  <Star
                                    className={`w-4 h-4 ${
                                      isFav
                                        ? 'fill-amber-500 text-amber-500'
                                        : 'fill-amber-500/80 text-amber-500'
                                    }`}
                                  />
                                </button>
                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                  <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white tracking-wide group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">
                                    {inst.symbol}
                                  </h3>
                                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                    {inst.expiry}
                                  </span>
                                  {inst.sectionName && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#121B2B] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                                      {inst.sectionName}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Row 1.5: Company Name */}
                              {inst.name && inst.name !== inst.symbol && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[220px] sm:max-w-[320px] mt-0.5">
                                  {inst.name}
                                </p>
                              )}

                              {/* Row 2: Intraday and Holding values */}
                              <div className="flex items-center gap-3 text-xs mt-2 text-slate-500 dark:text-slate-400">
                                <span>
                                  Intraday:{' '}
                                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                                    ₹{inst.intraday.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </span>
                                </span>
                                <span>
                                  Holding:{' '}
                                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
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
                                    ? 'bg-gradient-to-t from-transparent to-emerald-500/20 border-b border-emerald-500/50'
                                    : 'bg-gradient-to-t from-transparent to-rose-500/20 border-b border-rose-500/50'
                                }`}
                              />
                            </div>

                            {/* Right: Live Price & Absolute / Percentage Change */}
                            <div className="text-right flex flex-col items-end shrink-0">
                              {/* Row 1: Last Price */}
                              <div className="font-mono font-black text-base sm:text-lg text-slate-900 dark:text-white tracking-tight">
                                ₹{inst.lastPrice < 10
                                  ? inst.lastPrice.toFixed(4)
                                  : inst.lastPrice.toLocaleString('en-IN', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                              </div>
                              {/* Row 2: Direction Arrow & Change */}
                              <div
                                className={`font-mono text-xs sm:text-sm flex items-center gap-1 font-bold mt-0.5 ${
                                  isPositive ? 'text-emerald-500' : 'text-rose-500'
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

              {/* Desktop Spotlight & Market Overview Sidebar (4 cols on lg) */}
              <div className="hidden lg:block lg:col-span-4 sticky top-20">
                {featuredSpotlightInst && (
                  <DesktopMarketPanel
                    spotlightInstrument={featuredSpotlightInst}
                    wallet={portfolio?.wallet}
                    onOpenOrder={(inst, type) => handleOpenOrder(inst, type)}
                    onOpenChart={(inst) => handleOpenChart(inst)}
                    onOpenWallet={() => setIsWalletModalOpen(true)}
                  />
                )}
              </div>
            </div>
          );
        })()}

        {/* 2. ORDERS TAB (Zerodha Kite & Upstox Level) */}
        {activeNav === 'orders' && (() => {
          const allOrders = portfolio?.orders || [];
          const executedCount = allOrders.filter((o) => o.status === 'EXECUTED').length;
          const pendingCount = allOrders.filter((o) => o.status === 'PENDING' || o.status === 'OPEN').length;
          const cancelledCount = allOrders.filter((o) => o.status === 'CANCELLED' || o.status === 'REJECTED').length;

          const filteredOrders = allOrders.filter((ord) => {
            if (orderFilterTab === 'EXECUTED' && ord.status !== 'EXECUTED') return false;
            if (orderFilterTab === 'PENDING' && ord.status !== 'PENDING' && ord.status !== 'OPEN') return false;
            if (orderFilterTab === 'CANCELLED' && ord.status !== 'CANCELLED' && ord.status !== 'REJECTED') return false;

            if (orderSideFilter !== 'ALL' && ord.type !== orderSideFilter) return false;

            if (orderSearchQuery.trim()) {
              const q = orderSearchQuery.toLowerCase();
              const matchSymbol = ord.symbol.toLowerCase().includes(q);
              const matchId = ord.id.toLowerCase().includes(q);
              if (!matchSymbol && !matchId) return false;
            }

            return true;
          });

          return (
            <div className="space-y-4 animate-fadeIn">
              {/* Order Book Header */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">Order Book</h2>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-mono font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      LIVE FEED
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Real-time order execution, pending queue, and audit trail
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveNav('watchlist')}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Place New Order</span>
                  </button>
                </div>
              </div>

              {/* Order Status Counters Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => setOrderFilterTab('ALL')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    orderFilterTab === 'ALL'
                      ? 'bg-amber-500/10 border-amber-500/50 shadow-xs'
                      : 'bg-white dark:bg-[#0B111C] border-slate-200 dark:border-[#1A2638] hover:border-slate-300 dark:hover:border-[#2A3B52]'
                  }`}
                >
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold block">Total Orders</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-lg font-black font-mono text-slate-900 dark:text-white">{allOrders.length}</span>
                    <span className="text-[10px] font-mono text-slate-400">All types</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setOrderFilterTab('EXECUTED')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    orderFilterTab === 'EXECUTED'
                      ? 'bg-emerald-500/15 border-emerald-500/50 shadow-xs'
                      : 'bg-white dark:bg-[#0B111C] border-slate-200 dark:border-[#1A2638] hover:border-slate-300 dark:hover:border-[#2A3B52]'
                  }`}
                >
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold block">Executed / Filled</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-lg font-black font-mono text-emerald-600 dark:text-emerald-400">{executedCount}</span>
                    <span className="text-[10px] font-mono text-emerald-600/70 dark:text-emerald-400/70">Completed</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setOrderFilterTab('PENDING')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    orderFilterTab === 'PENDING'
                      ? 'bg-amber-500/15 border-amber-500/50 shadow-xs'
                      : 'bg-white dark:bg-[#0B111C] border-slate-200 dark:border-[#1A2638] hover:border-slate-300 dark:hover:border-[#2A3B52]'
                  }`}
                >
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-semibold block">Open / Pending</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-lg font-black font-mono text-amber-600 dark:text-amber-400">{pendingCount}</span>
                    <span className="text-[10px] font-mono text-amber-600/70 dark:text-amber-400/70">In Queue</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setOrderFilterTab('CANCELLED')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    orderFilterTab === 'CANCELLED'
                      ? 'bg-rose-500/10 border-rose-500/50 shadow-xs'
                      : 'bg-white dark:bg-[#0B111C] border-slate-200 dark:border-[#1A2638] hover:border-slate-300 dark:hover:border-[#2A3B52]'
                  }`}
                >
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold block">Cancelled</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-lg font-black font-mono text-slate-700 dark:text-slate-300">{cancelledCount}</span>
                    <span className="text-[10px] font-mono text-slate-400">Void</span>
                  </div>
                </button>
              </div>

              {/* Filter Tabs & Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-[#1A2638] rounded-2xl shadow-xs">
                {/* Tabs */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {(['ALL', 'EXECUTED', 'PENDING', 'CANCELLED'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setOrderFilterTab(tab)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        orderFilterTab === tab
                          ? 'bg-amber-500 text-slate-950 shadow-xs font-extrabold'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {tab === 'ALL' && `All (${allOrders.length})`}
                      {tab === 'EXECUTED' && `Executed (${executedCount})`}
                      {tab === 'PENDING' && `Open (${pendingCount})`}
                      {tab === 'CANCELLED' && `Cancelled (${cancelledCount})`}
                    </button>
                  ))}
                </div>

                {/* Search & Side Filter */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-56">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={orderSearchQuery}
                      onChange={(e) => setOrderSearchQuery(e.target.value)}
                      placeholder="Search symbol or #ID..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-[#121B2B] border border-slate-200 dark:border-[#1D2B40] text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                    />
                    {orderSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setOrderSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-[#121B2B] rounded-xl border border-slate-200 dark:border-[#1D2B40]">
                    {(['ALL', 'BUY', 'SELL'] as const).map((side) => (
                      <button
                        key={side}
                        type="button"
                        onClick={() => setOrderSideFilter(side)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          orderSideFilter === side
                            ? side === 'BUY'
                              ? 'bg-emerald-500 text-white font-extrabold'
                              : side === 'SELL'
                              ? 'bg-rose-500 text-white font-extrabold'
                              : 'bg-white dark:bg-[#1E2E44] text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {side}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 dark:border-[#1A2638] bg-white dark:bg-[#0B111C] shadow-xs">
                <table className="w-full text-left text-xs font-sans">
                  <thead className="bg-slate-50 dark:bg-[#0E1626] border-b border-slate-200 dark:border-[#1A2638] text-slate-500 dark:text-slate-400 uppercase font-semibold text-[11px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Order ID & Time</th>
                      <th className="py-3 px-4">Instrument</th>
                      <th className="py-3 px-4">Side</th>
                      <th className="py-3 px-4">Product</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4 text-right">Lots / Qty</th>
                      <th className="py-3 px-4 text-right">Price</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#162234]">
                    {filteredOrders.map((ord) => {
                      const inst = instruments.find((i) => i.symbol === ord.symbol);
                      const isBuy = ord.type === 'BUY';
                      const isExecuted = ord.status === 'EXECUTED';
                      const isPending = ord.status === 'PENDING' || ord.status === 'OPEN';
                      const isCancelled = ord.status === 'CANCELLED' || ord.status === 'REJECTED';

                      return (
                        <tr key={ord.id} className="hover:bg-slate-50/75 dark:hover:bg-[#121C2D]/60 transition-colors">
                          <td className="py-3 px-4 font-mono">
                            <button
                              type="button"
                              onClick={() => setSelectedOrderForDetail(ord)}
                              className="font-bold text-slate-900 dark:text-white hover:text-amber-500 text-left flex items-center gap-1 cursor-pointer"
                            >
                              <span>#{ord.id}</span>
                              <FileText className="w-3 h-3 text-slate-400" />
                            </button>
                            <div className="text-[11px] text-slate-400 mt-0.5">{ord.time} · {ord.date}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-extrabold text-slate-900 dark:text-white text-sm">{ord.symbol}</div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {inst?.category || 'COMMODITY'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2.5 py-0.5 rounded text-[10px] font-black tracking-wider ${
                                isBuy
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {ord.type}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#162234] text-slate-600 dark:text-slate-300 font-mono text-[10px] font-bold">
                              {ord.product || 'INTRADAY'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {ord.orderType || 'MARKET'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                            {ord.lots || 1} <span className="text-slate-400 text-[11px]">({ord.qty})</span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                            ₹{ord.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isExecuted && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-md text-[11px] font-bold font-mono">
                                <Check className="w-3 h-3" />
                                <span>EXECUTED</span>
                              </span>
                            )}
                            {isPending && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-md text-[11px] font-bold font-mono">
                                <Clock className="w-3 h-3 animate-spin" />
                                <span>PENDING</span>
                              </span>
                            )}
                            {isCancelled && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-[#1D2B40] border border-slate-300 dark:border-[#2D4566] text-slate-500 dark:text-slate-400 rounded-md text-[11px] font-bold font-mono">
                                <X className="w-3 h-3" />
                                <span>{ord.status}</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {inst && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedChartInstrument(inst)}
                                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-[#162234] hover:bg-slate-200 dark:hover:bg-[#203046] text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
                                  title="View Chart"
                                >
                                  <BarChart2 className="w-3.5 h-3.5 text-amber-500" />
                                </button>
                              )}

                              {isPending && (
                                <button
                                  type="button"
                                  disabled={cancellingOrderId === ord.id}
                                  onClick={() => handleCancelOrder(ord.id)}
                                  className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                                >
                                  {cancellingOrderId === ord.id ? 'Cancelling...' : 'Cancel'}
                                </button>
                              )}

                              {isExecuted && inst && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenOrder(inst, ord.type)}
                                  className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Repeat</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setSelectedOrderForDetail(ord)}
                                className="p-1.5 rounded-lg bg-slate-100 dark:bg-[#162234] hover:bg-slate-200 dark:hover:bg-[#203046] text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
                                title="Order Audit Trail"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards View */}
              <div className="md:hidden space-y-2.5">
                {filteredOrders.map((ord) => {
                  const inst = instruments.find((i) => i.symbol === ord.symbol);
                  const isBuy = ord.type === 'BUY';
                  const isPending = ord.status === 'PENDING' || ord.status === 'OPEN';
                  const isExecuted = ord.status === 'EXECUTED';

                  return (
                    <div
                      key={ord.id}
                      className="p-4 bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-[#1A2638] rounded-2xl shadow-xs space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              isBuy
                                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40'
                                : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40'
                            }`}
                          >
                            {ord.type}
                          </span>
                          <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">{ord.symbol}</h3>
                          <span className="text-[10px] text-slate-400 font-mono">#{ord.id}</span>
                        </div>

                        <div>
                          {isExecuted && (
                            <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded text-[10px] font-bold font-mono">
                              EXECUTED
                            </span>
                          )}
                          {isPending && (
                            <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded text-[10px] font-bold font-mono">
                              PENDING
                            </span>
                          )}
                          {!isExecuted && !isPending && (
                            <span className="px-2 py-0.5 bg-slate-100 dark:bg-[#1D2B40] text-slate-500 rounded text-[10px] font-bold font-mono">
                              {ord.status}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs font-mono py-2 border-y border-slate-100 dark:border-[#162234]">
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase">Price</span>
                          <span className="font-bold text-slate-900 dark:text-white">₹{ord.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase">Lots (Qty)</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{ord.lots || 1} ({ord.qty})</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase">Product</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{ord.product || 'INTRADAY'}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="text-[10px] text-slate-400 font-mono">{ord.time} · {ord.date}</div>

                        <div className="flex items-center gap-2">
                          {inst && (
                            <button
                              type="button"
                              onClick={() => setSelectedChartInstrument(inst)}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#162234] text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1"
                            >
                              <BarChart2 className="w-3 h-3 text-amber-500" />
                              <span>Chart</span>
                            </button>
                          )}

                          {isPending && (
                            <button
                              type="button"
                              disabled={cancellingOrderId === ord.id}
                              onClick={() => handleCancelOrder(ord.id)}
                              className="px-3 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold"
                            >
                              {cancellingOrderId === ord.id ? 'Cancelling...' : 'Cancel'}
                            </button>
                          )}

                          {isExecuted && inst && (
                            <button
                              type="button"
                              onClick={() => handleOpenOrder(inst, ord.type)}
                              className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Repeat</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredOrders.length === 0 && (
                <div className="text-center py-12 px-4 bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-[#1A2638] rounded-2xl shadow-xs">
                  <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-[#162234] flex items-center justify-center mx-auto text-slate-400 mb-3">
                    <FileText className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">No Orders Found</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                    {orderSearchQuery
                      ? 'No orders matching your search query.'
                      : 'You do not have any orders in this view yet.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveNav('watchlist')}
                    className="mt-4 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition-all cursor-pointer shadow-md active:scale-95"
                  >
                    Go to Watchlist & Place Trade
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* 3. PORTFOLIO & POSITIONS TAB (Zerodha Kite & Upstox Level) */}
        {activeNav === 'positions' && (() => {
          return (
            <div className="space-y-4 animate-fadeIn">
              {/* Portfolio Header with Sub-Tabs */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center p-1 bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-[#1A2638] rounded-2xl shadow-xs">
                    <button
                      type="button"
                      onClick={() => setPortfolioSubTab('POSITIONS')}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        portfolioSubTab === 'POSITIONS'
                          ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Positions</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-900/10 dark:bg-black/20 font-mono">
                        {livePositions.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPortfolioSubTab('HOLDINGS')}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        portfolioSubTab === 'HOLDINGS'
                          ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Holdings</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-900/10 dark:bg-black/20 font-mono">
                        {holdingPositions.length}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {livePositions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowExitAllModal(true)}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Exit All Positions</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setActiveNav('watchlist')}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>Trade More</span>
                  </button>
                </div>
              </div>

              {/* 🌟 BIG HIGHLIGHT HERO CARD FOR PROFIT & LOSS (Zerodha Kite Standard) */}
              <div
                className={`rounded-2xl p-5 sm:p-6 border-2 transition-all shadow-xl relative overflow-hidden ${
                  isProfit
                    ? 'bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-white dark:from-[#062417]/95 dark:via-[#081720]/95 dark:to-[#080E18] border-emerald-500/40 shadow-emerald-500/5'
                    : 'bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-white dark:from-[#270D14]/95 dark:via-[#180C16]/95 dark:to-[#080E18] border-rose-500/40 shadow-rose-500/5'
                }`}
              >
                {/* Background Glow Effect */}
                <div
                  className={`absolute -right-12 -top-12 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none ${
                    isProfit ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                />

                <div className="relative z-10">
                  {/* Top Badge & Subtitle */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs sm:text-sm font-bold tracking-wider uppercase text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-amber-500" />
                      <span>Total Unrealized P&L (MTM)</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping ml-1" title="Live 1s Tick Feed" />
                    </span>

                    {/* High-visibility Profit/Loss Badge */}
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase flex items-center gap-1.5 shadow-sm ${
                        isProfit
                          ? 'bg-emerald-500 text-slate-950 border border-emerald-400'
                          : 'bg-rose-500 text-white border border-rose-400'
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
                      className={`text-3xl sm:text-4xl lg:text-5xl font-black font-mono tracking-tight transition-all duration-300 px-3 py-1 rounded-xl ${
                        pnlTickDirection === 'UP'
                          ? 'ring-2 ring-emerald-500 bg-emerald-500/10'
                          : pnlTickDirection === 'DOWN'
                          ? 'ring-2 ring-rose-500 bg-rose-500/10'
                          : ''
                      } ${
                        isProfit
                          ? 'text-emerald-500 dark:text-emerald-400'
                          : 'text-rose-500 dark:text-rose-400'
                      }`}
                    >
                      {isProfit ? '+' : ''}₹{totalUnrealizedPnL.toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                        <span>LIVE 1s FEED</span>
                      </div>
                      {pnlTickDirection === 'UP' && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-mono text-xs font-black animate-bounce">
                          ▲ TICK UP
                        </span>
                      )}
                      {pnlTickDirection === 'DOWN' && (
                        <span className="text-rose-600 dark:text-rose-400 font-mono text-xs font-black animate-bounce">
                          ▼ TICK DOWN
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Secondary Metrics Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3.5 border-t border-slate-200 dark:border-white/10 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium uppercase tracking-wide">
                        Realized P&L
                      </span>
                      <span
                        className={`text-sm font-mono font-black mt-0.5 block ${
                          isTodayProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isTodayProfit ? '+' : ''}₹{todayRealizedPnL.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium uppercase tracking-wide">
                        Net Total P&L
                      </span>
                      <span
                        className={`text-sm font-mono font-black mt-0.5 block ${
                          isNetProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isNetProfit ? '+' : ''}₹{netPnL.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium uppercase tracking-wide">
                        Used Margin
                      </span>
                      <span className="text-sm font-mono font-bold text-slate-900 dark:text-white mt-0.5 block">
                        ₹{(portfolio?.wallet?.usedMargin || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-medium uppercase tracking-wide">
                        Available Balance
                      </span>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-sm font-mono font-bold text-amber-600 dark:text-amber-400">
                          ₹{(portfolio?.wallet?.availableBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsWalletModalOpen(true)}
                          className="text-[10px] text-amber-500 hover:underline font-bold"
                        >
                          + Funds
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Positions Sub-View */}
              {portfolioSubTab === 'POSITIONS' && (
                <div className="space-y-3">
                  {/* Filter Pills */}
                  <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-[#0A101C] rounded-xl border border-slate-200 dark:border-[#1A2638] w-fit shadow-xs">
                    <button
                      type="button"
                      onClick={() => setPositionFilter('ALL')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        positionFilter === 'ALL'
                          ? 'bg-amber-500 text-slate-950 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      All ({livePositions.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPositionFilter('INTRADAY')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        positionFilter === 'INTRADAY'
                          ? 'bg-amber-500 text-slate-950 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Intraday MIS ({intradayPositions.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPositionFilter('HOLDING')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        positionFilter === 'HOLDING'
                          ? 'bg-amber-500 text-slate-950 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Holding CNC ({holdingPositions.length})
                    </button>
                  </div>

                  {/* Individual Positions Cards */}
                  <div className="space-y-3">
                    {displayedPositions.map((pos) => {
                      const isPosProfit = pos.pnl >= 0;
                      const inst = instruments.find((i) => i.symbol === pos.symbol);

                      return (
                        <div
                          key={pos.id}
                          className="p-4 sm:p-5 bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-[#1D2B40] hover:border-slate-300 dark:hover:border-[#2D4566] rounded-2xl transition-all shadow-xs space-y-3"
                        >
                          {/* Row 1: Symbol, Type, Lots & Actions */}
                          <div className="flex items-start justify-between flex-wrap gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                    pos.type === 'BUY'
                                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40'
                                      : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40'
                                  }`}
                                >
                                  {pos.type}
                                </span>
                                <h3 className="font-black text-base sm:text-lg text-slate-900 dark:text-white">
                                  {pos.symbol}
                                </h3>
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#162234] border border-slate-200 dark:border-[#233650] text-[10px] font-mono text-slate-700 dark:text-slate-300 font-bold">
                                  {pos.product || 'INTRADAY'}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-mono font-bold">
                                  {pos.lots || 1} Lot ({pos.qty} Qty)
                                </span>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2">
                              {inst && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenOrder(inst, pos.type)}
                                    className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                    title="Add More Quantity"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add More</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setSelectedChartInstrument(inst)}
                                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#142032] hover:bg-slate-200 dark:hover:bg-[#1E2E44] border border-slate-200 dark:border-[#23354E] text-slate-700 dark:text-slate-300 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                                    title="View Live Chart"
                                  >
                                    <BarChart2 className="w-3.5 h-3.5 text-amber-500" />
                                    <span>Chart</span>
                                  </button>
                                </>
                              )}

                              <button
                                type="button"
                                disabled={closingPositionId === pos.id}
                                onClick={() => handleSquareOffPosition(pos.id, pos.symbol)}
                                className="px-3.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 active:bg-rose-500/35 border border-rose-500/40 text-rose-600 dark:text-rose-300 text-xs font-black transition-all cursor-pointer disabled:opacity-50 shadow-xs flex items-center gap-1"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>{closingPositionId === pos.id ? 'Exiting...' : 'Exit Position'}</span>
                              </button>
                            </div>
                          </div>

                          {/* 🌟 DEDICATED BIG P&L HIGHLIGHT BOX PER POSITION */}
                          <div
                            className={`p-3.5 sm:p-4 rounded-xl border-2 transition-all flex items-center justify-between flex-wrap gap-2 ${
                              isPosProfit
                                ? 'bg-emerald-500/5 dark:bg-gradient-to-r dark:from-emerald-950/70 dark:via-[#0B2117]/80 dark:to-[#0A1813] border-emerald-500/40 shadow-xs'
                                : 'bg-rose-500/5 dark:bg-gradient-to-r dark:from-rose-950/70 dark:via-[#240C12]/80 dark:to-[#180A0E] border-rose-500/40 shadow-xs'
                            }`}
                          >
                            <div>
                              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                {isPosProfit ? (
                                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                                )}
                                <span className="flex items-center gap-1.5">
                                  <span>{isPosProfit ? 'PROFIT' : 'LOSS'} (LIVE MTM)</span>
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                                </span>
                              </span>

                              <div
                                className={`text-2xl sm:text-3xl font-black font-mono tracking-tight mt-0.5 ${
                                  isPosProfit
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-rose-600 dark:text-rose-400'
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
                                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300'
                              }`}
                            >
                              <span>{isPosProfit ? '↗' : '↘'}</span>
                              <span>{isPosProfit ? '+' : ''}{pos.pnlPercent}%</span>
                            </div>
                          </div>

                          {/* Trade Details Bar */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 dark:border-[#162234] text-xs font-mono text-slate-500 dark:text-slate-400">
                            <div>
                              <span className="text-[10px] text-slate-400 block uppercase">Avg Buy/Sell Price</span>
                              <span className="text-slate-800 dark:text-slate-200 font-bold">
                                ₹{pos.avgPrice?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block uppercase">Current LTP</span>
                              <span className="text-slate-900 dark:text-white font-bold flex items-center gap-1">
                                <span>₹{pos.ltp?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block uppercase">Total Exposure</span>
                              <span className="text-slate-800 dark:text-slate-200 font-bold">
                                ₹{(pos.avgPrice * pos.qty).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block uppercase">Position ID</span>
                              <span className="text-slate-500 dark:text-slate-400">#{pos.id}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {displayedPositions.length === 0 && (
                      <div className="text-center py-12 px-4 bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-[#1A2638] rounded-2xl shadow-xs">
                        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-500 mb-3">
                          <BookOpen className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">No Open Positions</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                          You do not have any active positions in this view. Choose an instrument from the Watchlist to place a trade.
                        </p>
                        <button
                          type="button"
                          onClick={() => setActiveNav('watchlist')}
                          className="mt-4 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition-all cursor-pointer shadow-md active:scale-95"
                        >
                          Go to Watchlist
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Holdings Sub-View (Zerodha Kite & Upstox Level Delivery Holdings) */}
              {portfolioSubTab === 'HOLDINGS' && (
                <div className="space-y-4">
                  {/* Holdings Summary Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-[#1A2638] rounded-2xl shadow-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold block">Total Investment</span>
                      <span className="text-base font-black font-mono text-slate-900 dark:text-white mt-1 block">
                        ₹{totalHoldingInvestment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold block">Current Value</span>
                      <span className="text-base font-black font-mono text-slate-900 dark:text-white mt-1 block">
                        ₹{totalHoldingCurrentVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold block">Overall P&L</span>
                      <span
                        className={`text-base font-black font-mono mt-1 block ${
                          isHoldingProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isHoldingProfit ? '+' : ''}₹{totalHoldingPnL.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold block">Total Holdings</span>
                      <span className="text-base font-black font-mono text-slate-700 dark:text-slate-300 mt-1 block">
                        {holdingPositions.length} Assets
                      </span>
                    </div>
                  </div>

                  {/* Holdings Table */}
                  <div className="space-y-3">
                    {holdingPositions.map((h) => {
                      const isHoldingProf = h.pnl >= 0;
                      const inst = instruments.find((i) => i.symbol === h.symbol);

                      return (
                        <div
                          key={h.id}
                          className="p-4 bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-[#1D2B40] rounded-2xl shadow-xs space-y-3"
                        >
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">{h.symbol}</h3>
                                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold font-mono">
                                  CNC HOLDING
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 font-mono mt-0.5">
                                Qty: <span className="font-bold text-slate-800 dark:text-slate-200">{h.qty}</span> • Avg: ₹
                                {h.avgPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </p>
                            </div>

                            <div className="text-right">
                              <span
                                className={`text-base font-black font-mono block ${
                                  isHoldingProf ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {isHoldingProf ? '+' : ''}₹{h.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                              <span className="text-xs font-mono text-slate-400 font-bold">
                                ({isHoldingProf ? '+' : ''}{h.pnlPercent}%)
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-[#162234] text-xs">
                            <span className="text-slate-400 font-mono">LTP: ₹{h.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>

                            <div className="flex items-center gap-2">
                              {inst && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenOrder(inst, 'BUY')}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold text-xs"
                                  >
                                    Buy More
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSelectedChartInstrument(inst)}
                                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#162234] text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1"
                                  >
                                    <BarChart2 className="w-3.5 h-3.5 text-amber-500" />
                                    <span>Chart</span>
                                  </button>
                                </>
                              )}

                              <button
                                type="button"
                                disabled={closingPositionId === h.id}
                                onClick={() => handleSquareOffPosition(h.id, h.symbol)}
                                className="px-3 py-1 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold text-xs"
                              >
                                {closingPositionId === h.id ? 'Selling...' : 'Sell Holding'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {holdingPositions.length === 0 && (
                      <div className="text-center py-12 px-4 bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-[#1A2638] rounded-2xl shadow-xs">
                        <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-[#162234] flex items-center justify-center mx-auto text-slate-400 mb-3">
                          <BookOpen className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">No Holdings Found</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                          You do not have any delivery holdings yet. Buy instruments with CNC product type from the Watchlist.
                        </p>
                        <button
                          type="button"
                          onClick={() => setActiveNav('watchlist')}
                          className="mt-4 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition-all cursor-pointer shadow-md active:scale-95"
                        >
                          Explore Watchlist
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Exit All Confirmation Modal */}
              {showExitAllModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn">
                  <div className="bg-white dark:bg-[#0E1624] border border-rose-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900 dark:text-white">Exit All Open Positions?</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Emergency / Market-wide Square Off</p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      This action will immediately square off all <span className="font-bold text-slate-900 dark:text-white">{livePositions.length} active position(s)</span> at current live market prices. Margin will be released back to your available balance.
                    </p>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0A101C] border border-slate-200 dark:border-[#1A2638] flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-500">Estimated Total Unrealized P&L:</span>
                      <span className={`font-black ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isProfit ? '+' : ''}₹{totalUnrealizedPnL.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowExitAllModal(false)}
                        className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#1A2638] hover:bg-slate-200 dark:hover:bg-[#25364E] text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer"
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        disabled={isExitingAll}
                        onClick={handleExitAllPositions}
                        className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-rose-600/20 active:scale-95"
                      >
                        {isExitingAll && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        <span>{isExitingAll ? 'Square Off in Progress...' : 'Confirm Exit All'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Order Detail & Audit Modal */}
              {selectedOrderForDetail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn">
                  <div className="bg-white dark:bg-[#0E1624] border border-slate-200 dark:border-[#1D2B40] rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            selectedOrderForDetail.type === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40'
                          }`}
                        >
                          {selectedOrderForDetail.type}
                        </span>
                        <h3 className="text-base font-black text-slate-900 dark:text-white">
                          {selectedOrderForDetail.symbol}
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedOrderForDetail(null)}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-[#0A101C] border border-slate-200 dark:border-[#1A2638] rounded-xl text-xs font-mono space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Order Reference</span>
                        <span className="font-bold text-slate-900 dark:text-white">#{selectedOrderForDetail.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Order Status</span>
                        <span className="font-bold text-emerald-500">{selectedOrderForDetail.status}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Product Code</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{selectedOrderForDetail.product || 'INTRADAY MIS'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Filled Lots / Qty</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{selectedOrderForDetail.lots || 1} ({selectedOrderForDetail.qty} Qty)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Execution Price</span>
                        <span className="font-bold text-slate-900 dark:text-white">₹{selectedOrderForDetail.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Order Timestamp</span>
                        <span className="text-slate-500">{selectedOrderForDetail.time} · {selectedOrderForDetail.date}</span>
                      </div>
                    </div>

                    {/* Execution Audit Trail Timeline */}
                    <div className="space-y-2 pt-2">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Execution Audit Trail</span>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>Order received & placed by trader</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>Pre-trade risk & margin validation passed</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>Order routed to Matching Engine</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>Trade execution confirmed & positions updated</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setSelectedOrderForDetail(null)}
                        className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all cursor-pointer"
                      >
                        Close Details
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* 4. HISTORY TAB */}
        {activeNav === 'history' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{t('history')} & Trades</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Complete audit log of executed trades and settlement</p>
              </div>
              <button
                type="button"
                onClick={() => setIsWalletModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Wallet Ledger</span>
              </button>
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 dark:border-[#1A2638] bg-white dark:bg-[#0B111C] shadow-xs">
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-slate-50 dark:bg-[#0E1626] border-b border-slate-200 dark:border-[#1A2638] text-slate-500 dark:text-slate-400 uppercase font-semibold text-[11px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Trade ID & Time</th>
                    <th className="py-3 px-4">Instrument</th>
                    <th className="py-3 px-4">Side</th>
                    <th className="py-3 px-4 text-right">Lots / Qty</th>
                    <th className="py-3 px-4 text-right">Execution Rate</th>
                    <th className="py-3 px-4 text-center">Execution Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#162234]">
                  {portfolio?.orders?.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50/75 dark:hover:bg-[#121C2D]/60 transition-colors">
                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-slate-900 dark:text-white">#{ord.id}</div>
                        <div className="text-[11px] text-slate-400">{ord.time} · {ord.date}</div>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{ord.symbol}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wider ${
                            ord.type === 'BUY'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {ord.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                        {ord.lots || 1} ({ord.qty})
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                        ₹{ord.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-md text-[11px] font-bold font-mono">
                          {ord.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-2.5">
              {portfolio?.orders?.map((ord) => (
                <div
                  key={ord.id}
                  className="p-4 bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-[#1A2638] rounded-xl flex items-center justify-between flex-wrap gap-2 shadow-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          ord.type === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/40'
                        }`}
                      >
                        {ord.type}
                      </span>
                      <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">{ord.symbol}</h3>
                      <span className="text-xs text-slate-400 font-mono">#{ord.id}</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                      Lots: <span className="text-slate-900 dark:text-white font-bold">{ord.lots || 1}</span> ({ord.qty} Qty) • Rate: ₹
                      {ord.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded text-xs font-bold font-mono">
                      {ord.status}
                    </span>
                    <div className="text-[10px] text-slate-400 font-mono mt-1">
                      {ord.time} · {ord.date}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {(!portfolio?.orders || portfolio.orders.length === 0) && (
              <div className="text-center py-12 px-4 bg-white dark:bg-[#0B111C] border border-slate-200 dark:border-[#1A2638] rounded-2xl shadow-xs">
                <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-900 dark:text-white">No Trade History Yet</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Your executed orders and transaction logs will be listed here.
                </p>
              </div>
            )}
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

      {/* Bottom Sticky Navigation Bar matching Screenshot 1 (visible on mobile/tablet, hidden on desktop lg+) */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-white/95 dark:bg-[#080E18]/95 border-t border-slate-200 dark:border-[#1A2638] backdrop-blur-md transition-colors pb-[env(safe-area-inset-bottom,0px)]">
        <div className="max-w-lg mx-auto grid grid-cols-5 py-2 px-2">
          {/* Watchlist */}
          <button
            type="button"
            id="nav-watchlist-btn"
            onClick={() => setActiveNav('watchlist')}
            className={`flex flex-col items-center gap-1 py-1 transition-colors cursor-pointer relative ${
              activeNav === 'watchlist' ? 'text-amber-500' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {activeNav === 'watchlist' && (
              <span className="absolute -top-2 w-8 h-1 bg-amber-500 rounded-full" />
            )}
            <Star className={`w-4 h-4 ${activeNav === 'watchlist' ? 'fill-amber-500' : ''}`} />
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
              activeNav === 'orders' ? 'text-amber-500' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {activeNav === 'orders' && (
              <span className="absolute -top-2 w-8 h-1 bg-amber-500 rounded-full" />
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
              activeNav === 'positions' ? 'text-amber-500' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {activeNav === 'positions' && (
              <span className="absolute -top-2 w-8 h-1 bg-amber-500 rounded-full" />
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
              activeNav === 'history' ? 'text-amber-500' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {activeNav === 'history' && (
              <span className="absolute -top-2 w-8 h-1 bg-amber-500 rounded-full" />
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
              activeNav === 'profile' ? 'text-amber-500' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {activeNav === 'profile' && (
              <span className="absolute -top-2 w-8 h-1 bg-amber-500 rounded-full" />
            )}
            <UserIcon className="w-4 h-4" />
            <span className="text-[9px] sm:text-[10px] font-bold tracking-wider uppercase truncate max-w-[64px]">
              {t('profile')}
            </span>
          </button>
        </div>
      </nav>

      {/* Notifications Modal */}
      <NotificationsModal
        isOpen={isNotificationsOpen}
        notifications={notifications}
        unreadCount={unreadNotificationsCount}
        onClose={() => setIsNotificationsOpen(false)}
        onMarkAllRead={handleMarkAllNotificationsRead}
        onMarkRead={handleMarkNotificationRead}
        onClearAll={handleClearNotifications}
      />

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
          onOrderPlaced={handleOrderPlaced}
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

      {/* Floating Help / Tour Button */}
      {!isTourOpen && (
        <button
          type="button"
          id="quick-tour-floating-help-btn"
          onClick={() => {
            setIsTourOpen(true);
            setTourStep(0);
          }}
          className="fixed bottom-20 lg:bottom-6 right-4 sm:right-6 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-base shadow-xl flex items-center justify-center border border-amber-300 z-30 cursor-pointer transition-transform hover:scale-110 active:scale-95 select-none"
          title="How to use GoldFut Platform - Guided Tour"
          aria-label="Platform Tour & Help"
        >
          ?
        </button>
      )}
    </div>
  );
};
