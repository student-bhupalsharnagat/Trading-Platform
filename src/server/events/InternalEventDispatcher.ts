/**
 * Asynchronous Internal Event Dispatcher
 *
 * Coordinates:
 * - Local EventQueue (in-memory buffering, retry backoff, dead-lettering)
 * - CircuitBreaker (fail-fast protection when Central Admin is down)
 * - CentralAdminEventClient (Phase 5B HMAC signed HTTP delivery)
 * - Non-blocking execution (trading never halts or rolls back on delivery failure)
 * - Margin breach state tracking and deduplication
 * - Audit logging with strict credential sanitization
 */

import crypto from 'crypto';
import {
  InternalEvent,
  InternalEventType,
  TradeExecutedPayload,
  ClientRegisteredPayload,
  ClientActivatedPayload,
  BrokerAddedPayload,
  LedgerUpdatedPayload,
  RiskAlertPayload,
  PositionUpdatedPayload,
  WalletUpdatedPayload,
  FundTransactionPayload,
  MarginBreachPayload,
  ExecutionFailurePayload,
  EmergencyControlPayload,
  ReconciliationMismatchPayload,
  KycSubmittedPayload,
  SupportTicketPayload,
} from './types.ts';
import { IEventQueue, eventQueue as defaultEventQueue, QueuedEvent } from './EventQueue.ts';
import { CircuitBreaker } from './CircuitBreaker.ts';
import {
  CentralAdminEventClient,
  centralAdminEventClient as defaultClient,
} from './CentralAdminEventClient.ts';
import { auditService } from '../services/auditService.ts';
import { transactionalOutboxService } from '../services/TransactionalOutboxService.ts';
import { tradingWebSocketServer } from '../websocket/WebSocketServer.ts';
import { enrichPayloadWithHierarchy } from '../utils/hierarchyContext.ts';

export interface SseClientFilter {
  tenantId?: string;
  userId?: string;
  masterId?: string;
  brokerId?: string;
  subBrokerId?: string;
  role?: string;
}

const PRIVILEGED_ROLES = new Set(['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER']);

export interface DispatcherHealthMetrics {
  queueSize: number;
  pendingEvents: number;
  failedEvents: number;
  deadLetterEvents: number;
  circuitState: string;
  lastSuccessfulDelivery: string | null;
  timestamp: string;
}

export class InternalEventDispatcher {
  private queue: IEventQueue;
  private client: CentralAdminEventClient;
  private circuitBreaker: CircuitBreaker;
  private lastSuccessfulDelivery: string | null = null;
  private drainInterval: NodeJS.Timeout | null = null;

  // Margin breach deduplication tracker: key = tenantId:userId
  private activeMarginBreaches = new Map<
    string,
    {
      usedMargin: number;
      availableMargin: number;
      exposure: number;
      reportedAt: number;
    }
  >();

  constructor(
    queue: IEventQueue = defaultEventQueue,
    client: CentralAdminEventClient = defaultClient,
    circuitBreaker: CircuitBreaker = new CircuitBreaker()
  ) {
    this.queue = queue;
    this.client = client;
    this.circuitBreaker = circuitBreaker;
  }

  public getQueue(): IEventQueue {
    return this.queue;
  }

  public getClient(): CentralAdminEventClient {
    return this.client;
  }

  public getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  // Active Server-Sent Events (SSE) subscribers
  private sseClients = new Set<{
    res: any;
    tenantId?: string;
    userId?: string;
    masterId?: string;
    brokerId?: string;
    subBrokerId?: string;
    role?: string;
  }>();

  public registerSseClient(
    res: any,
    filter?: SseClientFilter
  ): () => void {
    const client = {
      res,
      tenantId: filter?.tenantId,
      userId: filter?.userId,
      masterId: filter?.masterId,
      brokerId: filter?.brokerId,
      subBrokerId: filter?.subBrokerId,
      role: filter?.role,
    };
    this.sseClients.add(client);
    return () => {
      this.sseClients.delete(client);
    };
  }

  public getSseClientsCount(): number {
    return this.sseClients.size;
  }

