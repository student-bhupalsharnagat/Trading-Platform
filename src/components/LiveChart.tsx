import React, { useState, useEffect, useRef } from 'react';
import { Instrument, Candle } from '../types.ts';
import { authApi } from '../services/authApi.ts';
import { TradingViewChart } from './TradingViewChart.tsx';
import { MarketClosedModal } from './MarketClosedModal.tsx';
import { getMarketHoursInfo, MarketHoursInfo } from '../utils/marketHours.ts';
import {
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  CandlestickChart,
  LineChart,
  AreaChart,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Wallet,
} from 'lucide-react';

interface LiveChartProps {
  instrument: Instrument;
  marketClosedOverride?: boolean | null;
  onBack: () => void;
  onOpenOrderWindow: (instrument: Instrument, type: 'BUY' | 'SELL') => void;
  onOpenWallet?: () => void;
  walletBalance?: number;
}

export const LiveChart: React.FC<LiveChartProps> = ({
  instrument,
  marketClosedOverride = null,
  onBack,
  onOpenOrderWindow,
  onOpenWallet,
  walletBalance = 142840,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Timeframe and chart mode
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '15m' | '30m' | '1h' | '1D'>('15m');
  const [chartType, setChartType] = useState<'Candle' | 'Line' | 'Area'>('Candle');
  const [engineMode, setEngineMode] = useState<'TRADINGVIEW' | 'CANVAS'>('TRADINGVIEW');
  const [candles, setCandles] = useState<Candle[]>([]);

  // Market Closed modal
  const [showMarketClosedModal, setShowMarketClosedModal] = useState(false);
  const [marketHoursInfo, setMarketHoursInfo] = useState<MarketHoursInfo | undefined>(undefined);

  // Pan & Zoom for Canvas
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);

  // Crosshair state
  const [hoverData, setHoverData] = useState<{
    candle: Candle | null;
    mouseX: number;
    mouseY: number;
    price: number | null;
  }>({ candle: null, mouseX: -1, mouseY: -1, price: null });

  // Generate clean realistic fallback candles
  const generateInitialCandles = (basePrice: number, count = 70): Candle[] => {
    const list: Candle[] = [];
    let currentPrice = basePrice * 0.988;
    const now = Date.now();
    const intervalMs =
      timeframe === '1m'
        ? 60000
        : timeframe === '5m'
        ? 300000
        : timeframe === '15m'
        ? 900000
        : timeframe === '30m'
        ? 1800000
        : timeframe === '1h'
        ? 3600000
        : 86400000;

    for (let i = count; i >= 0; i--) {
      const time = now - i * intervalMs;
      const volatility = basePrice * 0.003;
      const change = (Math.random() - 0.485) * volatility;
      const open = currentPrice;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * (volatility * 0.5);
      const low = Math.min(open, close) - Math.random() * (volatility * 0.5);
      const volume = Math.floor(20 + Math.random() * 60);

      list.push({
        time,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume,
      });

      currentPrice = close;
    }

    if (list.length > 0) {
      const last = list[list.length - 1];
      last.close = instrument.lastPrice;
      last.high = Math.max(last.high, instrument.lastPrice);
      last.low = Math.min(last.low, instrument.lastPrice);
    }

    return list;
  };

  useEffect(() => {
    let isMounted = true;
    authApi
      .getCandles(instrument.symbol, timeframe)
      .then((res) => {
        if (isMounted) {
          if (res.candles && res.candles.length > 0) {
            setCandles(res.candles);
          } else {
            setCandles(generateInitialCandles(instrument.lastPrice));
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setCandles(generateInitialCandles(instrument.lastPrice));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [instrument.symbol, timeframe]);

  // Live ticking candle update
  useEffect(() => {
    const timer = setInterval(() => {
      setCandles((prev) => {
        if (!prev || prev.length === 0) return prev;
        const lastIdx = prev.length - 1;
        const last = { ...prev[lastIdx] };

        const tick = (Math.random() - 0.49) * (last.close * 0.0004);
        const newClose = Number((last.close + tick).toFixed(2));
        last.close = newClose;
        last.high = Math.max(last.high, newClose);
        last.low = Math.min(last.low, newClose);
        last.volume += Math.floor(Math.random() * 3);

        const updated = [...prev];
        updated[lastIdx] = last;
        return updated;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const latestCandle = candles[candles.length - 1];
  const activeCandle = hoverData.candle || latestCandle;
  const activePrice = latestCandle ? latestCandle.close : instrument.lastPrice;
  const isPositive = instrument.change >= 0;

  // Ask / Bid calculations
  const askPrice = instrument.ask || Number((activePrice + 0.60).toFixed(2));
  const bidPrice = instrument.bid || Number((activePrice - 2.50).toFixed(2));

  // Canvas Rendering logic for simple, clean trading chart
  useEffect(() => {
    if (engineMode !== 'CANVAS') return;
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Solid clean dark background
    ctx.fillStyle = '#060B13';
    ctx.fillRect(0, 0, width, height);

    const rightMargin = 78;
    const bottomMargin = 28;
    const topMargin = 20;
    const leftMargin = 12;

    const chartWidth = width - leftMargin - rightMargin;
    const chartHeight = height - bottomMargin - topMargin;

    const baseVisibleCount = Math.max(25, Math.floor(60 / zoomLevel));
    const maxOffset = Math.max(0, candles.length - baseVisibleCount);
    const effectiveOffset = Math.min(Math.max(0, panOffset), maxOffset);

    const startIndex = Math.max(0, candles.length - baseVisibleCount - effectiveOffset);
    const endIndex = Math.min(candles.length, startIndex + baseVisibleCount);
    const visibleCandles = candles.slice(startIndex, endIndex);

    if (visibleCandles.length === 0) return;

    let minPrice = Infinity;
    let maxPrice = -Infinity;

    visibleCandles.forEach((c) => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    });

    const priceRange = maxPrice - minPrice || 1;
    const paddedMin = minPrice - priceRange * 0.08;
    const paddedMax = maxPrice + priceRange * 0.08;
    const effectiveRange = paddedMax - paddedMin;

    const priceToY = (price: number) => {
      return topMargin + (1 - (price - paddedMin) / effectiveRange) * (chartHeight - 10);
    };

    const candleWidth = chartWidth / visibleCandles.length;
    const bodyWidth = Math.max(3, candleWidth * 0.7);

    // Clean subtle grid lines
    ctx.strokeStyle = '#0C1320';
    ctx.lineWidth = 1;

    const gridSteps = 10;
    const stepSize = effectiveRange / gridSteps;

    for (let i = 0; i <= gridSteps; i++) {
      const priceLevel = paddedMin + stepSize * i;
      const y = priceToY(priceLevel);

      ctx.beginPath();
      ctx.moveTo(leftMargin, y);
      ctx.lineTo(width - rightMargin, y);
      ctx.stroke();

      ctx.fillStyle = '#64748B';
      ctx.font = '10px "Roboto Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(priceLevel.toFixed(2), width - rightMargin + 8, y + 3.5);
    }

    // Vertical time grid lines
    const timeGridStep = Math.max(1, Math.floor(visibleCandles.length / 5));
    for (let i = 0; i < visibleCandles.length; i += timeGridStep) {
      const x = leftMargin + i * candleWidth + candleWidth / 2;
      ctx.beginPath();
      ctx.moveTo(x, topMargin);
      ctx.lineTo(x, height - bottomMargin);
      ctx.stroke();

      const c = visibleCandles[i];
      if (c) {
        const d = new Date(c.time);
        const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        ctx.fillStyle = '#64748B';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(timeStr, x, height - bottomMargin + 16);
      }
    }

    // Chart Series (Candles / Line / Area) - Simple & Clean without confusing indicators
    if (chartType === 'Candle') {
      visibleCandles.forEach((c, idx) => {
        const x = leftMargin + idx * candleWidth + candleWidth / 2;
        const isUp = c.close >= c.open;
        const color = isUp ? '#10B981' : '#EF4444';

        const openY = priceToY(c.open);
        const closeY = priceToY(c.close);
        const highY = priceToY(c.high);
        const lowY = priceToY(c.low);

        // Wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.stroke();

        // Candle body
        ctx.fillStyle = color;
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));
        ctx.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
      });
    } else if (chartType === 'Line' || chartType === 'Area') {
      ctx.beginPath();
      visibleCandles.forEach((c, idx) => {
        const x = leftMargin + idx * candleWidth + candleWidth / 2;
        const y = priceToY(c.close);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      if (chartType === 'Area') {
        const lastX = leftMargin + (visibleCandles.length - 1) * candleWidth + candleWidth / 2;
        const firstX = leftMargin + candleWidth / 2;
        const baseY = topMargin + chartHeight;

        const gradient = ctx.createLinearGradient(0, topMargin, 0, baseY);
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.22)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

        ctx.lineTo(lastX, baseY);
        ctx.lineTo(firstX, baseY);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        visibleCandles.forEach((c, idx) => {
          const x = leftMargin + idx * candleWidth + candleWidth / 2;
          const y = priceToY(c.close);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Active Live Price Line & Badge on Y-axis
    const liveY = priceToY(activePrice);
    ctx.strokeStyle = '#EF4444';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftMargin, liveY);
    ctx.lineTo(width - rightMargin, liveY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Live price pill badge
    ctx.fillStyle = '#EF4444';
    const liveBadgeW = 64;
    const liveBadgeH = 18;
    ctx.beginPath();
    ctx.roundRect(width - rightMargin + 4, liveY - liveBadgeH / 2, liveBadgeW, liveBadgeH, 4);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(activePrice.toFixed(2), width - rightMargin + 4 + liveBadgeW / 2, liveY + 3.5);

    // Crosshair on hover
    if (hoverData.mouseX > 0 && hoverData.mouseY > 0 && hoverData.mouseX < width - rightMargin) {
      ctx.strokeStyle = '#94A3B8';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(hoverData.mouseX, topMargin);
      ctx.lineTo(hoverData.mouseX, height - bottomMargin);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(leftMargin, hoverData.mouseY);
      ctx.lineTo(width - rightMargin, hoverData.mouseY);
      ctx.stroke();
      ctx.setLineDash([]);

      if (hoverData.price !== null) {
        ctx.fillStyle = '#334155';
        const crossBadgeW = 64;
        const crossBadgeH = 18;
        ctx.beginPath();
        ctx.roundRect(
          width - rightMargin + 4,
          hoverData.mouseY - crossBadgeH / 2,
          crossBadgeW,
          crossBadgeH,
          4
        );
        ctx.fill();

        ctx.fillStyle = '#F8FAFC';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          hoverData.price.toFixed(2),
          width - rightMargin + 4 + crossBadgeW / 2,
          hoverData.mouseY + 3.5
        );
      }
    }
  }, [
    candles,
    chartType,
    zoomLevel,
    panOffset,
    hoverData,
    activePrice,
    engineMode,
  ]);

  // Responsive canvas resizing
  useEffect(() => {
    if (engineMode !== 'CANVAS') return;
    const updateCanvasSize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    };

    updateCanvasSize();
    const observer = new ResizeObserver(updateCanvasSize);
    if (containerRef.current) observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [engineMode]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const rightMargin = 78;
    const topMargin = 20;
    const bottomMargin = 28;
    const leftMargin = 12;
    const chartWidth = rect.width - leftMargin - rightMargin;
    const chartHeight = rect.height - bottomMargin - topMargin;

    if (x < leftMargin || x > rect.width - rightMargin || y < topMargin || y > rect.height - bottomMargin) {
      setHoverData({ candle: null, mouseX: -1, mouseY: -1, price: null });
      return;
    }

    const baseVisibleCount = Math.max(25, Math.floor(60 / zoomLevel));
    const maxOffset = Math.max(0, candles.length - baseVisibleCount);
    const effectiveOffset = Math.min(Math.max(0, panOffset), maxOffset);
    const startIndex = Math.max(0, candles.length - baseVisibleCount - effectiveOffset);
    const endIndex = Math.min(candles.length, startIndex + baseVisibleCount);
    const visibleCandles = candles.slice(startIndex, endIndex);

    const candleWidth = chartWidth / visibleCandles.length;
    const candleIndex = Math.min(
      visibleCandles.length - 1,
      Math.max(0, Math.floor((x - leftMargin) / candleWidth))
    );
    const targetCandle = visibleCandles[candleIndex] || null;

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    visibleCandles.forEach((c) => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    });
    const priceRange = maxPrice - minPrice || 1;
    const paddedMin = minPrice - priceRange * 0.08;
    const paddedMax = maxPrice + priceRange * 0.08;
    const effectiveRange = paddedMax - paddedMin;

    const calcPrice = paddedMin + (1 - (y - topMargin) / (chartHeight - 10)) * effectiveRange;

    setHoverData({
      candle: targetCandle,
      mouseX: x,
      mouseY: y,
      price: Number(calcPrice.toFixed(2)),
    });

    if (isDragging) {
      const deltaX = e.clientX - dragStartX;
      const candleDelta = Math.round(deltaX / candleWidth);
      if (Math.abs(candleDelta) >= 1) {
        setPanOffset((prev) => Math.max(0, prev + candleDelta));
        setDragStartX(e.clientX);
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => {
    setIsDragging(false);
    setHoverData({ candle: null, mouseX: -1, mouseY: -1, price: null });
  };

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(3, prev + 0.25));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(0.5, prev - 0.25));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset(0);
  };

  return (
    <div className="min-h-screen bg-[#060B13] text-slate-100 flex flex-col font-sans selection:bg-amber-500/30">
      {/* 1. Header: Clean Title, LTP, Change & Ask/Bid */}
      <header className="sticky top-0 z-30 bg-[#060B13] border-b border-[#121B2B] px-3 sm:px-4 py-2.5">
        <div className="w-full flex items-center justify-between">
          {/* Back button + Instrument Details */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="w-8 h-8 rounded-lg bg-[#0E1726] hover:bg-[#142032] border border-[#1E2B40] text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Go Back"
            >
              <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
            </button>

            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-sm sm:text-base font-black text-white tracking-tight font-sans">
                  {instrument.symbol}
                </h1>
                <span className="px-1.5 py-0.5 rounded-sm border border-[#CA8A04] bg-[#201A0E] text-[#EAB308] text-[9px] font-black tracking-wider uppercase font-mono">
                  {instrument.category || 'COMMODITY'}
                </span>
                <span className="px-1.5 py-0.5 rounded-sm bg-[#F97316] text-[#060B13] text-[9px] font-black tracking-tight font-mono">
                  {instrument.expiry || '19 Aug'}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono">
                {instrument.name || instrument.symbol}
              </div>
            </div>
          </div>

          {/* Right Live Price, Wallet & ASK/BID summary */}
          <div className="flex items-center gap-3">
            {onOpenWallet && (
              <button
                type="button"
                id="live-chart-wallet-btn"
                onClick={onOpenWallet}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-400 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                title="Open Wallet & Funds"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span className="hidden sm:inline font-mono">₹{walletBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </button>
            )}

            <div className="text-right">
              <div
                className={`font-mono font-black text-base sm:text-lg tracking-tight ${
                  isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'
                }`}
              >
                ₹{activePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div
                className={`font-mono text-[11px] font-bold ${
                  isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'
                }`}
              >
                {isPositive ? '+' : ''}
                {instrument.change.toFixed(2)} ({isPositive ? '+' : ''}
                {instrument.changePercent.toFixed(2)}%)
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Simplified Clean Chart Toolbar: Timeframes & Clean Chart Types */}
      <div className="bg-[#080E18] border-b border-[#121B2B] px-3 sm:px-4 py-1.5">
        <div className="w-full flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          {/* Timeframe selector (1m, 5m, 15m, 30m, 1h, 1D) */}
          <div className="flex items-center gap-1">
            {(['1m', '5m', '15m', '30m', '1h', '1D'] as const).map((tf) => {
              const isActive = timeframe === tf;
              return (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`px-2 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#EAB308] text-slate-950 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              );
            })}
          </div>

          {/* Clean Controls: Chart Style, Engine & Ask/Bid badges */}
          <div className="flex items-center gap-2">
            {/* Chart Style (Candle, Line, Area) */}
            <div className="flex items-center gap-1 bg-[#060B13] p-0.5 rounded-lg border border-[#141E2E]">
              {(['Candle', 'Line', 'Area'] as const).map((type) => {
                const isActive = chartType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setChartType(type);
                      if (type !== 'Candle') setEngineMode('CANVAS');
                    }}
                    className={`px-2 py-0.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-amber-500/20 text-[#EAB308] border border-amber-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>

            {/* Quick Engine Switcher (TradingView / Clean Canvas) */}
            <button
              type="button"
              onClick={() => setEngineMode(engineMode === 'TRADINGVIEW' ? 'CANVAS' : 'TRADINGVIEW')}
              className="px-2 py-1 rounded-md text-[11px] font-bold border border-slate-700 bg-[#0E1726] text-slate-300 hover:text-white cursor-pointer"
              title="Switch chart view"
            >
              {engineMode === 'TRADINGVIEW' ? 'TradingView' : 'Standard'}
            </button>

            {/* Live ASK / BID pills */}
            <div className="hidden sm:flex items-center gap-1.5 font-mono text-[11px] font-bold">
              <div className="px-2 py-0.5 bg-[#061B16] border border-[#10B981] text-[#10B981] rounded-md">
                ASK {askPrice.toFixed(2)}
              </div>
              <div className="px-2 py-0.5 bg-[#200E14] border border-[#EF4444] text-[#EF4444] rounded-md">
                BID {bidPrice.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Real-Time OHLC Bar (Simple & Understandable for User) */}
      {activeCandle && (
        <div className="bg-[#060B13] border-b border-[#121B2B] px-3 sm:px-4 py-1 flex items-center justify-between text-[11px] font-mono text-slate-400 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-3 sm:gap-5 flex-wrap">
            <span>
              O: <strong className="text-slate-200">{activeCandle.open.toFixed(2)}</strong>
            </span>
            <span>
              H: <strong className="text-emerald-400">{activeCandle.high.toFixed(2)}</strong>
            </span>
            <span>
              L: <strong className="text-rose-400">{activeCandle.low.toFixed(2)}</strong>
            </span>
            <span>
              C: <strong className="text-slate-200">{activeCandle.close.toFixed(2)}</strong>
            </span>
          </div>

          {engineMode === 'CANVAS' && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleZoomIn}
                className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white"
                title="Zoom In"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white"
                title="Zoom Out"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* 4. Main Chart Canvas / TradingView Area (Clean & No Clutter) */}
      <main className="flex-1 relative flex flex-col p-1 sm:p-2 pb-16">
        {engineMode === 'TRADINGVIEW' && chartType === 'Candle' ? (
          <div className="flex-1 w-full h-[72vh] min-h-[440px] relative rounded-lg border border-[#121B2B] overflow-hidden bg-[#060B13]">
            <TradingViewChart instrument={instrument} timeframe={timeframe} />
          </div>
        ) : (
          <div
            ref={containerRef}
            className="flex-1 w-full h-[72vh] min-h-[440px] relative rounded-lg border border-[#121B2B] overflow-hidden bg-[#060B13] cursor-crosshair"
          >
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              className="w-full h-full block"
            />
          </div>
        )}
      </main>

      {/* 5. Bottom Action Buttons: SELL BID & BUY ASK */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-2">
        {/* SELL BID (Coral Red) */}
        <button
          type="button"
          id="live-chart-sell-bid-btn"
          onClick={() => {
            const hoursInfo = getMarketHoursInfo(instrument.category, marketClosedOverride);
            if (!hoursInfo.isOpen) {
              setMarketHoursInfo(hoursInfo);
              setShowMarketClosedModal(true);
              return;
            }
            onOpenOrderWindow(instrument, 'SELL');
          }}
          className="py-3.5 px-4 bg-[#EF4444] hover:bg-[#DC2626] active:bg-[#B91C1C] text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg tracking-wide"
        >
          <ArrowDownRight className="w-4 h-4 stroke-[3]" />
          <span>SELL BID (₹{bidPrice.toFixed(2)})</span>
        </button>

        {/* BUY ASK (Emerald Green) */}
        <button
          type="button"
          id="live-chart-buy-ask-btn"
          onClick={() => {
            const hoursInfo = getMarketHoursInfo(instrument.category, marketClosedOverride);
            if (!hoursInfo.isOpen) {
              setMarketHoursInfo(hoursInfo);
              setShowMarketClosedModal(true);
              return;
            }
            onOpenOrderWindow(instrument, 'BUY');
          }}
          className="py-3.5 px-4 bg-[#10B981] hover:bg-[#059669] active:bg-[#047857] text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg tracking-wide"
        >
          <ArrowUpRight className="w-4 h-4 stroke-[3]" />
          <span>BUY ASK (₹{askPrice.toFixed(2)})</span>
        </button>
      </footer>

      {/* Market Closed Modal */}
      <MarketClosedModal
        isOpen={showMarketClosedModal}
        onClose={() => setShowMarketClosedModal(false)}
        info={marketHoursInfo}
      />
    </div>
  );
};
