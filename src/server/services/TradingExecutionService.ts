import { pgDb, DbClient } from '../db/postgres.ts';
import { postgresOrderRepository } from '../repositories/trading/PostgresOrderRepository.ts';
import { postgresTradeRepository } from '../repositories/trading/PostgresTradeRepository.ts';
import { postgresPositionRepository } from '../repositories/trading/PostgresPositionRepository.ts';
import { postgresWalletRepository } from '../repositories/trading/PostgresWalletRepository.ts';
import { postgresOrderEventRepository } from '../repositories/trading/PostgresOrderEventRepository.ts';
import { postgresMarginRepository } from '../repositories/trading/PostgresMarginRepository.ts';
import { tradingWebSocketServer } from '../websocket/WebSocketServer.ts';
import { transactionalOutboxService } from './TransactionalOutboxService.ts';
import { internalEventDispatcher } from '../events/InternalEventDispatcher.ts';
import { tenantConfigCache } from '../cache/TenantConfigCache.ts';
import { emergencyStateCache } from '../cache/EmergencyStateCache.ts';
import { INSTRUMENTS, findInstrument, getTenantWallet, setTenantWallet, getTenantPositions, setTenantPositions, getTenantOrders } from '../trading/tradingStore.ts';
import { TradingOrder } from '../repositories/trading/ITradingOrderRepository.ts';
import { TradingTrade } from '../repositories/trading/ITradingTradeRepository.ts';
import { TradingPosition } from '../repositories/trading/ITradingPositionRepository.ts';
import { TradingWallet } from '../repositories/trading/ITradingWalletRepository.ts';
import { executionGateway } from '../gateways/ExecutionGateway.ts';
import { GatewayOrderResult } from '../gateways/types.ts';

export interface PlaceOrderInput {
  tenantId: string;
  userId: string;
  clientOrderId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType?: string; // 'MARKET' | 'LIMIT'
  product?: string;   // 'INTRADAY' | 'HOLDING'
  lots: number;
  quantity?: number;
  price?: number;
  stopLoss?: number;
  target?: number;
  timeInForce?: string;
}

export interface PlaceOrderResult {
  success: boolean;
  isDuplicate?: boolean;
  order: TradingOrder;
  trade?: TradingTrade;
  position?: TradingPosition;
  wallet: TradingWallet;
  message: string;
}

export class TradingExecutionService {
  /**
   * Transaction-safe order placement and simulated execution lifecycle.
   * Step 1: Validate input and check idempotency (client_order_id)
   * Step 2: Acquire row locks on wallet and position inside a BEGIN ... COMMIT block
   * Step 3: Validate available margin, execute order, update position, update wallet, record event
   * Step 4: Commit database transaction
   * Step 5: Asynchronously dispatch WebSocket notifications and Central Admin webhooks
   */
  public async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const { tenantId, userId, clientOrderId, symbol, side, lots } = input;

    if (!tenantId) {
      const err = new Error('Tenant context is required for order execution.');
      (err as any).statusCode = 400;
      throw err;
    }

    if (!userId) {
      const err = new Error('User identity is required for order execution.');
      (err as any).statusCode = 401;
      throw err;
    }

    if (!lots || lots <= 0) {
      const err = new Error('Order quantity (lots) must be greater than zero.');
      (err as any).statusCode = 400;
      throw err;
    }

    // Check emergency trading halt in tenant cache
    const emergencyState = emergencyStateCache.get(tenantId);
    const cachedConfig = tenantConfigCache.get(tenantId);
    if (emergencyState.tradingHalted || cachedConfig?.tradingEnabled === false) {
      const err = new Error('Trading is temporarily halted by Central Admin emergency control.');
      (err as any).statusCode = 403;
      (err as any).code = 'TRADING_HALTED';
      throw err;
    }