  public broadcastSse(
    event: string,
    payload: any,
    filter?: SseClientFilter
  ): void {
    const data = JSON.stringify(payload);
    const message = `event: ${event}\ndata: ${data}\n\n`;

    const payloadMasterId = filter?.masterId ?? payload?.masterId ?? undefined;
    const payloadBrokerId = filter?.brokerId ?? payload?.brokerId ?? undefined;
    const payloadSubBrokerId = filter?.subBrokerId ?? payload?.subBrokerId ?? undefined;

    this.sseClients.forEach((client) => {
      if (filter?.tenantId && client.tenantId && client.tenantId !== filter.tenantId && client.tenantId !== 'global') {
        return;
      }

      const isPrivileged = Boolean(client.role && PRIVILEGED_ROLES.has(client.role.toUpperCase()));

      if (filter?.role === 'ADMIN_ONLY' && client.role && !isPrivileged) {
        return;
      }

      // Enforce hierarchy scope when the subscriber declared a hierarchy node filter
      if (client.masterId && payloadMasterId && client.masterId !== payloadMasterId) {
        return;
      }
      if (client.brokerId && payloadBrokerId && client.brokerId !== payloadBrokerId) {
        return;
      }
      if (client.subBrokerId && payloadSubBrokerId && client.subBrokerId !== payloadSubBrokerId) {
        return;
      }

      if (filter?.userId && client.userId && client.userId !== filter.userId && !isPrivileged) {
        return;
      }

      try {
        client.res.write(message);
      } catch {
        this.sseClients.delete(client);
      }
    });
  }

  /**
   * Broadcasts an authoritative real-time KPI/metric event simultaneously over
   * WebSocket (/ws) and SSE (/api/stream, /api/v1/stream, /api/trading/stream, /api/internal/v1/stream)
   * enriched with tenantId, masterId, brokerId, and subBrokerId.
   */
  public broadcastDashboardEvent<T extends Record<string, any>>(
    tenantId: string,
    event: string,
    payload: T,
    options?: { targetUserId?: string; adminOnly?: boolean }
  ): T & { tenantId: string; masterId: string | null; brokerId: string | null; subBrokerId: string | null } {
    const enriched = enrichPayloadWithHierarchy(tenantId, payload);
    const targetUserId = options?.targetUserId;
    const adminOnly = Boolean(options?.adminOnly);

    const recipientFilter = adminOnly
      ? (ws: any) => PRIVILEGED_ROLES.has(String(ws.role || '').toUpperCase())
      : targetUserId
        ? (ws: any) => ws.userId === targetUserId || PRIVILEGED_ROLES.has(String(ws.role || '').toUpperCase())
        : undefined;

    const targetFilter = targetUserId && !adminOnly ? { targetUserId } : undefined;

    try {
      tradingWebSocketServer.broadcastToTenant(
        enriched.tenantId,
        event,
        enriched,
        recipientFilter,
        false,
        targetFilter
      );
    } catch (wsErr: any) {
      console.warn(`[InternalEventDispatcher] WS broadcast warning for ${event}:`, wsErr?.message || wsErr);
    }

    this.broadcastSse(event, enriched, {
      tenantId: enriched.tenantId,
      userId: adminOnly ? undefined : targetUserId,
      masterId: enriched.masterId ?? undefined,
      brokerId: enriched.brokerId ?? undefined,
      subBrokerId: enriched.subBrokerId ?? undefined,
      role: adminOnly ? 'ADMIN_ONLY' : undefined,
    });

    return enriched;
  }

  public broadcastRealtimeTick(tick: {
    symbol: string;
    ltp: number;
    change: number;
    changePercent: number;
  }): void {
    tradingWebSocketServer.broadcastToAll('market.tick', tick);
    this.broadcastSse('market.tick', tick);
  }

  public broadcastMtmBatch(
    deltas: Array<{
      positionId: string;
      clientId: string;
      symbol: string;
      ltp: number;
      unrealizedPnL: number;
    }>
  ): void {
    const payload = {
      deltas,
      count: deltas.length,
      timestamp: new Date().toISOString(),
    };
    tradingWebSocketServer.broadcastToAll('positions.mtm_batch', payload);
    this.broadcastSse('positions.mtm_batch', payload);
  }

