import { Router, Response } from 'express';
import { requireAuth, optionalAuth, AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import { Instrument, Candle, Position, Order, WalletFunds, SupportTicket, AppNotification } from '../../types.ts';

const router = Router();

// Helper to generate realistic historical candlestick data
function generateHistoricalCandles(basePrice: number, count: number = 80, intervalMinutes: number = 15): Candle[] {
  const candles: Candle[] = [];
  const now = Date.now();
  const intervalMs = intervalMinutes * 60 * 1000;
  let currentPrice = basePrice * (1 - (count * 0.0015));

  for (let i = count; i >= 0; i--) {
    const time = now - i * intervalMs;
    const volatility = currentPrice * 0.0035;
    const change = (Math.random() - 0.48) * volatility;
    const open = currentPrice;
    const close = Math.max(1, open + change);
    const high = Math.max(open, close) + Math.random() * volatility * 0.8;
    const low = Math.min(open, close) - Math.random() * volatility * 0.8;
    const volume = Math.floor(50 + Math.random() * 850);

    candles.push({
      time,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    });

    currentPrice = close;
  }
  return candles;
}

// Master instruments dataset with exact parameters from Screenshot 1 & 2
let INSTRUMENTS: Instrument[] = [
  {
    id: 'gold_fut',
    symbol: 'GOLD FUT',
    sectionName: 'GOLD',
    name: 'Gold Futures 100G',
    category: 'COMMODITY',
    expiry: '31 Aug',
    lastPrice: 157366.34,
    openPrice: 158500.0,
    highPrice: 159893.0,
    lowPrice: 156365.0,
    prevClose: 158505.34,
    change: -1139.0000,
    changePercent: -0.72,
    intraday: 31404.0,
    holding: 261700.0,
    lotSize: 100,
    maxLots: 50,
    ask: 157370.0,
    bid: 157362.0,
    sparkline: [158500, 158200, 157800, 157500, 157400, 157366.34],
    trend: 'down',
  },
  {
    id: 'silver_fut',
    symbol: 'SILVER FUT',
    sectionName: 'SILVER',
    name: 'Silver Futures',
    category: 'COMMODITY',
    expiry: '31 Aug',
    lastPrice: 2378.26,
    openPrice: 2413.0,
    highPrice: 2435.5,
    lowPrice: 2370.0,
    prevClose: 2413.26,
    change: -35.0000,
    changePercent: -1.45,
    intraday: 142.86,
    holding: 1190.5,
    lotSize: 30,
    maxLots: 100,
    ask: 2379.0,
    bid: 2377.5,
    sparkline: [2413, 2405, 2395, 2390, 2382, 2378.26],
    trend: 'down',
  },
  {
    id: 'copper_fut',
    symbol: 'COPPER FUT',
    sectionName: 'COPPER',
    name: 'Copper Futures',
    category: 'COMMODITY',
    expiry: '31 Aug',
    lastPrice: 846.89,
    openPrice: 843.09,
    highPrice: 852.0,
    lowPrice: 841.0,
    prevClose: 843.09,
    change: 3.80,
    changePercent: 0.45,
    intraday: 2840.0,
    holding: 18420.0,
    lotSize: 2500,
    maxLots: 40,
    ask: 847.2,
    bid: 846.5,
    sparkline: [843.09, 844.0, 844.8, 845.5, 846.2, 846.89],
    trend: 'up',
  },
  {
    id: 'crude_oil_fut',
    symbol: 'CRUDE OIL FUT',
    sectionName: 'CRUDE OIL',
    name: 'Crude Oil Futures',
    category: 'COMMODITY',
    expiry: '19 Aug',
    lastPrice: 6747.87,
    openPrice: 6663.87,
    highPrice: 6790.0,
    lowPrice: 6640.0,
    prevClose: 6663.87,
    change: 84.00,
    changePercent: 1.26,
    intraday: 8400.0,
    holding: 42000.0,
    lotSize: 100,
    maxLots: 50,
    ask: 6749.0,
    bid: 6746.5,
    sparkline: [6663.87, 6680, 6710, 6725, 6740, 6747.87],
    trend: 'up',
  },
  {
    id: 'btc_usdt',
    symbol: 'BTC/USDT',
    sectionName: 'BITCOIN',
    name: 'Bitcoin Perpetual',
    category: 'CRYPTO',
    expiry: 'Perpetual',
    lastPrice: 67219.85,
    openPrice: 65971.05,
    highPrice: 67800.0,
    lowPrice: 65800.0,
    prevClose: 65971.05,
    change: 1248.80,
    changePercent: 1.89,
    intraday: 12500.0,
    holding: 340000.0,
    lotSize: 1,
    maxLots: 20,
    ask: 67225.0,
    bid: 67215.0,
    sparkline: [65971, 66200, 66600, 66900, 67150, 67219.85],
    trend: 'up',
  },
  {
    id: 'bank_nifty_fut',
    symbol: 'BANKNIFTY FUT',
    sectionName: 'BANKNIFTY',
    name: 'Bank Nifty Futures',
    category: 'INDEX',
    expiry: '28 Aug',
    lastPrice: 51383.41,
    openPrice: 51763.41,
    highPrice: 51900.0,
    lowPrice: 51200.0,
    prevClose: 51763.41,
    change: -380.0000,
    changePercent: -0.74,
    intraday: 38200.0,
    holding: 191000.0,
    lotSize: 15,
    maxLots: 60,
    ask: 51385.0,
    bid: 51380.0,
    sparkline: [51763, 51650, 51500, 51450, 51400, 51383.41],
    trend: 'down',
  },
  {
    id: 'reliance_fut',
    symbol: 'RELIANCE FUT',
    sectionName: 'RELIANCE',
    name: 'Reliance Industries Futures',
    category: 'EQUITY',
    expiry: '31 Aug',
    lastPrice: 2931.46,
    openPrice: 2908.96,
    highPrice: 2945.0,
    lowPrice: 2900.0,
    prevClose: 2908.96,
    change: 22.50,
    changePercent: 0.77,
    intraday: 4200.0,
    holding: 21000.0,
    lotSize: 250,
    maxLots: 100,
    ask: 2932.0,
    bid: 2931.0,
    sparkline: [2908.96, 2915, 2920, 2928, 2930, 2931.46],
    trend: 'up',
  },
  {
    id: 'tcs_fut',
    symbol: 'TCS FUT',
    sectionName: 'TCS',
    name: 'Tata Consultancy Services Futures',
    category: 'EQUITY',
    expiry: '31 Aug',
    lastPrice: 4141.06,
    openPrice: 4189.06,
    highPrice: 4210.0,
    lowPrice: 4130.0,
    prevClose: 4189.06,
    change: -48.0000,
    changePercent: -1.15,
    intraday: 3600.0,
    holding: 18000.0,
    lotSize: 175,
    maxLots: 80,
    ask: 4142.0,
    bid: 4140.0,
    sparkline: [4189, 4175, 4160, 4150, 4145, 4141.06],
    trend: 'down',
  },
  {
    id: 'eur_usd',
    symbol: 'EUR/USD',
    sectionName: 'EURO',
    name: 'Euro / US Dollar',
    category: 'FOREX',
    expiry: 'Spot',
    lastPrice: 1.0851,
    openPrice: 1.0820,
    highPrice: 1.0865,
    lowPrice: 1.0815,
    prevClose: 1.0820,
    change: 0.0031,
    changePercent: 0.29,
    intraday: 840.0,
    holding: 4200.0,
    lotSize: 1000,
    maxLots: 100,
    ask: 1.0852,
    bid: 1.0850,
    sparkline: [1.082, 1.0828, 1.0835, 1.0842, 1.0848, 1.0851],
    trend: 'up',
  },
  {
    id: 'gbp_usd',
    symbol: 'GBP/USD',
    sectionName: 'STERLING',
    name: 'British Pound / US Dollar',
    category: 'FOREX',
    expiry: 'Spot',
    lastPrice: 1.2794,
    openPrice: 1.2818,
    highPrice: 1.2830,
    lowPrice: 1.2780,
    prevClose: 1.2818,
    change: -0.0024,
    changePercent: -0.19,
    intraday: 620.0,
    holding: 3100.0,
    lotSize: 1000,
    maxLots: 100,
    ask: 1.2796,
    bid: 1.2792,
    sparkline: [1.2818, 1.2810, 1.2805, 1.2798, 1.2794],
    trend: 'down',
  },
  {
    id: 'nifty_50',
    symbol: 'NIFTY 50',
    sectionName: 'NIFTY',
    name: 'NIFTY 50 Index',
    category: 'INDEX',
    expiry: '28 Aug',
    lastPrice: 24852.15,
    openPrice: 24709.55,
    highPrice: 24910.0,
    lowPrice: 24690.0,
    prevClose: 24709.55,
    change: 142.60,
    changePercent: 0.58,
    intraday: 8900.0,
    holding: 120500.0,
    lotSize: 25,
    maxLots: 75,
    ask: 24853.0,
    bid: 24851.5,
    sparkline: [24710, 24750, 24780, 24820, 24852.15],
    trend: 'up',
  },
  {
    id: 'eth_usdt',
    symbol: 'ETH/USDT',
    sectionName: 'ETHEREUM',
    name: 'Ethereum Perpetual',
    category: 'CRYPTO',
    expiry: 'Perpetual',
    lastPrice: 3540.25,
    openPrice: 3490.0,
    highPrice: 3590.0,
    lowPrice: 3470.0,
    prevClose: 3490.0,
    change: 50.25,
    changePercent: 1.44,
    intraday: 3500.0,
    holding: 70000.0,
    lotSize: 1,
    maxLots: 50,
    ask: 3541.0,
    bid: 3539.5,
    sparkline: [3490, 3505, 3520, 3510, 3540.25],
    trend: 'up',
  },
];

// In-memory state for active user sessions
let userWallet: WalletFunds = {
  availableBalance: 142840.0,
  usedMargin: 38210.0,
  totalPnL: 34386.86,
  todayPnL: 504.52,
  deposited: 200000.0,
  withdrawn: 50000.0,
};

let userPositions: Position[] = [
  {
    id: 'POS-1',
    symbol: 'GOLD FUT',
    category: 'COMMODITY',
    type: 'BUY',
    product: 'INTRADAY',
    qty: 100,
    lots: 1,
    lotSize: 100,
    avgPrice: 156820.0,
    ltp: 156578.01,
    pnl: -241.99,
    pnlPercent: -0.15,
    timestamp: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'POS-2',
    symbol: 'COPPER FUT',
    category: 'COMMODITY',
    type: 'BUY',
    product: 'INTRADAY',
    qty: 2500,
    lots: 1,
    lotSize: 2500,
    avgPrice: 844.0,
    ltp: 847.8,
    pnl: 746.51,
    pnlPercent: 0.45,
    timestamp: new Date(Date.now() - 7200000).toISOString(),
  },
];

let userOrders: Order[] = [
  {
    id: 'ORD-99101',
    symbol: 'GOLD FUT',
    type: 'BUY',
    orderType: 'MARKET',
    product: 'INTRADAY',
    qty: 100,
    lots: 1,
    lotSize: 100,
    price: 156820.0,
    status: 'EXECUTED',
    time: '11:15:20',
    date: '31 Aug 2026',
  },
  {
    id: 'ORD-99102',
    symbol: 'SILVER FUT',
    type: 'SELL',
    orderType: 'LIMIT',
    product: 'INTRADAY',
    qty: 30,
    lots: 1,
    lotSize: 30,
    price: 2385.0,
    status: 'EXECUTED',
    time: '10:42:05',
    date: '31 Aug 2026',
  },
  {
    id: 'ORD-99103',
    symbol: 'CRUDE OIL FUT',
    type: 'BUY',
    orderType: 'LIMIT',
    product: 'HOLDING',
    qty: 100,
    lots: 1,
    lotSize: 100,
    price: 6240.0,
    status: 'EXECUTED',
    time: '09:30:12',
    date: '31 Aug 2026',
  },
];

let userTickets: SupportTicket[] = [
  {
    id: 'TKT-1042',
    subject: 'Unable to place order during market hours',
    category: 'Trading Issues',
    priority: 'High',
    status: 'IN_PROGRESS',
    createdAt: '30 Aug 2026, 09:14',
    updatedAt: '30 Aug 2026, 11:32',
    messages: [
      {
        id: 'msg-1042-1',
        sender: 'user',
        senderName: 'You',
        text: "I tried placing a GOLD FUT order at 09:10 IST but got an error saying 'Order rejected'. My account has sufficient margin.",
        time: '09:14',
        timestamp: '30 Aug 2026, 09:14',
      },
      {
        id: 'msg-1042-2',
        sender: 'support',
        senderName: 'Vertex Support',
        text: 'Hello! Thank you for reaching out. We have escalated this to our trading desk. Could you share the exact error code shown on screen?',
        time: '11:32',
        timestamp: '30 Aug 2026, 11:32',
      },
    ],
  },
  {
    id: 'TKT-1038',
    subject: 'Withdrawal pending for 3 days',
    category: 'Payment & Withdrawal',
    priority: 'Urgent',
    status: 'OPEN',
    createdAt: '27 Aug 2026, 16:45',
    updatedAt: '27 Aug 2026, 16:45',
    messages: [
      {
        id: 'msg-1038-1',
        sender: 'user',
        senderName: 'You',
        text: 'I submitted a withdrawal of ₹50,000 on 27 Aug. It has been 3 days and the amount is still not credited to my bank account.',
        time: '16:45',
        timestamp: '27 Aug 2026, 16:45',
      },
    ],
  },
  {
    id: 'TKT-1029',
    subject: 'KYC document re-submission required',
    category: 'KYC & Documents',
    priority: 'Medium',
    status: 'RESOLVED',
    createdAt: '22 Aug 2026, 10:05',
    updatedAt: '24 Aug 2026, 14:18',
    rating: 5,
    messages: [
      {
        id: 'msg-1029-1',
        sender: 'user',
        senderName: 'You',
        text: 'I received an email saying my PAN card was rejected. I have re-uploaded a clearer copy.',
        time: '10:05',
        timestamp: '22 Aug 2026, 10:05',
      },
      {
        id: 'msg-1029-2',
        sender: 'support',
        senderName: 'Vertex Support',
        text: 'Thank you for re-uploading. Your KYC has been verified and your account is now fully active. Sorry for the inconvenience.',
        time: '14:18',
        timestamp: '24 Aug 2026, 14:18',
      },
    ],
  },
];

let userNotifications: AppNotification[] = [
  {
    id: 'NOTIF-1',
    title: 'Order Executed',
    message: 'BUY 1 Lot of GOLD FUT executed at ₹1,56,820.00',
    type: 'ORDER',
    time: '11:15 AM',
    read: false,
  },
  {
    id: 'NOTIF-2',
    title: 'Price Alert Triggered',
    message: 'COPPER FUT broke above ₹845.00 resistance level.',
    type: 'PRICE_ALERT',
    time: '10:05 AM',
    read: false,
  },
  {
    id: 'NOTIF-3',
    title: 'Margin Update',
    message: 'Your available margin is ₹1,42,840. Healthy account coverage.',
    type: 'MARGIN',
    time: '09:00 AM',
    read: false,
  },
];

// Dynamic tick simulator for live streaming market feeling
setInterval(() => {
  INSTRUMENTS = INSTRUMENTS.map((inst) => {
    const volatilityPct = 0.0006;
    const delta = (Math.random() - 0.49) * (inst.lastPrice * volatilityPct);
    const updatedPrice = Number(Math.max(1, inst.lastPrice + delta).toFixed(2));
    const change = Number((updatedPrice - inst.prevClose).toFixed(2));
    const changePercent = Number(((change / inst.prevClose) * 100).toFixed(2));

    const highPrice = Number(Math.max(inst.highPrice, updatedPrice).toFixed(2));
    const lowPrice = Number(Math.min(inst.lowPrice, updatedPrice).toFixed(2));

    const spread = updatedPrice * 0.0002;
    const ask = Number((updatedPrice + spread).toFixed(2));
    const bid = Number((updatedPrice - spread).toFixed(2));

    return {
      ...inst,
      lastPrice: updatedPrice,
      highPrice,
      lowPrice,
      change,
      changePercent,
      ask,
      bid,
      trend: change >= 0 ? 'up' : 'down',
    };
  });

  // Recalculate open PnL dynamically
  let livePnL = 0;
  userPositions = userPositions.map((pos) => {
    const liveInst = INSTRUMENTS.find((i) => i.symbol === pos.symbol);
    const ltp = liveInst ? liveInst.lastPrice : pos.ltp;
    const pnl = pos.type === 'BUY' ? (ltp - pos.avgPrice) * pos.qty : (pos.avgPrice - ltp) * pos.qty;
    const pnlPercent = Number(((pnl / (pos.avgPrice * pos.qty)) * 100).toFixed(2));
    livePnL += pnl;

    return {
      ...pos,
      ltp,
      pnl: Number(pnl.toFixed(2)),
      pnlPercent,
    };
  });

  userWallet.todayPnL = Number((500 + livePnL).toFixed(2));
  userWallet.totalPnL = Number((34000 + livePnL).toFixed(2));
}, 1500);

// Get live instruments list
router.get('/instruments', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    instruments: INSTRUMENTS,
  });
});