    // Check idempotency if clientOrderId is provided
    if (clientOrderId && clientOrderId.trim()) {
      const existing = await postgresOrderRepository.findByClientOrderId(tenantId, userId, clientOrderId.trim());
      if (existing) {
        const wallet = await postgresWalletRepository.getOrCreateWallet(tenantId, userId);
        const positions = await postgresPositionRepository.getPositions(tenantId, userId);
        return {
          success: true,
          isDuplicate: true,
          order: existing,
          wallet,
          message: `Idempotent acknowledgment: Order with client_order_id '${clientOrderId}' was already executed.`,
        };
      }
    }

    // Find instrument and calculate margin
    const inst = findInstrument(symbol) || INSTRUMENTS.find((i) => i.symbol === symbol);
    if (!inst) {
      const err = new Error(`Instrument '${symbol}' not found.`);
      (err as any).statusCode = 404;
      throw err;
    }

    const execPrice = input.price && input.price > 0 ? input.price : inst.lastPrice;
    const lotSize = inst.lotSize || 1;
    const marginPerLot = (input.product || '').toUpperCase() === 'HOLDING'
      ? (inst.holding || (inst.lastPrice * lotSize))
      : (inst.intraday || Math.round(inst.lastPrice * lotSize * 0.2));
    const requiredMargin = marginPerLot * lots;
    const qty = input.quantity && input.quantity > 0 ? input.quantity : lots * lotSize;
    const isLimit = (input.orderType || '').toUpperCase() === 'LIMIT';
    const orderId = `ORD-${Math.floor(10000 + Math.random() * 90000)}`;

    // Communicate through Execution Gateway
    const gatewayResult = await executionGateway.placeOrder({
      tenantId,
      userId,
      orderId,
      clientOrderId: clientOrderId ? clientOrderId.trim() : undefined,
      symbol: inst.symbol,
      side,
      orderType: isLimit ? 'LIMIT' : 'MARKET',
      quantity: qty,
      price: execPrice,
      timeInForce: input.timeInForce || 'DAY',
    });

    if (isLimit) {
      const limitResult = await pgDb.transaction(async (client: DbClient) => {
        const wallet = await postgresWalletRepository.lockWalletForUpdate(tenantId, userId, client);
        if (wallet.available_balance < requiredMargin) {
          const err = new Error(
            `Insufficient margin. Required ₹${requiredMargin.toLocaleString('en-IN')}, available ₹${wallet.available_balance.toLocaleString('en-IN')}.`
          );
          (err as any).statusCode = 400;
          (err as any).code = 'INSUFFICIENT_MARGIN';
          throw err;
        }

        const newAvailable = Math.max(0, wallet.available_balance - requiredMargin);
        const newBlocked = wallet.blocked_balance + requiredMargin;
        const updatedWallet = await postgresWalletRepository.updateWallet(
          tenantId,
          userId,
          {
            available_balance: newAvailable,
            blocked_balance: newBlocked,
          },
          client
        );

        const newOrder = await postgresOrderRepository.create(
          {
            id: orderId,
            tenant_id: tenantId,
            user_id: userId,
            client_order_id: clientOrderId ? clientOrderId.trim() : null,
            instrument_id: inst.symbol,
            side,
            order_type: 'LIMIT',
            quantity: qty,
            price: execPrice,
            trigger_price: null,
            status: 'PENDING',
            broker_order_id: gatewayResult.brokerOrderId,
            normalized_status: gatewayResult.status,
            filled_quantity: 0,
            remaining_quantity: qty,
            average_fill_price: null,
            time_in_force: input.timeInForce || 'DAY',
          },
          client
        );

        await postgresOrderEventRepository.recordEvent(
          {
            id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            tenant_id: tenantId,
            order_id: newOrder.id,
            event_type: 'ORDER_CREATED',
            event_payload: { orderId: newOrder.id, userId, status: 'PENDING', price: execPrice, quantity: qty },
          },
          client
        );

        return { newOrder, updatedWallet };
      });

      // Synchronize in-memory fallback store for limit orders
      try {
        const memWallet = getTenantWallet(tenantId);
        memWallet.availableBalance = limitResult.updatedWallet.available_balance;
        memWallet.blockedBalance = limitResult.updatedWallet.blocked_balance;

        const memOrders = getTenantOrders(tenantId);
        memOrders.unshift({
          id: limitResult.newOrder.id,
          symbol: limitResult.newOrder.instrument_id,
          type: limitResult.newOrder.side as 'BUY' | 'SELL',
          orderType: 'LIMIT',
          product: (input.product as any) || 'INTRADAY',
          lots,
          qty,
          lotSize: inst.lotSize,
          price: limitResult.newOrder.price,
          status: 'PENDING',
          time: new Date().toTimeString().split(' ')[0],
          date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          userId,
          tenantId,
        });
      } catch {
        // Ignore fallback errors
      }

      tradingWebSocketServer.broadcastToTenant(tenantId, 'order.created', limitResult.newOrder, (ws) => ws.userId === userId || ws.role === 'SUPER_ADMIN');
      tradingWebSocketServer.broadcastToTenant(tenantId, 'wallet.updated', limitResult.updatedWallet, (ws) => ws.userId === userId || ws.role === 'SUPER_ADMIN');

      return {
        success: true,
        order: limitResult.newOrder,
        wallet: limitResult.updatedWallet,
        message: `Limit order for ${lots} lot(s) of ${inst.symbol} placed in PENDING status.`,
      };
    }

