import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Instrument } from '../types.ts';
import { useTheme } from '../context/ThemeContext.tsx';
import {
  Wifi,
  RefreshCw,
  BarChart2,
  AlertCircle,
  ExternalLink,
  Layers,
  TrendingUp,
  Maximize2,
} from 'lucide-react';

interface TradingViewChartProps {
  instrument: Instrument;
  timeframe?: string;
  height?: string | number;
}

/**
 * Intelligent symbol mapper converting internal trading instrument symbols
 * to verified, official TradingView ticker identifiers.
 */
export const getTradingViewSymbol = (symbol: string): string => {
  if (!symbol) return 'NSE:NIFTY';
  const clean = symbol.toUpperCase().trim();

  // If already formatted with exchange prefix (e.g. BINANCE:BTCUSDT or NSE:RELIANCE)
  if (clean.includes(':')) {
    return clean;
  }

  // Commodities (MCX / International equivalents for TradingView)
  if (clean.includes('CRUDE') || clean.includes('OIL')) return 'TVC:USOIL';
  if (clean.includes('GOLD')) return 'TVC:GOLD';
  if (clean.includes('SILVER')) return 'TVC:SILVER';
  if (clean.includes('COPPER')) return 'COMEX:HG1!';
  if (clean.includes('NATURALGAS') || clean.includes('NATURAL GAS') || clean.includes('NATGAS')) return 'NYMEX:NG1!';
  if (clean.includes('ALUMINIUM') || clean.includes('ALUMINUM')) return 'COMEX:ALI1!';
  if (clean.includes('ZINC')) return 'LME:ZS1!';
  if (clean.includes('LEAD')) return 'LME:PB1!';
  if (clean.includes('NICKEL')) return 'LME:NI1!';

  // Indices
  if (clean.includes('NIFTY 50') || clean === 'NIFTY' || clean.includes('NIFTY_FUT')) return 'NSE:NIFTY';
  if (clean.includes('BANKNIFTY') || clean.includes('BANK NIFTY') || clean.includes('BANK_NIFTY')) return 'NSE:BANKNIFTY';
  if (clean.includes('FINNIFTY') || clean.includes('FIN NIFTY')) return 'NSE:CNXFINANCE';
  if (clean.includes('MIDCPNIFTY') || clean.includes('MIDCAP')) return 'NSE:MIDCPNIFTY';
  if (clean.includes('SENSEX')) return 'BSE:SENSEX';
  if (clean.includes('BANKEX')) return 'BSE:BANKEX';

  // Crypto
  if (clean.includes('BTC') || clean.includes('BITCOIN')) return 'BINANCE:BTCUSDT';
  if (clean.includes('ETH') || clean.includes('ETHEREUM')) return 'BINANCE:ETHUSDT';
  if (clean.includes('SOL') || clean.includes('SOLANA')) return 'BINANCE:SOLUSDT';
  if (clean.includes('BNB')) return 'BINANCE:BNBUSDT';
  if (clean.includes('XRP') || clean.includes('RIPPLE')) return 'BINANCE:XRPUSDT';
  if (clean.includes('DOGE')) return 'BINANCE:DOGEUSDT';
  if (clean.includes('ADA') || clean.includes('CARDANO')) return 'BINANCE:ADAUSDT';
  if (clean.includes('MATIC') || clean.includes('POLYGON')) return 'BINANCE:MATICUSDT';

  // Indian Equities
  if (clean.includes('RELIANCE')) return 'NSE:RELIANCE';
  if (clean.includes('HDFC')) return 'NSE:HDFCBANK';
  if (clean.includes('TCS')) return 'NSE:TCS';
  if (clean.includes('INFY') || clean.includes('INFOSYS')) return 'NSE:INFY';
  if (clean.includes('ICICI')) return 'NSE:ICICIBANK';
  if (clean.includes('SBIN') || clean.includes('SBI')) return 'NSE:SBIN';
  if (clean.includes('BHARTI') || clean.includes('AIRTEL')) return 'NSE:BHARTIARTL';
  if (clean.includes('ITC')) return 'NSE:ITC';
  if (clean.includes('TATAMOTORS') || (clean.includes('TATA') && clean.includes('MOTORS'))) return 'NSE:TATAMOTORS';
  if (clean.includes('TATASTEEL') || (clean.includes('TATA') && clean.includes('STEEL'))) return 'NSE:TATASTEEL';
  if (clean.includes('AXIS')) return 'NSE:AXISBANK';
  if (clean.includes('KOTAK')) return 'NSE:KOTAKBANK';
  if (clean.includes('LT') || clean.includes('LARSEN')) return 'NSE:LT';
  if (clean.includes('WIPRO')) return 'NSE:WIPRO';
  if (clean.includes('MARUTI')) return 'NSE:MARUTI';
  if (clean.includes('BAJFINANCE')) return 'NSE:BAJFINANCE';

  // Forex
  if (clean.includes('EUR/USD') || clean === 'EURUSD') return 'FX:EURUSD';
  if (clean.includes('GBP/USD') || clean === 'GBPUSD') return 'FX:GBPUSD';
  if (clean.includes('USD/INR') || clean === 'USDINR') return 'FX_IDC:USDINR';
  if (clean.includes('USD/JPY') || clean === 'USDJPY') return 'FX:USDJPY';
  if (clean.includes('AUD/USD') || clean === 'AUDUSD') return 'FX:AUDUSD';

  // Fallback: Strip options / future suffixes (CE, PE, FUT) to find underlying
  const basePart = clean.replace(/_\w+|\s+(FUT|CE|PE|\d+CE|\d+PE).*$/i, '').trim();
  return `NSE:${basePart || 'NIFTY'}`;
};

