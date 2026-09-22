import {
  Instrument,
  Position,
  Order,
  WalletFunds,
  SupportTicket,
  AppNotification,
  Candle,
} from '../../types.ts';
import { DEFAULT_INSTRUMENTS } from '../../data/defaultInstruments.ts';
import { tradingWebSocketServer } from '../websocket/WebSocketServer.ts';

// Helper to generate realistic historical candle data
export function generateHistoricalCandles(
  basePrice: number,
  count = 60,
  intervalMinutes = 15
): Candle[] {
  const candles: Candle[] = [];
  const now = Date.now();
  const intervalMs = intervalMinutes * 60 * 1000;
  let currentPrice = basePrice * 0.985;

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

// Master instruments dataset initialized with all Indian shares, stock futures, commodities, indices, forex, crypto, options
export let INSTRUMENTS: Instrument[] = JSON.parse(JSON.stringify(DEFAULT_INSTRUMENTS));

export const initialWallet: WalletFunds = {
  availableBalance: 142840.0,
  usedMargin: 38210.0,
  totalPnL: 34386.86,
  todayPnL: 504.52,
  deposited: 200000.0,
  withdrawn: 50000.0,
};

export const initialPositions: Position[] = [
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
    tenantId: 'vertex-default',
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
    tenantId: 'vertex-default',
  },
];

export const initialOrders: Order[] = [
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
    tenantId: 'vertex-default',
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
    tenantId: 'vertex-default',
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
    tenantId: 'vertex-default',
  },
];

// In-memory collections scoped by tenant
const tenantWallets: Record<string, WalletFunds> = {
  'vertex-default': JSON.parse(JSON.stringify(initialWallet)),
};
const tenantPositions: Record<string, Position[]> = {
  'vertex-default': JSON.parse(JSON.stringify(initialPositions)),
};
const tenantOrders: Record<string, Order[]> = {
  'vertex-default': JSON.parse(JSON.stringify(initialOrders)),
};
const tenantTickets: Record<string, SupportTicket[]> = {
  'vertex-default': [],
};
const tenantNotifications: Record<string, AppNotification[]> = {
  'vertex-default': [],
};

export function getTenantWallet(tenantId: string): WalletFunds {
  const normTenant = tenantId || 'vertex-default';
  if (!tenantWallets[normTenant]) {
    tenantWallets[normTenant] = JSON.parse(JSON.stringify(initialWallet));
  }
  return tenantWallets[normTenant];
}

export function setTenantWallet(tenantId: string, wallet: WalletFunds): void {
  const normTenant = tenantId || 'vertex-default';
  tenantWallets[normTenant] = wallet;
}

export function getTenantPositions(tenantId: string): Position[] {
  const normTenant = tenantId || 'vertex-default';
  if (!tenantPositions[normTenant]) {
    tenantPositions[normTenant] = JSON.parse(JSON.stringify(initialPositions));
  }
  return tenantPositions[normTenant];
}

export function setTenantPositions(tenantId: string, positions: Position[]): void {
  const normTenant = tenantId || 'vertex-default';
  tenantPositions[normTenant] = positions;
}

export function getTenantOrders(tenantId: string): Order[] {
  const normTenant = tenantId || 'vertex-default';
  if (!tenantOrders[normTenant]) {
    tenantOrders[normTenant] = JSON.parse(JSON.stringify(initialOrders));
  }
  return tenantOrders[normTenant];
}

export function setTenantOrders(tenantId: string, orders: Order[]): void {
  const normTenant = tenantId || 'vertex-default';
  tenantOrders[normTenant] = orders;
}

export function addTenantOrder(tenantId: string, order: Order): void {
  const orders = getTenantOrders(tenantId);
  orders.unshift(order);
}

export function getTenantTickets(tenantId: string): SupportTicket[] {
  const normTenant = tenantId || 'vertex-default';
  if (!tenantTickets[normTenant]) {
    tenantTickets[normTenant] = [];
  }
  return tenantTickets[normTenant];
}

export function getTenantNotifications(tenantId: string): AppNotification[] {
  const normTenant = tenantId || 'vertex-default';
  if (!tenantNotifications[normTenant]) {
    tenantNotifications[normTenant] = [];
  }
  return tenantNotifications[normTenant];
}

export function setTenantNotifications(
  tenantId: string,
  notifications: AppNotification[]
): void {
  const normTenant = tenantId || 'vertex-default';
  tenantNotifications[normTenant] = notifications;
}

