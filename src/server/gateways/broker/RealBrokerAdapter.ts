/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5H
 * Real Broker Sandbox Adapter (Alpaca Paper / Sandbox Protocol)
 * 
 * Strict Security Guarantees:
 * 1. SANDBOX ONLY: Real-money production trading is strictly blocked and rejected at runtime.
 * 2. Secrets reside exclusively in server-side environment variables / secure store.
 * 3. Never exposed to database logs, audit payloads, or client frontends.
 * 4. Preserves broker_order_id, provider status, and correlation IDs throughout.
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
import {
  BrokerError,
  BrokerTimeoutError,
  BrokerRejectedError,
  BrokerRateLimitError,
  BrokerAuthError,
  BrokerSecurityError,
  BrokerNetworkError,
} from '../errors/BrokerErrors.ts';

export interface SandboxAccountDetails {
  id: string;
  accountNumber: string;
  status: string;
  currency: string;
  cash: number;
  portfolioValue: number;
  buyingPower: number;
  isSandbox: boolean;
}

export class RealBrokerAdapter implements IBrokerAdapter {
  public readonly providerId = 'real-sandbox';
  public readonly name = 'Real Broker Sandbox Adapter (Alpaca Paper Protocol)';

  // Default paper-trading sandbox URL
  private readonly defaultBaseUrl = 'https://paper-api.alpaca.markets';

  // Custom HTTP dispatcher hook for deterministic in-process testing / simulation
  private mockHttpDispatcher: ((url: string, init: RequestInit) => Promise<Response>) | null = null;

  public setMockHttpDispatcher(dispatcher: ((url: string, init: RequestInit) => Promise<Response>) | null): void {
    this.mockHttpDispatcher = dispatcher;
  }

  /**
   * Strictly validate that the environment and endpoint are sandboxed.
   * Hard-fails if any production environment or live endpoint is detected.
   */
  private validateSandboxSafety(context: ProviderContext, targetUrl: string): void {
    if (context.environment === 'PRODUCTION') {
      throw new BrokerSecurityError(
        'Real-money production trading is strictly prohibited! Only SANDBOX and SIMULATION environments are permitted.'
      );
    }

    const lower = targetUrl.toLowerCase();
    const isAllowed =
      lower.includes('paper-api.alpaca.markets') ||
      lower.includes('sandbox') ||
      lower.includes('paper') ||
      lower.includes('localhost') ||
      lower.includes('127.0.0.1') ||
      lower.includes('mock');

    if (!isAllowed || lower.includes('api.alpaca.markets') && !lower.includes('paper-api')) {
      throw new BrokerSecurityError(
        `Production endpoint '${targetUrl}' rejected. Base URL must point to a verified paper-trading / sandbox environment.`
      );
    }
  }

  private resolveCredentials(context: ProviderContext): { apiKey: string; apiSecret: string } {
    const apiKey =
      context.credentials?.keyIdentifier ||
      process.env.BROKER_SANDBOX_API_KEY ||
      '';
    const apiSecret =
      context.credentials?.secret ||
      process.env.BROKER_SANDBOX_API_SECRET ||
      '';

    return { apiKey, apiSecret };
  }

  private getBaseUrl(context: ProviderContext): string {
    const configured = context.settings?.baseUrl || process.env.BROKER_SANDBOX_BASE_URL;
    return (configured || this.defaultBaseUrl).replace(/\/+$/, '');
  }

  /**
   * Internal secure HTTP transport to broker sandbox.
   */
  private async fetchBroker(
    endpoint: string,
    method: string,
    body: any,
    context: ProviderContext,
    correlationId?: string
  ): Promise<any> {
    const baseUrl = this.getBaseUrl(context);
    const fullUrl = `${baseUrl}${endpoint}`;

    this.validateSandboxSafety(context, fullUrl);

    const { apiKey, apiSecret } = this.resolveCredentials(context);
    if (!apiKey || !apiSecret) {
      // If fallback is enabled in dev, allow graceful handling
      if (context.settings?.allowFallback) {
        throw new BrokerAuthError('Sandbox broker credentials are not configured.', correlationId);
      }
      throw new BrokerAuthError('Missing broker sandbox API Key or Secret. Set BROKER_SANDBOX_API_KEY/SECRET.', correlationId);
    }

    const headers: Record<string, string> = {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': apiSecret,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Correlation-Id': correlationId || `corr-${Date.now()}`,
    };

    const timeoutMs = context.settings?.timeoutMs || 5000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let res: Response;
      if (this.mockHttpDispatcher) {
        res = await this.mockHttpDispatcher(fullUrl, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
      } else {
        res = await fetch(fullUrl, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
      }

      clearTimeout(timer);

      if (res.status === 401 || res.status === 403) {
        const text = await res.text().catch(() => '');
        throw new BrokerAuthError(`Broker sandbox authentication failed (HTTP ${res.status}): ${text}`, correlationId);
      }

      if (res.status === 429) {
        const text = await res.text().catch(() => '');
        throw new BrokerRateLimitError(`Broker sandbox rate limit exceeded (HTTP 429): ${text}`, correlationId);
      }

      if (res.status === 400 || res.status === 422) {
        const data = await res.json().catch(() => ({ message: 'Unprocessable request' }));
        const msg = data.message || data.error || JSON.stringify(data);
        throw new BrokerRejectedError(`Broker sandbox rejected order (HTTP ${res.status}): ${msg}`, correlationId);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new BrokerError(`Broker sandbox error (HTTP ${res.status}): ${text}`, 'BROKER_ERROR', res.status, res.status >= 500, correlationId);
      }

      if (res.status === 204) {
        return { success: true };
      }

      return await res.json();
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        throw new BrokerTimeoutError(`Broker sandbox request timed out after ${timeoutMs}ms.`, correlationId);
      }
      if (err instanceof BrokerError) {
        throw err;
      }
      throw new BrokerNetworkError(`Failed to connect to broker sandbox: ${err.message}`, correlationId);
    }
  }

