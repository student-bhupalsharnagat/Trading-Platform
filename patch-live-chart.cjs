const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'LiveChart.tsx');
let content = fs.readFileSync(filePath, 'utf8');
const normalize = (s) => s.replace(/\r\n/g, '\n');

// 1. Add globalCandleCache
const target1 = `interface LiveChartProps {`;
const replacement1 = `// Bug #12 & #23: Module-level cache so switching tabs/intervals does not wipe historical candle history
const globalCandleCache = new Map<string, Candle[]>();

interface LiveChartProps {`;

if (normalize(content).includes(normalize(target1))) {
  content = normalize(content).replace(normalize(target1), normalize(replacement1));
  console.log('Successfully added globalCandleCache');
} else {
  console.error('Target 1 not found in LiveChart.tsx');
}

// 2. Initialize candles from cache if available
const target2 = `  const [candles, setCandles] = useState<Candle[]>(() => generateInitialCandles(instrument.lastPrice || 1000, '15m'));`;
const replacement2 = `  const [candles, setCandles] = useState<Candle[]>(() => {
    const key = \`\${instrument.symbol}_15m\`;
    const cached = globalCandleCache.get(key);
    if (cached && cached.length > 0) return cached;
    const initial = generateInitialCandles(instrument.lastPrice || 1000, '15m');
    globalCandleCache.set(key, initial);
    return initial;
  });`;

if (normalize(content).includes(normalize(target2))) {
  content = normalize(content).replace(normalize(target2), normalize(replacement2));
  console.log('Successfully patched initial candle caching');
} else {
  console.error('Target 2 not found in LiveChart.tsx');
}

// 3. Update candles effect to check cache and write to cache
const target3 = `  useEffect(() => {
    let isMounted = true;
    authApi
      .getCandles(instrument.symbol, timeframe)
      .then((res) => {
        if (isMounted) {
          if (res.candles && res.candles.length > 0) {
            setCandles(res.candles);
          } else {
            setCandles(generateInitialCandles(instrument.lastPrice, timeframe));
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setCandles(generateInitialCandles(instrument.lastPrice, timeframe));
        }
      });

    return () => {
      isMounted = false;
    };
  }, [instrument.symbol, timeframe]);`;

const replacement3 = `  useEffect(() => {
    const key = \`\${instrument.symbol}_\${timeframe}\`;
    const cached = globalCandleCache.get(key);
    if (cached && cached.length > 0) {
      setCandles(cached);
    }
    let isMounted = true;
    authApi
      .getCandles(instrument.symbol, timeframe)
      .then((res) => {
        if (isMounted) {
          if (res.candles && res.candles.length > 0) {
            setCandles(res.candles);
            globalCandleCache.set(key, res.candles);
          } else if (!globalCandleCache.has(key)) {
            const initial = generateInitialCandles(instrument.lastPrice, timeframe);
            setCandles(initial);
            globalCandleCache.set(key, initial);
          }
        }
      })
      .catch(() => {
        if (isMounted && !globalCandleCache.has(key)) {
          const initial = generateInitialCandles(instrument.lastPrice, timeframe);
          setCandles(initial);
          globalCandleCache.set(key, initial);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [instrument.symbol, timeframe]);`;

if (normalize(content).includes(normalize(target3))) {
  content = normalize(content).replace(normalize(target3), normalize(replacement3));
  console.log('Successfully patched candle sync effect');
} else {
  console.error('Target 3 not found in LiveChart.tsx');
}

// 4. Update sync on tick effect to also sync to cache
const target4 = `  useEffect(() => {
    if (!instrument.lastPrice) return;
    setCandles((prev) => {
      if (!prev || prev.length === 0) return prev;
      const lastIdx = prev.length - 1;
      const last = { ...prev[lastIdx] };
      last.close = instrument.lastPrice;
      last.high = Math.max(last.high, instrument.lastPrice);
      last.low = Math.min(last.low, instrument.lastPrice);
      const updated = [...prev];
      updated[lastIdx] = last;
      return updated;
    });
  }, [instrument.lastPrice]);`;