  /**
   * Dispatches an event asynchronously.
   * Enqueues immediately and attempts delivery without blocking caller or failing caller.
   */
  public async dispatch<T = any>(event: InternalEvent<T>): Promise<void> {
    const enrichedEvent: InternalEvent<T> = {
      ...event,
      payload: enrichPayloadWithHierarchy(event.tenantId, event.payload),
    };

    // 1. Enqueue locally first
    this.queue.enqueue(enrichedEvent);

    // 2. Persist to transactional outbox (PostgreSQL) asynchronously
    transactionalOutboxService
      .enqueue({
        eventId: enrichedEvent.eventId,
        tenantId: enrichedEvent.tenantId,
        eventType: enrichedEvent.eventType,
        payload: enrichedEvent.payload,
      })
      .catch((err) => {
        console.warn('[InternalEventDispatcher] Outbox persistence warning:', err);
      });

    // 3. Attempt delivery asynchronously (non-blocking)
    // Run attempt in next tick so caller function returns immediately
    setImmediate(() => {
      this.attemptDelivery(enrichedEvent.eventId).catch((err) => {
        console.error('[InternalEventDispatcher] Unhandled delivery error:', err);
      });
    });
  }

  /**
   * Synchronous-style attempt for a single event (used by background drain or direct test runner).
   * Returns true if delivered or acknowledged, false if failed/queued.
   */
  public async attemptDelivery(eventId: string): Promise<boolean> {
    const item = this.queue.getEvent(eventId);
    if (!item || item.status === 'DEAD_LETTER' || item.status === 'COMPLETED') {
      return false;
    }

    // Check circuit breaker
    if (!this.circuitBreaker.canExecute()) {
      // Circuit is OPEN, skip HTTP attempt and keep in queue
      return false;
    }

    const event: InternalEvent = {
      eventId: item.eventId,
      eventType: item.eventType,
      tenantId: item.tenantId,
      timestamp: item.timestamp,
      version: item.version,
      payload: item.payload,
    };

    try {
      const result = await this.client.sendEvent(event);

      if (result.success || result.data?.alreadyProcessed === true) {
        this.circuitBreaker.recordSuccess();
        this.queue.markSuccess(eventId);
        this.lastSuccessfulDelivery = new Date().toISOString();

        auditService.logEmergencyEvent({
          action: 'EVENT_DELIVERY_SUCCESS',
          source: 'TRADING_PLATFORM_EVENT_DISPATCHER',
          tenantId: event.tenantId,
          reason: `Event ${event.eventType} delivered successfully`,
          result: {
            eventId: event.eventId,
            eventType: event.eventType,
            attempts: item.attempts + 1,
            alreadyProcessed: Boolean(result.data?.alreadyProcessed),
          },
        });

        return true;
      } else {
        this.circuitBreaker.recordFailure();
        const failure = this.queue.markFailure(
          eventId,
          result.error || `HTTP status ${result.statusCode}`
        );

        auditService.logEmergencyEvent({
          action: failure.deadLetter ? 'EVENT_DEAD_LETTER' : 'EVENT_DELIVERY_FAILURE',
          source: 'TRADING_PLATFORM_EVENT_DISPATCHER',
          tenantId: event.tenantId,
          reason: `Event ${event.eventType} delivery failed: ${result.error}`,
          result: {
            eventId: event.eventId,
            eventType: event.eventType,
            attempts: failure.event.attempts,
            maxAttempts: failure.event.maxAttempts,
            deadLetter: failure.deadLetter,
            category: result.code || 'DELIVERY_FAILURE',
          },
        });

        return false;
      }
    } catch (err: any) {
      this.circuitBreaker.recordFailure();
      const failure = this.queue.markFailure(
        eventId,
        err.message || 'Unknown network error'
      );

      auditService.logEmergencyEvent({
        action: failure.deadLetter ? 'EVENT_DEAD_LETTER' : 'EVENT_DELIVERY_FAILURE',
        source: 'TRADING_PLATFORM_EVENT_DISPATCHER',
        tenantId: event.tenantId,
        reason: `Event delivery exception: ${err.message}`,
        result: {
          eventId: event.eventId,
          eventType: event.eventType,
          attempts: failure.event.attempts,
          deadLetter: failure.deadLetter,
          category: 'EXCEPTION',
        },
      });

      return false;
    }
  }

