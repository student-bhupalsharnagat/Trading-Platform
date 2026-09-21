/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5G
 * Mock Broker Adapter for Deterministic Testing & Simulation
 */

import { IBrokerAdapter } from './IBrokerAdapter.ts';
import {
  GatewayPlaceOrderRequest,
  GatewayCancelOrderRequest,
  GatewayModifyOrderRequest,
  GatewayOrderStatusRequest,
  GatewayOrderResult,
  NormalizedOrderState,
  ProviderContext,
} from '../types.ts';
import { BrokerRejectedError, BrokerTimeoutError, BrokerError } from '../errors/BrokerErrors.ts';

interface MockStoredOrder {
  orderId: string;
  brokerOrderId: string;
  clientOrderId?: string;
  tenantId: string;
  userId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: string;
  quantity: number;
  price: number;
  filledQuantity: number;
  remainingQuantity: number;
  averagePrice: number;
  rawStatus: string;
  normalizedStatus: NormalizedOrderState;
  createdAt: number;
  updatedAt: number;
}

export class MockBrokerAdapter implements IBrokerAdapter {
  public readonly providerId = 'mock-broker';
  public readonly name = 'Mock Broker Simulation Adapter';

  private storedOrders = new Map<string, MockStoredOrder>(); // keyed by brokerOrderId
  private clientOrderIndex = new Map<string, string>(); // `${tenantId}:${clientOrderId}` -> brokerOrderId

  // Simulation test hooks
  private simulatedDelayMs = 0;
  private forcedError: Error | null = null;
  private forceTimeout = false;
  private partialFillFraction = 0; // 0 = full, 0.5 = 50% partial fill

  public setSimulatedDelay(ms: number): void {
    this.simulatedDelayMs = ms;
  }

  public setSimulatedError(err: Error | null): void {
    this.forcedError = err;
  }

  public setSimulatedTimeout(enabled: boolean): void {
    this.forceTimeout = enabled;
  }

  public setPartialFillFraction(fraction: number): void {
    this.partialFillFraction = fraction;
  }

  public clearMockData(): void {
    this.storedOrders.clear();
    this.clientOrderIndex.clear();
    this.simulatedDelayMs = 0;
    this.forcedError = null;
    this.forceTimeout = false;
    this.partialFillFraction = 0;
  }

  public mapProviderStatus(rawStatus: string): NormalizedOrderState {
    const s = (rawStatus || '').toUpperCase();
    switch (s) {
      case 'NEW':
      case 'SUBMITTED':
      case 'PENDING_ACK':
        return 'NEW';
      case 'OPEN':
      case 'ACCEPTED':
      case 'WORKING':
      case 'PENDING':
        return 'OPEN';
      case 'PARTIAL':
      case 'PARTIALLY_FILLED':
      case 'PART_FILLED':
        return 'PARTIALLY_FILLED';
      case 'FILLED':
      case 'EXECUTED':
      case 'COMPLETE':
      case 'DONE':
        return 'FILLED';
      case 'CANCELLED':
      case 'CANCELED':
      case 'EXPIRED':
        return 'CANCELLED';
      case 'REJECTED':
      case 'DECLINED':
      case 'FAILED':
        return 'REJECTED';
      default:
        return 'OPEN';
    }
  }