    // Database ACID Transaction for Market / Fillable Orders
    const result = await pgDb.transaction(async (client: DbClient) => {
      // 1. Lock wallet row FOR UPDATE
      const wallet = await postgresWalletRepository.lockWalletForUpdate(tenantId, userId, client);

      // 2. Lock and fetch existing position FOR UPDATE
      const existingPos = await postgresPositionRepository.lockPositionForUpdate(
        tenantId,
        userId,
        inst.symbol,
        client
      );

      const posQuantity = existingPos ? existingPos.quantity : 0;
      const isOpposite = existingPos && ((posQuantity > 0 && side === 'SELL') || (posQuantity < 0 && side === 'BUY'));

      let updatedWallet: TradingWallet;
      let updatedPosition: TradingPosition;
      let realizedPnL = 0;

      if (isOpposite && existingPos) {
        // Reducing, closing, or flipping an existing position
        const currentLots = Math.abs(posQuantity) / inst.lotSize;
        const closedLots = Math.min(currentLots, lots);
        const closedQty = closedLots * inst.lotSize;
        const marginReleased = (existingPos.margin_used / currentLots) * closedLots;
        realizedPnL = posQuantity > 0
          ? (execPrice - existingPos.average_price) * closedQty
          : (existingPos.average_price - execPrice) * closedQty;

        const excessLots = Math.max(0, lots - closedLots);
        const excessMargin = excessLots * (requiredMargin / lots);

        if (wallet.available_balance + marginReleased + realizedPnL < excessMargin) {
          const err = new Error(`Insufficient margin for reversed position.`);
          (err as any).statusCode = 400;
          (err as any).code = 'INSUFFICIENT_MARGIN';
          throw err;
        }

        const newAvailable = Number((wallet.available_balance + marginReleased + realizedPnL - excessMargin).toFixed(2));
        const newUsedMargin = Number(Math.max(0, wallet.used_margin - marginReleased + excessMargin).toFixed(2));
        const newRealized = Number((wallet.realized_pnl + realizedPnL).toFixed(2));

        updatedWallet = await postgresWalletRepository.updateWallet(
          tenantId,
          userId,
          {
            available_balance: newAvailable,
            used_margin: newUsedMargin,
            realized_pnl: newRealized,
          },
          client
        );

        if (currentLots <= lots) {
          if (excessLots === 0) {
            await postgresPositionRepository.deletePosition(tenantId, existingPos.id, client);
            updatedPosition = {
              ...existingPos,
              quantity: 0,
              margin_used: 0,
              realized_pnl: Number((existingPos.realized_pnl + realizedPnL).toFixed(2)),
            };
          } else {
            const flippedQty = side === 'BUY' ? excessLots * inst.lotSize : -(excessLots * inst.lotSize);
            updatedPosition = await postgresPositionRepository.upsertPosition(
              {
                id: existingPos.id,
                tenant_id: tenantId,
                user_id: userId,
                instrument_id: inst.symbol,
                quantity: flippedQty,
                average_price: execPrice,
                realized_pnl: Number((existingPos.realized_pnl + realizedPnL).toFixed(2)),
                unrealized_pnl: 0,
                margin_used: excessMargin,
              },
              client
            );
          }
        } else {
          const remainingLots = currentLots - closedLots;
          const remainingQty = (posQuantity > 0 ? 1 : -1) * (remainingLots * inst.lotSize);
          const remainingMargin = Math.max(0, existingPos.margin_used - marginReleased);

          updatedPosition = await postgresPositionRepository.upsertPosition(
            {
              id: existingPos.id,
              tenant_id: tenantId,
              user_id: userId,
              instrument_id: inst.symbol,
              quantity: remainingQty,
              average_price: existingPos.average_price,
              realized_pnl: Number((existingPos.realized_pnl + realizedPnL).toFixed(2)),
              unrealized_pnl: 0,
              margin_used: remainingMargin,
            },
            client
          );
        }
      } else {
        // Opening or adding to position
        if (wallet.available_balance < requiredMargin) {
          internalEventDispatcher.dispatchMarginBreach({
            tenantId,
            userId,
            usedMargin: wallet.used_margin,
            availableMargin: wallet.available_balance,
            exposure: wallet.used_margin + requiredMargin,
            threshold: 1.0,
          }).catch((e) => console.error('[Event] Margin breach dispatch error:', e));

          const err = new Error(
            `Insufficient margin. Required ₹${requiredMargin.toLocaleString('en-IN')}, available ₹${wallet.available_balance.toLocaleString('en-IN')}.`
          );
          (err as any).statusCode = 400;
          (err as any).code = 'INSUFFICIENT_MARGIN';
          throw err;
        }

        const newAvailable = Math.max(0, wallet.available_balance - requiredMargin);
        const newUsedMargin = wallet.used_margin + requiredMargin;
        updatedWallet = await postgresWalletRepository.updateWallet(
          tenantId,
          userId,
          {
            available_balance: newAvailable,
            used_margin: newUsedMargin,
          },
          client
        );

        if (existingPos) {
          const totalQty = posQuantity + (side === 'BUY' ? qty : -qty);
          const totalCost = Math.abs(posQuantity) * existingPos.average_price + qty * execPrice;
          const newAvgPrice = Number((totalCost / Math.abs(totalQty)).toFixed(2));
          const newMargin = existingPos.margin_used + requiredMargin;

          updatedPosition = await postgresPositionRepository.upsertPosition(
            {
              id: existingPos.id,
              tenant_id: tenantId,
              user_id: userId,
              instrument_id: inst.symbol,
              quantity: totalQty,
              average_price: newAvgPrice,
              realized_pnl: existingPos.realized_pnl,
              unrealized_pnl: 0,
              margin_used: newMargin,
            },
            client
          );
        } else {
          const posId = `POS-${Math.floor(1000 + Math.random() * 9000)}`;
          const signedQty = side === 'BUY' ? qty : -qty;

          updatedPosition = await postgresPositionRepository.upsertPosition(
            {
              id: posId,
              tenant_id: tenantId,
              user_id: userId,
              instrument_id: inst.symbol,
              quantity: signedQty,
              average_price: execPrice,
              realized_pnl: 0,
              unrealized_pnl: 0,
              margin_used: requiredMargin,
            },
            client
          );
        }
      }

      // 3. Create order record
      const newOrder = await postgresOrderRepository.create(
        {
          id: orderId,
          tenant_id: tenantId,
          user_id: userId,
          client_order_id: clientOrderId ? clientOrderId.trim() : null,
          instrument_id: inst.symbol,
          side,
          order_type: input.orderType || 'MARKET',
          quantity: qty,
          price: execPrice,
          trigger_price: null,
          status: 'EXECUTED',
          broker_order_id: gatewayResult.brokerOrderId,
          normalized_status: gatewayResult.status,
          filled_quantity: qty,
          remaining_quantity: 0,
          average_fill_price: execPrice,
          time_in_force: input.timeInForce || 'DAY',
        },
        client
      );

      // 4. Create trade execution record
      const tradeId = `TRD-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const executionValue = qty * execPrice;
      const newTrade = await postgresTradeRepository.create(
        {
          id: tradeId,
          tenant_id: tenantId,
          order_id: newOrder.id,
          user_id: userId,
          instrument_id: inst.symbol,
          side,
          quantity: qty,
          execution_price: execPrice,
          execution_value: executionValue,
          realized_pnl: realizedPnL,
          executed_at: new Date().toISOString(),
        },
        client
      );

      // 6. Record order event
      await postgresOrderEventRepository.recordEvent(
        {
          id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          tenant_id: tenantId,
          order_id: newOrder.id,
          event_type: 'ORDER_FILLED',
          event_payload: {
            orderId: newOrder.id,
            tradeId: newTrade.id,
            symbol: inst.symbol,
            side,
            quantity: qty,
            price: execPrice,
            requiredMargin,
            remainingAvailable: updatedWallet.available_balance,
          },
        },
        client
      );

      // 7. Record margin snapshot
      await postgresMarginRepository.recordSnapshot(
        {
          id: `ms-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          tenant_id: tenantId,
          user_id: userId,
          equity: updatedWallet.available_balance + updatedWallet.used_margin,
          available_margin: updatedWallet.available_balance,
          used_margin: updatedWallet.used_margin,
          margin_level: updatedWallet.used_margin > 0 ? (updatedWallet.available_balance / updatedWallet.used_margin) * 100 : 999,
          unrealized_pnl: 0,
        },
        client
      );

