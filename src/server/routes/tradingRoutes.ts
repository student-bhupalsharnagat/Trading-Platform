import { Router, Response } from 'express';
import { requireAuth, optionalAuth, AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import {
  TenantRequest,
  requireTradingEnabled,
  requireActiveTrader,
} from '../middleware/tenantMiddleware.ts';
import { Instrument, Candle, Position, Order, WalletFunds, SupportTicket, AppNotification } from '../../types.ts';
import {
  INSTRUMENTS,
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
  closeSinglePosition,
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
  const userId = userObj?.userId || userObj?.user_id || userObj?.id || 'demo-trader';

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
          todayPnL: wallet.todayPnL || 0,
          deposited: 200000,
          withdrawn: 50000,
        };
      }
      const pgPositions = await postgresPositionRepository.getPositions(tenantId, userId);
      if (pgPositions && pgPositions.length > 0) {
        positions = pgPositions.map((p) => {
          const inst = findInstrument(p.instrument_id);
          const ltp = inst ? inst.lastPrice : p.average_price;
          const posType = p.quantity > 0 ? 'BUY' : 'SELL';
          const qty = Math.abs(p.quantity);
          const lotSize = inst?.lotSize || 100;
          const lots = Math.max(1, Math.round(qty / lotSize));
          const pnl = posType === 'BUY'
            ? (ltp - p.average_price) * qty
            : (p.average_price - ltp) * qty;
          const pnlPercent = (p.average_price * qty) > 0
            ? Number(((pnl / (p.average_price * qty)) * 100).toFixed(2))
            : 0;

          return {
            id: p.id,
            symbol: p.instrument_id,
            category: inst?.category || 'COMMODITY',
            type: posType,
            product: 'INTRADAY' as const,
            lots,
            qty,
            lotSize,
            avgPrice: p.average_price,
            ltp,
            pnl: Number(pnl.toFixed(2)),
            pnlPercent,
            timestamp: p.updated_at,
            tenantId: p.tenant_id,
          };
        });
      }
      const pgOrders = await postgresOrderRepository.getOrders(tenantId, userId);
      if (pgOrders && pgOrders.length > 0) {
        orders = pgOrders.map((o) => {
          const inst = findInstrument(o.instrument_id);
          const lotSize = inst?.lotSize || 100;
          return {
            id: o.id,
            symbol: o.instrument_id,
            type: o.side as 'BUY' | 'SELL',
            orderType: o.order_type as any,
            product: 'INTRADAY',
            lots: Math.max(1, Math.round(o.quantity / lotSize)),
            qty: o.quantity,
            lotSize,
            price: o.price,
            status: o.status as any,
            time: new Date(o.created_at).toTimeString().split(' ')[0],
            date: new Date(o.created_at).toLocaleDateString('en-GB'),
            tenantId: o.tenant_id,
          };
        });
      }
    }
  } catch {
    // fallback to memory
  }

  // Real-time dynamic mark-to-market (MTM) calculation against live instrument prices
  positions = positions.map((pos) => {
    const inst = findInstrument(pos.symbol);
    const ltp = inst ? inst.lastPrice : pos.ltp;
    const pnl = pos.type === 'BUY'
      ? (ltp - pos.avgPrice) * pos.qty
      : (pos.avgPrice - ltp) * pos.qty;
    const pnlPercent = (pos.avgPrice * pos.qty) > 0
      ? Number(((pnl / (pos.avgPrice * pos.qty)) * 100).toFixed(2))
      : 0;
    return {
      ...pos,
      ltp,
      pnl: Number(pnl.toFixed(2)),
      pnlPercent,
    };
  });

  const totalUnrealizedPnL = positions.reduce((sum, p) => sum + (p.pnl || 0), 0);
  const realizedPnL = wallet.totalPnL || 0;
  wallet.todayPnL = Number((500 + totalUnrealizedPnL).toFixed(2));
  wallet.totalPnL = Number((realizedPnL + totalUnrealizedPnL).toFixed(2));

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