// Get historical candles for live chart
router.get('/candles/:symbol', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const timeframe = (req.query.timeframe as string) || '15m';

  const inst = INSTRUMENTS.find((i) => i.symbol.toLowerCase() === symbol.toLowerCase() || i.id.toLowerCase() === symbol.toLowerCase()) || INSTRUMENTS[0];

  let intervalMinutes = 15;
  let count = 90;
  if (timeframe === '1m') { intervalMinutes = 1; count = 100; }
  else if (timeframe === '5m') { intervalMinutes = 5; count = 100; }
  else if (timeframe === '15m') { intervalMinutes = 15; count = 90; }
  else if (timeframe === '30m') { intervalMinutes = 30; count = 80; }
  else if (timeframe === '1h') { intervalMinutes = 60; count = 80; }
  else if (timeframe === '1D') { intervalMinutes = 1440; count = 60; }

  const candles = generateHistoricalCandles(inst.lastPrice, count, intervalMinutes);

  // Sync the latest candle with exact live price
  if (candles.length > 0) {
    const last = candles[candles.length - 1];
    last.close = inst.lastPrice;
    last.high = Math.max(last.high, inst.lastPrice);
    last.low = Math.min(last.low, inst.lastPrice);
  }

  res.json({
    success: true,
    symbol: inst.symbol,
    timeframe,
    candles,
    instrument: inst,
  });
});

