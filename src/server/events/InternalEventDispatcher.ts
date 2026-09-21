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
  MarginBreachPayload,
  ExecutionFailurePayload,
  EmergencyControlPayload,
  ReconciliationMismatchPayload,
} from './types.ts';
import { IEventQueue, eventQueue as defaultEventQueue, QueuedEvent } from './EventQueue.ts';
import { CircuitBreaker } from './CircuitBreaker.ts';
import {
  CentralAdminEventClient,
  centralAdminEventClient as defaultClient,
} from './CentralAdminEventClient.ts';
import { auditService } from '../services/auditService.ts';

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

  /**
   * Dispatches an event asynchronously.
   * Enqueues immediately and attempts delivery without blocking caller or failing caller.
   */
  public async dispatch<T = any>(event: InternalEvent<T>): Promise<void> {
    // 1. Enqueue locally first
    this.queue.enqueue(event);

    // 2. Attempt delivery asynchronously (non-blocking)
    // Run attempt in next tick so caller function returns immediately
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
   * Only required operational details are included; no secrets or tokens.
   */
  public async dispatchTradeExecuted(params: {
    tenantId: string;
    orderId: string;
    userId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    executionPrice: number;
    executedAt?: string;
  }): Promise<InternalEvent<TradeExecutedPayload>> {
    const event: InternalEvent<TradeExecutedPayload> = {
      eventId: `evt-trade-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      eventType: 'trade.executed',
      tenantId: params.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: {
        orderId: params.orderId,
        userId: params.userId,
        symbol: params.symbol,
        side: params.side,
        quantity: params.quantity,
        executionPrice: params.executionPrice,
        executedAt: params.executedAt || new Date().toISOString(),
      },
    };

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

    const event: InternalEvent<MarginBreachPayload> = {
      eventId: `evt-risk-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      eventType: 'risk.margin_breach',
      tenantId: params.tenantId,
      timestamp: new Date().toISOString(),
      version: 1,
      payload: {
        userId: params.userId,
        usedMargin: params.usedMargin,
        availableMargin: params.availableMargin,
        exposure: params.exposure,
        threshold: params.threshold ?? 0.8,
        detectedAt: params.detectedAt || new Date().toISOString(),
      },
    };

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
      },
    };

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
