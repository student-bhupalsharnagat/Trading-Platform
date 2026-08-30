import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.ts';

const router = Router();

// Simulated rich live trading instruments matching screenshot
const INITIAL_INSTRUMENTS = [
  {
    id: 'gold_fut',
    symbol: 'GOLD FUT',
    category: 'COMMODITY',
    expiry: '31 Aug',
    lastPrice: 157083.2,
    change: -1139.0,
    changePercent: -0.72,
    intraday: 31404.0,
    holding: 261700.0,
    sparkline: [158200, 158100, 157800, 157500, 157200, 157083.2],
    trend: 'down',
  },
  {
    id: 'silver_fut',
    symbol: 'SILVER FUT',
    category: 'COMMODITY',
    expiry: '31 Aug',
    lastPrice: 2381.73,
    change: -35.0,
    changePercent: -1.45,
    intraday: 142.86,
    holding: 1190.5,
    sparkline: [2416, 2410, 2400, 2390, 2385, 2381.73],
    trend: 'down',
  },
  {
    id: 'copper_fut',
    symbol: 'COPPER FUT',
    category: 'COMMODITY',
    expiry: '31 Aug',
    lastPrice: 847.8,
    change: 3.8,
    changePercent: 0.45,
    intraday: 2840.0,
    holding: 18420.0,
    sparkline: [844, 845, 844.5, 846, 847.2, 847.8],
    trend: 'up',
  },
  {
    id: 'crude_oil_fut',
    symbol: 'CRUDE OIL FUT',
    category: 'COMMODITY',
    expiry: '19 Sep',
    lastPrice: 6245.5,
    change: 84.0,
    changePercent: 1.36,
    intraday: 5120.0,
    holding: 45000.0,
    sparkline: [6160, 6180, 6210, 6200, 6230, 6245.5],
    trend: 'up',
  },
  {
    id: 'nifty_50',
    symbol: 'NIFTY 50',
    category: 'INDEX',
    expiry: 'Spot',
    lastPrice: 24852.15,
    change: 142.6,
    changePercent: 0.58,
    intraday: 8900.0,
    holding: 120500.0,
    sparkline: [24710, 24750, 24780, 24820, 24852.15],
    trend: 'up',
  },
  {
    id: 'btc_usdt',
    symbol: 'BTC / USDT',
    category: 'CRYPTO',
    expiry: 'Perpetual',
    lastPrice: 68420.0,
    change: -840.0,
    changePercent: -1.21,
    intraday: 12500.0,
    holding: 340000.0,
    sparkline: [69260, 69100, 68800, 68600, 68420.0],
    trend: 'down',
  },
  {
    id: 'rel_equity',
    symbol: 'RELIANCE',
    category: 'EQUITY',
    expiry: 'EQ',
    lastPrice: 2980.4,
    change: 18.2,
    changePercent: 0.61,
    intraday: 1200.0,
    holding: 59600.0,
    sparkline: [2962, 2965, 2970, 2975, 2980.4],
    trend: 'up',
  },
  {
    id: 'usd_inr',
    symbol: 'USD / INR',
    category: 'FOREX',
    expiry: '28 Sep',
    lastPrice: 83.94,
    change: 0.08,
    changePercent: 0.1,
    intraday: 450.0,
    holding: 8394.0,
    sparkline: [83.86, 83.88, 83.9, 83.92, 83.94],
    trend: 'up',
  },
];

// Get live instruments list
router.get('/instruments', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  // Add subtle live jitter to prices for realistic market feeling
  const liveData = INITIAL_INSTRUMENTS.map((inst) => {
    const jitter = (Math.random() - 0.5) * (inst.lastPrice * 0.001);
    const updatedPrice = Number((inst.lastPrice + jitter).toFixed(2));
    return {
      ...inst,
      lastPrice: updatedPrice,
    };
  });

  res.json({
    success: true,
    instruments: liveData,
  });
});

// Get user portfolio & orders
router.get('/portfolio', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    wallet: {
      availableBalance: req.user?.demoBalance || 1000000.0,
      usedMargin: 312520.0,
      totalPnL: 34386.86,
      todayPnL: 4386.86,
    },
    positions: [
      {
        symbol: 'GOLD FUT',
        type: 'BUY',
        qty: 1,
        avgPrice: 158222.2,
        ltp: 157083.2,
        pnl: -1139.0,
        pnlPercent: -0.72,
      },
      {
        symbol: 'COPPER FUT',
        type: 'BUY',
        qty: 5,
        avgPrice: 844.0,
        ltp: 847.8,
        pnl: 1900.0,
        pnlPercent: 0.45,
      },
    ],
    orders: [
      {
        id: 'ORD-88219',
        symbol: 'SILVER FUT',
        type: 'SELL',
        qty: 1,
        price: 2385.0,
        status: 'EXECUTED',
        time: '14:22:05',
      },
      {
        id: 'ORD-88220',
        symbol: 'CRUDE OIL FUT',
        type: 'BUY',
        qty: 2,
        price: 6240.0,
        status: 'EXECUTED',
        time: '14:38:12',
      },
    ],
  });
});

export default router;
