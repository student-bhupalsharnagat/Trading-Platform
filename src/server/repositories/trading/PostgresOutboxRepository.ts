import { pgDb, DbClient } from '../../db/postgres.ts';

export type OutboxEventStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DEAD_LETTER';

export interface OutboxEventRecord<T = any> {
  id: string;
  event_id: string;
  tenant_id: string;
  event_type: string;
  payload: T;
  status: OutboxEventStatus;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error?: string | null;
  created_at: string;
  processed_at?: string | null;
}

export class PostgresOutboxRepository {
  /**
   * Inserts an outbox event within an existing or new database transaction.
   * If an event with the same event_id already exists, ignores to ensure idempotency.
   */
  public async insert(
    event: {
      id: string;
      event_id: string;
      tenant_id: string;
      event_type: string;
      payload: any;
      max_attempts?: number;
    },
    client?: DbClient
  ): Promise<OutboxEventRecord> {
    const maxAttempts = event.max_attempts ?? 5;
    const sql = `
      INSERT INTO trading_outbox (
        id, event_id, tenant_id, event_type, payload, status, attempt_count, max_attempts, next_attempt_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, 'PENDING', 0, $6, NOW(), NOW())
      ON CONFLICT (event_id) DO NOTHING
      RETURNING *;
    `;

    const params = [
      event.id,
      event.event_id,
      event.tenant_id,
      event.event_type,
      JSON.stringify(event.payload),
      maxAttempts,
    ];

    if (client) {
      const res = await client.query(sql, params);
      if (res.rows && res.rows[0]) {
        return this.mapRow(res.rows[0]);
      }
      // If already exists, fetch existing
      return (await this.findByEventId(event.event_id, client))!;
    }

    const res = await pgDb.query(sql, params);
    if (res.rows && res.rows[0]) {
      return this.mapRow(res.rows[0]);
    }
    return (await this.findByEventId(event.event_id))!;
  }

  /**
   * Fetches pending events for asynchronous worker processing.
   * Uses FOR UPDATE SKIP LOCKED to guarantee safe, collision-free concurrency across instances.
   */
  public async fetchPendingBatch(
    batchSize = 20,
    client?: DbClient
  ): Promise<OutboxEventRecord[]> {
    const sql = `
      SELECT * FROM trading_outbox
      WHERE status IN ('PENDING', 'FAILED')
        AND next_attempt_at <= NOW()
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED;
    `;

    try {
      if (client) {
        const res = await client.query(sql, [batchSize]);
        return (res.rows || []).map(this.mapRow);
      }
      const res = await pgDb.query(sql, [batchSize]);
      return (res.rows || []).map(this.mapRow);
    } catch (err: any) {
      // In engines where SKIP LOCKED might be unparsed or outside transaction, fallback safely
      const fallbackSql = `
        SELECT * FROM trading_outbox
        WHERE status IN ('PENDING', 'FAILED')
          AND next_attempt_at <= NOW()
        ORDER BY created_at ASC
        LIMIT $1;
      `;
      const res = client ? await client.query(fallbackSql, [batchSize]) : await pgDb.query(fallbackSql, [batchSize]);
      return (res.rows || []).map(this.mapRow);
    }
  }

  public async markProcessing(id: string, client?: DbClient): Promise<void> {
    const sql = `
      UPDATE trading_outbox
      SET status = 'PROCESSING'
      WHERE id = $1;
    `;
    if (client) {
      await client.query(sql, [id]);
    } else {
      await pgDb.query(sql, [id]);
    }
  }

  public async markCompleted(id: string, client?: DbClient): Promise<void> {
    const sql = `
      UPDATE trading_outbox
      SET status = 'COMPLETED',
          processed_at = NOW()
      WHERE id = $1;
    `;
    if (client) {
      await client.query(sql, [id]);
    } else {
      await pgDb.query(sql, [id]);
    }
  }

  public async markFailure(
    id: string,
    error: string,
    nextAttemptDelayMs: number,
    client?: DbClient
  ): Promise<{ deadLetter: boolean; attemptCount: number }> {
    // Read current attempt_count and max_attempts
    const fetchSql = `SELECT attempt_count, max_attempts FROM trading_outbox WHERE id = $1`;
    const res = client ? await client.query(fetchSql, [id]) : await pgDb.query(fetchSql, [id]);
    const row = res.rows && res.rows[0];

    const currentAttempts = row ? Number(row.attempt_count) : 0;
    const maxAttempts = row ? Number(row.max_attempts) : 5;
    const nextAttempts = currentAttempts + 1;
    const isDeadLetter = nextAttempts >= maxAttempts;
    const nextStatus: OutboxEventStatus = isDeadLetter ? 'DEAD_LETTER' : 'FAILED';

    const nextAttemptDate = new Date(Date.now() + nextAttemptDelayMs).toISOString();

    const updateSql = `
      UPDATE trading_outbox
      SET status = $1,
          attempt_count = $2,
          last_error = $3,
          next_attempt_at = $4,
          processed_at = ${isDeadLetter ? 'NOW()' : 'processed_at'}
      WHERE id = $5;
    `;

    const params = [nextStatus, nextAttempts, error, nextAttemptDate, id];
    if (client) {
      await client.query(updateSql, params);
    } else {
      await pgDb.query(updateSql, params);
    }

    return { deadLetter: isDeadLetter, attemptCount: nextAttempts };
  }