  /**
   * Helper: Dispatches a Trade Executed event.
   * Only authoritative operational details are included; no secrets or tokens.
   */
  public async dispatchTradeExecuted(
    params: TradeExecutedPayload & { tenantId: string }
  ): Promise<InternalEvent<TradeExecutedPayload>> {
    const tradeId = params.tradeId || `TRD-${Date.now()}`;
    const qty = Number(params.quantity);
    const price = Number(params.executionPrice);
    const val = Number(params.executionValue ?? params.totalValue ?? (qty * price));

    const payload: TradeExecutedPayload = enrichPayloadWithHierarchy(params.tenantId, {
      ...params,
      tenantId: params.tenantId,
      userId: params.userId,
      clientId: params.clientId || params.tradingUserId || params.userId,
      tradingUserId: params.tradingUserId || params.clientId || params.userId,
      clientCode: params.clientCode || (params.userId ? params.userId.toUpperCase() : 'CLIENT'),
      clientName: params.clientName || params.userId || 'Client',
      orderId: params.orderId,
      tradeId,
      symbol: params.symbol,
      exchange: params.exchange || 'NSE',
      side: params.side,
      quantity: qty,
      qty,
      price,
      executionPrice: price,
      executionValue: val,
      totalValue: val,
      turnover: val,
      fees: Number(params.fees ?? 0),
      commission: Number(params.commission ?? 0),
      realizedPnl: Number(params.realizedPnl ?? 0),
      executedAt: params.executedAt || new Date().toISOString(),
    });

    const event: InternalEvent<TradeExecutedPayload> = {
      eventId: `evt-trade-${tradeId}`,
      eventType: 'trade.executed',
      tenantId: params.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload,
    };

    this.broadcastDashboardEvent(params.tenantId, 'trade.executed', payload, {
      targetUserId: params.userId,
    });

    await this.dispatch(event);
    return event;
  }

  /**
   * Helper: Dispatches a Margin Breach event with state tracking & deduplication.
   * If the breach state is unchanged within cooldown window (60s), suppresses duplicate.
   */
  public async dispatchMarginBreach(params: {
    tenantId: string;
    userId: string;
    usedMargin: number;
    availableMargin: number;
    exposure: number;
    threshold?: number;
    detectedAt?: string;
    force?: boolean;
  }): Promise<InternalEvent<MarginBreachPayload> | null> {
    const dedupKey = `${params.tenantId}:${params.userId}`;
    const existing = this.activeMarginBreaches.get(dedupKey);
    const now = Date.now();

    if (!params.force && existing) {
      const isSameMetrics =
        existing.usedMargin === params.usedMargin &&
        existing.availableMargin === params.availableMargin &&
        existing.exposure === params.exposure;

      const isWithinCooldown = now - existing.reportedAt < 60000; // 60s cooldown

      if (isSameMetrics && isWithinCooldown) {
        // Suppress duplicate event
        return null;
      }
    }

    // Record breach state
    this.activeMarginBreaches.set(dedupKey, {
      usedMargin: params.usedMargin,
      availableMargin: params.availableMargin,
      exposure: params.exposure,
      reportedAt: now,
    });

    const detectedAt = params.detectedAt || new Date().toISOString();
    const enrichedPayload = enrichPayloadWithHierarchy(params.tenantId, {
      tenantId: params.tenantId,
      userId: params.userId,
      usedMargin: params.usedMargin,
      availableMargin: params.availableMargin,
      exposure: params.exposure,
      threshold: params.threshold ?? 0.8,
      detectedAt,
    });

    const event: InternalEvent<MarginBreachPayload> = {
      eventId: `evt-risk-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      eventType: 'risk.margin_breach',
      tenantId: params.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: enrichedPayload,
    };

    this.broadcastDashboardEvent(params.tenantId, 'risk.margin_breach', enrichedPayload, {
      targetUserId: params.userId,
    });
    this.broadcastDashboardEvent(
      params.tenantId,
      'risk.alert_triggered',
      {
        ...enrichedPayload,
        alertType: 'MARGIN_SHORTFALL' as const,
        severity: 'CRITICAL' as const,
        code: 'MARGIN_BREACH',
        reason: `Margin shortfall detected for ${params.userId} (available: ${params.availableMargin}, exposure: ${params.exposure})`,
      },
      { targetUserId: params.userId }
    );

    await this.dispatch(event);
    return event;
  }

  /**
   * Publishes a real-time risk.alert_triggered event for margin shortfalls or blocked orders.
   */
  public async dispatchRiskAlert(
    payload: RiskAlertPayload
  ): Promise<InternalEvent<RiskAlertPayload>> {
    const enriched = enrichPayloadWithHierarchy(payload.tenantId, {
      ...payload,
      severity: payload.severity || 'HIGH',
      detectedAt: payload.detectedAt || new Date().toISOString(),
    });

    const event: InternalEvent<RiskAlertPayload> = {
      eventId: `evt-risk-alert-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      eventType: 'risk.alert_triggered',
      tenantId: enriched.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: enriched,
    };

    this.broadcastDashboardEvent(enriched.tenantId, 'risk.alert_triggered', enriched, {
      targetUserId: enriched.userId,
    });

    await this.dispatch(event);
    return event;
  }