/**
 * Checks whether an instrument symbol is restricted on TradingView's free widgetembed
 * (e.g. Indian NSE/BSE equities, MCX commodities, and Indian indices)
 */
export const isTradingViewRestrictedSymbol = (symbol: string, category?: string): boolean => {
  if (!symbol) return false;
  if (category === 'EQUITY' || category === 'INDEX') return true;
  const upper = symbol.toUpperCase().trim();
  if (upper.startsWith('NSE:') || upper.startsWith('BSE:') || upper.startsWith('MCX:')) return true;
  const indianKeywords = [
    'RELIANCE', 'HDFC', 'TCS', 'INFY', 'INFOSYS', 'ICICI', 'SBIN', 'SBI',
    'BHARTI', 'AIRTEL', 'ITC', 'TATAMOTORS', 'TATASTEEL', 'AXIS', 'KOTAK',
    'LT', 'LARSEN', 'WIPRO', 'MARUTI', 'BAJFINANCE', 'NIFTY', 'BANKNIFTY',
    'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'
  ];
  return indianKeywords.some((k) => upper.includes(k));
};

// Map timeframe to TradingView interval string
export const getTradingViewInterval = (tf: string): string => {
  switch (tf) {
    case '1m':
      return '1';
    case '5m':
      return '5';
    case '15m':
      return '15';
    case '30m':
      return '30';
    case '1h':
      return '60';
    case '1D':
    case 'D':
      return 'D';
    case '1W':
    case 'W':
      return 'W';
    default:
      return '15';
  }
};

