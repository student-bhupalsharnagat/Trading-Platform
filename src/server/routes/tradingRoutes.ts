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
  getTenantFundTransactions,
} from '../trading/tradingStore.ts';
import { db } from '../db/database.ts';
import { tenantConfigCache } from '../cache/TenantConfigCache.ts';
import { internalEventDispatcher } from '../events/InternalEventDispatcher.ts';
import { SupportTicketPayload } from '../events/types.ts';
import { transactionalOutboxService } from '../services/TransactionalOutboxService.ts';
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
import { authoritativeTradingDataService } from '../services/authoritativeTradingDataService.ts';
import { postgresFundTransactionRepository } from '../repositories/trading/PostgresFundTransactionRepository.ts';
import { postgresLedgerRepository } from '../repositories/trading/PostgresLedgerRepository.ts';

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

  const cleanSym = symbol.replace(/^(NSE|BSE|MCX|NFO|BINANCE|TVC):/i, '').trim().toLowerCase();
  const inst =
    INSTRUMENTS.find((i) => {
      const iSym = i.symbol.replace(/^(NSE|BSE|MCX|NFO|BINANCE|TVC):/i, '').trim().toLowerCase();
      return iSym === cleanSym || i.id.toLowerCase() === cleanSym || i.symbol.toLowerCase() === symbol.toLowerCase();
    }) ||
    INSTRUMENTS.find((i) => i.symbol.toLowerCase().includes(cleanSym)) ||
    INSTRUMENTS[0];

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

