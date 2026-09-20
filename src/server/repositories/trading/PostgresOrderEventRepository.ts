import { pgDb, DbClient } from '../../db/postgres.ts';
import { ITradingOrderEventRepository, TradingOrderEvent } from './ITradingOrderEventRepository.ts';

export class PostgresOrderEventRepository implements ITradingOrderEventRepository {
  private mapRow(row: any): TradingOrderEvent {
    let payload = row.event_payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        // preserve string
      }
    }
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      order_id: row.order_id,
      event_type: row.event_type,
      event_payload: payload,
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  public async recordEvent(
    event: Omit<TradingOrderEvent, 'created_at'>,
    client?: DbClient
  ): Promise<TradingOrderEvent> {
    const sql = `
      INSERT INTO trading_order_events (
        id, tenant_id, order_id, event_type, event_payload, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, NOW()
      )
      RETURNING *;
    `;
    const payload = typeof event.event_payload === 'string'
      ? event.event_payload
      : JSON.stringify(event.event_payload);

    const params = [event.id, event.tenant_id, event.order_id, event.event_type, payload];

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    return this.mapRow(res.rows[0]);
  }

  public async getEventsByOrder(
    tenantId: string,
    orderId: string,
    client?: DbClient
  ): Promise<TradingOrderEvent[]> {
    const sql = `
      SELECT * FROM trading_order_events
      WHERE tenant_id = $1 AND order_id = $2
      ORDER BY created_at ASC;
    `;
    const res = client ? await client.query(sql, [tenantId, orderId]) : await pgDb.query(sql, [tenantId, orderId]);
    return res.rows.map((r) => this.mapRow(r));
  }
}

export const postgresOrderEventRepository = new PostgresOrderEventRepository();