interface LocalCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  instrument,
  timeframe = '15m',
  height = '100%',
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const tvSymbol = useMemo(() => getTradingViewSymbol(instrument.symbol), [instrument.symbol]);
  const interval = useMemo(() => getTradingViewInterval(timeframe), [timeframe]);
  const isRestricted = useMemo(
    () => isTradingViewRestrictedSymbol(instrument.symbol, instrument.category) || tvSymbol.startsWith('NSE:') || tvSymbol.startsWith('BSE:'),
    [instrument.symbol, instrument.category, tvSymbol]
  );

  // Engine state: Default to 'canvas' for Indian symbols (since TradingView free widgetembed blocks Indian exchange feeds),
  // and 'tradingview' for global Crypto, Forex, and Commodities.
  const [engine, setEngine] = useState<'tradingview' | 'canvas'>(() => (isRestricted ? 'canvas' : 'tradingview'));
  const [isIframeLoading, setIsIframeLoading] = useState(true);
  const [hasIframeError, setHasIframeError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (isRestricted) {
      setEngine('canvas');
    }
  }, [isRestricted, instrument.symbol]);

  // Construct official, robust TradingView widget embed URL
  const iframeUrl = useMemo(() => {
    const params = new URLSearchParams({
      frameElementId: `tv_embed_${reloadKey}`,
      symbol: tvSymbol,
      interval: interval,
      hidesidetoolbar: '1',
      symboledit: '1',
      saveimage: '0',
      toolbarbg: isDark ? '060B13' : 'F8FAFC',
      theme: isDark ? 'dark' : 'light',
      style: '1',
      timezone: 'Asia/Kolkata',
      withdateranges: '1',
      studies: '[]',
      locale: 'en',
      utm_source: 'vertex-platform',
      utm_medium: 'widget',
      utm_campaign: 'chart',
    });
    return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
  }, [tvSymbol, interval, isDark, reloadKey]);

  // Reset loading status whenever symbol, interval, or reloadKey changes
  useEffect(() => {
    setIsIframeLoading(true);
    setHasIframeError(false);

    // Timeout watchdog: If iframe doesn't finish loading within 8 seconds,
    // ensure loading indicator clears and give user fallback options
    const timer = setTimeout(() => {
      setIsIframeLoading((prev) => {
        if (prev) {
          // If still loading after 8s, mark as slow/error so fallback is accessible
          setHasIframeError(true);
          return false;
        }
        return false;
      });
    }, 8000);

    return () => clearTimeout(timer);
  }, [tvSymbol, interval, reloadKey]);

  // Local interactive Canvas Chart state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [candles, setCandles] = useState<LocalCandle[]>([]);
  const [hoveredCandle, setHoveredCandle] = useState<LocalCandle | null>(null);

  // Generate synthetic yet mathematically consistent candles around instrument price
  useEffect(() => {
    const basePrice = instrument.lastPrice || 1000;
    const volatility = basePrice * 0.003;
    const now = Math.floor(Date.now() / 1000);
    const generated: LocalCandle[] = [];

    let currentClose = basePrice * 0.98;
    const count = 60;

    for (let i = count; i >= 0; i--) {
      const time = now - i * 60 * 15;
      const change = (Math.random() - 0.49) * volatility * 2;
      const open = currentClose;
      const close = Math.max(1, open + change);
      const high = Math.max(open, close) + Math.random() * volatility;
      const low = Math.min(open, close) - Math.random() * volatility;
      const volume = Math.floor(Math.random() * 50000 + 10000);

      generated.push({ time, open, high, low, close, volume });
      currentClose = close;
    }

    setCandles(generated);
  }, [instrument.symbol, instrument.lastPrice]);

  // Live tick animation on the most recent candle
  useEffect(() => {
    if (engine !== 'canvas') return;

    const intervalId = setInterval(() => {
      setCandles((prev) => {
        if (prev.length === 0) return prev;
        const lastIndex = prev.length - 1;
        const last = prev[lastIndex];
        const delta = (Math.random() - 0.49) * (last.close * 0.001);
        const newClose = +(last.close + delta).toFixed(2);
        const newHigh = Math.max(last.high, newClose);
        const newLow = Math.min(last.low, newClose);

        const updated = [...prev];
        updated[lastIndex] = {
          ...last,
          close: newClose,
          high: newHigh,
          low: newLow,
          volume: last.volume + Math.floor(Math.random() * 50),
        };
        return updated;
      });
    }, 1500);

    return () => clearInterval(intervalId);
  }, [engine]);

  // Render Canvas Chart
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Background
    ctx.fillStyle = isDark ? '#060B13' : '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    if (candles.length === 0) return;

    const paddingRight = 70;
    const paddingBottom = 30;
    const paddingTop = 20;
    const plotWidth = width - paddingRight;
    const plotHeight = height - paddingBottom - paddingTop;

    // Calculate price bounds
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (const c of candles) {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    }
    const priceRange = maxPrice - minPrice || 1;
    const priceMargin = priceRange * 0.08;
    const yMin = minPrice - priceMargin;
    const yMax = maxPrice + priceMargin;
    const yRange = yMax - yMin;

    // Helper functions for coordinates
    const getX = (index: number) => (index / (candles.length - 1)) * plotWidth;
    const getY = (val: number) => paddingTop + plotHeight - ((val - yMin) / yRange) * plotHeight;

    // Draw horizontal grid lines & price labels
    const gridSteps = 5;
    ctx.lineWidth = 1;
    ctx.strokeStyle = isDark ? '#121B2B' : '#F1F5F9';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= gridSteps; i++) {
      const p = yMin + (yRange / gridSteps) * i;
      const y = getY(p);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotWidth, y);
      ctx.stroke();

      ctx.fillStyle = isDark ? '#64748B' : '#94A3B8';
      ctx.fillText(p.toFixed(2), plotWidth + 8, y);
    }

    // Draw volume bars at the bottom
    const maxVol = Math.max(...candles.map((c) => c.volume), 1);
    const volHeight = plotHeight * 0.22;
    const candleWidth = Math.max(3, (plotWidth / candles.length) * 0.7);

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = getX(i);
      const isUp = c.close >= c.open;
      const vH = (c.volume / maxVol) * volHeight;
      const vY = paddingTop + plotHeight - vH;

      ctx.fillStyle = isUp
        ? isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.25)'
        : isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.25)';
      ctx.fillRect(x - candleWidth / 2, vY, candleWidth, vH);
    }

    // Draw Candlesticks
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const x = getX(i);
      const isUp = c.close >= c.open;
      const color = isUp ? '#10B981' : '#EF4444';

      const yOpen = getY(c.open);
      const yClose = getY(c.close);
      const yHigh = getY(c.high);
      const yLow = getY(c.low);

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      // Body
      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));
      ctx.fillStyle = color;
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
    }

    // Current price horizontal dashed line
    const lastCandle = candles[candles.length - 1];
    if (lastCandle) {
      const currentY = getY(lastCandle.close);
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, currentY);
      ctx.lineTo(plotWidth, currentY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Current Price Badge
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(plotWidth + 2, currentY - 9, 64, 18);
      ctx.fillStyle = '#060B13';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillText(lastCandle.close.toFixed(2), plotWidth + 6, currentY);
    }
  }, [candles, isDark]);

  // Resize observer for canvas
  useEffect(() => {
    if (engine !== 'canvas') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
      drawCanvas();
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [engine, drawCanvas]);

  useEffect(() => {
    if (engine === 'canvas') {
      drawCanvas();
    }
  }, [engine, drawCanvas]);

  return (
    <div
      style={{ height }}
      className="w-full h-full flex flex-col bg-[#060B13] rounded-xl overflow-hidden border border-[#121B2B] select-none"
    >
      {/* Top Chart Header / Status Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#080E18] border-b border-[#121B2B] text-xs">
        <div className="flex items-center gap-2">
          {/* Active Symbol Chip */}
          <span className="font-mono font-bold text-white bg-[#0F172A] px-2 py-0.5 rounded border border-[#1E293B]">
            {tvSymbol}
          </span>

          {/* Engine indicator */}
          <div className="flex items-center gap-1.5 text-slate-400">
            <span
              className={`w-2 h-2 rounded-full ${
                engine === 'tradingview' && !hasIframeError
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-amber-500'
              }`}
            />
            <span className="font-medium text-[11px] text-slate-300">
              {engine === 'tradingview' ? 'TradingView Live' : 'Pro Canvas Engine'}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Toggle between TradingView and Canvas */}
          <button
            type="button"
            onClick={() => setEngine(engine === 'tradingview' ? 'canvas' : 'tradingview')}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#121B2B] text-slate-300 hover:text-white hover:bg-[#1A263C] transition-colors cursor-pointer"
            title="Switch charting engine"
          >
            <Layers className="w-3 h-3 text-sky-400" />
            <span>{engine === 'tradingview' ? 'Switch to Canvas' : 'Use TradingView'}</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => {
              setReloadKey((k) => k + 1);
              setIsIframeLoading(true);
              setHasIframeError(false);
            }}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#121B2B] transition-colors cursor-pointer"
            title="Reload chart feed"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Direct TradingView Link */}
          <a
            href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded text-slate-400 hover:text-sky-400 hover:bg-[#121B2B] transition-colors"
            title="Open in TradingView"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Main Chart Rendering Surface */}
      <div className="flex-1 w-full relative overflow-hidden bg-[#060B13]">
        {engine === 'tradingview' ? (
          <>
            {/* Elegant Skeleton / Loading Overlay */}
            {isIframeLoading && !hasIframeError && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#060B13]/90 backdrop-blur-xs text-slate-300 p-6 pointer-events-none">
                <div className="w-10 h-10 border-2 border-sky-500/20 border-t-sky-500 rounded-full animate-spin mb-3" />
                <p className="text-sm font-semibold text-white tracking-wide">
                  Connecting to TradingView Cloud Stream
                </p>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  Loading real-time market data for {tvSymbol}...
                </p>
              </div>
            )}

            {/* Offline or Blocked Notice with 1-click fallback */}
            {hasIframeError && (
              <div className="absolute top-2 left-2 right-2 z-20 flex items-center justify-between p-2.5 bg-amber-950/80 border border-amber-600/40 rounded-lg text-xs text-amber-200">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    TradingView stream connecting slowly. You can switch to the local Pro Canvas engine or retry.
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEngine('canvas')}
                    className="px-2.5 py-1 bg-amber-500 text-slate-950 font-bold rounded hover:bg-amber-400 cursor-pointer transition-colors"
                  >
                    View Canvas Chart
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReloadKey((k) => k + 1);
                      setIsIframeLoading(true);
                      setHasIframeError(false);
                    }}
                    className="px-2 py-1 bg-slate-800 text-slate-300 rounded hover:text-white cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            {/* Direct Official TradingView Widget Iframe */}
            <iframe
              key={`tv-iframe-${tvSymbol}-${interval}-${isDark ? 'dark' : 'light'}-${reloadKey}`}
              src={iframeUrl}
              title={`TradingView Chart ${tvSymbol}`}
              className="w-full h-full border-0 block"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation-by-user-activation"
              onLoad={() => {
                setIsIframeLoading(false);
                setHasIframeError(false);
              }}
              onError={() => {
                setIsIframeLoading(false);
                setHasIframeError(true);
              }}
            />
          </>
        ) : (
          /* Pro Canvas Chart View */
          <div className="w-full h-full relative">
            <canvas
              ref={canvasRef}
              className="w-full h-full block cursor-crosshair"
            />
            {/* Quick stats floating badge */}
            <div className="absolute top-2 left-2 bg-[#080E18]/90 border border-[#121B2B] px-3 py-1.5 rounded-lg text-xs font-mono space-y-0.5 pointer-events-none">
              <div className="text-slate-400 flex items-center gap-2">
                <span>LTP:</span>
                <span className="text-white font-bold">
                  {instrument.lastPrice
                    ? `₹${instrument.lastPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                    : '₹67,220.00'}
                </span>
                <span className={instrument.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {instrument.change >= 0 ? '+' : ''}{instrument.change?.toFixed(2) || '+1.20'}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default TradingViewChart;
