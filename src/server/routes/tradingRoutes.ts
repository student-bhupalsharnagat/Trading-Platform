import { Router, Response } from 'express';
import { requireAuth, optionalAuth, AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import {
  TenantRequest,
  requireTradingEnabled,
  requireActiveTrader,
} from '../middleware/tenantMiddleware.ts';
import { Instrument, Candle, Position, Order, WalletFunds, SupportTicket, AppNotification } from '../../types.ts';
import {
  findInstrument,
  getTenantWallet,
  setTenantWallet,
  getTenantPositions,
  setTenantPositions,
  getTenantOrders,
  setTenantOrders,
  getTenantTickets,
  getTenantNotifications,
  setTenantNotifications,
} from '../trading/tradingStore.ts';
import { tenantConfigCache } from '../cache/TenantConfigCache.ts';
import { internalEventDispatcher } from '../events/InternalEventDispatcher.ts';
import { tradingExecutionService } from '../services/TradingExecutionService.ts';
import { postgresOrderRepository } from '../repositories/trading/PostgresOrderRepository.ts';
import { postgresPositionRepository } from '../repositories/trading/PostgresPositionRepository.ts';
import { postgresWalletRepository } from '../repositories/trading/PostgresWalletRepository.ts';
import { postgresTradeRepository } from '../repositories/trading/PostgresTradeRepository.ts';
import { providerConfigService } from '../gateways/broker/ProviderConfigService.ts';
import { executionAuditLogger } from '../gateways/audit/ExecutionAuditLogger.ts';
import { marketDataGateway } from '../gateways/MarketDataGateway.ts';
import { executionGateway } from '../gateways/ExecutionGateway.ts';
import { brokerWebhookHandler } from '../gateways/broker/BrokerWebhookHandler.ts';
import { brokerReconciliationService } from '../services/BrokerReconciliationService.ts';

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
    id: 'nifty_24500_ce',
    symbol: 'NIFTY 24500 CE',
    sectionName: 'NIFTY OPT',
    name: 'Nifty 24500 Call Option',
    category: 'OPTIONS',
    expiry: '28 Aug',
    lastPrice: 145.5,
    openPrice: 130.0,
    highPrice: 160.0,
    lowPrice: 125.0,
    prevClose: 130.0,
    change: 15.5,
    changePercent: 11.92,
    intraday: 3500.0,
    holding: 7500.0,
    lotSize: 25,
    maxLots: 50,
    ask: 146.0,
    bid: 145.0,
    sparkline: [130, 135, 140, 138, 142, 145.5],
    trend: 'up',
  },
  {
    id: 'natural_gas_fut',
    symbol: 'NATURAL GAS FUT',
    sectionName: 'NATURAL GAS',
    name: 'Natural Gas Futures',
    category: 'COMMODITY',
    expiry: '26 Aug',
    lastPrice: 185.4,
    openPrice: 182.1,
    highPrice: 188.5,
    lowPrice: 180.2,
    prevClose: 182.1,
    change: 3.3,
    changePercent: 1.81,
    intraday: 2500.0,
    holding: 12500.0,
    lotSize: 1250,
    maxLots: 40,
    ask: 185.6,
    bid: 185.2,
    sparkline: [182.1, 183.0, 184.2, 184.9, 185.4],
    trend: 'up',
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

// Seed state for active user sessions
const initialWallet: WalletFunds = {
  availableBalance: 142840.0,
  usedMargin: 38210.0,
  totalPnL: 34386.86,
  todayPnL: 504.52,
  deposited: 200000.0,
  withdrawn: 50000.0,
};

const initialPositions: Position[] = [
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

function getReqTenantId(req: any): string {
  return req.user?.tenantId || req.tenant?.tenant?.id || (req.headers && (req.headers['x-tenant-id'] as string)) || 'vertex-default';
}

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

// Get portfolio data (scoped to resolved tenant)
router.get('/portfolio', optionalAuth, async (req: TenantRequest, res: Response) => {
  const tenantId = getReqTenantId(req);
  const userObj = (req as any).user;
  const userId = userObj?.userId || userObj?.user_id || userObj?.id;

  let wallet = getTenantWallet(tenantId);
  let positions = getTenantPositions(tenantId);
  let orders = getTenantOrders(tenantId);

  try {
    if (userId) {
      const pgWallet = await postgresWalletRepository.getWallet(tenantId, userId);
      if (pgWallet) {
        wallet = {
          availableBalance: pgWallet.available_balance,
          usedMargin: pgWallet.used_margin,
          totalPnL: pgWallet.realized_pnl,
          todayPnL: 0,
          deposited: 200000,
          withdrawn: 50000,
        };
      }
      const pgPositions = await postgresPositionRepository.getPositions(tenantId, userId);
      if (pgPositions && pgPositions.length > 0) {
        positions = pgPositions.map((p) => ({
          id: p.id,
          symbol: p.instrument_id,
          category: 'COMMODITY',
          type: p.quantity > 0 ? 'BUY' : 'SELL',
          product: 'INTRADAY',
          lots: Math.max(1, Math.round(Math.abs(p.quantity) / 100)),
          qty: Math.abs(p.quantity),
          lotSize: 100,
          avgPrice: p.average_price,
          ltp: p.average_price,
          pnl: p.realized_pnl,
          pnlPercent: 0,
          timestamp: p.updated_at,
          tenantId: p.tenant_id,
        }));
      }
      const pgOrders = await postgresOrderRepository.getOrders(tenantId, userId);
      if (pgOrders && pgOrders.length > 0) {
        orders = pgOrders.map((o) => ({
          id: o.id,
          symbol: o.instrument_id,
          type: o.side as 'BUY' | 'SELL',
          orderType: o.order_type as any,
          product: 'INTRADAY',
          lots: Math.max(1, Math.round(o.quantity / 100)),
          qty: o.quantity,
          lotSize: 100,
          price: o.price,
          status: o.status as any,
          time: new Date(o.created_at).toTimeString().split(' ')[0],
          date: new Date(o.created_at).toLocaleDateString('en-GB'),
          tenantId: o.tenant_id,
        }));
      }
    }
  } catch {
    // fallback to memory
  }

  res.json({
    success: true,
    tenantId,
    wallet,
    positions,
    orders,
  });
});

// Place new Order (BUY / SELL) - Enforces Tenant trading freeze, active trader, and ACID persistence
router.post(
  ['/order', '/orders'],
  optionalAuth,
  requireTradingEnabled,
  requireActiveTrader,
  async (req: TenantRequest, res: Response) => {
    try {
      const tenantId = getReqTenantId(req);
      const userObj = (req as any).user;
      const tenantHeader = (req.headers['x-tenant-id'] as string) || (req.headers['x-dev-tenant-id'] as string);
      const userTenant = userObj?.tenantId || userObj?.tenant_id;

      if (tenantHeader && userTenant && tenantHeader !== userTenant && userObj?.role !== 'SUPER_ADMIN') {
        res.status(403).json({
          success: false,
          code: 'TENANT_MISMATCH',
          message: 'Access denied: Requested tenant does not match user account tenant.',
        });
        return;
      }

      const orderUserId = userObj?.userId || userObj?.user_id || userObj?.id || 'demo-trader';

      const {
        symbol,
        type, // BUY or SELL
        side, // alternative for type
        orderType, // MARKET or LIMIT
        product, // INTRADAY or HOLDING
        lots,
        limitPrice,
        price,
        stopLoss,
        target,
        clientOrderId,
        client_order_id,
      } = req.body;

      const orderSide = ((type || side || '') as string).toUpperCase() as 'BUY' | 'SELL';
      const orderLots = Number(lots);

      if (!symbol || (orderSide !== 'BUY' && orderSide !== 'SELL') || !orderLots || orderLots <= 0) {
        res.status(400).json({ success: false, message: 'Invalid order parameters: symbol, type (BUY/SELL), and positive lots are required.' });
        return;
      }

      const inst =
        findInstrument(symbol) ||
        INSTRUMENTS.find(
          (i) =>
            i.symbol === symbol ||
            i.id === symbol ||
            i.symbol.toLowerCase().replace(/[\s\-_]/g, '') === (symbol || '').toLowerCase().replace(/[\s\-_]/g, '')
        );
      if (!inst) {
        res.status(404).json({ success: false, message: 'Instrument not found.' });
        return;
      }

      // Enforce tenant feature flags (e.g. options trading disabled)
      const isOptionInst = inst.symbol.includes('CE') || inst.symbol.includes('PE') || (inst as any).category === 'OPTIONS';
      const cachedConfig = tenantConfigCache.get(tenantId);
      if (
        isOptionInst &&
        (cachedConfig?.optionsTradingEnabled === false || req.tenant?.config.options_trading_enabled === false)
      ) {
        res.status(403).json({
          success: false,
          code: 'OPTIONS_DISABLED',
          message: 'Options trading is disabled by administrator for this platform.',
        });
        return;
      }

      const execPrice = price ? Number(price) : (orderType === 'LIMIT' && limitPrice ? Number(limitPrice) : inst.lastPrice);

      // Execute through ACID TradingExecutionService
      const result = await tradingExecutionService.placeOrder({
        tenantId,
        userId: orderUserId,
        clientOrderId: clientOrderId || client_order_id,
        symbol: inst.symbol,
        side: orderSide,
        orderType: orderType || 'MARKET',
        product: product || 'INTRADAY',
        lots: orderLots,
        price: execPrice,
        stopLoss: stopLoss ? Number(stopLoss) : undefined,
        target: target ? Number(target) : undefined,
      });

      if (result.isDuplicate) {
        res.status(200).json({
          success: true,
          isDuplicate: true,
          message: result.message,
          order: result.order,
          wallet: {
            availableBalance: result.wallet.available_balance,
            usedMargin: result.wallet.used_margin,
            totalPnL: result.wallet.realized_pnl,
            todayPnL: 0,
          },
        });
        return;
      }

      const notifications = getTenantNotifications(tenantId);
      notifications.unshift({
        id: `NOTIF-${Date.now()}`,
        title: 'Order Executed',
        message: `${orderSide} ${orderLots} Lot(s) of ${inst.symbol} executed at ₹${execPrice.toLocaleString('en-IN')}`,
        type: 'ORDER',
        time: 'Just now',
        read: false,
      });

      res.json({
        success: true,
        message: result.message,
        order: result.order,
        trade: result.trade,
        position: result.position,
        wallet: {
          availableBalance: result.wallet.available_balance,
          usedMargin: result.wallet.used_margin,
          totalPnL: result.wallet.realized_pnl,
          todayPnL: 0,
        },
        positions: getTenantPositions(tenantId),
      });
    } catch (err: any) {
      const status = err.statusCode || (err.code === 'INSUFFICIENT_MARGIN' ? 400 : 500);
      res.status(status).json({ success: false, code: err.code, message: err.message || 'Failed to execute order.' });
    }
  }
);

// Close / Square-off position - Protected by tradingEnabled and activeTrader
router.post(
  '/position/close',
  requireAuth,
  requireTradingEnabled,
  requireActiveTrader,
  async (req: TenantRequest, res: Response) => {
    try {
      const tenantId = getReqTenantId(req);
      const userObj = (req as any).user;
      const userId = userObj?.userId || userObj?.user_id || userObj?.id || 'demo-trader';
      const { positionId } = req.body;

      if (!positionId) {
        res.status(400).json({ success: false, message: 'Position ID is required.' });
        return;
      }

      const result = await tradingExecutionService.closePosition(tenantId, userId, positionId);

      // Also clean in-memory positions
      const positions = getTenantPositions(tenantId);
      const posIndex = positions.findIndex((p) => p.id === positionId || p.symbol === positionId);
      if (posIndex !== -1) {
        positions.splice(posIndex, 1);
      }

      const notifications = getTenantNotifications(tenantId);
      notifications.unshift({
        id: `NOTIF-${Date.now()}`,
        title: 'Position Squared Off',
        message: `Closed position ${positionId}`,
        type: 'ORDER',
        time: 'Just now',
        read: false,
      });

      res.json({
        success: true,
        message: result.message,
        position: result.position,
        wallet: {
          availableBalance: result.wallet.available_balance,
          usedMargin: result.wallet.used_margin,
          totalPnL: result.wallet.realized_pnl,
          todayPnL: 0,
        },
        positions: getTenantPositions(tenantId),
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to close position.' });
    }
  }
);

// Cancel Order
router.post(
  ['/order/cancel', '/orders/cancel'],
  requireAuth,
  async (req: TenantRequest, res: Response) => {
    try {
      const tenantId = getReqTenantId(req);
      const userObj = (req as any).user;
      const userId = userObj?.userId || userObj?.user_id || userObj?.id || 'demo-trader';
      const { orderId } = req.body;

      if (!orderId) {
        res.status(400).json({ success: false, message: 'Order ID is required.' });
        return;
      }

      const result = await tradingExecutionService.cancelOrder(tenantId, userId, orderId);
      res.json(result);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to cancel order.' });
    }
  }
);

// Get execution trades
router.get('/trades', requireAuth, async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const userObj = (req as any).user;
    const userId = userObj?.userId || userObj?.user_id || userObj?.id;
    const trades = await postgresTradeRepository.getTrades(tenantId, userId);
    res.json({ success: true, tenantId, trades });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Add Funds (Deposit)
router.post('/funds/deposit', requireAuth, (req: TenantRequest, res: Response) => {
  const tenantId = getReqTenantId(req);
  const wallet = getTenantWallet(tenantId);
  const notifications = getTenantNotifications(tenantId);

  const { amount, method } = req.body;
  const numAmount = Number(amount);
  if (!numAmount || numAmount < 100) {
    res.status(400).json({ success: false, message: 'Minimum deposit amount is ₹100.' });
    return;
  }

  wallet.availableBalance += numAmount;
  wallet.deposited += numAmount;

  notifications.unshift({
    id: `NOTIF-${Date.now()}`,
    title: 'Deposit Successful',
    message: `₹${numAmount.toLocaleString('en-IN')} added via ${method || 'UPI Instant'}.`,
    type: 'SYSTEM',
    time: 'Just now',
    read: false,
  });

  res.json({
    success: true,
    message: `Deposit of ₹${numAmount.toLocaleString('en-IN')} successful.`,
    wallet,
  });
});

// Withdraw Funds
router.post('/funds/withdraw', requireAuth, (req: TenantRequest, res: Response) => {
  const tenantId = getReqTenantId(req);
  const wallet = getTenantWallet(tenantId);
  const notifications = getTenantNotifications(tenantId);

  const { amount, bankName } = req.body;
  const numAmount = Number(amount);
  if (!numAmount || numAmount <= 0) {
    res.status(400).json({ success: false, message: 'Invalid withdrawal amount.' });
    return;
  }

  if (numAmount > wallet.availableBalance) {
    res.status(400).json({
      success: false,
      message: `Insufficient balance. Available to withdraw: ₹${wallet.availableBalance.toLocaleString('en-IN')}`,
    });
    return;
  }

  wallet.availableBalance -= numAmount;
  wallet.withdrawn += numAmount;

  notifications.unshift({
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
    wallet,
  });
});

// Get & Create Support Tickets (scoped to resolved tenant)
router.get('/tickets', optionalAuth, (req: TenantRequest, res: Response) => {
  const tenantId = getReqTenantId(req);
  res.json({ success: true, tickets: getTenantTickets(tenantId) });
});

router.get('/tickets/:id', optionalAuth, (req: TenantRequest, res: Response) => {
  const tenantId = getReqTenantId(req);
  const tickets = getTenantTickets(tenantId);
  const ticket = tickets.find((t) => t.id.toLowerCase() === req.params.id.toLowerCase());
  if (!ticket) {
    res.status(404).json({ success: false, message: 'Ticket not found.' });
    return;
  }
  res.json({ success: true, ticket });
});

router.post('/tickets', optionalAuth, (req: TenantRequest, res: Response) => {
  const tenantId = getReqTenantId(req);
  const tickets = getTenantTickets(tenantId);
  const notifications = getTenantNotifications(tenantId);

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

  tickets.unshift(newTicket);

  // Add system notification for ticket raised
  notifications.unshift({
    id: `NOTIF-${Date.now()}`,
    title: 'Ticket Raised',
    message: `Ticket #${newTicket.id} (${newTicket.subject}) submitted. Support will reply within SLA.`,
    type: 'SYSTEM',
    time: 'Just now',
    read: false,
  });

  res.json({ success: true, message: 'Support ticket raised successfully.', ticket: newTicket });
});

router.post('/tickets/:id/reply', optionalAuth, (req: TenantRequest, res: Response) => {
  const tenantId = getReqTenantId(req);
  const tickets = getTenantTickets(tenantId);
  const { message, attachmentUrl, attachmentName } = req.body;
  const ticket = tickets.find((t) => t.id.toLowerCase() === req.params.id.toLowerCase());
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

router.post('/tickets/:id/status', optionalAuth, (req: TenantRequest, res: Response) => {
  const tenantId = getReqTenantId(req);
  const tickets = getTenantTickets(tenantId);
  const { status } = req.body;
  const ticket = tickets.find((t) => t.id.toLowerCase() === req.params.id.toLowerCase());
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

router.post('/tickets/:id/rate', optionalAuth, (req: TenantRequest, res: Response) => {
  const tenantId = getReqTenantId(req);
  const tickets = getTenantTickets(tenantId);
  const { rating, feedback } = req.body;
  const ticket = tickets.find((t) => t.id.toLowerCase() === req.params.id.toLowerCase());
  if (!ticket) {
    res.status(404).json({ success: false, message: 'Ticket not found.' });
    return;
  }

  ticket.rating = Number(rating);
  if (feedback) ticket.feedback = feedback;

  res.json({ success: true, message: 'Thank you for your rating!', ticket });
});

// Notifications (scoped to resolved tenant)
router.get('/notifications', requireAuth, (req: TenantRequest, res: Response) => {
  const tenantId = getReqTenantId(req);
  res.json({ success: true, notifications: getTenantNotifications(tenantId) });
});

router.post('/notifications/mark-read', requireAuth, (req: TenantRequest, res: Response) => {
  const tenantId = getReqTenantId(req);
  let notifications = getTenantNotifications(tenantId);
  const { id } = req.body || {};
  if (id) {
    notifications = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
  } else {
    notifications = notifications.map((n) => ({ ...n, read: true }));
  }
  setTenantNotifications(tenantId, notifications);
  res.json({ success: true, message: 'Notifications marked as read.', notifications });
});

router.post('/notifications/clear', requireAuth, (req: TenantRequest, res: Response) => {
  const tenantId = getReqTenantId(req);
  setTenantNotifications(tenantId, []);
  res.json({ success: true, message: 'All notifications cleared.' });
});

// ==========================================================
// PHASE 5G — GATEWAYS, BROKER ADAPTER & MARKET DATA ROUTES
// ==========================================================

// Modify order via Execution Gateway
router.put('/orders/:id', requireAuth, requireActiveTrader, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const userId = req.user!.userId;
    const { id } = req.params;
    const { price, quantity } = req.body || {};

    const result = await tradingExecutionService.modifyOrder(tenantId, userId, id, {
      price: price ? Number(price) : undefined,
      quantity: quantity ? Number(quantity) : undefined,
    });

    res.json(result);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message, code: err.code });
  }
});

// Get order status directly from Broker through Execution Gateway
router.get('/orders/:id/broker-status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const userId = req.user!.userId;
    const { id } = req.params;

    const result = await tradingExecutionService.getOrderStatus(tenantId, userId, id);
    res.json(result);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message, code: err.code });
  }
});

// Tenant-scoped Provider Configuration
router.get('/gateways/config', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const providerId = (req.query.providerId as string) || 'mock-broker';
    const context = await providerConfigService.getProviderConfig(tenantId, providerId);
    
    // Return sanitized context, credentials secret is NEVER returned
    res.json({
      success: true,
      providerConfig: {
        tenantId: context.tenantId,
        providerId: context.providerId,
        environment: context.environment,
        settings: context.settings,
        hasCredentials: !!context.credentials?.keyIdentifier,
        keyIdentifier: context.credentials?.keyIdentifier || null,
        authScheme: context.credentials?.authScheme || null,
      },
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

router.post('/gateways/config', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const { providerId, providerType, environment, settings, isActive, isDefault } = req.body || {};

    if (!providerId) {
      res.status(400).json({ success: false, message: 'providerId is required.' });
      return;
    }

    const saved = await providerConfigService.setProviderConfig(tenantId, providerId, {
      providerType,
      environment,
      settings,
      isActive,
      isDefault,
    });

    res.json({ success: true, message: 'Provider config updated successfully.', providerConfig: saved });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

// Credentials Metadata (Secrets are exclusively in server-side env vars)
router.get('/gateways/credentials-metadata', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const providerId = (req.query.providerId as string) || 'mock-broker';
    const meta = await providerConfigService.getCredentialsMetadata(tenantId, providerId);
    const sanitized = providerConfigService.sanitizeMetadataForClient(meta);

    res.json({ success: true, credentialsMetadata: sanitized });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

router.post('/gateways/credentials-metadata', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const { providerId, keyIdentifier, authScheme, secretEnvVar, status } = req.body || {};

    if (!providerId || !keyIdentifier) {
      res.status(400).json({ success: false, message: 'providerId and keyIdentifier are required.' });
      return;
    }

    const saved = await providerConfigService.setCredentialsMetadata(tenantId, providerId, {
      keyIdentifier,
      authScheme,
      secretEnvVar,
      status,
    });

    const sanitized = providerConfigService.sanitizeMetadataForClient(saved);
    res.json({ success: true, message: 'Credentials metadata configured.', credentialsMetadata: sanitized });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

// Execution Audits (strictly sanitized, zero secrets)
router.get('/gateways/audits', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const limit = Number(req.query.limit || 50);
    const audits = await executionAuditLogger.getAuditsByTenant(tenantId, limit);
    res.json({ success: true, audits });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

// Phase 5H: Gateway Broker Authentication
router.post('/gateways/authenticate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const authResult = await executionGateway.authenticate(tenantId);
    res.json({
      success: true,
      authenticated: authResult.authenticated,
      accountId: authResult.accountId,
      mode: authResult.mode,
      details: authResult.details,
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

// Phase 5H: Open Orders via Execution Gateway
router.get('/gateways/orders/open', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const orders = await executionGateway.getOpenOrders(tenantId);
    res.json({ success: true, orders });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

// Phase 5H: Broker Positions via Execution Gateway
router.get('/gateways/positions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const positions = await executionGateway.getPositions(tenantId);
    res.json({ success: true, positions });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

// Phase 5H: Inbound Broker Webhook Handler
router.post('/gateways/webhook', async (req: any, res: Response) => {
  try {
    const tenantId = req.tenant?.tenant.id || (req.headers['x-tenant-id'] as string) || 'vertex-default';
    const providerId = (req.query.provider as string) || 'real-sandbox';
    const signature = (req.headers['x-broker-signature'] || req.headers['x-hub-signature-256']) as string;
    const timestamp = req.headers['x-broker-timestamp'] as string;
    const rawBody = req.rawBody || JSON.stringify(req.body);

    const secret = process.env.BROKER_WEBHOOK_SECRET;
    if (signature && secret) {
      const isValid = brokerWebhookHandler.verifySignature(rawBody, signature, timestamp, secret);
      if (!isValid) {
        res.status(401).json({ success: false, message: 'Invalid webhook signature.' });
        return;
      }
    }

    const result = await brokerWebhookHandler.processWebhook(tenantId, providerId, req.body, rawBody);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Phase 5H: State Reconciliation Trigger
router.post('/gateways/reconcile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const autoFix = req.body?.autoFix === true;
    const report = await brokerReconciliationService.reconcileTenant(tenantId, { autoFix });
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Phase 5H: State Reconciliation Audits
router.get('/gateways/reconciliation/audits', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const limit = Number(req.query.limit || 20);
    const audits = await brokerReconciliationService.getReconciliationAudits(tenantId, limit);
    res.json({ success: true, audits });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Market Data Gateway Routes
router.get('/market/quotes', async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const symbolsParam = req.query.symbols as string;
    const symbols = symbolsParam ? symbolsParam.split(',').map((s) => s.trim()) : ['NIFTY50', 'BANKNIFTY', 'RELIANCE', 'TCS', 'INFY'];
    const quotes = await marketDataGateway.getQuotes(symbols, tenantId);
    res.json({ success: true, quotes });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/market/quote/:symbol', async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const quote = await marketDataGateway.getQuote(req.params.symbol, tenantId);
    if (!quote) {
      res.status(404).json({ success: false, message: `Instrument '${req.params.symbol}' not found.` });
      return;
    }
    res.json({ success: true, quote });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/market/candles/:symbol', async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const timeframe = (req.query.timeframe as string) || '15m';
    const count = Number(req.query.count || 60);
    const candles = await marketDataGateway.getCandles(req.params.symbol, timeframe, count, tenantId);
    res.json({ success: true, candles });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
