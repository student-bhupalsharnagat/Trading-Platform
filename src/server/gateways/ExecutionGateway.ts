/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5G
 * Unified Execution Gateway
 * Multi-tenant broker routing, timeout management, safe retries, circuit breaking, idempotency & audit logging.
 */

import { IBrokerAdapter } from './broker/IBrokerAdapter.ts';
import { mockBrokerAdapter } from './broker/MockBrokerAdapter.ts';
import { realBrokerAdapter } from './broker/RealBrokerAdapter.ts';
import { providerConfigService } from './broker/ProviderConfigService.ts';
import { providerCircuitBreaker } from './circuit/ProviderCircuitBreaker.ts';
import { executionAuditLogger } from './audit/ExecutionAuditLogger.ts';
import {
  GatewayPlaceOrderRequest,
  GatewayCancelOrderRequest,
  GatewayModifyOrderRequest,
  GatewayOrderStatusRequest,
  GatewayOrderResult,
  ProviderContext,
} from './types.ts';
import {
  BrokerCircuitOpenError,
  BrokerTimeoutError,
  normalizeBrokerError,
  BrokerError,
} from './errors/BrokerErrors.ts';

export class ExecutionGateway {
  private adapters = new Map<string, IBrokerAdapter>();
  private idempotencyCache = new Map<string, GatewayOrderResult>(); // `${tenantId}:${clientOrderId}` -> result

  constructor() {
    // Register available broker adapters
    this.registerAdapter(mockBrokerAdapter);
    this.registerAdapter(realBrokerAdapter);
  }

  public registerAdapter(adapter: IBrokerAdapter): void {
    this.adapters.set(adapter.providerId, adapter);
  }

  public normalizeProviderId(providerId?: string): string {
    if (!providerId) return 'mock-broker';
    const p = providerId.trim().toUpperCase();
    if (p === 'REAL_SANDBOX' || p === 'SANDBOX' || p === 'ALPACA_SANDBOX' || p === 'REAL-SANDBOX') {
      return 'real-sandbox';
    }
    if (p === 'MOCK' || p === 'SIMULATION' || p === 'MOCK-BROKER' || p === 'MOCK_BROKER') {
      return 'mock-broker';
    }
    return providerId;
  }

  public getAdapter(providerId = 'mock-broker'): IBrokerAdapter {
    const normalized = this.normalizeProviderId(providerId);
    const adapter = this.adapters.get(normalized) || this.adapters.get(providerId);
    if (!adapter) {
      throw new BrokerError(`Broker adapter for '${providerId}' is not registered.`, 'ADAPTER_NOT_FOUND', 501);
    }
    return adapter;
  }

  private getIdempotencyKey(tenantId: string, clientOrderId?: string): string | null {
    if (!clientOrderId || !clientOrderId.trim()) return null;
    return `${tenantId}:${clientOrderId.trim()}`;
  }

