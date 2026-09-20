import {
  Instrument,
  Position,
  Order,
  WalletFunds,
  SupportTicket,
  AppNotification,
  Candle,
} from '../../types.ts';

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

// Master instruments dataset
export let INSTRUMENTS: Instrument[] = [
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
    change: -1139.0,
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
    change: -35.0,
    changePercent: -1.45,
    intraday: 15000.0,
    holding: 75000.0,
    lotSize: 100,
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
    change: 3.8,
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
    change: 84.0,
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
    id: 'natural_gas_fut',
    symbol: 'NATURAL GAS FUT',
    sectionName: 'NATURAL GAS',
    name: 'Natural Gas Futures',
    category: 'COMMODITY',
    expiry: '28 Aug',
    lastPrice: 248.5,
    openPrice: 245.0,
    highPrice: 252.0,
    lowPrice: 244.0,
    prevClose: 245.0,
    change: 3.5,
    changePercent: 1.43,
    intraday: 250.0,
    holding: 1250.0,
    lotSize: 1250,
    maxLots: 50,
    ask: 249.0,
    bid: 248.0,
    sparkline: [245, 246, 247, 247.5, 248, 248.5],
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
    change: 1248.8,
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
    change: -380.0,
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
    change: 22.5,
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
    id: 'eur_usd',
    symbol: 'EUR/USD',
    sectionName: 'EURO',
    name: 'Euro / US Dollar',
    category: 'FOREX',
    expiry: 'Spot',
    lastPrice: 1.0851,
    openPrice: 1.082,
    highPrice: 1.0865,
    lowPrice: 1.0815,
    prevClose: 1.082,
    change: 0.0031,
    changePercent: 0.29,
    intraday: 840.0,
    holding: 4200.0,
    lotSize: 1000,
    maxLots: 100,
    ask: 1.0852,
    bid: 1.085,
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
    highPrice: 1.283,
    lowPrice: 1.278,
    prevClose: 1.2818,
    change: -0.0024,
    changePercent: -0.19,
    intraday: 620.0,
    holding: 3100.0,
    lotSize: 1000,
    maxLots: 100,
    ask: 1.2796,
    bid: 1.2792,
    sparkline: [1.2818, 1.281, 1.2805, 1.2798, 1.2794],
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
    change: 142.6,
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
  const normalized = raw.replace(/[\s\-_]/g, '');
  return INSTRUMENTS.find(
    (i) =>
      i.symbol.toLowerCase() === raw ||
      i.id.toLowerCase() === raw ||
      i.symbol.toLowerCase().replace(/[\s\-_]/g, '') === normalized ||
      i.id.toLowerCase().replace(/[\s\-_]/g, '') === normalized ||
      (i.sectionName && i.sectionName.toLowerCase() === raw) ||
      (i.sectionName && i.sectionName.toLowerCase().replace(/[\s\-_]/g, '') === normalized) ||
      i.symbol.toLowerCase().startsWith(raw) ||
      i.id.toLowerCase().startsWith(raw) ||
      raw.startsWith(i.symbol.toLowerCase()) ||
      raw.startsWith(i.id.toLowerCase())
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

// Background tick simulator
const tickTimer = setInterval(() => {
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

  // Recalculate live PnL dynamically across active tenant portfolios
  for (const tenantId of Object.keys(tenantPositions)) {
    let livePnL = 0;
    const positions = tenantPositions[tenantId] || [];
    tenantPositions[tenantId] = positions.map((pos) => {
      const liveInst = findInstrument(pos.symbol);
      const ltp = liveInst ? liveInst.lastPrice : pos.ltp;
      const pnl =
        pos.type === 'BUY' ? (ltp - pos.avgPrice) * pos.qty : (pos.avgPrice - ltp) * pos.qty;
      const pnlPercent = Number(((pnl / (pos.avgPrice * pos.qty)) * 100).toFixed(2));
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
  }
}, 1500);

if (tickTimer.unref) {
  tickTimer.unref();
}