// Get portfolio data (scoped to authenticated user & resolved tenant)
router.get('/portfolio', optionalAuth, async (req: TenantRequest, res: Response) => {
  const tenantId = getReqTenantId(req);
  const userObj = (req as any).user;
  const userId = userObj?.userId || userObj?.user_id || userObj?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required to view trading portfolio.',
      wallet: {
        availableBalance: 0,
        usedMargin: 0,
        totalPnL: 0,
        todayPnL: 0,
        deposited: 0,
        withdrawn: 0,
      },
      positions: [],
      orders: [],
    });
  }

  try {
    const pgWallet = await postgresWalletRepository.getOrCreateWallet(tenantId, userId, 0);
    const pgPositions = await postgresPositionRepository.getPositions(tenantId, userId);
    const pgOrders = await postgresOrderRepository.getOrders(tenantId, userId);

    const positions = (pgPositions || []).map((p) => {
      const inst = findInstrument(p.instrument_id);
      const avgPrice = Number(p.average_price);
      const ltp = inst ? inst.lastPrice : avgPrice;
      const posType: 'BUY' | 'SELL' = Number(p.quantity) >= 0 ? 'BUY' : 'SELL';
      const qty = Math.abs(Number(p.quantity));
      const lotSize = inst?.lotSize || 1;
      const lots = Math.max(1, Math.round(qty / lotSize));
      const pnl = posType === 'BUY'
        ? (ltp - avgPrice) * qty
        : (avgPrice - ltp) * qty;
      const pnlPercent = (avgPrice * qty) > 0
        ? Number(((pnl / (avgPrice * qty)) * 100).toFixed(2))
        : 0;

      return {
        id: p.id,
        symbol: p.instrument_id,
        category: inst?.category || 'EQUITY',
        type: posType,
        product: 'INTRADAY' as const,
        lots,
        qty,
        lotSize,
        avgPrice: Number(avgPrice.toFixed(2)),
        ltp: Number(ltp.toFixed(2)),
        pnl: Number(pnl.toFixed(2)),
        pnlPercent,
        timestamp: p.updated_at,
        tenantId: p.tenant_id,
      };
    });

    const orders = (pgOrders || []).map((o) => {
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

    // Real-time dynamic mark-to-market (MTM) calculation against live instrument prices
    const updatedPositions = positions.map((pos) => {
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

    const totalUnrealizedPnL = updatedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
    const realizedPnL = pgWallet.realized_pnl || 0;

    const wallet = {
      availableBalance: pgWallet.available_balance,
      usedMargin: pgWallet.used_margin,
      totalPnL: Number((realizedPnL + totalUnrealizedPnL).toFixed(2)),
      todayPnL: Number(realizedPnL.toFixed(2)),
      deposited: (pgWallet as any).deposited || 0,
      withdrawn: (pgWallet as any).withdrawn || 0,
    };

    return res.json({
      success: true,
      tenantId,
      wallet,
      positions: updatedPositions,
      orders,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to load user portfolio',
      wallet: {
        availableBalance: 0,
        usedMargin: 0,
        totalPnL: 0,
        todayPnL: 0,
        deposited: 0,
        withdrawn: 0,
      },
      positions: [],
      orders: [],
    });
  }
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

      if (userObj) {
        const latestUser = db.findUserById(userObj.id || userObj.userId) || db.findUserByUserId(userObj.userId || userObj.id);
        if (latestUser) {
          const check = db.isUserOrHierarchyFrozen(latestUser);
          if (check.frozen || Boolean(latestUser.is_frozen)) {
            res.status(403).json({
              success: false,
              code: 'USER_FROZEN',
              message: check.reason || 'Your account is currently frozen.',
            });
            return;
          }
        }
      }

      const {
        symbol,
        instrument,
        type, // BUY or SELL
        side, // alternative for type
        orderType, // MARKET, LIMIT, SL, SL-M
        product, // INTRADAY or HOLDING, MIS, CNC, NRML
        lots,
        quantity,
        limitPrice,
        triggerPrice,
        trigger_price,
        price,
        orderPrice,
        stopLoss,
        target,
        timeInForce,
        clientOrderId,
        client_order_id,
        clientId,
      } = req.body;

      const orderSide = ((type || side || '') as string).toUpperCase() as 'BUY' | 'SELL';
      const effectiveSymbol = symbol || instrument;

      const inst = effectiveSymbol
        ? (findInstrument(effectiveSymbol) ||
            INSTRUMENTS.find(
              (i) =>
                i.symbol === effectiveSymbol ||
                i.id === effectiveSymbol ||
                i.symbol.toLowerCase().replace(/[\s\-_]/g, '') === (effectiveSymbol || '').toLowerCase().replace(/[\s\-_]/g, '')
            ))
        : undefined;

      if (!inst) {
        res.status(404).json({ success: false, message: 'Instrument not found.' });
        return;
      }

      const lotSize = inst?.lotSize || 1;
      const orderLots = Number(lots) > 0 ? Number(lots) : (quantity ? Math.max(1, Math.round(Number(quantity) / lotSize)) : 0);

      if ((orderSide !== 'BUY' && orderSide !== 'SELL') || !orderLots || orderLots <= 0) {
        res.status(400).json({ success: false, message: 'Invalid order parameters: symbol, type (BUY/SELL), and positive lots (or quantity) are required.' });
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

      // Map product codes
      let normalizedProduct: 'INTRADAY' | 'HOLDING' = 'INTRADAY';
      const prodUpper = String(product || '').toUpperCase();
      if (prodUpper === 'CNC' || prodUpper === 'HOLDING') {
        normalizedProduct = 'HOLDING';
      }

      const execPrice = (price !== undefined && price !== 'Market')
        ? Number(price)
        : (orderPrice !== undefined && orderPrice !== 'Market'
            ? Number(orderPrice)
            : (orderType === 'LIMIT' && limitPrice ? Number(limitPrice) : inst.lastPrice));

      const callerRole = String(userObj?.role || '').toUpperCase();
      const isHierarchyCaller = ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER', 'OPERATIONS'].includes(callerRole);
      if (clientId && clientId !== orderUserId && !isHierarchyCaller) {
        res.status(403).json({
          success: false,
          code: 'UNAUTHORIZED_CLIENT_OVERRIDE',
          message: 'You are not authorized to place orders on behalf of another client.',
        });
        return;
      }
      const effectiveUserId = (isHierarchyCaller && clientId) ? clientId : orderUserId;

      // Execute through ACID TradingExecutionService
      const result = await tradingExecutionService.placeOrder({
        tenantId,
        userId: effectiveUserId,
        clientOrderId: clientOrderId || client_order_id,
        symbol: inst.symbol,
        side: orderSide,
        orderType: orderType || 'MARKET',
        product: normalizedProduct,
        lots: orderLots,
        quantity: quantity ? Number(quantity) : undefined,
        price: execPrice,
        triggerPrice: (triggerPrice != null || trigger_price != null) ? Number(triggerPrice ?? trigger_price) : undefined,
        stopLoss: stopLoss ? Number(stopLoss) : undefined,
        target: target ? Number(target) : undefined,
        timeInForce: timeInForce || 'DAY',
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

      const clientPosition = result.position ? {
        id: result.position.id,
        symbol: result.position.instrument_id,
        category: inst.category,
        type: Number(result.position.quantity) >= 0 ? 'BUY' as const : 'SELL' as const,
        product: (product || 'INTRADAY') as any,
        qty: Math.abs(Number(result.position.quantity)),
        lots: Math.max(1, Math.round(Math.abs(Number(result.position.quantity)) / (inst.lotSize || 1))),
        lotSize: inst.lotSize || 1,
        avgPrice: Number(Number(result.position.average_price).toFixed(2)),
        ltp: Number(inst.lastPrice.toFixed(2)),
        pnl: Number(
          (Number(result.position.quantity) >= 0
            ? (inst.lastPrice - Number(result.position.average_price)) * Math.abs(Number(result.position.quantity))
            : (Number(result.position.average_price) - inst.lastPrice) * Math.abs(Number(result.position.quantity))
          ).toFixed(2)
        ),
        pnlPercent: Number(result.position.average_price) > 0
          ? Number(
              (
                (((Number(result.position.quantity) >= 0
                  ? inst.lastPrice - Number(result.position.average_price)
                  : Number(result.position.average_price) - inst.lastPrice) *
                  Math.abs(Number(result.position.quantity))) /
                  (Number(result.position.average_price) * Math.abs(Number(result.position.quantity)))) *
                100
              ).toFixed(2)
            )
          : 0,
        timestamp: new Date().toISOString(),
        tenantId,
      } : undefined;

      res.json({
        success: true,
        message: result.message,
        order: result.order,
        trade: result.trade,
        position: clientPosition,
        wallet: {
          availableBalance: result.wallet.available_balance,
          usedMargin: result.wallet.used_margin,
          totalPnL: result.wallet.realized_pnl,
          todayPnL: 0,
        },
        positions: (await postgresPositionRepository.getPositions(tenantId, effectiveUserId)).map((p) => {
          const pInst = findInstrument(p.instrument_id);
          const avgPrice = Number(p.average_price);
          const ltp = pInst ? pInst.lastPrice : avgPrice;
          const posType: 'BUY' | 'SELL' = Number(p.quantity) >= 0 ? 'BUY' : 'SELL';
          const qty = Math.abs(Number(p.quantity));
          const lotSize = pInst?.lotSize || 1;
          const lots = Math.max(1, Math.round(qty / lotSize));
          const pnl = posType === 'BUY' ? (ltp - avgPrice) * qty : (avgPrice - ltp) * qty;
          return {
            id: p.id,
            symbol: p.instrument_id,
            category: pInst?.category || 'EQUITY',
            type: posType,
            product: 'INTRADAY' as const,
            lots,
            qty,
            lotSize,
            avgPrice: Number(avgPrice.toFixed(2)),
            ltp: Number(ltp.toFixed(2)),
            pnl: Number(pnl.toFixed(2)),
            pnlPercent: (avgPrice * qty) > 0 ? Number(((pnl / (avgPrice * qty)) * 100).toFixed(2)) : 0,
            timestamp: p.updated_at,
            tenantId: p.tenant_id,
          };
        }),
      });
    } catch (err: any) {
      const status = err.statusCode || (err.code === 'INSUFFICIENT_MARGIN' ? 400 : 500);
      res.status(status).json({ success: false, code: err.code, message: err.message || 'Failed to execute order.' });
    }
  }
);

// Close / Square-off position - Supports both Postgres and fallback memory store
router.post(
  ['/position/close', '/positions/close', '/positions/:id/square-off'],
  optionalAuth,
  requireTradingEnabled,
  requireActiveTrader,
  async (req: TenantRequest, res: Response) => {
    try {
      const tenantId = getReqTenantId(req);
      const userObj = (req as any).user;
      const userId = userObj?.userId || userObj?.user_id || userObj?.id || 'demo-trader';
      const positionId = req.body?.positionId || req.body?.id || req.params?.id;

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
          availableBalance: result.wallet?.available_balance ?? result.wallet?.availableBalance ?? (result.updatedWallet ? Number(result.updatedWallet.available_balance) : 0),
          usedMargin: result.wallet?.used_margin ?? result.wallet?.usedMargin ?? (result.updatedWallet ? Number(result.updatedWallet.used_margin) : 0),
          totalPnL: Number((result.wallet?.realized_pnl ?? result.wallet?.totalPnL ?? (result.updatedWallet ? Number(result.updatedWallet.realized_pnl) : 0)).toFixed(2)),
          todayPnL: Number((result.wallet?.realized_pnl ?? result.wallet?.todayPnL ?? (result.updatedWallet ? Number(result.updatedWallet.realized_pnl) : 0)).toFixed(2)),
        },
        positions: (await postgresPositionRepository.getPositions(tenantId, userId)).map((p) => {
          const pInst = findInstrument(p.instrument_id);
          const avgPrice = Number(p.average_price);
          const ltp = pInst ? pInst.lastPrice : avgPrice;
          const posType: 'BUY' | 'SELL' = Number(p.quantity) >= 0 ? 'BUY' : 'SELL';
          const qty = Math.abs(Number(p.quantity));
          const lotSize = pInst?.lotSize || 1;
          const lots = Math.max(1, Math.round(qty / lotSize));
          const pnl = posType === 'BUY' ? (ltp - avgPrice) * qty : (avgPrice - ltp) * qty;
          return {
            id: p.id,
            symbol: p.instrument_id,
            category: pInst?.category || 'EQUITY',
            type: posType,
            product: 'INTRADAY' as const,
            lots,
            qty,
            lotSize,
            avgPrice: Number(avgPrice.toFixed(2)),
            ltp: Number(ltp.toFixed(2)),
            pnl: Number(pnl.toFixed(2)),
            pnlPercent: (avgPrice * qty) > 0 ? Number(((pnl / (avgPrice * qty)) * 100).toFixed(2)) : 0,
            timestamp: p.updated_at,
            tenantId: p.tenant_id,
          };
        }),
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
  ['/order/cancel', '/orders/cancel', '/orders/:id/cancel'],
  optionalAuth,
  async (req: TenantRequest, res: Response) => {
    try {
      const tenantId = getReqTenantId(req);
      const userObj = (req as any).user;
      const userId = userObj?.userId || userObj?.user_id || userObj?.id || 'demo-trader';
      const orderId = req.body?.orderId || req.body?.id || req.params?.id;

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

// Add Funds (Deposit) - Authoritative PostgreSQL Transaction & Immutable Ledger Flow
router.post('/funds/deposit', requireAuth, async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const userObj = (req as any).user;
    const userId = userObj?.userId || userObj?.user_id || 'demo-trader';

    const { amount, method } = req.body;
    const numAmount = Number(amount);
    if (!numAmount || numAmount < 100) {
      res.status(400).json({ success: false, message: 'Minimum deposit amount is ₹100.' });
      return;
    }

    // 1. Create authoritative fund transaction in PostgreSQL (PENDING state + outbox deposit.created event)
    const refId = `DEP-${Date.now()}`;
    const tx = await authoritativeTradingDataService.createFundTransaction(
      tenantId,
      userId,
      'DEPOSIT',
      numAmount,
      method || 'UPI Instant',
      refId
    );

    // 2. QA-043/QA-044: When user clicks 'Pay & Credit Instantly', immediately approve/complete in PostgreSQL and tradingStore
    try {
      await authoritativeTradingDataService.processFundTransaction(
        tenantId,
        tx.id,
        'APPROVE',
        'INSTANT_PAYMENT'
      );
    } catch {
      const pgW = await postgresWalletRepository.getOrCreateWallet(tenantId, userId);
      await postgresWalletRepository.updateWallet(tenantId, userId, {
        available_balance: Number((pgW.available_balance + numAmount).toFixed(2)),
      });
      await postgresFundTransactionRepository.updateStatus(tenantId, tx.id, 'APPROVED', 'INSTANT_PAYMENT');
    }

    // In-memory dual-write for instant margin reflection
    for (const t of [tenantId, 'TNT-001', 'vertex-default']) {
      const memW = getTenantWallet(t);
      memW.availableBalance = Number((memW.availableBalance + numAmount).toFixed(2));
      memW.deposited = Number((memW.deposited + numAmount).toFixed(2));

      const memTxs = getTenantFundTransactions(t);
      const existingMem = memTxs.find((it: any) => it.id === tx.id);
      if (existingMem) {
        existingMem.status = 'APPROVED';
      }
    }

    const pgWallet = await postgresWalletRepository.getOrCreateWallet(tenantId, userId);

    const notifications = getTenantNotifications(tenantId);
    notifications.unshift({
      id: `NOTIF-${Date.now()}`,
      title: 'Funds Credited Successfully',
      message: `Deposit of ₹${numAmount.toLocaleString('en-IN')} has been credited instantly to your trading margin balance.`,
      type: 'SYSTEM',
      time: 'Just now',
      read: false,
    });

    res.json({
      success: true,
      transactionId: tx.id,
      status: 'SUCCESS',
      message: `₹${numAmount.toLocaleString('en-IN')} has been credited to your trading margin balance.`,
      wallet: {
        availableBalance: pgWallet.available_balance,
        usedMargin: pgWallet.used_margin,
        totalPnL: pgWallet.realized_pnl,
        todayPnL: pgWallet.realized_pnl,
        deposited: (pgWallet as any).deposited || numAmount,
      },
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

// Withdraw Funds - Authoritative PostgreSQL Transaction & Immutable Ledger Flow
router.post('/funds/withdraw', requireAuth, async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const userObj = (req as any).user;
    const userId = userObj?.userId || userObj?.user_id || 'demo-trader';

    const { amount, bankName } = req.body;
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      res.status(400).json({ success: false, message: 'Invalid withdrawal amount.' });
      return;
    }

    const pgWallet = await postgresWalletRepository.getOrCreateWallet(tenantId, userId);
    if (numAmount > pgWallet.available_balance) {
      res.status(400).json({
        success: false,
        message: `Insufficient balance. Available to withdraw: ₹${pgWallet.available_balance.toLocaleString('en-IN')}`,
      });
      return;
    }

    // Create authoritative PENDING withdrawal transaction + outbox event withdrawal.created
    const refId = `WDR-${Date.now()}`;
    const tx = await authoritativeTradingDataService.createFundTransaction(
      tenantId,
      userId,
      'WITHDRAWAL',
      numAmount,
      bankName || 'Verified Bank',
      refId
    );

    const wallet = getTenantWallet(tenantId);
    const notifications = getTenantNotifications(tenantId);
    notifications.unshift({
      id: `NOTIF-${Date.now()}`,
      title: 'Withdrawal Initiated',
      message: `Payout request for ₹${numAmount.toLocaleString('en-IN')} sent to ${bankName || 'Verified Bank'} (Status: PENDING).`,
      type: 'SYSTEM',
      time: 'Just now',
      read: false,
    });

    res.json({
      success: true,
      transactionId: tx.id,
      status: 'PENDING',
      message: `Withdrawal request of ₹${numAmount.toLocaleString('en-IN')} submitted and pending approval.`,
      wallet,
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

// GET /api/trading/funds & /api/trading/funds/transactions - Authenticated trader/broker fund transactions
router.get(['/funds', '/funds/transactions'], requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const caller = req.user!;
    let targetUserId = caller.userId;

    if (req.query.userId && ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'].includes(caller.role || '')) {
      const requestedId = String(req.query.userId);
      if (caller.role !== 'SUPER_ADMIN') {
        const targetUser = db.findUserByUserId(requestedId) || db.findUserById(requestedId);
        if (!targetUser || !targetUser.hierarchy_path?.startsWith(caller.hierarchyPath || '')) {
          res.status(403).json({ success: false, message: 'Access denied: client is outside your hierarchy' });
          return;
        }
      }
      targetUserId = requestedId;
    }

    const type = req.query.type as 'DEPOSIT' | 'WITHDRAWAL' | undefined;
    const status = req.query.status as string | undefined;

    const pgTxs = await postgresFundTransactionRepository.getByTenant(tenantId, targetUserId, type, status);
    const memTxs = [
      ...getTenantFundTransactions(tenantId),
      ...getTenantFundTransactions('TNT-001'),
      ...getTenantFundTransactions('vertex-default'),
    ].filter((t: any) => !t.userId || t.userId === targetUserId || t.userId === 'vtx_demo' || t.userId === 'demo-trader');

    const seenIds = new Set<string>();
    const transactions: any[] = [];
    for (const tx of [...pgTxs, ...memTxs]) {
      const id = tx.id || tx.transactionId;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        if (type && tx.transaction_type !== type && tx.type !== type) continue;
        if (status && tx.status !== status) continue;
        transactions.push(tx);
      }
    }

    res.json({ success: true, tenantId, userId: targetUserId, transactions });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/trading/wallet - Authenticated trader wallet summary & fund history
router.get('/wallet', optionalAuth, async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const userObj = (req as any).user;
    const userId = userObj?.userId || userObj?.user_id || userObj?.id || 'demo-trader';

    const pgWallet = await postgresWalletRepository.getOrCreateWallet(tenantId, userId, 0);
    const pgTransactions = await postgresFundTransactionRepository.getByTenant(tenantId, userId);
    const memTransactions = [
      ...getTenantFundTransactions(tenantId),
      ...getTenantFundTransactions('TNT-001'),
      ...getTenantFundTransactions('vertex-default'),
    ].filter((t: any) => !t.userId || t.userId === userId || t.userId === 'vtx_demo' || t.userId === 'demo-trader');

    const seenIds = new Set<string>();
    const allTxs: any[] = [];
    for (const tx of [...pgTransactions, ...memTransactions]) {
      const id = tx.id || tx.transactionId;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        allTxs.push(tx);
      }
    }

    res.json({
      success: true,
      tenantId,
      userId,
      wallet: {
        availableBalance: pgWallet.available_balance,
        usedMargin: pgWallet.used_margin,
        totalPnL: pgWallet.realized_pnl,
        todayPnL: pgWallet.realized_pnl,
        deposited: (pgWallet as any).deposited || 0,
        withdrawn: (pgWallet as any).withdrawn || 0,
      },
      transactions: allTxs,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/trading/ledger - Authenticated trader/broker immutable financial ledger
router.get('/ledger', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const caller = req.user!;
    let targetUserId = caller.userId;

    if (req.query.userId && ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'].includes(caller.role || '')) {
      const requestedId = String(req.query.userId);
      if (caller.role !== 'SUPER_ADMIN') {
        const targetUser = db.findUserByUserId(requestedId) || db.findUserById(requestedId);
        if (!targetUser || !targetUser.hierarchy_path?.startsWith(caller.hierarchyPath || '')) {
          res.status(403).json({ success: false, message: 'Access denied: client is outside your hierarchy' });
          return;
        }
      }
      targetUserId = requestedId;
    }

    const ledger = await postgresLedgerRepository.getByUserId(targetUserId, tenantId);
    res.json({ success: true, tenantId, userId: targetUserId, ledger });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/trading/account - Consolidated authoritative client account, margin & wallet status
router.get('/account', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const caller = req.user!;
    let targetUserId = caller.userId;

    if (req.query.userId && ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'].includes(caller.role || '')) {
      const requestedId = String(req.query.userId);
      if (caller.role !== 'SUPER_ADMIN') {
        const targetUser = db.findUserByUserId(requestedId) || db.findUserById(requestedId);
        if (!targetUser || !targetUser.hierarchy_path?.startsWith(caller.hierarchyPath || '')) {
          res.status(403).json({ success: false, message: 'Access denied: client is outside your hierarchy' });
          return;
        }
      }
      targetUserId = requestedId;
    }

    const userRecord = db.findUserByUserId(targetUserId) || db.findUserById(targetUserId);
    const wallet = await postgresWalletRepository.getOrCreateWallet(tenantId, targetUserId);
    const positions = await postgresPositionRepository.getPositions(tenantId, targetUserId);

    const openPositions = positions.filter((p) => Number(p.quantity) !== 0);
    let unrealizedPnL = 0;
    for (const pos of openPositions) {
      const inst = findInstrument(pos.instrument_id);
      const ltp = inst ? inst.lastPrice : Number(pos.average_price);
      const qty = Number(pos.quantity);
      unrealizedPnL += (ltp - Number(pos.average_price)) * qty;
    }

    const availableBalance = Number(wallet.available_balance);
    const usedMargin = Number(wallet.used_margin);
    const blockedBalance = Number(wallet.blocked_balance || 0);
    const realizedPnL = Number(wallet.realized_pnl || 0);
    const equity = Number((availableBalance + usedMargin + unrealizedPnL).toFixed(2));
    const marginLevel = usedMargin > 0 ? Number(((equity / usedMargin) * 100).toFixed(2)) : 999;

    res.json({
      success: true,
      tenantId,
      user: {
        userId: targetUserId,
        fullName: userRecord?.full_name || targetUserId,
        role: userRecord?.role || 'CLIENT',
        accountType: userRecord?.account_type || 'real',
        status: userRecord?.status || 'active',
        isFrozen: Boolean(userRecord?.is_frozen),
        tenantId: userRecord?.tenant_id || tenantId,
      },
      wallet: {
        availableBalance,
        usedMargin,
        blockedBalance,
        realizedPnL,
        unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
        equity,
        marginLevel,
      },
      openPositionsCount: openPositions.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
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

  const { subject, category, priority, attachmentUrl, attachmentName } = req.body;
  const message = req.body.message || req.body.description;
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

  const ticketUserId = req.user?.userId || req.user?.id || 'CLIENT';
  const ticketClientCode = (req.user?.userId || req.user?.id || 'CLIENT').toUpperCase();
  const ticketPayload: SupportTicketPayload = {
    tenantId,
    ticketId: newTicket.id,
    userId: ticketUserId,
    clientCode: ticketClientCode,
    subject: newTicket.subject,
    category: newTicket.category,
    status: newTicket.status,
    priority: newTicket.priority,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  transactionalOutboxService.enqueue({
    eventId: `evt-ticket-${newTicket.id}-${Date.now()}`,
    eventType: 'support.ticket_created',
    tenantId,
    payload: ticketPayload,
  }).catch((e) => console.warn('[Outbox] Support ticket created enqueue warning:', e));

  internalEventDispatcher.dispatchSupportTicketCreated(ticketPayload).catch((e) =>
    console.warn('[Event] Support ticket created dispatch warning:', e)
  );

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

  const replyUserId = req.user?.userId || req.user?.id || 'CLIENT';
  const replyClientCode = (req.user?.userId || req.user?.id || 'CLIENT').toUpperCase();
  const updatePayload: SupportTicketPayload = {
    tenantId,
    ticketId: ticket.id,
    userId: replyUserId,
    clientCode: replyClientCode,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    priority: ticket.priority,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  transactionalOutboxService.enqueue({
    eventId: `evt-ticket-upd-${ticket.id}-${Date.now()}`,
    eventType: 'support.ticket_updated',
    tenantId,
    payload: updatePayload,
  }).catch((e) => console.warn('[Outbox] Support ticket updated enqueue warning:', e));

  internalEventDispatcher.dispatchSupportTicketUpdated(updatePayload).catch((e) =>
    console.warn('[Event] Support ticket updated dispatch warning:', e)
  );

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

    const statusUserId = req.user?.userId || req.user?.id || 'CLIENT';
    const statusClientCode = (req.user?.userId || req.user?.id || 'CLIENT').toUpperCase();
    const updatePayload: SupportTicketPayload = {
      tenantId,
      ticketId: ticket.id,
      userId: statusUserId,
      clientCode: statusClientCode,
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    transactionalOutboxService.enqueue({
      eventId: `evt-ticket-upd-${ticket.id}-${Date.now()}`,
      eventType: 'support.ticket_updated',
      tenantId,
      payload: updatePayload,
    }).catch((e) => console.warn('[Outbox] Support ticket updated enqueue warning:', e));

    internalEventDispatcher.dispatchSupportTicketUpdated(updatePayload).catch((e) =>
      console.warn('[Event] Support ticket updated dispatch warning:', e)
    );
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
