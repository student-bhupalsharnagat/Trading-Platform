import React, { useState, useEffect } from 'react';
import { Instrument } from '../types.ts';
import { useAuth } from '../hooks/useAuth.ts';
import { useTenant } from '../context/TenantContext.tsx';
import { authApi } from '../services/authApi.ts';
import { OptionChain } from './OptionChain.tsx';
import { MarketClosedModal } from './MarketClosedModal.tsx';
import { TradingViewChart } from './TradingViewChart.tsx';
import { getMarketHoursInfo, MarketHoursInfo } from '../utils/marketHours.ts';
import {
  X,
  TrendingUp,
  TrendingDown,
  BarChart2,
  Zap,
  Target,
  Info,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Maximize2,
  ShieldAlert,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Clock,
  CheckCircle2,
} from 'lucide-react';

interface OrderWindowProps {
  instrument: Instrument;
  initialType?: 'BUY' | 'SELL';
  availableBalance?: number;
  marketClosedOverride?: boolean | null;
  tourStep?: number;
  onClose: () => void;
  onOpenLiveChart?: (instrument: Instrument) => void;
  onOrderPlaced?: (result?: any) => void;
}

export const OrderWindow: React.FC<OrderWindowProps> = ({
  instrument,
  initialType = 'BUY',
  availableBalance,
  marketClosedOverride = null,
  tourStep,
  onClose,
  onOpenLiveChart,
  onOrderPlaced,
}) => {
  const { showToast } = useAuth();
  const { isTradingEnabled, isOptionsEnabled, branding } = useTenant();

  // Active View Tab inside Order Window: 'ORDER' or 'CHART'
  const [activeView, setActiveView] = useState<'ORDER' | 'CHART'>('ORDER');
  const [chartTimeframe, setChartTimeframe] = useState<'1m' | '5m' | '15m' | '30m' | '1h' | '1D'>('15m');

  // Synchronize view during guided tour
  useEffect(() => {
    if (tourStep === 6) {
      setActiveView('CHART');
    } else if (tourStep === 7 || tourStep === 8) {
      setActiveView('ORDER');
    }
  }, [tourStep]);

  // Mode: Intraday (MIS) vs Holding (CNC/NRML)
  const [productType, setProductType] = useState<'INTRADAY' | 'HOLDING'>('INTRADAY');

  // Execution: Market vs Limit vs SL vs SL-M (Zerodha & Upstox standard)
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'SL' | 'SL-M'>('MARKET');
  const [limitPrice, setLimitPrice] = useState<number>(instrument.lastPrice);
  const [triggerPrice, setTriggerPrice] = useState<number>(
    Number((instrument.lastPrice * (initialType === 'BUY' ? 1.005 : 0.995)).toFixed(2))
  );

  // Lot vs Quantity Mode
  const [inputMode, setInputMode] = useState<'LOTS' | 'QTY'>('LOTS');
  const [lots, setLots] = useState<number>(1);
  const [quantity, setQuantity] = useState<number>(instrument.lotSize || 100);

  // Stop Loss & Target Toggle (GTT / Cover Order style)
  const [enableSLTarget, setEnableSLTarget] = useState(false);
  const [stopLossPrice, setStopLossPrice] = useState<string>('');
  const [targetPrice, setTargetPrice] = useState<string>('');
  const [trailingSL, setTrailingSL] = useState<string>('');

  // Validity
  const [validity, setValidity] = useState<'DAY' | 'IOC'>('DAY');

  // Market Depth Drawer
  const [showMarketDepth, setShowMarketDepth] = useState(false);

  // Option Chain modal state
  const [showOptionChain, setShowOptionChain] = useState(false);

  // Market Closed modal state
  const [showMarketClosedModal, setShowMarketClosedModal] = useState(false);
  const [marketHoursInfo, setMarketHoursInfo] = useState<MarketHoursInfo | undefined>(undefined);

  // Execution state
  const [submitting, setSubmitting] = useState(false);

  // Dynamic calculations
  const effectiveLots = inputMode === 'LOTS' ? lots : Math.max(1, Math.round(quantity / (instrument.lotSize || 1)));
  const currentPrice =
    orderType === 'MARKET' || orderType === 'SL-M' ? instrument.lastPrice : limitPrice;

  // Margin calculation matching Indian discount brokers (Zerodha/Upstox)
  const intradayMarginPerLot = instrument.intraday || Math.round(instrument.lastPrice * 0.2);
  const holdingMarginPerLot = instrument.holding || Math.round(instrument.lastPrice * 1.67);

  const totalIntradayMargin = intradayMarginPerLot * effectiveLots;
  const totalHoldingMargin = holdingMarginPerLot * effectiveLots;
  const selectedMargin = productType === 'INTRADAY' ? totalIntradayMargin : totalHoldingMargin;

  const isMarginShortfall = availableBalance !== undefined && availableBalance < selectedMargin;
  const marginShortfallAmount = isMarginShortfall ? selectedMargin - availableBalance : 0;

  const askPrice = instrument.ask || Number((instrument.lastPrice + 0.63).toFixed(2));
  const bidPrice = instrument.bid || Number((instrument.lastPrice - 2.49).toFixed(2));

  // Synthesize 5-level Market Depth (Bid/Ask ladder) around current market spread
  const marketDepth = React.useMemo(() => {
    const spread = Math.max(0.05, Number((instrument.lastPrice * 0.0003).toFixed(2)));
    const bids = [
      { orders: 42, qty: (instrument.lotSize || 1) * 35, price: Number((instrument.lastPrice - spread * 1).toFixed(2)) },
      { orders: 28, qty: (instrument.lotSize || 1) * 20, price: Number((instrument.lastPrice - spread * 2).toFixed(2)) },
      { orders: 19, qty: (instrument.lotSize || 1) * 15, price: Number((instrument.lastPrice - spread * 3).toFixed(2)) },
      { orders: 14, qty: (instrument.lotSize || 1) * 10, price: Number((instrument.lastPrice - spread * 4).toFixed(2)) },
      { orders: 9, qty: (instrument.lotSize || 1) * 8, price: Number((instrument.lastPrice - spread * 5).toFixed(2)) },
    ];
    const asks = [
      { price: Number((instrument.lastPrice + spread * 1).toFixed(2)), qty: (instrument.lotSize || 1) * 30, orders: 38 },
      { price: Number((instrument.lastPrice + spread * 2).toFixed(2)), qty: (instrument.lotSize || 1) * 25, orders: 24 },
      { price: Number((instrument.lastPrice + spread * 3).toFixed(2)), qty: (instrument.lotSize || 1) * 18, orders: 16 },
      { price: Number((instrument.lastPrice + spread * 4).toFixed(2)), qty: (instrument.lotSize || 1) * 12, orders: 11 },
      { price: Number((instrument.lastPrice + spread * 5).toFixed(2)), qty: (instrument.lotSize || 1) * 7, orders: 6 },
    ];
    const totalBuyQty = bids.reduce((acc, b) => acc + b.qty, 0);
    const totalSellQty = asks.reduce((acc, a) => acc + a.qty, 0);
    const totalVolume = totalBuyQty + totalSellQty;
    const buyPercentage = totalVolume > 0 ? Math.round((totalBuyQty / totalVolume) * 100) : 50;

    return { bids, asks, totalBuyQty, totalSellQty, buyPercentage };
  }, [instrument.lastPrice, instrument.lotSize]);

  const handleLotChange = (newLots: number) => {
    const clamped = Math.min(Math.max(1, newLots), instrument.maxLots || 1000);
    setLots(clamped);
    setQuantity(clamped * (instrument.lotSize || 1));
  };

  const handleQtyChange = (newQty: number) => {
    const clamped = Math.max(1, newQty);
    setQuantity(clamped);
    setLots(Math.max(1, Math.round(clamped / (instrument.lotSize || 1))));
  };

  const toggleInputMode = () => {
    if (inputMode === 'LOTS') {
      setInputMode('QTY');
      setQuantity(lots * (instrument.lotSize || 1));
    } else {
      setInputMode('LOTS');
      setLots(Math.max(1, Math.round(quantity / (instrument.lotSize || 1))));
    }
  };

  const handleExecuteOrder = async (actionType: 'BUY' | 'SELL') => {
    const hoursInfo = getMarketHoursInfo(instrument.category, marketClosedOverride);
    if (!hoursInfo.isOpen) {
      setMarketHoursInfo(hoursInfo);
      setShowMarketClosedModal(true);
      return;
    }

    setSubmitting(true);

    try {
      const isPending = orderType === 'LIMIT' || orderType === 'SL' || orderType === 'SL-M';
      const orderPrice = orderType === 'MARKET' || orderType === 'SL-M' ? instrument.lastPrice : limitPrice;
      const orderTrigger = orderType === 'SL' || orderType === 'SL-M' ? triggerPrice : undefined;

      const payload = {
        symbol: instrument.symbol,
        type: actionType,
        orderType,
        product: productType,
        lots: effectiveLots,
        quantity: inputMode === 'QTY' ? quantity : effectiveLots * (instrument.lotSize || 1),
        price: orderPrice,
        limitPrice: orderType === 'LIMIT' || orderType === 'SL' ? limitPrice : undefined,
        triggerPrice: orderTrigger,
        stopLoss: enableSLTarget && stopLossPrice ? Number(stopLossPrice) : undefined,
        target: enableSLTarget && targetPrice ? Number(targetPrice) : undefined,
        timeInForce: validity,
      };

      const res = await authApi.placeOrder(payload);

      showToast({
        type: 'success',
        title: isPending ? `📋 ${orderType} Order Placed` : `✅ ${actionType === 'BUY' ? 'BUY ASK' : 'SELL BID'} Executed!`,
        description: isPending
          ? `Placed ${orderType} order for ${effectiveLots} lot(s) (${effectiveLots * (instrument.lotSize || 1)} Qty) of ${instrument.symbol}${orderTrigger ? ` with trigger ₹${orderTrigger}` : ''}.`
          : `Successfully executed ${actionType} for ${effectiveLots} lot(s) (${effectiveLots * (instrument.lotSize || 1)} Qty) of ${instrument.symbol} at ₹${orderPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`,
        duration: 4500,
      });

      if (onOrderPlaced) onOrderPlaced(res);
      onClose();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Order Rejected',
        description: err.message || 'Failed to place order.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fadeIn">
        <div
          className={`bg-white dark:bg-[#080E18] border border-slate-200 dark:border-[#1A2638] rounded-2xl w-full shadow-2xl overflow-hidden flex flex-col my-auto transition-all ${
            activeView === 'CHART' ? 'max-w-4xl' : 'max-w-xl'
          }`}
        >
          {/* Top Header */}
          <div id="tour-target-instrument-header" className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#141E2E] bg-slate-50/80 dark:bg-[#080E18]">
            <div className="flex items-start justify-between">
              {/* Title & Price Info */}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {instrument.symbol}
                  </h2>
                  <span className="px-1.5 py-0.5 rounded-sm border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-[#EAB308] text-[9px] font-black tracking-wider uppercase font-mono">
                    {instrument.category || 'EQUITY'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-sm bg-[#F97316] text-[#060B13] text-[9px] font-black tracking-tight font-mono">
                    {instrument.expiry || 'NSE'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-600 dark:text-slate-300 flex-wrap">
                  <span className="text-slate-500 dark:text-slate-400">{instrument.name || instrument.symbol}</span>
                  <span className="text-slate-400 dark:text-slate-500">•</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    LTP <span className="font-mono font-bold text-slate-900 dark:text-white">₹{instrument.lastPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </span>
                  <span
                    className={`font-mono font-bold flex items-center gap-0.5 text-xs ${
                      instrument.change >= 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
                    }`}
                  >
                    {instrument.change >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    <span>{instrument.change >= 0 ? '+' : ''}{instrument.change.toFixed(2)}</span>
                    <span>({instrument.change >= 0 ? '+' : ''}{instrument.changePercent.toFixed(2)}%)</span>
                  </span>
                </div>
              </div>

              {/* Action Buttons: Chart Toggle + Close */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveView(activeView === 'ORDER' ? 'CHART' : 'ORDER')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeView === 'CHART'
                      ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#142032] dark:hover:bg-slate-800 border-slate-200 dark:border-[#223652] text-slate-700 dark:text-slate-200'
                  }`}
                  title="Toggle Live Chart"
                >
                  <BarChart2 className="w-4 h-4" />
                  <span className="hidden sm:inline">{activeView === 'CHART' ? 'Order' : 'Chart'}</span>
                </button>

                {onOpenLiveChart && (
                  <button
                    type="button"
                    onClick={() => onOpenLiveChart(instrument)}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#142032] dark:hover:bg-slate-800 border border-slate-200 dark:border-[#223652] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                    title="Open Fullscreen Chart"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#142032] dark:hover:bg-slate-800 border border-slate-200 dark:border-[#223652] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sub-row: Option Chain & Market Depth & Bid/Ask indicators */}
            <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowMarketDepth((prev) => !prev)}
                  className={`px-3 py-1 rounded-md border text-xs font-bold tracking-wide transition-colors flex items-center gap-1.5 cursor-pointer ${
                    showMarketDepth
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-slate-300 dark:border-slate-700 bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title="View 5-Level Bid/Ask Market Depth"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Market Depth (L2)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!isOptionsEnabled) {
                      showToast({
                        type: 'warning',
                        title: 'Options Trading Disabled',
                        description: `Derivatives/Options trading is disabled on ${branding.brandName} desk by central policy.`,
                      });
                      return;
                    }
                    setShowOptionChain(true);
                  }}
                  className={`px-3 py-1 rounded-md border text-xs font-bold tracking-wide transition-colors flex items-center gap-1.5 cursor-pointer ${
                    isOptionsEnabled
                      ? 'border-amber-500/70 bg-transparent text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
                      : 'border-slate-700/60 bg-slate-800/40 text-slate-500 hover:text-slate-400'
                  }`}
                  title={!isOptionsEnabled ? 'Options trading is disabled for this tenant' : 'View Option Chain'}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Option Chain</span>
                </button>
              </div>

              <div className="flex items-center gap-2 font-mono text-xs font-bold">
                <div className="px-2 py-0.5 bg-emerald-50 dark:bg-[#061B16] border border-[#10B981] text-[#10B981] rounded-md flex items-center gap-1">
                  <span>ASK</span>
                  <span>{askPrice.toFixed(2)}</span>
                </div>
                <div className="px-2 py-0.5 bg-rose-50 dark:bg-[#200E14] border border-[#EF4444] text-[#EF4444] rounded-md flex items-center gap-1">
                  <span>BID</span>
                  <span>{bidPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 5-Level Market Depth Drawer (Zerodha/Upstox Style) */}
          {showMarketDepth && (
            <div className="p-3.5 bg-slate-100 dark:bg-[#060A12] border-b border-slate-200 dark:border-[#141E2E] animate-fadeIn">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                <span>5-Level Market Depth (Bid / Ask Ladder)</span>
                <span className="font-mono text-emerald-400">Total Buy: {marketDepth.totalBuyQty} ({marketDepth.buyPercentage}%)</span>
              </div>

              {/* Total Buy vs Total Sell Progress Bar */}
              <div className="w-full h-1.5 rounded-full overflow-hidden bg-rose-500/40 mb-3 flex">
                <div style={{ width: `${marketDepth.buyPercentage}%` }} className="h-full bg-emerald-500 transition-all duration-300" />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                {/* Bids Table */}
                <div className="bg-white dark:bg-[#080E18] rounded-lg border border-slate-200 dark:border-slate-800 p-2">
                  <div className="grid grid-cols-3 text-[10px] text-slate-400 uppercase font-semibold pb-1 border-b border-slate-200 dark:border-slate-800">
                    <span>Bid Price</span>
                    <span className="text-center">Orders</span>
                    <span className="text-right">Qty</span>
                  </div>
                  <div className="space-y-1 pt-1 text-[11px]">
                    {marketDepth.bids.map((b, i) => (
                      <div key={i} className="grid grid-cols-3 text-emerald-500 font-semibold">
                        <span>₹{b.price.toFixed(2)}</span>
                        <span className="text-center text-slate-400">{b.orders}</span>
                        <span className="text-right text-slate-300">{b.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Asks Table */}
                <div className="bg-white dark:bg-[#080E18] rounded-lg border border-slate-200 dark:border-slate-800 p-2">
                  <div className="grid grid-cols-3 text-[10px] text-slate-400 uppercase font-semibold pb-1 border-b border-slate-200 dark:border-slate-800">
                    <span>Ask Price</span>
                    <span className="text-center">Orders</span>
                    <span className="text-right">Qty</span>
                  </div>
                  <div className="space-y-1 pt-1 text-[11px]">
                    {marketDepth.asks.map((a, i) => (
                      <div key={i} className="grid grid-cols-3 text-rose-400 font-semibold">
                        <span>₹{a.price.toFixed(2)}</span>
                        <span className="text-center text-slate-400">{a.orders}</span>
                        <span className="text-right text-slate-300">{a.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* OHLC & Circuit Statistics */}
              <div className="grid grid-cols-4 gap-2 mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-[10px]">
                <div className="text-slate-400">Open: <span className="font-mono text-slate-200 font-bold">₹{instrument.openPrice || instrument.lastPrice}</span></div>
                <div className="text-slate-400">High: <span className="font-mono text-slate-200 font-bold">₹{instrument.highPrice || (instrument.lastPrice * 1.01).toFixed(2)}</span></div>
                <div className="text-slate-400">Low: <span className="font-mono text-slate-200 font-bold">₹{instrument.lowPrice || (instrument.lastPrice * 0.99).toFixed(2)}</span></div>
                <div className="text-slate-400">Close: <span className="font-mono text-slate-200 font-bold">₹{instrument.prevClose || instrument.lastPrice}</span></div>
              </div>
            </div>
          )}

          {/* Body: Either Live TradingView Chart or Order Configuration Form */}
          {activeView === 'CHART' ? (
            <div id="tour-target-price-chart" className="flex flex-col bg-[#060B13]">
              <div className="bg-[#080E18] border-b border-[#121B2B] px-3 py-1.5 flex items-center justify-between overflow-x-auto no-scrollbar">
                <div className="flex items-center gap-1">
                  {(['1m', '5m', '15m', '30m', '1h', '1D'] as const).map((tf) => (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setChartTimeframe(tf)}
                      className={`px-2 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                        chartTimeframe === tf
                          ? 'bg-[#EAB308] text-slate-950 shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  TradingView Live Feed
                </span>
              </div>
              <div className="w-full h-[52vh] min-h-[380px] bg-[#060B13] p-1">
                <TradingViewChart instrument={instrument} timeframe={chartTimeframe} />
              </div>
            </div>
          ) : (
            <div id="tour-target-order-builder" className="p-4 sm:p-5 space-y-4 max-h-[65vh] overflow-y-auto custom-scrollbar bg-white dark:bg-[#080E18]">
              {/* Product Type Cards: MIS (Intraday) vs CNC/NRML (Holding) */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setProductType('INTRADAY')}
                  className={`p-3.5 rounded-xl border text-center transition-all cursor-pointer ${
                    productType === 'INTRADAY'
                      ? 'bg-amber-50 dark:bg-[#1C150A] border-amber-500 shadow-md shadow-amber-500/10 dark:shadow-amber-950/30'
                      : 'bg-slate-50 dark:bg-[#0B111C] border-slate-200 dark:border-[#182334] text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-700'
                  }`}
                >
                  <div className={`text-xs font-bold ${productType === 'INTRADAY' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                    MIS (Intraday)
                  </div>
                  <div className="text-base sm:text-lg font-black font-mono text-amber-600 dark:text-amber-400 mt-0.5">
                    ₹{totalIntradayMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">5x Leverage</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProductType('HOLDING')}
                  className={`p-3.5 rounded-xl border text-center transition-all cursor-pointer ${
                    productType === 'HOLDING'
                      ? 'bg-amber-50 dark:bg-[#1C150A] border-amber-500 shadow-md shadow-amber-500/10 dark:shadow-amber-950/30'
                      : 'bg-slate-50 dark:bg-[#0B111C] border-slate-200 dark:border-[#182334] text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-700'
                  }`}
                >
                  <div className={`text-xs font-bold ${productType === 'HOLDING' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                    {instrument.category === 'EQUITY' ? 'CNC (Delivery)' : 'NRML (Overnight)'}
                  </div>
                  <div className="text-base sm:text-lg font-black font-mono text-slate-800 dark:text-slate-300 mt-0.5">
                    ₹{totalHoldingMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Full Margin</span>
                </button>
              </div>

              {/* 4-Item Configuration Row */}
              <div className="grid grid-cols-4 gap-2 items-center">
                <div className="p-2.5 bg-slate-50 dark:bg-[#0B111C] border border-slate-200 dark:border-[#182334] rounded-xl text-left">
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider block">MAX LOTS</span>
                  <span className="text-xs sm:text-sm font-mono font-black text-slate-800 dark:text-slate-200 mt-0.5 block">
                    {instrument.maxLots || 1000}
                  </span>
                </div>

                <div className="p-2 bg-slate-50 dark:bg-[#0B111C] border border-slate-300 dark:border-slate-700 rounded-xl text-left">
                  <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 tracking-wider block">
                    {inputMode === 'LOTS' ? 'ORDER LOTS' : 'ORDER QTY'}
                  </span>
                  {inputMode === 'LOTS' ? (
                    <input
                      type="number"
                      min={1}
                      max={instrument.maxLots || 1000}
                      value={lots}
                      onChange={(e) => handleLotChange(parseInt(e.target.value) || 1)}
                      className="w-full bg-transparent font-mono font-black text-xs sm:text-sm text-slate-900 dark:text-white outline-none mt-0.5"
                    />
                  ) : (
                    <input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => handleQtyChange(parseInt(e.target.value) || 1)}
                      className="w-full bg-transparent font-mono font-black text-xs sm:text-sm text-slate-900 dark:text-white outline-none mt-0.5"
                    />
                  )}
                </div>

                <div className="p-2.5 bg-slate-50 dark:bg-[#0B111C] border border-slate-200 dark:border-[#182334] rounded-xl text-left">
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider block">LOT SIZE</span>
                  <span className="text-xs sm:text-sm font-mono font-black text-slate-800 dark:text-slate-200 mt-0.5 block">
                    {instrument.lotSize || 1}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={toggleInputMode}
                  className="h-full min-h-[48px] py-2 px-1 bg-amber-500/10 hover:bg-amber-500/20 dark:bg-[#121008] dark:hover:bg-[#1C180A] border border-amber-500/80 rounded-xl text-amber-600 dark:text-amber-400 text-[10px] sm:text-xs font-bold tracking-wide transition-colors cursor-pointer text-center flex items-center justify-center"
                >
                  {inputMode === 'LOTS' ? 'Switch to Qty' : 'Switch to Lots'}
                </button>
              </div>

              {/* Price & Lots Stepper Row */}
              <div className="p-3 bg-slate-50 dark:bg-[#0B111C] border border-slate-200 dark:border-[#182334] rounded-xl flex items-center justify-between">
                <div>
                  {orderType === 'MARKET' ? (
                    <>
                      <div className="text-sm font-black text-slate-900 dark:text-white tracking-wide">Market (LTP)</div>
                      <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider">EXECUTES INSTANTLY</div>
                    </>
                  ) : orderType === 'SL-M' ? (
                    <>
                      <div className="text-sm font-black text-slate-900 dark:text-white tracking-wide">Market on Trigger</div>
                      <div className="text-[10px] font-bold text-amber-500 tracking-wider">SL-MARKET</div>
                    </>
                  ) : (
                    <>
                      <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 tracking-wider">LIMIT PRICE (₹)</div>
                      <input
                        type="number"
                        step="0.05"
                        value={limitPrice}
                        onChange={(e) => setLimitPrice(parseFloat(e.target.value) || instrument.lastPrice)}
                        className="font-mono font-black text-sm text-slate-900 dark:text-white bg-transparent outline-none w-32 border-b border-amber-500/50"
                      />
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleLotChange(lots - 1)}
                    className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-[#142032] hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-bold text-sm flex items-center justify-center transition-colors cursor-pointer"
                  >
                    -
                  </button>
                  <div className="text-center font-mono font-bold text-xs text-slate-700 dark:text-slate-200 px-1 min-w-[50px]">
                    {effectiveLots} {effectiveLots === 1 ? 'LOT' : 'LOTS'}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLotChange(lots + 1)}
                    className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-[#142032] hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-bold text-sm flex items-center justify-center transition-colors cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Order Types 4-Way Tab (Zerodha Kite & Upstox: Market, Limit, SL, SL-M) */}
              <div className="grid grid-cols-4 gap-1.5 bg-slate-100 dark:bg-[#060A12] p-1 rounded-xl border border-slate-200 dark:border-[#141E2E]">
                <button
                  type="button"
                  onClick={() => setOrderType('MARKET')}
                  className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    orderType === 'MARKET'
                      ? 'bg-amber-500/15 border-b-2 border-amber-500 text-amber-600 dark:text-amber-400 font-black shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Zap className="w-3 h-3 text-amber-500" /> Market
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('LIMIT')}
                  className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    orderType === 'LIMIT'
                      ? 'bg-amber-500/15 border-b-2 border-amber-500 text-amber-600 dark:text-amber-400 font-black shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Target className="w-3 h-3" /> Limit
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('SL')}
                  className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    orderType === 'SL'
                      ? 'bg-amber-500/15 border-b-2 border-amber-500 text-amber-600 dark:text-amber-400 font-black shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  SL (Limit)
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('SL-M')}
                  className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    orderType === 'SL-M'
                      ? 'bg-amber-500/15 border-b-2 border-amber-500 text-amber-600 dark:text-amber-400 font-black shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  SL-M
                </button>
              </div>

              {/* Trigger Price Field when SL or SL-M is active */}
              {(orderType === 'SL' || orderType === 'SL-M') && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1.5 animate-fadeIn">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-500">Trigger Price (₹)</span>
                    <span className="text-[10px] text-slate-400">Order activates once LTP crosses trigger</span>
                  </div>
                  <input
                    type="number"
                    step="0.05"
                    value={triggerPrice}
                    onChange={(e) => setTriggerPrice(parseFloat(e.target.value) || instrument.lastPrice)}
                    className="w-full bg-white dark:bg-[#080E18] border border-amber-500/50 rounded-lg px-3 py-1.5 font-mono font-bold text-sm text-slate-900 dark:text-white outline-none focus:border-amber-400"
                  />
                </div>
              )}

              {/* Validity & Time In Force (DAY / IOC) */}
              <div className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-[#0B111C] border border-slate-200 dark:border-[#182334] rounded-xl text-xs">
                <span className="font-bold text-slate-500 dark:text-slate-400">Order Validity:</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setValidity('DAY')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                      validity === 'DAY'
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    DAY
                  </button>
                  <button
                    type="button"
                    onClick={() => setValidity('IOC')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                      validity === 'IOC'
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    IOC (Immediate/Cancel)
                  </button>
                </div>
              </div>

              {/* Set Stop Loss / Target Toggle (Cover Order / GTT) */}
              <div className="p-3.5 bg-slate-50 dark:bg-[#0B111C] border border-slate-200 dark:border-[#182334] rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="sl-target-toggle" className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                    Set Stop Loss & Target (GTT OCO)
                  </label>
                  <button
                    id="sl-target-toggle"
                    type="button"
                    role="switch"
                    aria-checked={enableSLTarget}
                    onClick={() => setEnableSLTarget(!enableSLTarget)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      enableSLTarget ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                        enableSLTarget ? 'left-6' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                {enableSLTarget && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-[#141E2E] animate-fadeIn">
                    <div>
                      <label className="text-[10px] font-bold text-rose-500 dark:text-rose-400 block mb-1">
                        Stop Loss Price
                      </label>
                      <input
                        type="number"
                        placeholder={`e.g. ${(instrument.lastPrice * 0.98).toFixed(2)}`}
                        value={stopLossPrice}
                        onChange={(e) => setStopLossPrice(e.target.value)}
                        className="w-full bg-white dark:bg-[#080E18] border border-slate-300 dark:border-[#1E2E44] rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block mb-1">
                        Target Price
                      </label>
                      <input
                        type="number"
                        placeholder={`e.g. ${(instrument.lastPrice * 1.04).toFixed(2)}`}
                        value={targetPrice}
                        onChange={(e) => setTargetPrice(e.target.value)}
                        className="w-full bg-white dark:bg-[#080E18] border border-slate-300 dark:border-[#1E2E44] rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="text-[10px] font-bold text-amber-600 dark:text-amber-400 block mb-1">
                        Trailing SL (Pts)
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 50.00"
                        value={trailingSL}
                        onChange={(e) => setTrailingSL(e.target.value)}
                        className="w-full bg-white dark:bg-[#080E18] border border-slate-300 dark:border-[#1E2E44] rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Margin & Funds Status Bar (Zerodha/Upstox Style) */}
          <div className="px-4 py-2.5 bg-slate-100 dark:bg-[#060A12] border-t border-slate-200 dark:border-[#141E2E] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400">Margin Required:</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                ₹{selectedMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {availableBalance !== undefined && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 dark:text-slate-400">Available:</span>
                <span className={`font-mono font-bold ${isMarginShortfall ? 'text-rose-500' : 'text-emerald-500'}`}>
                  ₹{availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          {/* Shortfall Alert if applicable */}
          {isMarginShortfall && (
            <div className="px-4 py-1.5 bg-rose-500/10 border-t border-rose-500/30 text-rose-500 dark:text-rose-400 text-xs flex items-center justify-between font-medium">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Margin shortfall: ₹{marginShortfallAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <span className="text-[10px] underline font-bold cursor-pointer">Add Funds</span>
            </div>
          )}

          {/* Trading Disabled Notification if Central Policy blocks it */}
          {!isTradingEnabled && (
            <div className="px-4 py-2.5 bg-rose-950/80 border-t border-rose-800 text-rose-200 text-xs flex items-center justify-center gap-2 font-medium">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Trading is suspended on {branding.brandName} desk by Central Risk.</span>
            </div>
          )}

          {/* Bottom Dual Action Buttons (Flush Split) */}
          <div id="tour-target-action-buttons" className="grid grid-cols-2 border-t border-[#141E2E]">
            {/* SELL BID Button */}
            <button
              type="button"
              id="order-window-sell-btn"
              disabled={submitting || !isTradingEnabled}
              onClick={() => handleExecuteOrder('SELL')}
              className="py-3 px-4 bg-[#EF4444] hover:bg-[#DC2626] active:bg-[#B91C1C] text-white font-black text-xs sm:text-sm flex flex-col items-center justify-center transition-all cursor-pointer shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              title={!isTradingEnabled ? 'Trading suspended by central risk' : 'Place Sell Order'}
            >
              <div className="flex items-center gap-1.5">
                <ArrowDownRight className="w-4 h-4 stroke-[3]" />
                <span>SELL BID (₹{bidPrice.toFixed(2)})</span>
              </div>
              <span className="text-[11px] font-mono font-medium opacity-90 mt-0.5">
                {orderType === 'MARKET' ? 'Market Order' : `${orderType} @ ₹${currentPrice.toFixed(2)}`}
              </span>
            </button>

            {/* BUY ASK Button */}
            <button
              type="button"
              id="order-window-buy-btn"
              disabled={submitting || !isTradingEnabled}
              onClick={() => handleExecuteOrder('BUY')}
              className="py-3 px-4 bg-[#10B981] hover:bg-[#059669] active:bg-[#047857] text-white font-black text-xs sm:text-sm flex flex-col items-center justify-center transition-all cursor-pointer shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              title={!isTradingEnabled ? 'Trading suspended by central risk' : 'Place Buy Order'}
            >
              <div className="flex items-center gap-1.5">
                <ArrowUpRight className="w-4 h-4 stroke-[3]" />
                <span>BUY ASK (₹{askPrice.toFixed(2)})</span>
              </div>
              <span className="text-[11px] font-mono font-medium opacity-90 mt-0.5">
                {orderType === 'MARKET' ? 'Market Order' : `${orderType} @ ₹${currentPrice.toFixed(2)}`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Option Chain Modal */}
      {showOptionChain && (
        <OptionChain
          instrument={instrument}
          onClose={() => setShowOptionChain(false)}
          onSelectOption={(optSymbol, strike, type, price) => {
            setShowOptionChain(false);
            showToast({
              type: 'info',
              title: `${optSymbol} Selected`,
              description: `Loaded strike ₹${strike} ${type} at LTP ₹${price.toFixed(2)}`,
            });
          }}
        />
      )}

      {/* Market Closed Modal */}
      {showMarketClosedModal && (
        <MarketClosedModal
          isOpen={showMarketClosedModal}
          onClose={() => setShowMarketClosedModal(false)}
          info={marketHoursInfo}
        />
      )}
    </>
  );
};
