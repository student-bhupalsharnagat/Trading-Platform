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
  availableBalance: 0.0,
  usedMargin: 0.0,
  totalPnL: 0.0,
  todayPnL: 0.0,
  deposited: 0.0,
  withdrawn: 0.0,
};

export const initialPositions: Position[] = [];

export const initialOrders: Order[] = [];

// In-memory collections scoped by tenant
const tenantWallets: Record<string, WalletFunds> = {
  'vertex-default': JSON.parse(JSON.stringify(initialWallet)),
  'TNT-001': JSON.parse(JSON.stringify(initialWallet)),
};
const tenantPositions: Record<string, Position[]> = {
  'vertex-default': JSON.parse(JSON.stringify(initialPositions)),
  'TNT-001': JSON.parse(JSON.stringify(initialPositions)),
};
const tenantOrders: Record<string, Order[]> = {
  'vertex-default': JSON.parse(JSON.stringify(initialOrders)),
  'TNT-001': JSON.parse(JSON.stringify(initialOrders)),
};
const tenantTrades: Record<string, any[]> = {
  'vertex-default': [],
  'TNT-001': [],
};
const tenantFundTransactions: Record<string, any[]> = {
  'vertex-default': [],
  'TNT-001': [],
};
const tenantLedgerEntries: Record<string, any[]> = {
  'vertex-default': [],
  'TNT-001': [],
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
  const exists = orders.some((o) => o.id === order.id);
  if (!exists) {
    orders.unshift(order);
  }
}

export function getTenantTrades(tenantId: string): any[] {
  const normTenant = tenantId || 'vertex-default';
  if (!tenantTrades[normTenant]) {
    tenantTrades[normTenant] = [];
  }
  return tenantTrades[normTenant];
}

export function setTenantTrades(tenantId: string, trades: any[]): void {
  const normTenant = tenantId || 'vertex-default';
  tenantTrades[normTenant] = trades;
}

export function addTenantTrade(tenantId: string, trade: any): void {
  const trades = getTenantTrades(tenantId);
  const exists = trades.some((t) => t.id === trade.id);
  if (!exists) {
    trades.unshift(trade);
  }
}

export function getTenantFundTransactions(tenantId: string): any[] {
  const normTenant = tenantId || 'vertex-default';
  if (!tenantFundTransactions[normTenant]) {
    tenantFundTransactions[normTenant] = [];
  }
  return tenantFundTransactions[normTenant];
}

export function addTenantFundTransaction(tenantId: string, tx: any): void {
  const txs = getTenantFundTransactions(tenantId);
  const idx = txs.findIndex((t) => t.id === tx.id || t.transactionId === tx.id);
  if (idx !== -1) {
    txs[idx] = { ...txs[idx], ...tx };
  } else {
    txs.unshift(tx);
  }
}

export function getTenantLedger(tenantId: string): any[] {
  const normTenant = tenantId || 'vertex-default';
  if (!tenantLedgerEntries[normTenant]) {
    tenantLedgerEntries[normTenant] = [];
  }
  return tenantLedgerEntries[normTenant];
}

export function addTenantLedgerEntry(tenantId: string, entry: any): void {
  const ledger = getTenantLedger(tenantId);
  const exists = ledger.some((e) => e.id === entry.id || (e.transaction_id && e.transaction_id === entry.transaction_id));
  if (!exists) {
    ledger.unshift(entry);
  }
}

export function getAllTenantOrders(): { tenantId: string; order: Order }[] {
  const results: { tenantId: string; order: Order }[] = [];
  const seen = new Set<string>();
  for (const [tId, orders] of Object.entries(tenantOrders)) {
    for (const o of orders) {
      if (!seen.has(o.id)) {
        seen.add(o.id);
        results.push({ tenantId: tId, order: o });
      }
    }
  }
  return results;
}

export function getAllTenantPositions(): { tenantId: string; position: Position }[] {
  const results: { tenantId: string; position: Position }[] = [];
  const seen = new Set<string>();
  for (const [tId, positions] of Object.entries(tenantPositions)) {
    for (const p of positions) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        results.push({ tenantId: tId, position: p });
      }
    }
  }
  return results;
}

export function getAllTenantTrades(): { tenantId: string; trade: any }[] {
  const results: { tenantId: string; trade: any }[] = [];
  const seen = new Set<string>();
  for (const [tId, trades] of Object.entries(tenantTrades)) {
    for (const tr of trades) {
      if (!seen.has(tr.id)) {
        seen.add(tr.id);
        results.push({ tenantId: tId, trade: tr });
      }
    }
  }
  return results;
}

export function getAllTenantFundTransactions(): { tenantId: string; tx: any }[] {
  const results: { tenantId: string; tx: any }[] = [];
  const seen = new Set<string>();
  for (const [tId, txs] of Object.entries(tenantFundTransactions)) {
    for (const t of txs) {
      const id = t.id || t.transactionId;
      if (!seen.has(id)) {
        seen.add(id);
        results.push({ tenantId: tId, tx: t });
      }
    }
  }
  return results;
}

export function getAllTenantLedger(): { tenantId: string; entry: any }[] {
  const results: { tenantId: string; entry: any }[] = [];
  const seen = new Set<string>();
  for (const [tId, entries] of Object.entries(tenantLedgerEntries)) {
    for (const e of entries) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        results.push({ tenantId: tId, entry: e });
      }
    }
  }
  return results;
}

export function getAllTenantWallets(): Record<string, WalletFunds> {
  return { ...tenantWallets };
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
