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
  BrokerAddedPayload,
  ClientActivatedPayload,
  PositionUpdatedPayload,
  WalletUpdatedPayload,
  FundTransactionPayload,
  LedgerUpdatedPayload,
  MarginBreachPayload,
  RiskAlertTriggeredPayload,
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
import { db } from '../db/database.ts';

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
    role?: string;
  }>();

  public registerSseClient(
    res: any,
    filter?: { tenantId?: string; userId?: string; role?: string }
  ): () => void {
    const client = { res, tenantId: filter?.tenantId, userId: filter?.userId, role: filter?.role };
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
    filter?: { tenantId?: string; userId?: string }
  ): void {
    const data = JSON.stringify(payload);
    const message = `event: ${event}\ndata: ${data}\n\n`;

    this.sseClients.forEach((client) => {
      const isPrivileged = client.role && ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER', 'ADMIN'].includes(client.role);
      if (filter?.tenantId && client.tenantId && client.tenantId !== filter.tenantId && client.tenantId !== 'global' && client.tenantId !== 'vertex-default') {
        if (!isPrivileged) return;
      }
      if (filter?.userId && client.userId && client.userId !== filter.userId) {
        if (!isPrivileged) return;
      }
      try {
        client.res.write(message);
      } catch {
        this.sseClients.delete(client);
      }
    });
  }

  public broadcastRealtimeEvent(
    event: string,
    payload: any,
    tenantId?: string,
    recipientFilter?: (client: any) => boolean
  ): void {
    const tId = tenantId || payload?.tenantId || 'TNT-001';

    // 1. Broadcast over WebSocket
    try {
      if (tId === 'global' || !tId) {
        tradingWebSocketServer.broadcastToAll(event, payload);
      } else {
        const isPrivileged = (role: string) => ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER', 'ADMIN'].includes(role);
        tradingWebSocketServer.broadcastToTenant(
          tId,
          event,
          payload,
          recipientFilter || ((client: any) => {
            if (isPrivileged(client.role)) return true;
            if (payload.userId && client.userId === payload.userId) return true;
            if (payload.tradingUserId && client.userId === payload.tradingUserId) return true;
            return false;
          }),
          false
        );
      }
    } catch (wsErr: any) {
      console.warn('[InternalEventDispatcher] WebSocket broadcast notice:', wsErr.message);
    }

    // 2. Broadcast over Server-Sent Events (SSE)
    try {
      this.broadcastSse(event, payload, { tenantId: tId, userId: payload?.userId || payload?.tradingUserId });
    } catch (sseErr: any) {
      console.warn('[InternalEventDispatcher] SSE broadcast notice:', sseErr.message);
    }
  }

  public resolveHierarchy(entity: any): {
    masterId: string | null;
    brokerId: string | null;
    subBrokerId: string | null;
  } {
    if (!entity) return { masterId: null, brokerId: null, subBrokerId: null };
    let masterId: string | null = entity.masterId || entity.master_id || null;
    let brokerId: string | null = entity.brokerId || entity.broker_id || null;
    let subBrokerId: string | null = entity.subBrokerId || entity.sub_broker_id || null;

    const uid = entity.user_id || entity.userId || entity.trading_user_id || entity.tradingUserId;
    if (uid && (!masterId || !brokerId || !subBrokerId)) {
      try {
        const user = db.findUserByUserId(uid) || db.findUserById(uid);
        if (user) {
          if (!brokerId && user.broker_id) brokerId = user.broker_id;
          if (!subBrokerId && (user as any).sub_broker_id) subBrokerId = (user as any).sub_broker_id;
          if (!masterId && (user as any).master_id) masterId = (user as any).master_id;

          const path = user.hierarchy_path || '';
          if (path && path.startsWith('root.')) {
            const parts = path.split('.');
            if (!masterId && parts.length >= 2 && parts[1] !== user.user_id) {
              masterId = parts[1];
            }
            if (!brokerId && parts.length >= 3 && parts[2] !== user.user_id) {
              brokerId = parts[2];
            }
            if (!subBrokerId && parts.length >= 4 && parts[3] !== user.user_id) {
              subBrokerId = parts[3];
            }
          }
          if (user.parent_id && (!masterId || !brokerId)) {
            const parent = db.findUserById(user.parent_id) || db.findUserByUserId(user.parent_id);
            if (parent) {
              if (parent.role === 'SUB_BROKER') {
                if (!subBrokerId) subBrokerId = parent.id;
                if (parent.parent_id) {
                  const brk = db.findUserById(parent.parent_id) || db.findUserByUserId(parent.parent_id);
                  if (brk) {
                    if (!brokerId) brokerId = brk.id;
                    if (!masterId && brk.parent_id) masterId = brk.parent_id;
                  }
                }
              } else if (parent.role === 'BROKER') {
                if (!brokerId) brokerId = parent.id;
                if (!masterId && parent.parent_id) masterId = parent.parent_id;
              } else if (parent.role === 'MASTER') {
                if (!masterId) masterId = parent.id;
              }
            }
          }
        }
      } catch {}
    }
    return { masterId, brokerId, subBrokerId };
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
   * Emits over WebSocket & SSE immediately, enqueues locally, persists to outbox, and sends to Central Admin.
   */
  public async dispatch<T = any>(event: InternalEvent<T>): Promise<void> {
    // 0. Instant real-time broadcast over /ws and SSE
    this.broadcastRealtimeEvent(event.eventType, event.payload, event.tenantId);

    // 1. Enqueue locally first
    this.queue.enqueue(event);

    // 2. Persist to transactional outbox (PostgreSQL) asynchronously
    transactionalOutboxService
      .enqueue({
        eventId: event.eventId,
        tenantId: event.tenantId,
        eventType: event.eventType,
        payload: event.payload,
        skipBroadcast: true, // Already broadcast above
      })
      .catch((err) => {
        console.warn('[InternalEventDispatcher] Outbox persistence warning:', err);
      });

    // 3. Attempt delivery asynchronously (non-blocking)
    setImmediate(() => {
      this.attemptDelivery(event.eventId).catch((err) => {
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
   * Authoritative operational details with hierarchy links (tenantId, masterId, brokerId, subBrokerId).
   */
  public async dispatchTradeExecuted(
    params: TradeExecutedPayload & { tenantId: string }
  ): Promise<InternalEvent<TradeExecutedPayload>> {
    const tradeId = params.tradeId || `TRD-${Date.now()}`;
    const qty = Number(params.quantity);
    const price = Number(params.executionPrice);
    const val = Number(params.executionValue ?? params.totalValue ?? (qty * price));
    const h = this.resolveHierarchy(params);

    const payload: TradeExecutedPayload = {
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
      masterId: params.masterId ?? h.masterId,
      brokerId: params.brokerId ?? h.brokerId,
      subBrokerId: params.subBrokerId ?? h.subBrokerId,
      master_id: params.master_id ?? params.masterId ?? h.masterId,
      broker_id: params.broker_id ?? params.brokerId ?? h.brokerId,
      sub_broker_id: params.sub_broker_id ?? params.subBrokerId ?? h.subBrokerId,
    };

    const event: InternalEvent<TradeExecutedPayload> = {
      eventId: `evt-trade-${tradeId}`,
      eventType: 'trade.executed',
      tenantId: params.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload,
    };

    await this.dispatch(event);
    return event;
  }

  /**
   * Helper: Dispatches a Ledger Updated event.
   * Authoritative balance and transaction recalculation trigger with hierarchy links.
   */
  public async dispatchLedgerUpdated(
    payload: LedgerUpdatedPayload
  ): Promise<InternalEvent<LedgerUpdatedPayload>> {
    const h = this.resolveHierarchy(payload);
    const enrichedPayload: LedgerUpdatedPayload = {
      ...payload,
      id: payload.id || payload.ledgerId || `led-${Date.now()}`,
      ledgerId: payload.ledgerId || payload.id || `led-${Date.now()}`,
      masterId: payload.masterId ?? h.masterId,
      brokerId: payload.brokerId ?? h.brokerId,
      subBrokerId: payload.subBrokerId ?? h.subBrokerId,
      master_id: payload.master_id ?? payload.masterId ?? h.masterId,
      broker_id: payload.broker_id ?? payload.brokerId ?? h.brokerId,
      sub_broker_id: payload.sub_broker_id ?? payload.subBrokerId ?? h.subBrokerId,
      balance_before: payload.balance_before ?? payload.balanceBefore,
      balance_after: payload.balance_after ?? payload.balanceAfter,
      createdAt: payload.createdAt || new Date().toISOString(),
      timestamp: payload.timestamp || new Date().toISOString(),
    };

    const event: InternalEvent<LedgerUpdatedPayload> = {
      eventId: `evt-led-${enrichedPayload.id}-${Date.now()}`,
      eventType: 'ledger.updated',
      tenantId: payload.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: enrichedPayload,
    };

    await this.dispatch(event);
    return event;
  }

  /**
   * Helper: Dispatches a Risk Alert event for margin shortfalls or blocked orders.
   * Carries tenantId, masterId, brokerId, and subBrokerId for hierarchical filtering.
   */
  public async dispatchRiskAlert(params: {
    tenantId: string;
    userId: string;
    alertType: 'MARGIN_SHORTFALL' | 'BLOCKED_ORDER' | 'LIMIT_BREACH' | 'ORDER_EXECUTION_FAILURE' | string;
    severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    message: string;
    requiredMargin?: number;
    availableMargin?: number;
    shortfall?: number;
    exposure?: number;
    usedMargin?: number;
    orderId?: string;
    symbol?: string;
    details?: any;
    masterId?: string | null;
    brokerId?: string | null;
    subBrokerId?: string | null;
  }): Promise<InternalEvent<RiskAlertTriggeredPayload>> {
    const h = this.resolveHierarchy(params);
    const alertId = `risk-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const payload: RiskAlertTriggeredPayload = {
      alertId,
      tenantId: params.tenantId,
      masterId: params.masterId ?? h.masterId,
      brokerId: params.brokerId ?? h.brokerId,
      subBrokerId: params.subBrokerId ?? h.subBrokerId,
      master_id: params.masterId ?? h.masterId,
      broker_id: params.brokerId ?? h.brokerId,
      sub_broker_id: params.subBrokerId ?? h.subBrokerId,
      userId: params.userId,
      clientId: params.userId,
      tradingUserId: params.userId,
      alertType: params.alertType,
      type: params.alertType,
      severity: params.severity || 'HIGH',
      message: params.message,
      requiredMargin: params.requiredMargin,
      availableMargin: params.availableMargin,
      shortfall: params.shortfall,
      exposure: params.exposure,
      usedMargin: params.usedMargin,
      orderId: params.orderId,
      symbol: params.symbol,
      details: params.details,
      timestamp: new Date().toISOString(),
    };

    const event: InternalEvent<RiskAlertTriggeredPayload> = {
      eventId: alertId,
      eventType: 'risk.alert_triggered',
      tenantId: params.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload,
    };

    await this.dispatch(event);
    return event;
  }

  /**
   * Helper: Dispatches a Margin Breach event with state tracking & deduplication.
   * If the breach state is unchanged within cooldown window (60s), suppresses duplicate.
   * Also triggers authoritative risk.alert_triggered event.
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
    reason?: string;
    masterId?: string | null;
    brokerId?: string | null;
    subBrokerId?: string | null;
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

    const h = this.resolveHierarchy(params);
    const payload: any = {
      userId: params.userId,
      clientId: params.userId,
      tradingUserId: params.userId,
      usedMargin: params.usedMargin,
      availableMargin: params.availableMargin,
      exposure: params.exposure,
      threshold: params.threshold ?? 0.8,
      detectedAt: params.detectedAt || new Date().toISOString(),
      tenantId: params.tenantId,
      masterId: params.masterId ?? h.masterId,
      brokerId: params.brokerId ?? h.brokerId,
      subBrokerId: params.subBrokerId ?? h.subBrokerId,
      master_id: params.masterId ?? h.masterId,
      broker_id: params.brokerId ?? h.brokerId,
      sub_broker_id: params.subBrokerId ?? h.subBrokerId,
    };

    const event: InternalEvent<MarginBreachPayload> = {
      eventId: `evt-risk-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      eventType: 'risk.margin_breach',
      tenantId: params.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload,
    };

    await this.dispatch(event);

    // Also trigger distinct risk.alert_triggered event
    await this.dispatchRiskAlert({
      tenantId: params.tenantId,
      userId: params.userId,
      alertType: 'MARGIN_SHORTFALL',
      severity: 'HIGH',
      message: params.reason || `Margin shortfall detected for client ${params.userId}: used ₹${params.usedMargin}, available ₹${params.availableMargin}.`,
      requiredMargin: params.usedMargin,
      availableMargin: params.availableMargin,
      exposure: params.exposure,
      usedMargin: params.usedMargin,
      masterId: params.masterId ?? h.masterId,
      brokerId: params.brokerId ?? h.brokerId,
      subBrokerId: params.subBrokerId ?? h.subBrokerId,
    }).catch(() => {});

    return event;
  }

  /**
   * Publishes an execution.failure and risk.alert_triggered event when an order cannot be processed.
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
    masterId?: string | null;
    brokerId?: string | null;
    subBrokerId?: string | null;
  }): Promise<InternalEvent<ExecutionFailurePayload>> {
    const h = this.resolveHierarchy(params);
    const event: InternalEvent<ExecutionFailurePayload> = {
      eventId: `evt-fail-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      eventType: 'execution.failure',
      tenantId: params.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: {
        orderId: params.orderId,
        userId: params.userId,
        symbol: params.symbol,
        side: params.side,
        quantity: params.quantity,
        reason: params.reason,
        failedAt: params.failedAt || new Date().toISOString(),
        masterId: params.masterId ?? h.masterId,
        brokerId: params.brokerId ?? h.brokerId,
        subBrokerId: params.subBrokerId ?? h.subBrokerId,
        master_id: params.masterId ?? h.masterId,
        broker_id: params.brokerId ?? h.brokerId,
        sub_broker_id: params.subBrokerId ?? h.subBrokerId,
      } as any,
    };

    await this.dispatch(event);

    // Also dispatch risk.alert_triggered for blocked order / failure
    await this.dispatchRiskAlert({
      tenantId: params.tenantId,
      userId: params.userId,
      orderId: params.orderId,
      symbol: params.symbol,
      alertType: 'BLOCKED_ORDER',
      severity: 'HIGH',
      message: `Order ${params.orderId} for ${params.symbol} failed: ${params.reason}`,
      masterId: params.masterId ?? h.masterId,
      brokerId: params.brokerId ?? h.brokerId,
      subBrokerId: params.subBrokerId ?? h.subBrokerId,
      details: { side: params.side, quantity: params.quantity },
    }).catch(() => {});

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
   * Publishes a client.registered event upon B2C customer registration or admin provisioning.
   */
  public async dispatchClientRegistered(
    payload: ClientRegisteredPayload
  ): Promise<InternalEvent<ClientRegisteredPayload>> {
    const h = this.resolveHierarchy(payload);
    const enrichedPayload: ClientRegisteredPayload = {
      ...payload,
      masterId: payload.masterId ?? h.masterId,
      brokerId: payload.brokerId ?? h.brokerId,
      subBrokerId: payload.subBrokerId ?? h.subBrokerId,
      master_id: payload.master_id ?? payload.masterId ?? h.masterId,
      broker_id: payload.broker_id ?? payload.brokerId ?? h.brokerId,
      sub_broker_id: payload.sub_broker_id ?? payload.subBrokerId ?? h.subBrokerId,
    };

    const event: InternalEvent<ClientRegisteredPayload> = {
      eventId: `evt-client-${payload.userId}-${Date.now()}`,
      eventType: 'client.registered',
      tenantId: payload.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: enrichedPayload,
    };

    await this.dispatch(event);
    return event;
  }

  /**
   * Publishes a broker.added event whenever a Master, Broker, or Sub-Broker is created.
   */
  public async dispatchBrokerAdded(
    payload: BrokerAddedPayload
  ): Promise<InternalEvent<BrokerAddedPayload>> {
    const h = this.resolveHierarchy(payload);
    const enrichedPayload: BrokerAddedPayload = {
      ...payload,
      masterId: payload.masterId ?? h.masterId,
      brokerId: payload.brokerId ?? h.brokerId,
      subBrokerId: payload.subBrokerId ?? h.subBrokerId,
      master_id: payload.master_id ?? payload.masterId ?? h.masterId,
      broker_id: payload.broker_id ?? payload.brokerId ?? h.brokerId,
      sub_broker_id: payload.sub_broker_id ?? payload.subBrokerId ?? h.subBrokerId,
    };

    const event: InternalEvent<BrokerAddedPayload> = {
      eventId: `evt-broker-${payload.id}-${Date.now()}`,
      eventType: 'broker.added',
      tenantId: payload.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: enrichedPayload,
    };

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
    const h = this.resolveHierarchy(payload);
    const enrichedPayload: ClientActivatedPayload = {
      ...payload,
      masterId: payload.masterId ?? h.masterId,
      brokerId: payload.brokerId ?? h.brokerId,
      subBrokerId: payload.subBrokerId ?? h.subBrokerId,
      master_id: payload.master_id ?? payload.masterId ?? h.masterId,
      broker_id: payload.broker_id ?? payload.brokerId ?? h.brokerId,
      sub_broker_id: payload.sub_broker_id ?? payload.subBrokerId ?? h.subBrokerId,
    };

    const event: InternalEvent<ClientActivatedPayload> = {
      eventId: customEventId || `evt-act-${payload.tradingUserId || payload.userId}-${Date.now()}`,
      eventType: 'client.activated',
      tenantId: payload.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: enrichedPayload,
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
    const h = this.resolveHierarchy(payload);
    const enrichedPayload: PositionUpdatedPayload = {
      ...payload,
      qty: payload.qty ?? Number(payload.quantity),
      avgPrice: payload.avgPrice ?? Number(payload.averagePrice),
      ltp: payload.ltp ?? Number(payload.currentPrice),
      masterId: (payload as any).masterId ?? h.masterId,
      brokerId: (payload as any).brokerId ?? h.brokerId,
      subBrokerId: (payload as any).subBrokerId ?? h.subBrokerId,
      master_id: (payload as any).master_id ?? (payload as any).masterId ?? h.masterId,
      broker_id: (payload as any).broker_id ?? (payload as any).brokerId ?? h.brokerId,
      sub_broker_id: (payload as any).sub_broker_id ?? (payload as any).subBrokerId ?? h.subBrokerId,
    } as any;

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
    const h = this.resolveHierarchy(payload);
    const enrichedPayload: WalletUpdatedPayload = {
      ...payload,
      balance: payload.balance ?? Number((payload.availableBalance + payload.blockedBalance).toFixed(2)),
      available: payload.available ?? Number(payload.availableBalance),
      blocked: payload.blocked ?? Number(payload.blockedBalance),
      masterId: (payload as any).masterId ?? h.masterId,
      brokerId: (payload as any).brokerId ?? h.brokerId,
      subBrokerId: (payload as any).subBrokerId ?? h.subBrokerId,
      master_id: (payload as any).master_id ?? (payload as any).masterId ?? h.masterId,
      broker_id: (payload as any).broker_id ?? (payload as any).brokerId ?? h.brokerId,
      sub_broker_id: (payload as any).sub_broker_id ?? (payload as any).subBrokerId ?? h.subBrokerId,
    } as any;

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
   * Authoritatively emits both the specific event and fund.transaction_updated with hierarchy links.
   */
  public async dispatchFundTransaction(
    eventType: InternalEventType,
    payload: FundTransactionPayload
  ): Promise<InternalEvent<FundTransactionPayload>> {
    const h = this.resolveHierarchy(payload);
    const enrichedPayload: FundTransactionPayload = {
      ...payload,
      id: payload.id || payload.transactionId,
      clientCode: payload.clientCode || payload.userId?.toUpperCase(),
      method: payload.method || payload.paymentMethod || 'BANK_TRANSFER',
      reference: payload.reference || payload.referenceId || payload.transactionId,
      createdAt: payload.createdAt || payload.timestamp,
      masterId: payload.masterId ?? h.masterId,
      brokerId: payload.brokerId ?? h.brokerId,
      subBrokerId: payload.subBrokerId ?? h.subBrokerId,
      master_id: payload.master_id ?? payload.masterId ?? h.masterId,
      broker_id: payload.broker_id ?? payload.brokerId ?? h.brokerId,
      sub_broker_id: payload.sub_broker_id ?? payload.subBrokerId ?? h.subBrokerId,
    };

    const event: InternalEvent<FundTransactionPayload> = {
      eventId: `evt-fund-${payload.transactionId}-${Date.now()}`,
      eventType,
      tenantId: payload.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: enrichedPayload,
    };

    await this.dispatch(event);

    // Also emit fund.transaction_updated whenever a deposit or withdrawal is created, approved, or rejected
    if (eventType !== 'fund.transaction_updated') {
      const txUpdatedPayload: FundTransactionPayload = {
        ...enrichedPayload,
        action: eventType.includes('approved') ? 'APPROVED' : eventType.includes('rejected') ? 'REJECTED' : 'REQUESTED',
      };
      const txUpdatedEvent: InternalEvent<FundTransactionPayload> = {
        eventId: `evt-fundtx-${payload.transactionId}-${Date.now()}`,
        eventType: 'fund.transaction_updated',
        tenantId: payload.tenantId,
        timestamp: new Date().toISOString(),
        version: 1,
        payload: txUpdatedPayload,
      };
      await this.dispatch(txUpdatedEvent);
    }

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