  public mapProviderStatus(rawStatus: string): NormalizedOrderState {
    const s = (rawStatus || '').toLowerCase().trim();
    switch (s) {
      case 'new':
      case 'pending_new':
      case 'accepted':
        return 'NEW';
      case 'open':
      case 'accepted_for_bidding':
      case 'calculated':
        return 'OPEN';
      case 'partially_filled':
      case 'partial':
        return 'PARTIALLY_FILLED';
      case 'filled':
        return 'FILLED';
      case 'canceled':
      case 'cancelled':
      case 'expired':
      case 'replaced':
      case 'stopped':
        return 'CANCELLED';
      case 'rejected':
      case 'suspended':
      case 'pending_cancel':
        return 'REJECTED';
      default:
        return 'OPEN';
    }
  }

  /**
   * Authenticate / Connect to Sandbox Environment
   */
  public async authenticate(context: ProviderContext): Promise<{ authenticated: boolean; details?: any }> {
    const accountData = await this.fetchBroker('/v2/account', 'GET', null, context);
    const details: SandboxAccountDetails = {
      id: accountData.id || `acc-${context.tenantId}`,
      accountNumber: accountData.account_number || `SANDBOX-${context.tenantId.substring(0, 6)}`,
      status: accountData.status || 'ACTIVE',
      currency: accountData.currency || 'USD',
      cash: Number(accountData.cash || 100000),
      portfolioValue: Number(accountData.portfolio_value || accountData.cash || 100000),
      buyingPower: Number(accountData.buying_power || 200000),
      isSandbox: true,
    };

    return {
      authenticated: details.status === 'ACTIVE',
      details,
    };
  }

  /**
   * Place Order in Broker Sandbox
   */
  public async placeOrder(req: GatewayPlaceOrderRequest, context: ProviderContext): Promise<GatewayOrderResult> {
    const startTime = Date.now();
    const correlationId = req.correlationId || `corr-${Date.now()}`;

    // Map internal order request to Alpaca sandbox format
    // Clean symbol (strip internal FUT suffix if standard equity/stock test)
    const normalizedSymbol = req.symbol.replace(/\s+FUT/i, '').replace(/[\s\-_]/g, '').toUpperCase();
    const providerOrderType = req.orderType.toLowerCase() === 'limit' ? 'limit' : 'market';

    const providerPayload: Record<string, any> = {
      symbol: normalizedSymbol,
      qty: req.quantity,
      side: req.side.toLowerCase(),
      type: providerOrderType,
      time_in_force: (req.timeInForce || 'day').toLowerCase(),
      client_order_id: req.clientOrderId || req.orderId,
    };

    if (providerOrderType === 'limit') {
      if (!req.price || req.price <= 0) {
        throw new BrokerRejectedError('Limit price must be greater than 0 for LIMIT orders.', correlationId);
      }
      providerPayload.limit_price = req.price;
    }

    const response = await this.fetchBroker('/v2/orders', 'POST', providerPayload, context, correlationId);
    const normalizedStatus = this.mapProviderStatus(response.status);

    const filledQty = Number(response.filled_qty || 0);
    const totalQty = Number(response.qty || req.quantity);
    const avgPrice = Number(response.filled_avg_price || response.limit_price || req.price || 0);

    return {
      success: true,
      orderId: req.orderId,
      brokerOrderId: response.id || `bkr-${Date.now()}`,
      status: normalizedStatus,
      filledQuantity: filledQty,
      remainingQuantity: Math.max(0, totalQty - filledQty),
      averagePrice: avgPrice,
      lastExecutionPrice: avgPrice,
      lastExecutionQuantity: filledQty,
      rawStatus: response.status || 'new',
      providerId: this.providerId,
      correlationId,
      latencyMs: Date.now() - startTime,
      timestamp: response.created_at || new Date().toISOString(),
    };
  }