// Get portfolio data
router.get('/portfolio', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    wallet: userWallet,
    positions: userPositions,
    orders: userOrders,
  });
});

// Place new Order (BUY / SELL)
router.post('/order', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      symbol,
      type, // BUY or SELL
      orderType, // MARKET or LIMIT
      product, // INTRADAY or HOLDING
      lots,
      limitPrice,
      stopLoss,
      target,
    } = req.body;

    if (!symbol || !type || !lots || lots <= 0) {
      res.status(400).json({ success: false, message: 'Invalid order parameters.' });
      return;
    }

    const inst = INSTRUMENTS.find((i) => i.symbol === symbol || i.id === symbol);
    if (!inst) {
      res.status(404).json({ success: false, message: 'Instrument not found.' });
      return;
    }

    const execPrice = orderType === 'LIMIT' && limitPrice ? Number(limitPrice) : inst.lastPrice;
    const requiredMargin = product === 'INTRADAY' ? inst.intraday * lots : inst.holding * lots;

    if (userWallet.availableBalance < requiredMargin) {
      res.status(400).json({
        success: false,
        message: `Insufficient margin. Required ₹${requiredMargin.toLocaleString('en-IN')}, available ₹${userWallet.availableBalance.toLocaleString('en-IN')}.`,
      });
      return;
    }

    // Deduct margin
    userWallet.availableBalance = Math.max(0, userWallet.availableBalance - requiredMargin);
    userWallet.usedMargin += requiredMargin;

    const orderId = `ORD-${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const newOrder: Order = {
      id: orderId,
      symbol: inst.symbol,
      type,
      orderType: orderType || 'MARKET',
      product: product || 'INTRADAY',
      lots,
      qty: lots * inst.lotSize,
      lotSize: inst.lotSize,
      price: execPrice,
      stopLoss: stopLoss ? Number(stopLoss) : undefined,
      target: target ? Number(target) : undefined,
      status: 'EXECUTED',
      time: timeStr,
      date: dateStr,
    };

    userOrders.unshift(newOrder);

    // Create or update position
    const existingPos = userPositions.find((p) => p.symbol === inst.symbol && p.product === (product || 'INTRADAY'));
    if (existingPos) {
      if (existingPos.type === type) {
        // Average up
        const totalQty = existingPos.qty + newOrder.qty;
        const totalCost = existingPos.avgPrice * existingPos.qty + execPrice * newOrder.qty;
        existingPos.avgPrice = Number((totalCost / totalQty).toFixed(2));
        existingPos.qty = totalQty;
        existingPos.lots += lots;
      } else {
        // Close or reduce position
        if (existingPos.lots <= lots) {
          userPositions = userPositions.filter((p) => p.id !== existingPos.id);
        } else {
          existingPos.lots -= lots;
          existingPos.qty -= newOrder.qty;
        }
      }
    } else {
      userPositions.unshift({
        id: `POS-${Math.floor(1000 + Math.random() * 9000)}`,
        symbol: inst.symbol,
        category: inst.category,
        type,
        product: product || 'INTRADAY',
        lots,
        qty: lots * inst.lotSize,
        lotSize: inst.lotSize,
        avgPrice: execPrice,
        ltp: inst.lastPrice,
        pnl: 0,
        pnlPercent: 0,
        timestamp: new Date().toISOString(),
      });
    }

    // Add notification
    userNotifications.unshift({
      id: `NOTIF-${Date.now()}`,
      title: 'Order Executed',
      message: `${type} ${lots} Lot(s) of ${inst.symbol} executed at ₹${execPrice.toLocaleString('en-IN')}`,
      type: 'ORDER',
      time: 'Just now',
      read: false,
    });

    res.json({
      success: true,
      message: `${type} order for ${lots} lot(s) of ${inst.symbol} executed successfully!`,
      order: newOrder,
      wallet: userWallet,
      positions: userPositions,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to execute order.' });
  }
});

// Close / Square-off position
router.post('/position/close', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { positionId } = req.body;
  const posIndex = userPositions.findIndex((p) => p.id === positionId);
  if (posIndex === -1) {
    res.status(404).json({ success: false, message: 'Position not found.' });
    return;
  }

  const pos = userPositions[posIndex];
  const inst = INSTRUMENTS.find((i) => i.symbol === pos.symbol);
  const releasedMargin = (inst?.intraday || 30000) * pos.lots;

  userWallet.availableBalance += releasedMargin + pos.pnl;
  userWallet.usedMargin = Math.max(0, userWallet.usedMargin - releasedMargin);

  userPositions.splice(posIndex, 1);

  userNotifications.unshift({
    id: `NOTIF-${Date.now()}`,
    title: 'Position Squared Off',
    message: `Closed ${pos.symbol} position with PnL of ₹${pos.pnl.toLocaleString('en-IN')}`,
    type: 'ORDER',
    time: 'Just now',
    read: false,
  });

  res.json({
    success: true,
    message: `Position for ${pos.symbol} closed successfully.`,
    wallet: userWallet,
    positions: userPositions,
  });
});

// Add Funds (Deposit)
router.post('/funds/deposit', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { amount, method } = req.body;
  const numAmount = Number(amount);
  if (!numAmount || numAmount < 100) {
    res.status(400).json({ success: false, message: 'Minimum deposit amount is ₹100.' });
    return;
  }

  userWallet.availableBalance += numAmount;
  userWallet.deposited += numAmount;

  userNotifications.unshift({
    id: `NOTIF-${Date.now()}`,
    title: 'Deposit Successful',
    message: `₹${numAmount.toLocaleString('en-IN')} added via ${method || 'UPI Instant'}.`,
    type: 'SYSTEM',
    time: 'Just now',
    read: false,
  });

  res.json({
    success: true,
    message: `₹${numAmount.toLocaleString('en-IN')} successfully added to trading wallet.`,
    wallet: userWallet,
  });
});

// Withdraw Funds
router.post('/funds/withdraw', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { amount, bankName, accountNumber } = req.body;
  const numAmount = Number(amount);
  if (!numAmount || numAmount <= 0) {
    res.status(400).json({ success: false, message: 'Invalid withdrawal amount.' });
    return;
  }

  if (numAmount > userWallet.availableBalance) {
    res.status(400).json({
      success: false,
      message: `Insufficient balance. Available to withdraw: ₹${userWallet.availableBalance.toLocaleString('en-IN')}`,
    });
    return;
  }

  userWallet.availableBalance -= numAmount;
  userWallet.withdrawn += numAmount;

  userNotifications.unshift({
    id: `NOTIF-${Date.now()}`,
    title: 'Withdrawal Initiated',
    message: `Payout request for ₹${numAmount.toLocaleString('en-IN')} sent to ${bankName || 'Verified Bank'}.`,
    type: 'SYSTEM',
    time: 'Just now',
    read: false,
  });

  res.json({
    success: true,
    message: `Withdrawal request of ₹${numAmount.toLocaleString('en-IN')} processed successfully.`,
    wallet: userWallet,
  });
});

// Get & Create Support Tickets
router.get('/tickets', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, tickets: userTickets });
});

router.get('/tickets/:id', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const ticket = userTickets.find((t) => t.id.toLowerCase() === req.params.id.toLowerCase());
  if (!ticket) {
    res.status(404).json({ success: false, message: 'Ticket not found.' });
    return;
  }
  res.json({ success: true, ticket });
});

router.post('/tickets', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const { subject, category, priority, message, attachmentUrl, attachmentName } = req.body;
  if (!subject || !message) {
    res.status(400).json({ success: false, message: 'Subject and description are required.' });
    return;
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toTimeString().split(' ')[0].slice(0, 5);
  const formattedTime = `${dateStr}, ${timeStr}`;

  const newTicket: SupportTicket = {
    id: `TKT-${Math.floor(1000 + Math.random() * 9000)}`,
    subject,
    category: category || 'Trading Issues',
    priority: priority || 'Medium',
    status: 'OPEN',
    createdAt: formattedTime,
    updatedAt: formattedTime,
    attachmentUrl,
    attachmentName,
    messages: [
      {
        id: `msg-${Date.now()}-1`,
        sender: 'user',
        senderName: 'You',
        text: message,
        time: timeStr,
        timestamp: formattedTime,
        attachmentUrl,
        attachmentName,
      },
    ],
  };

  userTickets.unshift(newTicket);

  // Add system notification for ticket raised
  userNotifications.unshift({
    id: `NOTIF-${Date.now()}`,
    title: 'Ticket Raised',
    message: `Ticket #${newTicket.id} (${newTicket.subject}) submitted. Support will reply within SLA.`,
    type: 'SYSTEM',
    time: 'Just now',
    read: false,
  });

  res.json({ success: true, message: 'Support ticket raised successfully.', ticket: newTicket });
});