export function findInstrument(symbol: string): Instrument | undefined {
  if (!symbol) return undefined;
  const raw = symbol.toLowerCase().trim();
  const clean = raw.replace(/^(nse|bse|mcx|nfo|binance|tvc|fx|fx_idc|comex|nymex|lme):/i, '').trim();
  const normalized = clean.replace(/[\s\-_]/g, '');

  return (
    INSTRUMENTS.find((i) => {
      const iRaw = i.symbol.toLowerCase().trim();
      const iClean = iRaw.replace(/^(nse|bse|mcx|nfo|binance|tvc|fx|fx_idc|comex|nymex|lme):/i, '').trim();
      const iNorm = iClean.replace(/[\s\-_]/g, '');
      const idClean = i.id.toLowerCase().trim().replace(/[\s\-_]/g, '');

      return (
        iClean === clean ||
        iNorm === normalized ||
        idClean === normalized ||
        iRaw === raw ||
        (i.sectionName && i.sectionName.toLowerCase().trim() === clean) ||
        (i.name && i.name.toLowerCase().trim() === clean)
      );
    }) ||
    INSTRUMENTS.find((i) => {
      const iRaw = i.symbol.toLowerCase().trim();
      const iClean = iRaw.replace(/^(nse|bse|mcx|nfo|binance|tvc|fx|fx_idc|comex|nymex|lme):/i, '').trim();
      return iClean.startsWith(clean) || clean.startsWith(iClean);
    })
  );
}

/**
 * Executes square-off for a single position: calculates PnL, releases margin, updates wallet.
 */
export function closeSinglePosition(
  tenantId: string,
  positionId: string
): { success: boolean; closedPosition?: Position; releasedMargin?: number; pnl?: number; error?: string } {
  const positions = getTenantPositions(tenantId);
  const posIndex = positions.findIndex((p) => p.id === positionId);
  if (posIndex === -1) {
    return { success: false, error: 'Position not found' };
  }

  const pos = positions[posIndex];
  const wallet = getTenantWallet(tenantId);
  const inst = findInstrument(pos.symbol);
  const releasedMargin = (inst?.intraday || 30000) * pos.lots;

  wallet.availableBalance += releasedMargin + pos.pnl;
  wallet.usedMargin = Math.max(0, wallet.usedMargin - releasedMargin);
  wallet.todayPnL = Number((wallet.todayPnL + pos.pnl).toFixed(2));
  wallet.totalPnL = Number((wallet.totalPnL + pos.pnl).toFixed(2));

  positions.splice(posIndex, 1);

  return {
    success: true,
    closedPosition: pos,
    releasedMargin,
    pnl: pos.pnl,
  };
}

/**
 * Resets tenant state (useful for tests and isolated cleanups)
 */
export function resetTenantTradingState(tenantId: string): void {
  const normTenant = tenantId || 'vertex-default';
  tenantWallets[normTenant] = JSON.parse(JSON.stringify(initialWallet));
  tenantPositions[normTenant] = JSON.parse(JSON.stringify(initialPositions));
  tenantOrders[normTenant] = JSON.parse(JSON.stringify(initialOrders));
}

// Background tick simulator - generates real-time market ticks and recalculates MTM PnL
const tickTimer = setInterval(() => {
  INSTRUMENTS = INSTRUMENTS.map((inst) => {
    const volatilityPct = 0.0006;
    const delta = (Math.random() - 0.495) * (inst.lastPrice * volatilityPct);
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

  // Recalculate live PnL dynamically across active tenant portfolios
  const activeTenants = new Set(['vertex-default', ...Object.keys(tenantPositions)]);

  for (const tenantId of activeTenants) {
    let livePnL = 0;
    const positions = tenantPositions[tenantId] || [];
    tenantPositions[tenantId] = positions.map((pos) => {
      const liveInst = findInstrument(pos.symbol);
      const ltp = liveInst ? liveInst.lastPrice : pos.ltp;
      const pnl =
        pos.type === 'BUY' ? (ltp - pos.avgPrice) * pos.qty : (pos.avgPrice - ltp) * pos.qty;
      const pnlPercent = (pos.avgPrice * pos.qty) > 0
        ? Number(((pnl / (pos.avgPrice * pos.qty)) * 100).toFixed(2))
        : 0;
      livePnL += pnl;

      return {
        ...pos,
        ltp,
        pnl: Number(pnl.toFixed(2)),
        pnlPercent,
      };
    });

    const wallet = getTenantWallet(tenantId);
    wallet.todayPnL = Number((500 + livePnL).toFixed(2));
    wallet.totalPnL = Number((34000 + livePnL).toFixed(2));

    // Broadcast live MTM portfolio update to the tenant's connected clients
    try {
      tradingWebSocketServer.broadcastToTenant(tenantId, 'portfolio.mtm', {
        positions: tenantPositions[tenantId],
        wallet,
        unrealizedPnL: Number(livePnL.toFixed(2)),
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Ignore websocket broadcast during initial boot
    }
  }

  // Broadcast market ticks to all connected clients
  try {
    const ticks = INSTRUMENTS.map((i) => ({
      id: i.id,
      symbol: i.symbol,
      lastPrice: i.lastPrice,
      change: i.change,
      changePercent: i.changePercent,
      ask: i.ask,
      bid: i.bid,
      highPrice: i.highPrice,
      lowPrice: i.lowPrice,
      trend: i.trend,
    }));
    tradingWebSocketServer.broadcastToAll('market.ticks', {
      instruments: INSTRUMENTS,
      ticks,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Ignore websocket broadcast during initial boot
  }
}, 1000);

if (tickTimer.unref) {
  tickTimer.unref();
}