  /**
   * Publishes an execution.failure event when an order cannot be processed by the gateway.
   */
  public async publishExecutionFailure(params: {
    tenantId: string;
    orderId: string;
    userId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    reason: string;
    failedAt?: string;
  }): Promise<InternalEvent<ExecutionFailurePayload>> {
    const failedAt = params.failedAt || new Date().toISOString();
    const enriched = enrichPayloadWithHierarchy(params.tenantId, {
      tenantId: params.tenantId,
      orderId: params.orderId,
      userId: params.userId,
      symbol: params.symbol,
      side: params.side,
      quantity: params.quantity,
      reason: params.reason,
      failedAt,
    });

    const event: InternalEvent<ExecutionFailurePayload> = {
      eventId: `evt-fail-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      eventType: 'execution.failure',
      tenantId: params.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: enriched,
    };

    this.broadcastDashboardEvent(
      params.tenantId,
      'risk.alert_triggered',
      {
        ...enriched,
        alertType: 'EXECUTION_FAILURE' as const,
        severity: 'HIGH' as const,
        code: 'EXECUTION_FAILURE',
        detectedAt: failedAt,
      },
      { targetUserId: params.userId }
    );

    await this.dispatch(event);
    return event;
  }

  /**
   * Publishes an emergency.control_activated event when an emergency action is executed.
   */
  public async publishEmergencyControl(params: {
    tenantId: string;
    action: string;
    scope: string;
    targetId?: string;
    reason?: string;
    triggeredAt?: string;
  }): Promise<InternalEvent<EmergencyControlPayload>> {
    const event: InternalEvent<EmergencyControlPayload> = {
      eventId: `evt-emg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      eventType: 'emergency.control_activated',
      tenantId: params.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: {
        action: params.action,
        scope: params.scope,
        targetId: params.targetId,
        reason: params.reason,
        triggeredAt: params.triggeredAt || new Date().toISOString(),
      },
    };

    await this.dispatch(event);
    return event;
  }