router.post('/tickets/:id/reply', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const { message, attachmentUrl, attachmentName } = req.body;
  const ticket = userTickets.find((t) => t.id.toLowerCase() === req.params.id.toLowerCase());
  if (!ticket) {
    res.status(404).json({ success: false, message: 'Ticket not found.' });
    return;
  }

  if (!message || !message.trim()) {
    res.status(400).json({ success: false, message: 'Reply message cannot be empty.' });
    return;
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toTimeString().split(' ')[0].slice(0, 5);
  const formattedTime = `${dateStr}, ${timeStr}`;

  const userMsg = {
    id: `msg-${Date.now()}`,
    sender: 'user' as const,
    senderName: 'You',
    text: message.trim(),
    time: timeStr,
    timestamp: formattedTime,
    attachmentUrl,
    attachmentName,
  };

  ticket.messages.push(userMsg);
  ticket.updatedAt = formattedTime;
  if (ticket.status === 'RESOLVED') {
    ticket.status = 'IN_PROGRESS';
  }

  res.json({ success: true, message: 'Reply sent.', ticket });
});

router.post('/tickets/:id/status', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body;
  const ticket = userTickets.find((t) => t.id.toLowerCase() === req.params.id.toLowerCase());
  if (!ticket) {
    res.status(404).json({ success: false, message: 'Ticket not found.' });
    return;
  }

  if (['OPEN', 'IN_PROGRESS', 'RESOLVED'].includes(status)) {
    ticket.status = status;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toTimeString().split(' ')[0].slice(0, 5);
    ticket.updatedAt = `${dateStr}, ${timeStr}`;
  }

  res.json({ success: true, message: `Ticket status updated to ${ticket.status}.`, ticket });
});

router.post('/tickets/:id/rate', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const { rating, feedback } = req.body;
  const ticket = userTickets.find((t) => t.id.toLowerCase() === req.params.id.toLowerCase());
  if (!ticket) {
    res.status(404).json({ success: false, message: 'Ticket not found.' });
    return;
  }

  ticket.rating = Number(rating);
  if (feedback) ticket.feedback = feedback;

  res.json({ success: true, message: 'Thank you for your rating!', ticket });
});

// Notifications
router.get('/notifications', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, notifications: userNotifications });
});

router.post('/notifications/mark-read', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.body || {};
  if (id) {
    userNotifications = userNotifications.map((n) => (n.id === id ? { ...n, read: true } : n));
  } else {
    userNotifications = userNotifications.map((n) => ({ ...n, read: true }));
  }
  res.json({ success: true, message: 'Notifications marked as read.', notifications: userNotifications });
});

router.post('/notifications/clear', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  userNotifications = [];
  res.json({ success: true, message: 'All notifications cleared.' });
});

export default router;