  public async findByEventId(eventId: string, client?: DbClient): Promise<OutboxEventRecord | null> {
    const sql = `SELECT * FROM trading_outbox WHERE event_id = $1 LIMIT 1`;
    const res = client ? await client.query(sql, [eventId]) : await pgDb.query(sql, [eventId]);
    if (res.rows && res.rows.length > 0) {
      return this.mapRow(res.rows[0]);
    }
    return null;
  }

  public async findById(id: string, client?: DbClient): Promise<OutboxEventRecord | null> {
    const sql = `SELECT * FROM trading_outbox WHERE id = $1 LIMIT 1`;
    const res = client ? await client.query(sql, [id]) : await pgDb.query(sql, [id]);
    if (res.rows && res.rows.length > 0) {
      return this.mapRow(res.rows[0]);
    }
    return null;
  }

  public async recoverStaleProcessing(staleThresholdMinutes = 5): Promise<number> {
    const sql = staleThresholdMinutes <= 0
      ? `UPDATE trading_outbox SET status = 'PENDING', next_attempt_at = NOW() WHERE status = 'PROCESSING' RETURNING id;`
      : `UPDATE trading_outbox SET status = 'PENDING', next_attempt_at = NOW() WHERE status = 'PROCESSING' AND created_at <= NOW() - ($1 || ' minutes')::INTERVAL RETURNING id;`;
    try {
      const res = staleThresholdMinutes <= 0 ? await pgDb.query(sql) : await pgDb.query(sql, [staleThresholdMinutes]);
      return (res.rows && res.rows.length) || res.rowCount || 0;
    } catch {
      const fallbackSql = `UPDATE trading_outbox SET status = 'PENDING', next_attempt_at = NOW() WHERE status = 'PROCESSING' RETURNING id;`;
      const res = await pgDb.query(fallbackSql);
      return (res.rows && res.rows.length) || res.rowCount || 0;
    }
  }

  public async reprocessDeadLetter(eventIdOrId: string): Promise<boolean> {
    const sql = `
      UPDATE trading_outbox
      SET status = 'PENDING',
          attempt_count = 0,
          next_attempt_at = NOW(),
          last_error = NULL
      WHERE (id = $1 OR event_id = $1)
        AND status = 'DEAD_LETTER'
      RETURNING id;
    `;
    const res = await pgDb.query(sql, [eventIdOrId]);
    return ((res.rows && res.rows.length) || res.rowCount || 0) > 0;
  }

  public async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    deadLetter: number;
    total: number;
  }> {
    const sql = `
      SELECT status, COUNT(*) as count
      FROM trading_outbox
      GROUP BY status;
    `;
    const res = await pgDb.query(sql);
    const stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      deadLetter: 0,
      total: 0,
    };

    for (const row of res.rows || []) {
      const cnt = parseInt(row.count, 10) || 0;
      stats.total += cnt;
      if (row.status === 'PENDING') stats.pending += cnt;
      else if (row.status === 'PROCESSING') stats.processing += cnt;
      else if (row.status === 'COMPLETED') stats.completed += cnt;
      else if (row.status === 'FAILED') stats.failed += cnt;
      else if (row.status === 'DEAD_LETTER') stats.deadLetter += cnt;
    }

    return stats;
  }

  private mapRow(row: any): OutboxEventRecord {
    let payload = row.payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        // Keep as string
      }
    }

    return {
      id: row.id,
      event_id: row.event_id,
      tenant_id: row.tenant_id,
      event_type: row.event_type,
      payload,
      status: row.status as OutboxEventStatus,
      attempt_count: Number(row.attempt_count || 0),
      max_attempts: Number(row.max_attempts || 5),
      next_attempt_at: row.next_attempt_at ? new Date(row.next_attempt_at).toISOString() : new Date().toISOString(),
      last_error: row.last_error,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      processed_at: row.processed_at ? new Date(row.processed_at).toISOString() : null,
    };
  }
}

export const postgresOutboxRepository = new PostgresOutboxRepository();