  /**
   * Cancel Order in Broker Sandbox
   */
  public async cancelOrder(req: GatewayCancelOrderRequest, context: ProviderContext): Promise<GatewayOrderResult> {
    const startTime = Date.now();
    const correlationId = req.correlationId || `corr-${Date.now()}`;

    const targetId = req.brokerOrderId || req.orderId;
    await this.fetchBroker(`/v2/orders/${encodeURIComponent(targetId)}`, 'DELETE', null, context, correlationId);

    return {
      success: true,
      orderId: req.orderId,
      brokerOrderId: targetId,
      status: 'CANCELLED',
      filledQuantity: 0,
      remainingQuantity: 0,
      averagePrice: 0,
      rawStatus: 'canceled',
      providerId: this.providerId,
      correlationId,
      latencyMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Modify Order in Broker Sandbox (Replace)
   */
  public async modifyOrder(req: GatewayModifyOrderRequest, context: ProviderContext): Promise<GatewayOrderResult> {
    const startTime = Date.now();
    const correlationId = req.correlationId || `corr-${Date.now()}`;

    const targetId = req.brokerOrderId || req.orderId;
    const patchPayload: Record<string, any> = {};

    if (req.quantity && req.quantity > 0) {
      patchPayload.qty = req.quantity;
    }
    if (req.price && req.price > 0) {
      patchPayload.limit_price = req.price;
    }

    const response = await this.fetchBroker(
      `/v2/orders/${encodeURIComponent(targetId)}`,
      'PATCH',
      patchPayload,
      context,
      correlationId
    );

    const normalizedStatus = this.mapProviderStatus(response.status);
    const filledQty = Number(response.filled_qty || 0);
    const totalQty = Number(response.qty || req.quantity || 0);
    const avgPrice = Number(response.filled_avg_price || response.limit_price || req.price || 0);

    return {
      success: true,
      orderId: req.orderId,
      brokerOrderId: response.id || targetId,
      status: normalizedStatus,
      filledQuantity: filledQty,
      remainingQuantity: Math.max(0, totalQty - filledQty),
      averagePrice: avgPrice,
      rawStatus: response.status || 'replaced',
      providerId: this.providerId,
      correlationId,
      latencyMs: Date.now() - startTime,
      timestamp: response.updated_at || new Date().toISOString(),
    };
  }

  /**
   * Get Order Status from Broker Sandbox
   */
  public async getOrderStatus(req: GatewayOrderStatusRequest, context: ProviderContext): Promise<GatewayOrderResult> {
    const startTime = Date.now();
    const correlationId = req.correlationId || `corr-${Date.now()}`;

    const targetId = req.brokerOrderId || req.orderId;
    const response = await this.fetchBroker(
      `/v2/orders/${encodeURIComponent(targetId)}`,
      'GET',
      null,
      context,
      correlationId
    );

    const normalizedStatus = this.mapProviderStatus(response.status);
    const filledQty = Number(response.filled_qty || 0);
    const totalQty = Number(response.qty || 0);
    const avgPrice = Number(response.filled_avg_price || response.limit_price || 0);

    return {
      success: true,
      orderId: req.orderId,
      brokerOrderId: response.id || targetId,
      status: normalizedStatus,
      filledQuantity: filledQty,
      remainingQuantity: Math.max(0, totalQty - filledQty),
      averagePrice: avgPrice,
      lastExecutionPrice: avgPrice,
      lastExecutionQuantity: filledQty,
      rawStatus: response.status,
      providerId: this.providerId,
      correlationId,
      latencyMs: Date.now() - startTime,
      timestamp: response.updated_at || response.created_at || new Date().toISOString(),
    };
  }

  /**
   * Fetch all Open Orders from Broker Sandbox
   */
  public async getOpenOrders(context: ProviderContext): Promise<GatewayOrderResult[]> {
    const startTime = Date.now();
    const orders = await this.fetchBroker('/v2/orders?status=open', 'GET', null, context);

    if (!Array.isArray(orders)) {
      return [];
    }

    return orders.map((o: any) => {
      const filledQty = Number(o.filled_qty || 0);
      const totalQty = Number(o.qty || 0);
      const avgPrice = Number(o.filled_avg_price || o.limit_price || 0);
      return {
        success: true,
        orderId: o.client_order_id || o.id,
        brokerOrderId: o.id,
        status: this.mapProviderStatus(o.status),
        filledQuantity: filledQty,
        remainingQuantity: Math.max(0, totalQty - filledQty),
        averagePrice: avgPrice,
        rawStatus: o.status,
        providerId: this.providerId,
        correlationId: `corr-${Date.now()}`,
        latencyMs: Date.now() - startTime,
        timestamp: o.updated_at || o.created_at || new Date().toISOString(),
      };
    });
  }

  /**
   * Fetch all Positions from Broker Sandbox
   */
  public async getPositions(context: ProviderContext): Promise<Array<{
    symbol: string;
    quantity: number;
    averagePrice: number;
    currentPrice?: number;
    unrealizedPnl?: number;
  }>> {
    const positions = await this.fetchBroker('/v2/positions', 'GET', null, context);
    if (!Array.isArray(positions)) {
      return [];
    }

    return positions.map((p: any) => ({
      symbol: p.symbol,
      quantity: Number(p.qty || 0),
      averagePrice: Number(p.avg_entry_price || 0),
      currentPrice: Number(p.current_price || 0),
      unrealizedPnl: Number(p.unrealized_pl || 0),
    }));
  }
}

export const realBrokerAdapter = new RealBrokerAdapter();