  /**
   * Place Order through Execution Gateway
   * Strictly enforces:
   * 1. Idempotency cache check
   * 2. Circuit Breaker validation
   * 3. Configurable timeout
   * 4. NO BLIND RETRIES on order placement (prevents duplicate fills)
   * 5. Sanitized Audit Logging
   */
  public async placeOrder(req: GatewayPlaceOrderRequest): Promise<GatewayOrderResult> {
    const startTime = Date.now();
    const correlationId = req.correlationId || `corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    req.correlationId = correlationId;

    // 1. Check idempotency cache
    const idempKey = this.getIdempotencyKey(req.tenantId, req.clientOrderId);
    if (idempKey) {
      const cached = this.idempotencyCache.get(idempKey);
      if (cached) {
        return {
          ...cached,
          correlationId,
          timestamp: new Date().toISOString(),
        };
      }
    }

    // 2. Resolve tenant provider configuration
    const context: ProviderContext = await providerConfigService.getProviderConfig(req.tenantId);
    const adapter = this.getAdapter(context.providerId);
    const timeoutMs = context.settings.timeoutMs || 5000;

    // 3. Verify Circuit Breaker state
    if (!providerCircuitBreaker.canExecute(req.tenantId, context.providerId)) {
      const err = new BrokerCircuitOpenError(
        `Broker '${context.providerId}' is currently unavailable due to repeated failures (Circuit Breaker is OPEN).`,
        correlationId
      );

      await executionAuditLogger.logAudit({
        tenantId: req.tenantId,
        correlationId,
        userId: req.userId,
        orderId: req.orderId,
        providerId: context.providerId,
        action: 'PLACE_ORDER',
        executionStatus: 'CIRCUIT_OPEN',
        requestPayload: req,
        responsePayload: {},
        latencyMs: Date.now() - startTime,
        errorCode: err.code,
        errorMessage: err.message,
      });

      throw err;
    }

    // 4. Execute with timeout race (NO BLIND RETRIES on placeOrder)
    let result: GatewayOrderResult;
    try {
      result = await this.executeWithTimeout(
        () => adapter.placeOrder(req, context),
        timeoutMs,
        correlationId
      );

      // Record success in Circuit Breaker
      providerCircuitBreaker.recordSuccess(req.tenantId, context.providerId);

      // Cache for idempotency
      if (idempKey) {
        this.idempotencyCache.set(idempKey, result);
      }

      // Log successful audit
      await executionAuditLogger.logAudit({
        tenantId: req.tenantId,
        correlationId,
        userId: req.userId,
        orderId: req.orderId,
        brokerOrderId: result.brokerOrderId,
        providerId: context.providerId,
        action: 'PLACE_ORDER',
        executionStatus: 'SUCCESS',
        requestPayload: req,
        responsePayload: result,
        latencyMs: Date.now() - startTime,
      });

      return result;
    } catch (rawErr: any) {
      const normErr = normalizeBrokerError(rawErr, correlationId);
      const latencyMs = Date.now() - startTime;

      // Only infrastructure failures (timeout, network, 5xx) trip the circuit breaker
      if (normErr instanceof BrokerTimeoutError || normErr.statusCode >= 500) {
        providerCircuitBreaker.recordFailure(req.tenantId, context.providerId);
      }

      const execStatus = normErr instanceof BrokerTimeoutError ? 'TIMEOUT' : 'FAILED';

      await executionAuditLogger.logAudit({
        tenantId: req.tenantId,
        correlationId,
        userId: req.userId,
        orderId: req.orderId,
        providerId: context.providerId,
        action: 'PLACE_ORDER',
        executionStatus: execStatus,
        requestPayload: req,
        responsePayload: {},
        latencyMs,
        errorCode: normErr.code,
        errorMessage: normErr.message,
      });

      throw normErr;
    }
  }

  /**
   * Cancel Order through Execution Gateway
   * Safe to retry up to 2 times on transient network error.
   */
  public async cancelOrder(req: GatewayCancelOrderRequest): Promise<GatewayOrderResult> {
    const startTime = Date.now();
    const correlationId = req.correlationId || `corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    req.correlationId = correlationId;

    const context = await providerConfigService.getProviderConfig(req.tenantId);
    const adapter = this.getAdapter(context.providerId);
    const timeoutMs = context.settings.timeoutMs || 5000;
    const maxRetries = 2;

    if (!providerCircuitBreaker.canExecute(req.tenantId, context.providerId)) {
      throw new BrokerCircuitOpenError(
        `Broker '${context.providerId}' is unavailable (Circuit Breaker OPEN).`,
        correlationId
      );
    }

    let lastError: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeWithTimeout(
          () => adapter.cancelOrder(req, context),
          timeoutMs,
          correlationId
        );

        providerCircuitBreaker.recordSuccess(req.tenantId, context.providerId);

        await executionAuditLogger.logAudit({
          tenantId: req.tenantId,
          correlationId,
          userId: req.userId,
          orderId: req.orderId,
          brokerOrderId: result.brokerOrderId,
          providerId: context.providerId,
          action: 'CANCEL_ORDER',
          executionStatus: 'SUCCESS',
          requestPayload: req,
          responsePayload: result,
          latencyMs: Date.now() - startTime,
        });

        return result;
      } catch (err: any) {
        lastError = normalizeBrokerError(err, correlationId);
        // Only retry retryable errors
        if (!lastError.isRetryable || attempt === maxRetries) {
          break;
        }
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
      }
    }

    if (lastError.isRetryable) {
      providerCircuitBreaker.recordFailure(req.tenantId, context.providerId);
    }

    await executionAuditLogger.logAudit({
      tenantId: req.tenantId,
      correlationId,
      userId: req.userId,
      orderId: req.orderId,
      providerId: context.providerId,
      action: 'CANCEL_ORDER',
      executionStatus: 'FAILED',
      requestPayload: req,
      responsePayload: {},
      latencyMs: Date.now() - startTime,
      errorCode: lastError.code,
      errorMessage: lastError.message,
    });

    throw lastError;
  }

  /**
   * Modify Order through Execution Gateway
   */
  public async modifyOrder(req: GatewayModifyOrderRequest): Promise<GatewayOrderResult> {
    const startTime = Date.now();
    const correlationId = req.correlationId || `corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    req.correlationId = correlationId;

    const context = await providerConfigService.getProviderConfig(req.tenantId);
    const adapter = this.getAdapter(context.providerId);
    const timeoutMs = context.settings.timeoutMs || 5000;

    if (!providerCircuitBreaker.canExecute(req.tenantId, context.providerId)) {
      throw new BrokerCircuitOpenError(
        `Broker '${context.providerId}' is unavailable (Circuit Breaker OPEN).`,
        correlationId
      );
    }

    try {
      const result = await this.executeWithTimeout(
        () => adapter.modifyOrder(req, context),
        timeoutMs,
        correlationId
      );

      providerCircuitBreaker.recordSuccess(req.tenantId, context.providerId);

      await executionAuditLogger.logAudit({
        tenantId: req.tenantId,
        correlationId,
        userId: req.userId,
        orderId: req.orderId,
        brokerOrderId: result.brokerOrderId,
        providerId: context.providerId,
        action: 'MODIFY_ORDER',
        executionStatus: 'SUCCESS',
        requestPayload: req,
        responsePayload: result,
        latencyMs: Date.now() - startTime,
      });

      return result;
    } catch (err: any) {
      const normErr = normalizeBrokerError(err, correlationId);
      if (normErr.isRetryable) {
        providerCircuitBreaker.recordFailure(req.tenantId, context.providerId);
      }

      await executionAuditLogger.logAudit({
        tenantId: req.tenantId,
        correlationId,
        userId: req.userId,
        orderId: req.orderId,
        providerId: context.providerId,
        action: 'MODIFY_ORDER',
        executionStatus: 'FAILED',
        requestPayload: req,
        responsePayload: {},
        latencyMs: Date.now() - startTime,
        errorCode: normErr.code,
        errorMessage: normErr.message,
      });

      throw normErr;
    }
  }

  /**
   * Get Order Status through Execution Gateway
   * Idempotent read query: safe to retry with backoff.
   */
  public async getOrderStatus(req: GatewayOrderStatusRequest): Promise<GatewayOrderResult> {
    const startTime = Date.now();
    const correlationId = req.correlationId || `corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    req.correlationId = correlationId;

    const context = await providerConfigService.getProviderConfig(req.tenantId);
    const adapter = this.getAdapter(context.providerId);
    const timeoutMs = context.settings.timeoutMs || 5000;
    const maxRetries = 2;

    let lastError: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeWithTimeout(
          () => adapter.getOrderStatus(req, context),
          timeoutMs,
          correlationId
        );

        providerCircuitBreaker.recordSuccess(req.tenantId, context.providerId);

        await executionAuditLogger.logAudit({
          tenantId: req.tenantId,
          correlationId,
          userId: req.userId,
          orderId: req.orderId,
          brokerOrderId: result.brokerOrderId,
          providerId: context.providerId,
          action: 'GET_STATUS',
          executionStatus: 'SUCCESS',
          requestPayload: req,
          responsePayload: result,
          latencyMs: Date.now() - startTime,
        });

        return result;
      } catch (err: any) {
        lastError = normalizeBrokerError(err, correlationId);
        if (!lastError.isRetryable || attempt === maxRetries) {
          break;
        }
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
      }
    }

    if (lastError.isRetryable) {
      providerCircuitBreaker.recordFailure(req.tenantId, context.providerId);
    }

    await executionAuditLogger.logAudit({
      tenantId: req.tenantId,
      correlationId,
      userId: req.userId,
      orderId: req.orderId,
      providerId: context.providerId,
      action: 'GET_STATUS',
      executionStatus: 'FAILED',
      requestPayload: req,
      responsePayload: {},
      latencyMs: Date.now() - startTime,
      errorCode: lastError.code,
      errorMessage: lastError.message,
    });

    throw lastError;
  }

  /**
   * Authenticate / Connect to broker for a tenant
   */
  public async authenticate(tenantId: string, correlationId?: string): Promise<{
    authenticated: boolean;
    accountId?: string;
    mode?: string;
    details?: any;
  }> {
    const corrId = correlationId || `corr-${Date.now()}`;
    const context = await providerConfigService.getProviderConfig(tenantId);
    const adapter = this.getAdapter(context.providerId);
    const timeoutMs = context.settings.timeoutMs || 5000;

    return this.executeWithTimeout(
      async () => {
        if (adapter.authenticate) {
          return adapter.authenticate(context);
        }
        return { authenticated: true, mode: 'MOCK', details: { message: 'Provider authentication bypassed' } };
      },
      timeoutMs,
      corrId
    );
  }

  /**
   * Get all open orders from broker for reconciliation or monitoring
   */
  public async getOpenOrders(tenantId: string, correlationId?: string): Promise<GatewayOrderResult[]> {
    const corrId = correlationId || `corr-${Date.now()}`;
    const context = await providerConfigService.getProviderConfig(tenantId);
    const adapter = this.getAdapter(context.providerId);
    const timeoutMs = context.settings.timeoutMs || 5000;

    return this.executeWithTimeout(
      async () => {
        if (adapter.getOpenOrders) {
          return adapter.getOpenOrders(context);
        }
        return [];
      },
      timeoutMs,
      corrId
    );
  }

  /**
   * Get active positions from broker for reconciliation or monitoring
   */
  public async getPositions(tenantId: string, correlationId?: string): Promise<Array<{
    symbol: string;
    quantity: number;
    averagePrice: number;
    currentPrice?: number;
    unrealizedPnl?: number;
  }>> {
    const corrId = correlationId || `corr-${Date.now()}`;
    const context = await providerConfigService.getProviderConfig(tenantId);
    const adapter = this.getAdapter(context.providerId);
    const timeoutMs = context.settings.timeoutMs || 5000;

    return this.executeWithTimeout(
      async () => {
        if (adapter.getPositions) {
          return adapter.getPositions(context);
        }
        return [];
      },
      timeoutMs,
      corrId
    );
  }

  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    correlationId: string
  ): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new BrokerTimeoutError(`Broker operation exceeded timeout of ${timeoutMs}ms.`, correlationId));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      return result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  public clearIdempotencyCache(): void {
    this.idempotencyCache.clear();
  }
}

export const executionGateway = new ExecutionGateway();
