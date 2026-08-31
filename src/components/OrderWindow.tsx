import React, { useState } from 'react';
import { Instrument } from '../types.ts';
import { useAuth } from '../hooks/useAuth.ts';
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
} from 'lucide-react';

interface OrderWindowProps {
  instrument: Instrument;
  initialType?: 'BUY' | 'SELL';
  marketClosedOverride?: boolean | null;
  onClose: () => void;
  onOpenLiveChart?: (instrument: Instrument) => void;
  onOrderPlaced?: () => void;
}

export const OrderWindow: React.FC<OrderWindowProps> = ({
  instrument,
  initialType = 'BUY',
  marketClosedOverride = null,
  onClose,
  onOpenLiveChart,
  onOrderPlaced,
}) => {
  const { showToast } = useAuth();

  // Active View Tab inside Order Window: 'ORDER' or 'CHART'
  const [activeView, setActiveView] = useState<'ORDER' | 'CHART'>('ORDER');
  const [chartTimeframe, setChartTimeframe] = useState<'1m' | '5m' | '15m' | '30m' | '1h' | '1D'>('15m');

  // Mode: Intraday (MIS) vs Holding (CNC/NRML)
  const [productType, setProductType] = useState<'INTRADAY' | 'HOLDING'>('INTRADAY');

  // Execution: Market vs Limit
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [limitPrice, setLimitPrice] = useState<number>(instrument.lastPrice);

  // Lot vs Quantity Mode
  const [inputMode, setInputMode] = useState<'LOTS' | 'QTY'>('LOTS');
  const [lots, setLots] = useState<number>(1);
  const [quantity, setQuantity] = useState<number>(instrument.lotSize || 100);

  // Stop Loss & Target Toggle
  const [enableSLTarget, setEnableSLTarget] = useState(false);
  const [stopLossPrice, setStopLossPrice] = useState<string>('');
  const [targetPrice, setTargetPrice] = useState<string>('');
  const [trailingSL, setTrailingSL] = useState<string>('');

  // Option Chain modal state
  const [showOptionChain, setShowOptionChain] = useState(false);

  // Market Closed modal state
  const [showMarketClosedModal, setShowMarketClosedModal] = useState(false);
  const [marketHoursInfo, setMarketHoursInfo] = useState<MarketHoursInfo | undefined>(undefined);

  // Execution state
  const [submitting, setSubmitting] = useState(false);

  // Dynamic calculations
  const effectiveLots = inputMode === 'LOTS' ? lots : Math.max(1, Math.round(quantity / (instrument.lotSize || 1)));
  const currentPrice = orderType === 'LIMIT' ? limitPrice : instrument.lastPrice;
  const isPositive = instrument.change >= 0;

  // Margin calculation matching screenshot
  const intradayMarginPerLot = instrument.intraday || Math.round(instrument.lastPrice * 0.2);
  const holdingMarginPerLot = instrument.holding || Math.round(instrument.lastPrice * 1.67);

  const totalIntradayMargin = intradayMarginPerLot * effectiveLots;
  const totalHoldingMargin = holdingMarginPerLot * effectiveLots;
  const selectedMargin = productType === 'INTRADAY' ? totalIntradayMargin : totalHoldingMargin;

  const askPrice = instrument.ask || Number((instrument.lastPrice + 0.63).toFixed(2));
  const bidPrice = instrument.bid || Number((instrument.lastPrice - 2.49).toFixed(2));

  const handleLotChange = (newLots: number) => {
    const clamped = Math.min(Math.max(1, newLots), instrument.maxLots || 50);
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
      const payload = {
        symbol: instrument.symbol,
        type: actionType,
        orderType,
        product: productType,
        lots: effectiveLots,
        limitPrice: orderType === 'LIMIT' ? limitPrice : undefined,
        stopLoss: enableSLTarget && stopLossPrice ? Number(stopLossPrice) : undefined,
        target: enableSLTarget && targetPrice ? Number(targetPrice) : undefined,
      };

      await authApi.placeOrder(payload);

      showToast({
        type: 'success',
        title: `${actionType} Order Executed`,
        description: `${actionType} ${effectiveLots} lot(s) of ${instrument.symbol} at ₹${currentPrice.toLocaleString('en-IN')}`,
      });

      if (onOrderPlaced) onOrderPlaced();
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
        <div className={`bg-[#080E18] border border-[#1A2638] rounded-2xl w-full shadow-2xl overflow-hidden flex flex-col my-auto transition-all ${
          activeView === 'CHART' ? 'max-w-4xl' : 'max-w-xl'
        }`}>
          {/* Top Header Matching Screenshot & Order Window */}
          <div className="p-4 sm:p-5 border-b border-[#141E2E] bg-[#080E18]">
            <div className="flex items-start justify-between">
              {/* Title & Price Info */}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    {instrument.symbol}
                  </h2>
                  {/* Category & Expiry Badges */}
                  <span className="px-1.5 py-0.5 rounded-sm border border-[#CA8A04] bg-[#201A0E] text-[#EAB308] text-[9px] font-black tracking-wider uppercase font-mono">
                    {instrument.category || 'COMMODITY'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-sm bg-[#F97316] text-[#060B13] text-[9px] font-black tracking-tight font-mono">
                    {instrument.expiry || '19 Aug'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-300 flex-wrap">
                  <span className="text-slate-400">{instrument.name || instrument.symbol}</span>
                  <span className="text-slate-500">•</span>
                  <span className="font-semibold text-slate-300">
                    LTP <span className="font-mono font-bold text-white">₹{instrument.lastPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </span>
                  <span
                    className={`font-mono font-semibold ${
                      isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'
                    }`}
                  >
                    {isPositive ? '+' : ''}
                    {instrument.change.toFixed(2)} ({isPositive ? '+' : ''}
                    {instrument.changePercent.toFixed(2)}%)
                  </span>
                </div>
              </div>

              {/* Right Action Buttons */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* View Switcher: Order vs Live Chart */}
                <div className="bg-[#0B111C] p-0.5 rounded-lg border border-[#1E2B40] flex items-center">
                  <button
                    type="button"
                    onClick={() => setActiveView('ORDER')}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      activeView === 'ORDER'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Order
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('CHART')}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      activeView === 'CHART'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    <span>Chart</span>
                  </button>
                </div>

                {onOpenLiveChart && (
                  <button
                    type="button"
                    onClick={() => onOpenLiveChart(instrument)}
                    className="p-1.5 rounded-lg bg-[#142032] hover:bg-[#1C2C44] border border-[#223652] text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="Fullscreen Live Chart"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-[#142032] hover:bg-slate-800 border border-[#223652] text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sub-row: Option Chain button & Ask/Bid indicators matching Screenshot */}
            <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowOptionChain(true)}
                className="px-3 py-1 rounded-md border border-amber-500/70 bg-transparent text-amber-400 text-xs font-bold tracking-wide hover:bg-amber-500/10 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                Option Chain
              </button>

              <div className="flex items-center gap-2 font-mono text-xs font-bold">
                <div className="px-2 py-0.5 bg-[#061B16] border border-[#10B981] text-[#10B981] rounded-md flex items-center gap-1">
                  <span>ASK</span>
                  <span>{askPrice.toFixed(2)}</span>
                </div>
                <div className="px-2 py-0.5 bg-[#200E14] border border-[#EF4444] text-[#EF4444] rounded-md flex items-center gap-1">
                  <span>BID</span>
                  <span>{bidPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Body: Either Live TradingView Chart or Order Configuration Form */}
          {activeView === 'CHART' ? (
            <div className="flex flex-col bg-[#060B13]">
              {/* Timeframe toolbar */}
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

              {/* TradingView Chart Container */}
              <div className="w-full h-[52vh] min-h-[380px] bg-[#060B13] p-1">
                <TradingViewChart instrument={instrument} timeframe={chartTimeframe} />
              </div>
            </div>
          ) : (
            <div className="p-4 sm:p-5 space-y-4 max-h-[65vh] overflow-y-auto custom-scrollbar">
              {/* Intraday vs Holding Big Cards */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setProductType('INTRADAY')}
                  className={`p-3.5 rounded-xl border text-center transition-all cursor-pointer ${
                    productType === 'INTRADAY'
                      ? 'bg-[#1C150A] border-amber-500 shadow-md shadow-amber-950/30'
                      : 'bg-[#0B111C] border-[#182334] text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className={`text-xs font-bold ${productType === 'INTRADAY' ? 'text-amber-400' : 'text-slate-400'}`}>
                    Intraday
                  </div>
                  <div className="text-base sm:text-lg font-black font-mono text-amber-400 mt-0.5">
                    ₹{totalIntradayMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setProductType('HOLDING')}
                  className={`p-3.5 rounded-xl border text-center transition-all cursor-pointer ${
                    productType === 'HOLDING'
                      ? 'bg-[#1C150A] border-amber-500 shadow-md shadow-amber-950/30'
                      : 'bg-[#0B111C] border-[#182334] text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className={`text-xs font-bold ${productType === 'HOLDING' ? 'text-amber-400' : 'text-slate-400'}`}>
                    Holding
                  </div>
                  <div className="text-base sm:text-lg font-black font-mono text-slate-300 mt-0.5">
                    ₹{totalHoldingMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </button>
              </div>

              {/* OHLC 3-Box Row */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="p-3 bg-[#0B111C] border border-[#182334] rounded-xl text-left">
                  <span className="text-[10px] font-bold text-slate-500 tracking-wider block">OPEN</span>
                  <p className="text-xs sm:text-sm font-mono font-black text-slate-200 mt-1">
                    {instrument.openPrice ? instrument.openPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '1,57,350.00'}
                  </p>
                </div>
                <div className="p-3 bg-[#0B111C] border border-[#182334] rounded-xl text-left">
                  <span className="text-[10px] font-bold text-slate-500 tracking-wider block">HIGH</span>
                  <p className="text-xs sm:text-sm font-mono font-black text-emerald-400 mt-1">
                    {instrument.highPrice ? instrument.highPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '1,59,893.00'}
                  </p>
                </div>
                <div className="p-3 bg-[#0B111C] border border-[#182334] rounded-xl text-left">
                  <span className="text-[10px] font-bold text-slate-500 tracking-wider block">LOW</span>
                  <p className="text-xs sm:text-sm font-mono font-black text-rose-500 mt-1">
                    {instrument.lowPrice ? instrument.lowPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '1,55,365.00'}
                  </p>
                </div>
              </div>

              {/* 4-Item Configuration Row */}
              <div className="grid grid-cols-4 gap-2 items-center">
                <div className="p-2.5 bg-[#0B111C] border border-[#182334] rounded-xl text-left">
                  <span className="text-[9px] font-bold text-slate-500 tracking-wider block">MAX LOTS</span>
                  <span className="text-xs sm:text-sm font-mono font-black text-slate-200 mt-0.5 block">
                    {instrument.maxLots || 50}
                  </span>
                </div>

                <div className="p-2 bg-[#0B111C] border border-slate-700 rounded-xl text-left">
                  <span className="text-[9px] font-bold text-slate-400 tracking-wider block">
                    {inputMode === 'LOTS' ? 'ORDER LOTS' : 'ORDER QTY'}
                  </span>
                  {inputMode === 'LOTS' ? (
                    <input
                      type="number"
                      min={1}
                      max={instrument.maxLots || 50}
                      value={lots}
                      onChange={(e) => handleLotChange(parseInt(e.target.value) || 1)}
                      className="w-full bg-transparent font-mono font-black text-xs sm:text-sm text-white outline-none mt-0.5"
                    />
                  ) : (
                    <input
                      type="number"
                      min={1}
                      value={quantity}
                      onChange={(e) => handleQtyChange(parseInt(e.target.value) || 1)}
                      className="w-full bg-transparent font-mono font-black text-xs sm:text-sm text-white outline-none mt-0.5"
                    />
                  )}
                </div>

                <div className="p-2.5 bg-[#0B111C] border border-[#182334] rounded-xl text-left">
                  <span className="text-[9px] font-bold text-slate-500 tracking-wider block">LOT SIZE</span>
                  <span className="text-xs sm:text-sm font-mono font-black text-slate-200 mt-0.5 block">
                    {instrument.lotSize || 100}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={toggleInputMode}
                  className="h-full min-h-[48px] py-2 px-1 bg-[#121008] hover:bg-[#1C180A] border border-amber-500/80 rounded-xl text-amber-400 text-[10px] sm:text-xs font-bold tracking-wide transition-colors cursor-pointer text-center flex items-center justify-center"
                >
                  {inputMode === 'LOTS' ? 'Switch to Qty' : 'Switch to Lots'}
                </button>
              </div>

              {/* Price & Stepper Row */}
              <div className="p-3 bg-[#0B111C] border border-[#182334] rounded-xl flex items-center justify-between">
                <div>
                  {orderType === 'MARKET' ? (
                    <>
                      <div className="text-sm font-black text-white tracking-wide">Market</div>
                      <div className="text-[10px] font-bold text-slate-500 tracking-wider">PRICE</div>
                    </>
                  ) : (
                    <>
                      <div className="text-[10px] font-bold text-amber-400 tracking-wider">LIMIT PRICE</div>
                      <input
                        type="number"
                        step="0.05"
                        value={limitPrice}
                        onChange={(e) => setLimitPrice(parseFloat(e.target.value) || instrument.lastPrice)}
                        className="font-mono font-black text-sm text-white bg-transparent outline-none w-32 border-b border-amber-500/50"
                      />
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleLotChange(lots - 1)}
                    className="w-8 h-8 rounded-lg bg-[#142032] hover:bg-slate-700 text-white font-bold text-sm flex items-center justify-center transition-colors cursor-pointer"
                  >
                    -
                  </button>
                  <div className="text-center font-mono font-bold text-xs text-slate-200 px-1 min-w-[50px]">
                    {effectiveLots} {effectiveLots === 1 ? 'LOT' : 'LOTS'}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLotChange(lots + 1)}
                    className="w-8 h-8 rounded-lg bg-[#142032] hover:bg-slate-700 text-white font-bold text-sm flex items-center justify-center transition-colors cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Market vs Limit Tabs */}
              <div className="grid grid-cols-2 gap-2 bg-[#060A12] p-1 rounded-xl border border-[#141E2E]">
                <button
                  type="button"
                  onClick={() => setOrderType('MARKET')}
                  className={`py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    orderType === 'MARKET'
                      ? 'bg-amber-500/15 border-b-2 border-amber-500 text-amber-400 font-black shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" /> Market
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('LIMIT')}
                  className={`py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    orderType === 'LIMIT'
                      ? 'bg-amber-500/15 border-b-2 border-amber-500 text-amber-400 font-black shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Target className="w-3.5 h-3.5" /> Limit
                </button>
              </div>

              {/* Set Stop Loss / Target Toggle */}
              <div className="p-3.5 bg-[#0B111C] border border-[#182334] rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="sl-target-toggle" className="flex items-center gap-1.5 text-xs font-bold text-slate-300 cursor-pointer">
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                    Set Stop Loss / Target
                  </label>
                  <button
                    id="sl-target-toggle"
                    type="button"
                    role="switch"
                    aria-checked={enableSLTarget}
                    onClick={() => setEnableSLTarget(!enableSLTarget)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      enableSLTarget ? 'bg-amber-500' : 'bg-slate-700'
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-[#141E2E] animate-fadeIn">
                    <div>
                      <label className="text-[10px] font-bold text-rose-400 block mb-1">
                        Stop Loss Price
                      </label>
                      <input
                        type="number"
                        placeholder={`e.g. ${(instrument.lastPrice * 0.98).toFixed(2)}`}
                        value={stopLossPrice}
                        onChange={(e) => setStopLossPrice(e.target.value)}
                        className="w-full bg-[#080E18] border border-[#1E2E44] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-emerald-400 block mb-1">
                        Target Price
                      </label>
                      <input
                        type="number"
                        placeholder={`e.g. ${(instrument.lastPrice * 1.04).toFixed(2)}`}
                        value={targetPrice}
                        onChange={(e) => setTargetPrice(e.target.value)}
                        className="w-full bg-[#080E18] border border-[#1E2E44] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="text-[10px] font-bold text-amber-400 block mb-1">
                        Trailing SL (Pts)
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 50.00"
                        value={trailingSL}
                        onChange={(e) => setTrailingSL(e.target.value)}
                        className="w-full bg-[#080E18] border border-[#1E2E44] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bottom Dual Action Buttons (Flush Split) */}
          <div className="grid grid-cols-2 border-t border-[#141E2E]">
            {/* SELL BID Button (Coral Red) */}
            <button
              type="button"
              id="order-window-sell-btn"
              disabled={submitting}
              onClick={() => handleExecuteOrder('SELL')}
              className="py-3.5 px-4 bg-[#EF4444] hover:bg-[#DC2626] active:bg-[#B91C1C] text-white font-black text-xs sm:text-sm flex flex-col items-center justify-center transition-all cursor-pointer shadow-lg disabled:opacity-50"
            >
              <div className="flex items-center gap-1.5">
                <ArrowDownRight className="w-4 h-4 stroke-[3]" />
                <span>SELL BID</span>
              </div>
              <span className="text-[11px] font-mono font-medium opacity-90 mt-0.5">
                ₹{selectedMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </button>

            {/* BUY ASK Button (Emerald Green) */}
            <button
              type="button"
              id="order-window-buy-btn"
              disabled={submitting}
              onClick={() => handleExecuteOrder('BUY')}
              className="py-3.5 px-4 bg-[#10B981] hover:bg-[#059669] active:bg-[#047857] text-white font-black text-xs sm:text-sm flex flex-col items-center justify-center transition-all cursor-pointer shadow-lg disabled:opacity-50"
            >
              <div className="flex items-center gap-1.5">
                <ArrowUpRight className="w-4 h-4 stroke-[3]" />
                <span>BUY ASK</span>
              </div>
              <span className="text-[11px] font-mono font-medium opacity-90 mt-0.5">
                ₹{selectedMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
      <MarketClosedModal
        isOpen={showMarketClosedModal}
        onClose={() => setShowMarketClosedModal(false)}
        info={marketHoursInfo}
      />
    </>
  );
};