const replacement4 = `  useEffect(() => {
    if (!instrument.lastPrice) return;
    setCandles((prev) => {
      if (!prev || prev.length === 0) return prev;
      const lastIdx = prev.length - 1;
      const last = { ...prev[lastIdx] };
      last.close = instrument.lastPrice;
      last.high = Math.max(last.high, instrument.lastPrice);
      last.low = Math.min(last.low, instrument.lastPrice);
      const updated = [...prev];
      updated[lastIdx] = last;
      globalCandleCache.set(\`\${instrument.symbol}_\${timeframe}\`, updated);
      return updated;
    });
  }, [instrument.lastPrice, instrument.symbol, timeframe]);`;

if (normalize(content).includes(normalize(target4))) {
  content = normalize(content).replace(normalize(target4), normalize(replacement4));
  console.log('Successfully patched live price tick candle sync');
} else {
  console.error('Target 4 not found in LiveChart.tsx');
}

// 5. Bug #25: Line chart rendering guard and pure line rendering
const target5 = `    } else if (chartType === 'Line' || chartType === 'Area') {
      const lastX = leftMargin + (visibleCandles.length - 1) * candleWidth + candleWidth / 2;
      const firstX = leftMargin + candleWidth / 2;
      const baseY = topMargin + chartHeight;

      // Area gradient for both Line and Area styles (so Line draws visible shaded gradient)
      const gradient = ctx.createLinearGradient(0, topMargin, 0, baseY);
      gradient.addColorStop(0, chartType === 'Line' ? 'rgba(56, 189, 248, 0.20)' : 'rgba(16, 185, 129, 0.22)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

      ctx.beginPath();
      visibleCandles.forEach((c, idx) => {
        const x = leftMargin + idx * candleWidth + candleWidth / 2;
        const y = priceToY(c.close);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(lastX, baseY);
      ctx.lineTo(firstX, baseY);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Price line path
      ctx.beginPath();
      visibleCandles.forEach((c, idx) => {
        const x = leftMargin + idx * candleWidth + candleWidth / 2;
        const y = priceToY(c.close);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = chartType === 'Line' ? '#38BDF8' : '#10B981';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }`;

const replacement5 = `    } else if (chartType === 'Line' || chartType === 'Area') {
      // Bug #25: Robust Line and Area rendering with NaN guards
      const lastX = leftMargin + Math.max(0, visibleCandles.length - 1) * candleWidth + candleWidth / 2;
      const firstX = leftMargin + candleWidth / 2;
      const baseY = topMargin + chartHeight;

      if (chartType === 'Area') {
        const gradient = ctx.createLinearGradient(0, topMargin, 0, baseY);
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

        ctx.beginPath();
        visibleCandles.forEach((c, idx) => {
          const x = leftMargin + idx * candleWidth + candleWidth / 2;
          const y = priceToY(c.close);
          if (isFinite(x) && isFinite(y)) {
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        });
        ctx.lineTo(lastX, baseY);
        ctx.lineTo(firstX, baseY);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Price line path (drawn for both Line and Area)
      ctx.beginPath();
      visibleCandles.forEach((c, idx) => {
        const x = leftMargin + idx * candleWidth + candleWidth / 2;
        const y = priceToY(c.close);
        if (isFinite(x) && isFinite(y)) {
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      });
      ctx.strokeStyle = chartType === 'Line' ? '#38BDF8' : '#10B981';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }`;

if (normalize(content).includes(normalize(target5))) {
  content = normalize(content).replace(normalize(target5), normalize(replacement5));
  console.log('Successfully patched line chart rendering');
} else {
  console.error('Target 5 not found in LiveChart.tsx');
}

// 6. Bug #35: Chart engine button label
const target6 = `              {engineMode === 'TRADINGVIEW' ? 'TradingView' : 'Standard'}`;
const replacement6 = `              {engineMode === 'TRADINGVIEW' ? 'TradingView Chart' : 'Standard Technical'}`;

if (normalize(content).includes(normalize(target6))) {
  content = normalize(content).replace(normalize(target6), normalize(replacement6));
  console.log('Successfully patched engine label');
} else {
  console.error('Target 6 not found in LiveChart.tsx');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished updating LiveChart.tsx');