// Close / Square-off position - Supports both Postgres and fallback memory store
router.post(
  '/position/close',
  optionalAuth,
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

      let result: any = null;
      try {
        result = await tradingExecutionService.closePosition(tenantId, userId, positionId);
      } catch (dbErr: any) {
        // Fallback to in-memory position close
        const memClose = closeSinglePosition(tenantId, positionId);
        if (!memClose.success) {
          throw dbErr;
        }
        const memWallet = getTenantWallet(tenantId);
        result = {
          message: `Position for ${memClose.closedPosition?.symbol || positionId} squared off successfully.`,
          position: { ...memClose.closedPosition, quantity: 0 },
          wallet: {
            available_balance: memWallet.availableBalance,
            used_margin: memWallet.usedMargin,
            realized_pnl: memWallet.totalPnL,
          }
        };
      }

      // Also clean in-memory positions
      const positions = getTenantPositions(tenantId);
      const posIndex = positions.findIndex((p) => p.id === positionId || p.symbol === positionId);
      let closedPosSymbol = positionId;
      if (posIndex !== -1) {
        closedPosSymbol = positions[posIndex].symbol;
        const closedPos = positions[posIndex];
        
        // Add an executed opposite order to Order Book (like Zerodha Kite / Upstox)
        const memOrders = getTenantOrders(tenantId);
        const inst = findInstrument(closedPos.symbol);
        const ltp = inst ? inst.lastPrice : closedPos.ltp;
        memOrders.unshift({
          id: `ORD-SO-${Date.now()}`,
          symbol: closedPos.symbol,
          type: closedPos.type === 'BUY' ? 'SELL' : 'BUY',
          orderType: 'MARKET',
          product: closedPos.product || 'INTRADAY',
          lots: closedPos.lots || 1,
          qty: closedPos.qty,
          lotSize: closedPos.lotSize || 100,
          price: ltp,
          status: 'EXECUTED',
          time: new Date().toTimeString().split(' ')[0],
          date: new Date().toLocaleDateString('en-GB'),
          userId,
          tenantId,
        });

        positions.splice(posIndex, 1);
      }

      const notifications = getTenantNotifications(tenantId);
      notifications.unshift({
        id: `NOTIF-${Date.now()}`,
        title: 'Position Squared Off',
        message: `Successfully squared off ${closedPosSymbol}`,
        type: 'ORDER',
        time: 'Just now',
        read: false,
      });

      res.json({
        success: true,
        message: result.message,
        position: result.position,
        wallet: {
          availableBalance: result.wallet.available_balance ?? result.wallet.availableBalance,
          usedMargin: result.wallet.used_margin ?? result.wallet.usedMargin,
          totalPnL: result.wallet.realized_pnl ?? result.wallet.totalPnL,
          todayPnL: 0,
        },
        positions: getTenantPositions(tenantId),
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to close position.' });
    }
  }
);

// Square-off ALL Positions (Exit All) - Zerodha Kite & Upstox benchmark feature
router.post(
  '/positions/close-all',
  optionalAuth,
  requireTradingEnabled,
  requireActiveTrader,
  async (req: TenantRequest, res: Response) => {
    try {
      const tenantId = getReqTenantId(req);
      const userObj = (req as any).user;
      const userId = userObj?.userId || userObj?.user_id || userObj?.id || 'demo-trader';

      const positions = [...getTenantPositions(tenantId)];
      const closedList: string[] = [];

      for (const pos of positions) {
        try {
          await tradingExecutionService.closePosition(tenantId, userId, pos.id);
        } catch {
          closeSinglePosition(tenantId, pos.id);
        }
        closedList.push(pos.symbol);

        // Record square-off order in Order Book
        const memOrders = getTenantOrders(tenantId);
        const inst = findInstrument(pos.symbol);
        const ltp = inst ? inst.lastPrice : pos.ltp;
        memOrders.unshift({
          id: `ORD-SO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          symbol: pos.symbol,
          type: pos.type === 'BUY' ? 'SELL' : 'BUY',
          orderType: 'MARKET',
          product: pos.product || 'INTRADAY',
          lots: pos.lots || 1,
          qty: pos.qty,
          lotSize: pos.lotSize || 100,
          price: ltp,
          status: 'EXECUTED',
          time: new Date().toTimeString().split(' ')[0],
          date: new Date().toLocaleDateString('en-GB'),
          userId,
          tenantId,
        });
      }

      // Empty in-memory positions
      setTenantPositions(tenantId, []);

      const memWallet = getTenantWallet(tenantId);
      res.json({
        success: true,
        message: `Successfully squared off ${closedList.length} position(s).`,
        wallet: {
          availableBalance: memWallet.availableBalance,
          usedMargin: 0,
          totalPnL: memWallet.totalPnL,
          todayPnL: 0,
        },
        positions: [],
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to exit all positions.' });
    }
  }
);

// Cancel Order
router.post(
  ['/order/cancel', '/orders/cancel'],
  optionalAuth,
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

      let result: any = null;
      try {
        result = await tradingExecutionService.cancelOrder(tenantId, userId, orderId);
      } catch (e: any) {
        // Fallback for in-memory orders
        const orders = getTenantOrders(tenantId);
        const ord = orders.find((o) => o.id === orderId);
        if (ord) {
          ord.status = 'CANCELLED' as any;
          result = { success: true, message: `Order ${orderId} has been cancelled.` };
        } else {
          throw e;
        }
      }

      // Update in-memory order status if present
      const orders = getTenantOrders(tenantId);
      const ord = orders.find((o) => o.id === orderId);
      if (ord) {
        ord.status = 'CANCELLED' as any;
      }

      res.json(result || { success: true, message: 'Order cancelled successfully.' });
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