  public async placeOrder(req: GatewayPlaceOrderRequest, context: ProviderContext): Promise<GatewayOrderResult> {
    const startTime = Date.now();
    const correlationId = req.correlationId || `corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    if (this.forceTimeout) {
      if (this.simulatedDelayMs > 0) {
        await new Promise((r) => setTimeout(r, this.simulatedDelayMs));
      }
      throw new BrokerTimeoutError('Mock broker order placement timed out.', correlationId);
    }

    if (this.forcedError) {
      throw this.forcedError;
    }

    if (this.simulatedDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.simulatedDelayMs));
    }

    // Check client order ID idempotency at the mock broker level
    if (req.clientOrderId) {
      const idxKey = `${req.tenantId}:${req.clientOrderId}`;
      const existingBrokerId = this.clientOrderIndex.get(idxKey);
      if (existingBrokerId) {
        const existing = this.storedOrders.get(existingBrokerId);
        if (existing) {
          return {
            success: true,
            orderId: req.orderId,
            brokerOrderId: existing.brokerOrderId,
            status: existing.normalizedStatus,
            filledQuantity: existing.filledQuantity,
            remainingQuantity: existing.remainingQuantity,
            averagePrice: existing.averagePrice,
            lastExecutionPrice: existing.averagePrice,
            lastExecutionQuantity: existing.filledQuantity,
            rawStatus: existing.rawStatus,
            providerId: this.providerId,
            correlationId,
            latencyMs: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          };
        }
      }
    }

    // Validate parameters
    if (!req.quantity || req.quantity <= 0) {
      throw new BrokerRejectedError('Order quantity must be positive.', correlationId);
    }

    const brokerOrderId = `MOCK-BKR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const execPrice = req.price && req.price > 0 ? req.price : 100.0;
    const isMarket = (req.orderType || 'MARKET').toUpperCase() === 'MARKET';

    let filledQty = 0;
    let remainingQty = req.quantity;
    let rawStatus = 'ACCEPTED';
    let normalizedStatus: NormalizedOrderState = 'OPEN';

    if (isMarket) {
      if (this.partialFillFraction > 0 && this.partialFillFraction < 1) {
        filledQty = Math.floor(req.quantity * this.partialFillFraction);
        remainingQty = req.quantity - filledQty;
        rawStatus = 'PARTIALLY_FILLED';
        normalizedStatus = 'PARTIALLY_FILLED';
      } else {
        filledQty = req.quantity;
        remainingQty = 0;
        rawStatus = 'EXECUTED';
        normalizedStatus = 'FILLED';
      }
    } else {
      // Limit order: initially placed in OPEN status
      rawStatus = 'WORKING';
      normalizedStatus = 'OPEN';
    }

    const stored: MockStoredOrder = {
      orderId: req.orderId,
      brokerOrderId,
      clientOrderId: req.clientOrderId,
      tenantId: req.tenantId,
      userId: req.userId,
      symbol: req.symbol,
      side: req.side,
      orderType: req.orderType,
      quantity: req.quantity,
      price: execPrice,
      filledQuantity: filledQty,
      remainingQuantity: remainingQty,
      averagePrice: execPrice,
      rawStatus,
      normalizedStatus,
      createdAt: startTime,
      updatedAt: Date.now(),
    };

    this.storedOrders.set(brokerOrderId, stored);
    if (req.clientOrderId) {
      this.clientOrderIndex.set(`${req.tenantId}:${req.clientOrderId}`, brokerOrderId);
    }

    return {
      success: true,
      orderId: req.orderId,
      brokerOrderId,
      status: normalizedStatus,
      filledQuantity: filledQty,
      remainingQuantity: remainingQty,
      averagePrice: execPrice,
      lastExecutionPrice: filledQty > 0 ? execPrice : undefined,
      lastExecutionQuantity: filledQty > 0 ? filledQty : undefined,
      rawStatus,
      providerId: this.providerId,
      correlationId,
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  public async cancelOrder(req: GatewayCancelOrderRequest, context: ProviderContext): Promise<GatewayOrderResult> {
    const startTime = Date.now();
    const correlationId = req.correlationId || `corr-${Date.now()}`;

    if (this.forceTimeout) {
      throw new BrokerTimeoutError('Mock broker cancel order timed out.', correlationId);
    }
    if (this.forcedError) {
      throw this.forcedError;
    }

    // Find order by brokerOrderId or orderId
    let target = req.brokerOrderId ? this.storedOrders.get(req.brokerOrderId) : undefined;
    if (!target && req.orderId) {
      for (const o of this.storedOrders.values()) {
        if (o.orderId === req.orderId && o.tenantId === req.tenantId) {
          target = o;
          break;
        }
      }
    }

    if (!target) {
      throw new BrokerError(`Order '${req.orderId || req.brokerOrderId}' not found at mock broker.`, 'ORDER_NOT_FOUND', 404, false, correlationId);
    }

    if (target.normalizedStatus === 'FILLED') {
      throw new BrokerRejectedError('Cannot cancel an already filled order.', correlationId);
    }

    target.rawStatus = 'CANCELLED';
    target.normalizedStatus = 'CANCELLED';
    target.updatedAt = Date.now();

    return {
      success: true,
      orderId: target.orderId,
      brokerOrderId: target.brokerOrderId,
      status: 'CANCELLED',
      filledQuantity: target.filledQuantity,
      remainingQuantity: target.remainingQuantity,
      averagePrice: target.averagePrice,
      rawStatus: 'CANCELLED',
      providerId: this.providerId,
      correlationId,
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  public async modifyOrder(req: GatewayModifyOrderRequest, context: ProviderContext): Promise<GatewayOrderResult> {
    const startTime = Date.now();
    const correlationId = req.correlationId || `corr-${Date.now()}`;

    if (this.forceTimeout) {
      throw new BrokerTimeoutError('Mock broker modify order timed out.', correlationId);
    }
    if (this.forcedError) {
      throw this.forcedError;
    }

    let target = req.brokerOrderId ? this.storedOrders.get(req.brokerOrderId) : undefined;
    if (!target && req.orderId) {
      for (const o of this.storedOrders.values()) {
        if (o.orderId === req.orderId && o.tenantId === req.tenantId) {
          target = o;
          break;
        }
      }
    }

    if (!target) {
      throw new BrokerError(`Order '${req.orderId || req.brokerOrderId}' not found at mock broker.`, 'ORDER_NOT_FOUND', 404, false, correlationId);
    }

    if (target.normalizedStatus === 'FILLED' || target.normalizedStatus === 'CANCELLED') {
      throw new BrokerRejectedError(`Cannot modify order with status ${target.normalizedStatus}.`, correlationId);
    }

    if (req.price !== undefined && req.price > 0) {
      target.price = req.price;
      target.averagePrice = req.price;
    }
    if (req.quantity !== undefined && req.quantity > 0) {
      target.quantity = req.quantity;
      target.remainingQuantity = Math.max(0, req.quantity - target.filledQuantity);
    }
    target.updatedAt = Date.now();

    return {
      success: true,
      orderId: target.orderId,
      brokerOrderId: target.brokerOrderId,
      status: target.normalizedStatus,
      filledQuantity: target.filledQuantity,
      remainingQuantity: target.remainingQuantity,
      averagePrice: target.averagePrice,
      rawStatus: target.rawStatus,
      providerId: this.providerId,
      correlationId,
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  public async getOrderStatus(req: GatewayOrderStatusRequest, context: ProviderContext): Promise<GatewayOrderResult> {
    const startTime = Date.now();
    const correlationId = req.correlationId || `corr-${Date.now()}`;

    if (this.forceTimeout) {
      throw new BrokerTimeoutError('Mock broker getOrderStatus timed out.', correlationId);
    }
    if (this.forcedError) {
      throw this.forcedError;
    }

    let target = req.brokerOrderId ? this.storedOrders.get(req.brokerOrderId) : undefined;
    if (!target && req.orderId) {
      for (const o of this.storedOrders.values()) {
        if (o.orderId === req.orderId && o.tenantId === req.tenantId) {
          target = o;
          break;
        }
      }
    }

    if (!target) {
      throw new BrokerError(`Order '${req.orderId || req.brokerOrderId}' not found at mock broker.`, 'ORDER_NOT_FOUND', 404, false, correlationId);
    }

    return {
      success: true,
      orderId: target.orderId,
      brokerOrderId: target.brokerOrderId,
      status: target.normalizedStatus,
      filledQuantity: target.filledQuantity,
      remainingQuantity: target.remainingQuantity,
      averagePrice: target.averagePrice,
      rawStatus: target.rawStatus,
      providerId: this.providerId,
      correlationId,
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  public async authenticate(context: ProviderContext): Promise<{ authenticated: boolean; details?: any }> {
    if (this.forceTimeout) {
      throw new BrokerTimeoutError('Mock broker authenticate timed out.');
    }
    if (this.forcedError) {
      throw this.forcedError;
    }
    return {
      authenticated: true,
      details: {
        providerId: this.providerId,
        tenantId: context.tenantId,
        environment: context.environment,
        mode: 'SIMULATION',
        status: 'CONNECTED',
      },
    };
  }

  public async getOpenOrders(context: ProviderContext): Promise<GatewayOrderResult[]> {
    if (this.forceTimeout) {
      throw new BrokerTimeoutError('Mock broker getOpenOrders timed out.');
    }
    if (this.forcedError) {
      throw this.forcedError;
    }

    const openResults: GatewayOrderResult[] = [];
    for (const order of this.storedOrders.values()) {
      if (
        order.tenantId === context.tenantId &&
        (order.normalizedStatus === 'OPEN' || order.normalizedStatus === 'NEW' || order.normalizedStatus === 'PARTIALLY_FILLED')
      ) {
        openResults.push({
          success: true,
          orderId: order.orderId,
          brokerOrderId: order.brokerOrderId,
          status: order.normalizedStatus,
          filledQuantity: order.filledQuantity,
          remainingQuantity: order.remainingQuantity,
          averagePrice: order.averagePrice,
          rawStatus: order.rawStatus,
          providerId: this.providerId,
          correlationId: `corr-${Date.now()}`,
          latencyMs: 5,
          timestamp: new Date(order.updatedAt).toISOString(),
        });
      }
    }

    return openResults;
  }

  public async getPositions(context: ProviderContext): Promise<Array<{
    symbol: string;
    quantity: number;
    averagePrice: number;
    currentPrice?: number;
    unrealizedPnl?: number;
  }>> {
    if (this.forceTimeout) {
      throw new BrokerTimeoutError('Mock broker getPositions timed out.');
    }
    if (this.forcedError) {
      throw this.forcedError;
    }

    // Return positions aggregated from filled orders
    const posMap = new Map<string, { qty: number; totalCost: number }>();
    for (const order of this.storedOrders.values()) {
      if (order.tenantId === context.tenantId && order.filledQuantity > 0) {
        const sign = order.side === 'BUY' ? 1 : -1;
        const current = posMap.get(order.symbol) || { qty: 0, totalCost: 0 };
        current.qty += order.filledQuantity * sign;
        current.totalCost += order.filledQuantity * order.averagePrice;
        posMap.set(order.symbol, current);
      }
    }

    const result: Array<{ symbol: string; quantity: number; averagePrice: number }> = [];
    for (const [symbol, data] of posMap.entries()) {
      if (data.qty !== 0) {
        result.push({
          symbol,
          quantity: data.qty,
          averagePrice: data.qty !== 0 ? Math.abs(data.totalCost / data.qty) : 0,
        });
      }
    }

    return result;
  }
}

export const mockBrokerAdapter = new MockBrokerAdapter();