      // 8. Transactional Outbox: Persist outbound event atomically in the same ACID transaction
      await transactionalOutboxService.enqueue(
        {
          eventId: `evt-trade-${newTrade.id}`,
          tenantId,
          eventType: 'trade.executed',
          payload: {
            orderId: newOrder.id,
            tradeId: newTrade.id,
            userId,
            symbol: inst.symbol,
            side: newOrder.side,
            quantity: newOrder.quantity,
            executionPrice: newOrder.price,
            executedAt: newTrade.executed_at,
          },
        },
        client
      );

      return {
        newOrder,
        newTrade,
        updatedPosition,
        updatedWallet,
      };
    });

    // Transaction committed successfully! Now perform post-commit asynchronous side-effects.

    // Synchronize in-memory fallback store for legacy simulation compatibility
    try {
      const memWallet = getTenantWallet(tenantId);
      memWallet.availableBalance = result.updatedWallet.available_balance;
      memWallet.usedMargin = result.updatedWallet.used_margin;
      memWallet.totalPnL = result.updatedWallet.realized_pnl;

      const memOrders = getTenantOrders(tenantId);
      memOrders.unshift({
        id: result.newOrder.id,
        symbol: result.newOrder.instrument_id,
        type: result.newOrder.side as 'BUY' | 'SELL',
        orderType: result.newOrder.order_type as any,
        product: (input.product as any) || 'INTRADAY',
        lots,
        qty,
        lotSize: inst.lotSize,
        price: result.newOrder.price,
        status: 'EXECUTED',
        time: new Date().toTimeString().split(' ')[0],
        date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        userId,
        tenantId,
      });

      // Synchronize in-memory positions list
      const memPositions = getTenantPositions(tenantId);
      const existingPosIdx = memPositions.findIndex((p) => p.symbol === inst.symbol);

      if (result.updatedPosition) {
        if (result.updatedPosition.quantity === 0) {
          // Position squared off
          if (existingPosIdx !== -1) {
            memPositions.splice(existingPosIdx, 1);
          }
        } else {
          const posType: 'BUY' | 'SELL' = result.updatedPosition.quantity >= 0 ? 'BUY' : 'SELL';
          const posQty = Math.abs(result.updatedPosition.quantity);
          const lotSize = inst.lotSize || 1;
          const posLots = Math.max(1, Math.round(posQty / lotSize));
          const avgPrice = Number(result.updatedPosition.average_price);
          const ltp = inst.lastPrice;
          const pnl = posType === 'BUY'
            ? (ltp - avgPrice) * posQty
            : (avgPrice - ltp) * posQty;
          const pnlPercent = (avgPrice * posQty) > 0
            ? Number(((pnl / (avgPrice * posQty)) * 100).toFixed(2))
            : 0;

          const updatedPosItem = {
            id: result.updatedPosition.id || `POS-${Date.now()}`,
            symbol: inst.symbol,
            category: inst.category,
            type: posType,
            product: (input.product as any) || 'INTRADAY',
            qty: posQty,
            lots: posLots,
            lotSize,
            avgPrice,
            ltp,
            pnl: Number(pnl.toFixed(2)),
            pnlPercent,
            timestamp: new Date().toISOString(),
            userId,
            tenantId,
          };

          if (existingPosIdx !== -1) {
            memPositions[existingPosIdx] = updatedPosItem;
          } else {
            memPositions.unshift(updatedPosItem);
          }
        }
      }
    } catch {
      // Ignore memory sync issues
    }

    // Broadcast Real-time WebSocket events strictly within tenant scope and user-isolation via Redis Pub/Sub
    try {
      const userFilter = (ws: any) => ws.userId === userId || ws.role === 'SUPER_ADMIN';
      const target = { targetUserId: userId };
      tradingWebSocketServer.broadcastToTenant(tenantId, 'order.created', result.newOrder, userFilter, false, target);
      tradingWebSocketServer.broadcastToTenant(tenantId, 'trade.executed', result.newTrade, userFilter, false, target);
      tradingWebSocketServer.broadcastToTenant(tenantId, 'position.updated', result.updatedPosition, userFilter, false, target);
      tradingWebSocketServer.broadcastToTenant(tenantId, 'wallet.updated', result.updatedWallet, userFilter, false, target);
    } catch (wsErr) {
      console.error('[WebSocket] Broadcast error:', wsErr);
    }

    // Dispatch Phase 5D trade.executed event to Central Admin asynchronously (non-blocking)
    internalEventDispatcher.dispatchTradeExecuted({
      tenantId,
      orderId: result.newOrder.id,
      userId,
      symbol: result.newOrder.instrument_id,
      side: result.newOrder.side as 'BUY' | 'SELL',
      quantity: result.newOrder.quantity,
      executionPrice: result.newOrder.price,
    }).catch((e) => console.error('[Event] trade.executed dispatch error:', e));

    return {
      success: true,
      order: result.newOrder,
      trade: result.newTrade,
      position: result.updatedPosition,
      wallet: result.updatedWallet,
      message: `${side} order for ${lots} lot(s) of ${inst.symbol} executed successfully!`,
    };
  }

  /**
   * Closes a position inside a PostgreSQL ACID transaction.
   */
  public async closePosition(
    tenantId: string,
    userId: string,
    positionId: string
  ): Promise<{ success: boolean; position: TradingPosition; wallet: TradingWallet; message: string }> {
    const result = await pgDb.transaction(async (client: DbClient) => {
      // Lock wallet
      const wallet = await postgresWalletRepository.lockWalletForUpdate(tenantId, userId, client);

      // Find position
      const positions = await postgresPositionRepository.getPositions(tenantId, userId, client);
      const pos = positions.find((p) => p.id === positionId || p.instrument_id === positionId);

      if (!pos) {
        const err = new Error(`Position '${positionId}' not found.`);
        (err as any).statusCode = 404;
        throw err;
      }

      const inst = findInstrument(pos.instrument_id);
      const releasedMargin = pos.margin_used || (inst?.intraday || 30000);
      const realizedPnL = pos.realized_pnl || 0;

      // Credit wallet
      const newAvailable = wallet.available_balance + releasedMargin + realizedPnL;
      const newUsed = Math.max(0, wallet.used_margin - releasedMargin);
      const newRealized = wallet.realized_pnl + realizedPnL;

      const updatedWallet = await postgresWalletRepository.updateWallet(
        tenantId,
        userId,
        {
          available_balance: newAvailable,
          used_margin: newUsed,
          realized_pnl: newRealized,
        },
        client
      );

      // Delete position
      await postgresPositionRepository.deletePosition(tenantId, pos.id, client);

      return {
        pos,
        updatedWallet,
      };
    });

    // Broadcast WebSocket events
    const target = { targetUserId: userId };
    tradingWebSocketServer.broadcastToTenant(tenantId, 'position.updated', { ...result.pos, quantity: 0 }, (ws) => ws.userId === userId || ws.role === 'SUPER_ADMIN', false, target);
    tradingWebSocketServer.broadcastToTenant(tenantId, 'wallet.updated', result.updatedWallet, (ws) => ws.userId === userId || ws.role === 'SUPER_ADMIN', false, target);

    return {
      success: true,
      position: { ...result.pos, quantity: 0 },
      wallet: result.updatedWallet,
      message: `Position for ${result.pos.instrument_id} squared off successfully.`,
    };
  }

  /**
   * Cancel an open/pending order inside a transaction
   */
  public async cancelOrder(
    tenantId: string,
    userId: string,
    orderId: string
  ): Promise<{ success: boolean; order: TradingOrder; message: string }> {
    const result = await pgDb.transaction(async (client: DbClient) => {
      const order = await postgresOrderRepository.findById(tenantId, orderId, client);
      if (!order) {
        const err = new Error(`Order '${orderId}' not found.`);
        (err as any).statusCode = 404;
        throw err;
      }

      if (order.user_id !== userId) {
        const err = new Error('You cannot cancel another user\'s order.');
        (err as any).statusCode = 403;
        throw err;
      }

      if (order.status !== 'PENDING') {
        const err = new Error(`Cannot cancel order with status '${order.status}'. Only PENDING orders may be cancelled.`);
        (err as any).statusCode = 400;
        throw err;
      }

      // Delegate cancellation to Execution Gateway
      await executionGateway.cancelOrder({
        tenantId,
        userId,
        orderId,
        brokerOrderId: order.broker_order_id || undefined,
        symbol: order.instrument_id,
      });

      const updated = await postgresOrderRepository.update(
        tenantId,
        orderId,
        {
          status: 'CANCELLED',
          normalized_status: 'CANCELLED',
          cancelled_at: new Date().toISOString(),
        },
        client
      );

      // Release blocked margin for the cancelled pending order
      const inst = findInstrument(order.instrument_id);
      const marginToRelease = (inst?.intraday || 30000) * Math.ceil(order.quantity / (inst?.lotSize || 1));
      const wallet = await postgresWalletRepository.lockWalletForUpdate(tenantId, userId, client);
      let updatedWallet: TradingWallet | null = null;
      if (wallet && wallet.blocked_balance > 0) {
        const releasedAmount = Math.min(wallet.blocked_balance, marginToRelease);
        const newBlocked = Math.max(0, wallet.blocked_balance - releasedAmount);
        const newAvail = wallet.available_balance + releasedAmount;
        updatedWallet = await postgresWalletRepository.updateWallet(
          tenantId,
          userId,
          {
            blocked_balance: newBlocked,
            available_balance: newAvail,
          },
          client
        );
      }

      await postgresOrderEventRepository.recordEvent(
        {
          id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          tenant_id: tenantId,
          order_id: orderId,
          event_type: 'ORDER_CANCELLED',
          event_payload: { orderId, userId, reason: 'Client requested cancellation' },
        },
        client
      );

      return { order: updated!, updatedWallet };
    });

    tradingWebSocketServer.broadcastToTenant(tenantId, 'order.cancelled', result.order, (ws) => ws.userId === userId || ws.role === 'SUPER_ADMIN');
    if (result.updatedWallet) {
      tradingWebSocketServer.broadcastToTenant(tenantId, 'wallet.updated', result.updatedWallet, (ws) => ws.userId === userId || ws.role === 'SUPER_ADMIN');
    }

    return {
      success: true,
      order: result.order,
      message: `Order '${orderId}' cancelled successfully.`,
    };
  }

  /**
   * Modify an open/pending order through Execution Gateway
   */
  public async modifyOrder(
    tenantId: string,
    userId: string,
    orderId: string,
    updates: { price?: number; quantity?: number }
  ): Promise<{ success: boolean; order: TradingOrder; message: string }> {
    const result = await pgDb.transaction(async (client: DbClient) => {
      const order = await postgresOrderRepository.findById(tenantId, orderId, client);
      if (!order) {
        const err = new Error(`Order '${orderId}' not found.`);
        (err as any).statusCode = 404;
        throw err;
      }

      if (order.user_id !== userId) {
        const err = new Error("You cannot modify another user's order.");
        (err as any).statusCode = 403;
        throw err;
      }

      if (order.status !== 'PENDING') {
        const err = new Error(`Cannot modify order with status '${order.status}'. Only PENDING orders may be modified.`);
        (err as any).statusCode = 400;
        throw err;
      }

      // Delegate modification to Execution Gateway
      const gatewayResult = await executionGateway.modifyOrder({
        tenantId,
        userId,
        orderId,
        brokerOrderId: order.broker_order_id || undefined,
        price: updates.price,
        quantity: updates.quantity,
      });

      const updated = await postgresOrderRepository.update(
        tenantId,
        orderId,
        {
          price: updates.price !== undefined ? updates.price : order.price,
          quantity: updates.quantity !== undefined ? updates.quantity : order.quantity,
          normalized_status: gatewayResult.status,
        },
        client
      );

      await postgresOrderEventRepository.recordEvent(
        {
          id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          tenant_id: tenantId,
          order_id: orderId,
          event_type: 'ORDER_MODIFIED',
          event_payload: { orderId, userId, updates, gatewayResult },
        },
        client
      );

      return updated!;
    });

    tradingWebSocketServer.broadcastToTenant(tenantId, 'order.modified', result, (ws) => ws.userId === userId || ws.role === 'SUPER_ADMIN');

    return {
      success: true,
      order: result,
      message: `Order '${orderId}' modified successfully.`,
    };
  }

  /**
   * Fetch current order status from Execution Gateway and sync with database
   */
  public async getOrderStatus(
    tenantId: string,
    userId: string,
    orderId: string
  ): Promise<{ success: boolean; order: TradingOrder; brokerStatus: GatewayOrderResult }> {
    const order = await postgresOrderRepository.findById(tenantId, orderId);
    if (!order) {
      const err = new Error(`Order '${orderId}' not found.`);
      (err as any).statusCode = 404;
      throw err;
    }

    if (order.user_id !== userId) {
      const err = new Error("You cannot inspect another user's order.");
      (err as any).statusCode = 403;
      throw err;
    }

    const brokerStatus = await executionGateway.getOrderStatus({
      tenantId,
      userId,
      orderId,
      brokerOrderId: order.broker_order_id || undefined,
    });

    return {
      success: true,
      order,
      brokerStatus,
    };
  }
}

export const tradingExecutionService = new TradingExecutionService();
