import crypto from 'crypto';
import { pgDb, DbClient } from '../db/postgres.ts';
import {
  postgresOutboxRepository,
  OutboxEventRecord,
} from '../repositories/trading/PostgresOutboxRepository.ts';
import { CentralAdminEventClient, centralAdminEventClient } from '../events/CentralAdminEventClient.ts';
import { CircuitBreaker } from '../events/CircuitBreaker.ts';
import { InternalEvent } from '../events/types.ts';
import { auditService } from './auditService.ts';

export interface OutboxServiceOptions {
  client?: CentralAdminEventClient;
  circuitBreaker?: CircuitBreaker;
  pollIntervalMs?: number;
  batchSize?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export class TransactionalOutboxService {
  private client: CentralAdminEventClient;
  private circuitBreaker: CircuitBreaker;
  private pollIntervalMs: number;
  private batchSize: number;
  private baseDelayMs: number;
  private maxDelayMs: number;
  private workerTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(options: OutboxServiceOptions = {}) {
    this.client = options.client || centralAdminEventClient;
    this.circuitBreaker = options.circuitBreaker || new CircuitBreaker();
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.batchSize = options.batchSize ?? 20;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.maxDelayMs = options.maxDelayMs ?? 60000;
  }

  /**
   * Enqueues an event within an active PostgreSQL ACID transaction.
   * This guarantees that the event is committed if and only if the trade commits.
   */
  public async enqueue(
    event: {
      eventId?: string;
      tenantId: string;
      eventType: string;
      payload: any;
      maxAttempts?: number;
    },
    client?: DbClient
  ): Promise<OutboxEventRecord> {
    const id = `outbox-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const eventId = event.eventId || `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    return await postgresOutboxRepository.insert(
      {
        id,
        event_id: eventId,
        tenant_id: event.tenantId,
        event_type: event.eventType,
        payload: event.payload,
        max_attempts: event.maxAttempts ?? 5,
      },
      client
    );
  }

  /**
   * Starts the asynchronous outbox dispatcher background worker.
   */
  public startWorker(): void {
    if (this.workerTimer) return;

    // Run crash recovery on stale processing events from previous crashed processes
    this.recoverZombieEvents().catch((err) => {
      console.warn('[TransactionalOutbox] Stale processing recovery notice:', err.message);
    });

    // Reset failed and dead-letter events so they re-attempt delivery to Central Admin
    this.resetFailedAndDeadLetterEvents().catch((err) => {
      console.warn('[TransactionalOutbox] Reset dead-letter recovery notice:', err.message);
    });

    this.workerTimer = setInterval(() => {
      this.processBatch().catch((err) => {
        console.error('[TransactionalOutbox] Unhandled batch error:', err.message);
      });
    }, this.pollIntervalMs);

    console.log('[TransactionalOutbox] Outbox background worker started');
  }

  /**
   * Resets any FAILED or DEAD_LETTER outbox events to PENDING with next_attempt_at = NOW()
   * so they are immediately picked up by the outbox dispatcher.
   */
  public async resetFailedAndDeadLetterEvents(): Promise<number> {
    try {
      const res = await pgDb.query(`
        UPDATE trading_outbox
        SET status = 'PENDING',
            attempt_count = 0,
            next_attempt_at = NOW()
        WHERE status IN ('FAILED', 'DEAD_LETTER')
        RETURNING id;
      `);
      const count = res.rowCount || 0;
      if (count > 0) {
        console.log(`[TransactionalOutbox] Reset ${count} failed/dead-letter outbox events back to PENDING`);
      }
      return count;
    } catch (err: any) {
      console.warn('[TransactionalOutbox] Reset failed events notice:', err.message);
      return 0;
    }
  }

  /**
   * Pushes all current clients, orders, and positions to Central Admin.
   * Ensures that live trading data is synced to https://admin-dashbord-wxcq.onrender.com.
   */
  public async syncAllCurrentDataToCentralAdmin(
    targetTenantId = 'TNT-001'
  ): Promise<{ clientsCount: number; ordersCount: number; positionsCount: number }> {
    let clientsCount = 0;
    let ordersCount = 0;
    let positionsCount = 0;

    try {
      // 1. Reset any previously failed/dead-letter events first
      await this.resetFailedAndDeadLetterEvents();

      // 2. Sync Users / Clients
      const { db } = await import('../db/database.ts');
      const allUsers = db.getAllUsers();
      for (const u of allUsers) {
        if (u.role === 'CLIENT' || !u.role) {
          clientsCount++;
          const tId = u.tenant_id && u.tenant_id !== 'vertex-default' && u.tenant_id !== 'default' ? u.tenant_id : targetTenantId;
          const clientPayload = {
            tenantId: tId,
            tradingUserId: u.user_id,
            userId: u.user_id,
            clientId: u.id || u.user_id,
            clientCode: u.user_id.toUpperCase(),
            name: u.full_name,
            fullName: u.full_name,
            email: u.email || '',
            phone: u.phone_e164 || u.mobile || '',
            status: u.status || 'ACTIVE',
            accountStatus: u.status || 'ACTIVE',
            kycStatus: u.is_verified ? 'VERIFIED' : 'PENDING',
            createdAt: u.created_at || new Date().toISOString(),
          };

          await this.enqueue({
            eventId: `sync-reg-${u.user_id}`,
            eventType: 'client.registered',
            tenantId: tId,
            payload: clientPayload,
          }).catch(() => {});

          await this.enqueue({
            eventId: `sync-act-${u.user_id}`,
            eventType: 'client.activated',
            tenantId: tId,
            payload: { ...clientPayload, clientId: u.id || u.user_id },
          }).catch(() => {});
        }
      }

      // 3. Sync Orders
      const { postgresOrderRepository } = await import('../repositories/trading/PostgresOrderRepository.ts');
      const orders = await postgresOrderRepository.getOrders(targetTenantId);
      const fallbackOrders = await postgresOrderRepository.getOrders('vertex-default');
      const allOrders = [...orders];
      const seenOrderIds = new Set(orders.map((o) => o.id));
      for (const fo of fallbackOrders) {
        if (!seenOrderIds.has(fo.id)) {
          seenOrderIds.add(fo.id);
          allOrders.push(fo);
        }
      }

      for (const o of allOrders) {
        ordersCount++;
        await this.enqueue({
          eventId: `sync-ord-${o.id}`,
          eventType: 'order.created',
          tenantId: targetTenantId,
          payload: {
            tenantId: targetTenantId,
            orderId: o.id,
            userId: o.user_id,
            symbol: o.instrument_id,
            instrumentId: o.instrument_id,
            side: o.side,
            orderType: o.order_type,
            quantity: o.quantity,
            price: o.price,
            status: o.status,
            filledQuantity: o.filled_quantity,
            averagePrice: o.average_fill_price,
            createdAt: o.created_at,
          },
        }).catch(() => {});
      }

      // 4. Sync Positions
      const { postgresPositionRepository } = await import('../repositories/trading/PostgresPositionRepository.ts');
      const positions = await postgresPositionRepository.getPositions(targetTenantId);
      const fallbackPositions = await postgresPositionRepository.getPositions('vertex-default');
      const allPositions = [...positions];
      const seenPosIds = new Set(positions.map((p) => p.id));
      for (const fp of fallbackPositions) {
        if (!seenPosIds.has(fp.id)) {
          seenPosIds.add(fp.id);
          allPositions.push(fp);
        }
      }

      for (const p of allPositions) {
        positionsCount++;
        await this.enqueue({
          eventId: `sync-pos-${p.id}`,
          eventType: 'position.updated',
          tenantId: targetTenantId,
          payload: {
            tenantId: targetTenantId,
            positionId: p.id,
            userId: p.user_id,
            symbol: p.instrument_id,
            instrumentId: p.instrument_id,
            quantity: p.quantity,
            averagePrice: p.average_price,
            realizedPnl: p.realized_pnl,
            unrealizedPnl: p.unrealized_pnl,
            marginUsed: p.margin_used,
            updatedAt: p.updated_at,
          },
        }).catch(() => {});
      }

      // 5. Immediately trigger batch dispatch
      this.processBatch(50).catch((err) => {
        console.warn('[TransactionalOutbox] Immediate sync batch notice:', err.message);
      });

      console.log(`[TransactionalOutbox] Startup sync queued: ${clientsCount} clients, ${ordersCount} orders, ${positionsCount} positions to Central Admin.`);
    } catch (err: any) {
      console.warn('[TransactionalOutbox] syncAllCurrentDataToCentralAdmin notice:', err.message);
    }

    return { clientsCount, ordersCount, positionsCount };
  }

  /**
   * Recovers zombie events stuck in PROCESSING state due to node crash.
   */
  public async recoverZombieEvents(staleThresholdMinutes = 5): Promise<number> {
    const recovered = await postgresOutboxRepository.recoverStaleProcessing(staleThresholdMinutes);
    if (recovered > 0) {
      console.log(`[TransactionalOutbox] Recovered ${recovered} zombie processing outbox events back to PENDING`);
    }
    return recovered;
  }

  /**
   * Admin recovery tool to reprocess a dead-lettered outbox event.
   */
  public async reprocessDeadLetter(eventId: string): Promise<boolean> {
    return await postgresOutboxRepository.reprocessDeadLetter(eventId);
  }

  /**
   * Stops the asynchronous outbox dispatcher worker.
   */
  public stopWorker(): void {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
  }

  public isWorkerRunning(): boolean {
    return this.workerTimer !== null;
  }

  /**
   * Processes a batch of pending events.
   * Multiple instances can run concurrently due to FOR UPDATE SKIP LOCKED.
   */
  public async processBatch(batchLimit = this.batchSize): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    deadLettered: number;
  }> {
    if (this.isProcessing) {
      return { processed: 0, succeeded: 0, failed: 0, deadLettered: 0 };
    }

    this.isProcessing = true;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let deadLettered = 0;

    try {
      // Check circuit breaker first
      if (!this.circuitBreaker.canExecute()) {
        return { processed: 0, succeeded: 0, failed: 0, deadLettered: 0 };
      }

      const pendingEvents = await postgresOutboxRepository.fetchPendingBatch(batchLimit);
      processed = pendingEvents.length;

      for (const record of pendingEvents) {
        if (!this.circuitBreaker.canExecute()) {
          break; // Stop processing batch if circuit opens
        }

        const success = await this.deliverRecord(record);
        if (success) {
          succeeded++;
        } else {
          failed++;
          const current = await postgresOutboxRepository.findById(record.id);
          if (current?.status === 'DEAD_LETTER') {
            deadLettered++;
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return { processed, succeeded, failed, deadLettered };
  }

  /**
   * Delivers a single outbox record with circuit breaker protection,
   * exponential backoff, and dead-letter state transitions.
   */
  public async deliverRecord(record: OutboxEventRecord): Promise<boolean> {
    await postgresOutboxRepository.markProcessing(record.id);

    const internalEvent: InternalEvent = {
      eventId: record.event_id,
      eventType: record.event_type as any,
      tenantId: record.tenant_id,
      timestamp: record.created_at,
      version: 1,
      payload: record.payload,
    };

    try {
      const response = await this.client.sendEvent(internalEvent);

      if (response.success || response.data?.alreadyProcessed === true) {
        this.circuitBreaker.recordSuccess();
        await postgresOutboxRepository.markCompleted(record.id);

        auditService.logEmergencyEvent({
          action: 'OUTBOX_DELIVERY_SUCCESS',
          source: 'TRANSACTIONAL_OUTBOX_WORKER',
          tenantId: record.tenant_id,
          reason: `Outbox event ${record.event_type} (${record.event_id}) delivered successfully`,
          result: {
            outboxId: record.id,
            eventId: record.event_id,
            eventType: record.event_type,
            attempts: record.attempt_count + 1,
          },
        });

        return true;
      } else {
        this.circuitBreaker.recordFailure();
        const delayMs = this.calculateBackoffDelay(record.attempt_count + 1);
        const failureResult = await postgresOutboxRepository.markFailure(
          record.id,
          response.error || `HTTP ${response.statusCode}`,
          delayMs
        );

        auditService.logEmergencyEvent({
          action: failureResult.deadLetter ? 'OUTBOX_DEAD_LETTER' : 'OUTBOX_DELIVERY_FAILURE',
          source: 'TRANSACTIONAL_OUTBOX_WORKER',
          tenantId: record.tenant_id,
          reason: `Outbox event delivery failed: ${response.error}`,
          result: {
            outboxId: record.id,
            eventId: record.event_id,
            attempts: failureResult.attemptCount,
            deadLetter: failureResult.deadLetter,
          },
        });

        return false;
      }
    } catch (err: any) {
      this.circuitBreaker.recordFailure();
      const delayMs = this.calculateBackoffDelay(record.attempt_count + 1);
      const failureResult = await postgresOutboxRepository.markFailure(
        record.id,
        err.message || 'Network exception',
        delayMs
      );

      auditService.logEmergencyEvent({
        action: failureResult.deadLetter ? 'OUTBOX_DEAD_LETTER' : 'OUTBOX_DELIVERY_FAILURE',
        source: 'TRANSACTIONAL_OUTBOX_WORKER',
        tenantId: record.tenant_id,
        reason: `Outbox delivery exception: ${err.message}`,
        result: {
          outboxId: record.id,
          eventId: record.event_id,
          attempts: failureResult.attemptCount,
          deadLetter: failureResult.deadLetter,
        },
      });

      return false;
    }
  }

  private calculateBackoffDelay(attempt: number): number {
    const delay = this.baseDelayMs * Math.pow(2, attempt - 1);
    return Math.min(delay, this.maxDelayMs);
  }

  public async getHealth(): Promise<{
    status: 'healthy' | 'degraded';
    workerRunning: boolean;
    circuitState: string;
    pendingCount: number;
    processingCount: number;
    completedCount: number;
    failedCount: number;
    deadLetterCount: number;
    totalCount: number;
  }> {
    const stats = await postgresOutboxRepository.getStats();
    const circuitState = this.circuitBreaker.getState();
    const isHealthy = circuitState !== 'OPEN' && stats.deadLetter === 0;

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      workerRunning: this.isWorkerRunning(),
      circuitState,
      pendingCount: stats.pending,
      processingCount: stats.processing,
      completedCount: stats.completed,
      failedCount: stats.failed,
      deadLetterCount: stats.deadLetter,
      totalCount: stats.total,
    };
  }
}

export const transactionalOutboxService = new TransactionalOutboxService();