  /**
   * Publishes a reconciliation.mismatch event when discrepancies are detected.
   */
  public async publishReconciliationMismatch(params: {
    tenantId: string;
    mismatchType: string;
    discrepancyDetails: Record<string, any>;
    detectedAt?: string;
  }): Promise<InternalEvent<ReconciliationMismatchPayload>> {
    const event: InternalEvent<ReconciliationMismatchPayload> = {
      eventId: `evt-recon-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      eventType: 'reconciliation.mismatch',
      tenantId: params.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: {
        tenantId: params.tenantId,
        mismatchType: params.mismatchType,
        discrepancyDetails: params.discrepancyDetails,
        detectedAt: params.detectedAt || new Date().toISOString(),
      },
    };

    await this.dispatch(event);
    return event;
  }

  /**
   * Publishes a client.registered event upon B2C customer registration.
   */
  public async dispatchClientRegistered(
    payload: ClientRegisteredPayload
  ): Promise<InternalEvent<ClientRegisteredPayload>> {
    const enriched = enrichPayloadWithHierarchy(payload.tenantId, payload);
    const event: InternalEvent<ClientRegisteredPayload> = {
      eventId: `evt-client-${payload.userId}-${Date.now()}`,
      eventType: 'client.registered',
      tenantId: enriched.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: enriched,
    };

    this.broadcastDashboardEvent(enriched.tenantId, 'client.registered', enriched, {
      targetUserId: enriched.userId,
    });

    await this.dispatch(event);
    return event;
  }

  /**
   * Publishes a broker.added event whenever a Master, Broker, or Sub-Broker is created.
   */
  public async dispatchBrokerAdded(
    payload: BrokerAddedPayload
  ): Promise<InternalEvent<BrokerAddedPayload>> {
    const enriched = enrichPayloadWithHierarchy(payload.tenantId, payload);
    const event: InternalEvent<BrokerAddedPayload> = {
      eventId: `evt-broker-${payload.id || payload.userId}-${Date.now()}`,
      eventType: 'broker.added',
      tenantId: enriched.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: enriched,
    };

    this.broadcastDashboardEvent(enriched.tenantId, 'broker.added', enriched, {
      adminOnly: true,
    });

    await this.dispatch(event);
    return event;
  }

  /**
   * Publishes a client.activated event upon OTP verification and account activation.
   */
  public async dispatchClientActivated(
    payload: ClientActivatedPayload,
    customEventId?: string
  ): Promise<InternalEvent<ClientActivatedPayload>> {
    const event: InternalEvent<ClientActivatedPayload> = {
      eventId: customEventId || `evt-act-${payload.tradingUserId || payload.userId}-${Date.now()}`,
      eventType: 'client.activated',
      tenantId: payload.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload,
    };

    await this.dispatch(event);
    return event;
  }

  /**
   * Publishes a position.updated event when positions change.
   */
  public async dispatchPositionUpdated(
    payload: PositionUpdatedPayload
  ): Promise<InternalEvent<PositionUpdatedPayload>> {
    const enrichedPayload: PositionUpdatedPayload = {
      ...payload,
      qty: payload.qty ?? Number(payload.quantity),
      avgPrice: payload.avgPrice ?? Number(payload.averagePrice),
      ltp: payload.ltp ?? Number(payload.currentPrice),
    };
    const event: InternalEvent<PositionUpdatedPayload> = {
      eventId: `evt-pos-${payload.positionId}-${Date.now()}`,
      eventType: 'position.updated',
      tenantId: payload.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: enrichedPayload,
    };

    await this.dispatch(event);
    return event;
  }

  /**
   * Publishes a wallet.updated event when balances/margins change.
   */
  public async dispatchWalletUpdated(
    payload: WalletUpdatedPayload
  ): Promise<InternalEvent<WalletUpdatedPayload>> {
    const enrichedPayload: WalletUpdatedPayload = {
      ...payload,
      balance: payload.balance ?? Number((payload.availableBalance + payload.blockedBalance).toFixed(2)),
      available: payload.available ?? Number(payload.availableBalance),
      blocked: payload.blocked ?? Number(payload.blockedBalance),
    };
    const event: InternalEvent<WalletUpdatedPayload> = {
      eventId: `evt-wallet-${payload.userId}-${Date.now()}`,
      eventType: 'wallet.updated',
      tenantId: payload.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: enrichedPayload,
    };

    await this.dispatch(event);
    return event;
  }

  /**
   * Publishes a deposit or withdrawal fund event.
   */
  public async dispatchFundTransaction(
    eventType: InternalEventType,
    payload: FundTransactionPayload
  ): Promise<InternalEvent<FundTransactionPayload>> {
    const enrichedPayload: FundTransactionPayload = enrichPayloadWithHierarchy(payload.tenantId, {
      ...payload,
      id: payload.id || payload.transactionId,
      clientCode: payload.clientCode || payload.userId?.toUpperCase(),
      method: payload.method || payload.paymentMethod || 'BANK_TRANSFER',
      reference: payload.reference || payload.referenceId || payload.transactionId,
      createdAt: payload.createdAt || payload.timestamp,
    });
    const event: InternalEvent<FundTransactionPayload> = {
      eventId: `evt-fund-${payload.transactionId}-${Date.now()}`,
      eventType,
      tenantId: enrichedPayload.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: enrichedPayload,
    };

    this.broadcastDashboardEvent(
      enrichedPayload.tenantId,
      'fund.transaction_updated',
      enrichedPayload,
      { targetUserId: enrichedPayload.userId }
    );

    await this.dispatch(event);
    return event;
  }

  /**
   * Publishes a ledger.updated event whenever an immutable ledger entry or balance update commits.
   */
  public async dispatchLedgerUpdated(
    payload: LedgerUpdatedPayload
  ): Promise<InternalEvent<LedgerUpdatedPayload>> {
    const enriched = enrichPayloadWithHierarchy(payload.tenantId, {
      ...payload,
      timestamp: payload.timestamp || new Date().toISOString(),
    });
    const event: InternalEvent<LedgerUpdatedPayload> = {
      eventId: `evt-ledger-${payload.transactionId || payload.userId}-${Date.now()}`,
      eventType: 'ledger.updated',
      tenantId: enriched.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: enriched,
    };

    this.broadcastDashboardEvent(enriched.tenantId, 'ledger.updated', enriched, {
      targetUserId: enriched.userId,
    });

    await this.dispatch(event);
    return event;
  }

  /**
   * Publishes a kyc.submitted event upon client KYC verification submission.
   */
  public async dispatchKycSubmitted(
    payload: KycSubmittedPayload
  ): Promise<InternalEvent<KycSubmittedPayload>> {
    const event: InternalEvent<KycSubmittedPayload> = {
      eventId: `evt-kyc-${payload.userId}-${Date.now()}`,
      eventType: 'kyc.submitted',
      tenantId: payload.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload,
    };

    await this.dispatch(event);
    return event;
  }

  /**
   * Publishes a support.ticket_created event.
   */
  public async dispatchSupportTicketCreated(
    payload: SupportTicketPayload
  ): Promise<InternalEvent<SupportTicketPayload>> {
    const event: InternalEvent<SupportTicketPayload> = {
      eventId: `evt-ticket-${payload.ticketId}-${Date.now()}`,
      eventType: 'support.ticket_created',
      tenantId: payload.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload,
    };

    await this.dispatch(event);
    return event;
  }

  /**
   * Publishes a support.ticket_updated event.
   */
  public async dispatchSupportTicketUpdated(
    payload: SupportTicketPayload
  ): Promise<InternalEvent<SupportTicketPayload>> {
    const event: InternalEvent<SupportTicketPayload> = {
      eventId: `evt-ticket-upd-${payload.ticketId}-${Date.now()}`,
      eventType: 'support.ticket_updated',
      tenantId: payload.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload,
    };

    await this.dispatch(event);
    return event;
  }

  /**
   * Resets active margin breach deduplication tracker (for testing).
   */
  public resetMarginBreachTracking(): void {
    this.activeMarginBreaches.clear();
  }

  /**
   * Drains all pending events currently ready in queue.
   */
  public async drainQueue(): Promise<{ attempted: number; succeeded: number }> {
    const pending = this.queue.getPending();
    let succeeded = 0;

    for (const item of pending) {
      const ok = await this.attemptDelivery(item.eventId);
      if (ok) succeeded += 1;
    }

    return { attempted: pending.length, succeeded };
  }

  /**
   * Returns current health and queue metrics.
   */
  public getHealth(): DispatcherHealthMetrics {
    const stats = this.queue.getStats();
    return {
      queueSize: stats.queueSize,
      pendingEvents: stats.pendingEvents,
      failedEvents: stats.failedEvents,
      deadLetterEvents: stats.deadLetterEvents,
      circuitState: this.circuitBreaker.getState(),
      lastSuccessfulDelivery: this.lastSuccessfulDelivery,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Clears queue and resets circuit breaker state (for testing).
   */
  public reset(): void {
    this.queue.clear();
    this.circuitBreaker.reset();
    this.lastSuccessfulDelivery = null;
    this.activeMarginBreaches.clear();
  }
}

export const internalEventDispatcher = new InternalEventDispatcher();
