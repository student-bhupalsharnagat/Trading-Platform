import React, { useEffect, useRef, useState } from 'react';
import { Instrument } from '../types.ts';

interface TradingViewChartProps {
  instrument: Instrument;
  timeframe?: string;
  height?: string | number;
}

export const getTradingViewSymbol = (symbol: string): string => {
  const clean = symbol.toUpperCase().trim();

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

  // Indian Equities
  if (clean.includes('RELIANCE')) return 'NSE:RELIANCE';
  if (clean.includes('HDFC')) return 'NSE:HDFCBANK';
  if (clean.includes('TCS')) return 'NSE:TCS';
  if (clean.includes('INFY') || clean.includes('INFOSYS')) return 'NSE:INFY';
  if (clean.includes('ICICI')) return 'NSE:ICICIBANK';
  if (clean.includes('SBIN') || clean.includes('SBI')) return 'NSE:SBIN';
  if (clean.includes('BHARTI') || clean.includes('AIRTEL')) return 'NSE:BHARTIARTL';
  if (clean.includes('ITC')) return 'NSE:ITC';
  if (clean.includes('TATA') && clean.includes('MOTORS')) return 'NSE:TATAMOTORS';
  if (clean.includes('TATA') && clean.includes('STEEL')) return 'NSE:TATASTEEL';

  // Forex
  if (clean.includes('EUR/USD') || clean === 'EURUSD') return 'FX:EURUSD';
  if (clean.includes('GBP/USD') || clean === 'GBPUSD') return 'FX:GBPUSD';
  if (clean.includes('USD/INR') || clean === 'USDINR') return 'FX_IDC:USDINR';
  if (clean.includes('USD/JPY') || clean === 'USDJPY') return 'FX:USDJPY';
  if (clean.includes('AUD/USD') || clean === 'AUDUSD') return 'FX:AUDUSD';

  // Fallback: Strip options suffixes (CE, PE, FUT) to find underlying
  const basePart = clean.replace(/_\w+|\s+(FUT|CE|PE|\d+CE|\d+PE).*$/i, '').trim();
  return `NSE:${basePart || 'NIFTY'}`;
};

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  instrument,
  timeframe = '15m',
  height = '100%',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState(false);

  const tvSymbol = getTradingViewSymbol(instrument.symbol);

  // Map timeframe to TradingView interval string
  const getInterval = (tf: string): string => {
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
      default:
        return '15';
    }
  };

  const interval = getInterval(timeframe);

  useEffect(() => {
    let isMounted = true;
    const container = containerRef.current;
    if (!container) return;

    // Clean previous widget
    container.innerHTML = '';
    setLoadError(false);

    const widgetHolderId = `tv_chart_${Math.random().toString(36).substring(2, 9)}`;

    // Create wrapper div
    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container';
    widgetContainer.style.height = '100%';
    widgetContainer.style.width = '100%';

    const widgetHolder = document.createElement('div');
    widgetHolder.id = widgetHolderId;
    widgetHolder.style.height = '100%';
    widgetHolder.style.width = '100%';
    widgetContainer.appendChild(widgetHolder);
    container.appendChild(widgetContainer);

    const initWidget = () => {
      if (!isMounted) return;
      const el = document.getElementById(widgetHolderId);
      if (!el || !el.parentNode) return;

      try {
        if (typeof (window as any).TradingView !== 'undefined') {
          new (window as any).TradingView.widget({
            autosize: true,
            symbol: tvSymbol,
            interval: interval,
            timezone: 'Asia/Kolkata',
            theme: 'dark',
            style: '1',
            locale: 'en',
            toolbar_bg: '#080E18',
            enable_publishing: false,
            allow_symbol_change: false,
            container_id: widgetHolderId,
            hide_side_toolbar: true,
            hide_legend: false,
            save_image: false,
            studies: [],
            overrides: {
              'paneProperties.background': '#060B13',
              'paneProperties.vertGridProperties.color': '#0C1320',
              'paneProperties.horzGridProperties.color': '#0C1320',
              'symbolWatermarkProperties.transparency': 100,
              'scalesProperties.textColor': '#94A3B8',
              'scalesProperties.lineColor': '#1E293B',
              'mainSeriesProperties.candleStyle.upColor': '#10B981',
              'mainSeriesProperties.candleStyle.downColor': '#EF4444',
              'mainSeriesProperties.candleStyle.drawWick': true,
              'mainSeriesProperties.candleStyle.drawBorder': true,
              'mainSeriesProperties.candleStyle.borderColor': '#334155',
              'mainSeriesProperties.candleStyle.borderUpColor': '#10B981',
              'mainSeriesProperties.candleStyle.borderDownColor': '#EF4444',
              'mainSeriesProperties.candleStyle.wickUpColor': '#10B981',
              'mainSeriesProperties.candleStyle.wickDownColor': '#EF4444',
            },
          });
        }
      } catch (e) {
        console.warn('TradingView widget initialization warning:', e);
      }
    };

    // Load TradingView library if needed
    if (typeof (window as any).TradingView === 'undefined') {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = () => {
        if (isMounted) initWidget();
      };
      script.onerror = () => {
        if (isMounted) setLoadError(true);
      };
      document.head.appendChild(script);
    } else {
      const timer = setTimeout(() => {
        if (isMounted) initWidget();
      }, 50);
      return () => {
        clearTimeout(timer);
        isMounted = false;
        if (container) container.innerHTML = '';
      };
    }

    return () => {
      isMounted = false;
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [tvSymbol, interval]);

  if (loadError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#060B13] text-slate-400 p-6 text-center">
        <p className="text-sm font-semibold text-slate-300">
          TradingView chart for {tvSymbol}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Loading market data stream...
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="w-full h-full min-h-[350px] bg-[#060B13] rounded-xl overflow-hidden"
    />
  );
};
