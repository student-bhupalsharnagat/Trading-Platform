import { pgDb, DbClient } from '../../db/postgres.ts';
import { ITradingOrderRepository, TradingOrder } from './ITradingOrderRepository.ts';

export class PostgresOrderRepository implements ITradingOrderRepository {
  private mapRow(row: any): TradingOrder {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      user_id: row.user_id,
      client_order_id: row.client_order_id,
      instrument_id: row.instrument_id,
      side: row.side,
      order_type: row.order_type,
      quantity: Number(row.quantity),
      price: Number(row.price),
      trigger_price: row.trigger_price != null ? Number(row.trigger_price) : null,
      status: row.status,
      broker_order_id: row.broker_order_id || null,
      normalized_status: row.normalized_status || null,
      filled_quantity: Number(row.filled_quantity || 0),
      remaining_quantity: Number(row.remaining_quantity || 0),
      average_fill_price: Number(row.average_fill_price || 0),
      time_in_force: row.time_in_force || 'DAY',
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
      cancelled_at: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
    };
  }

  public async create(order: Omit<TradingOrder, 'created_at' | 'updated_at'>, client?: DbClient): Promise<TradingOrder> {
    const sql = `
      INSERT INTO trading_orders (
        id, tenant_id, user_id, client_order_id, instrument_id, side,
        order_type, quantity, price, trigger_price, status,
        broker_order_id, normalized_status,
        filled_quantity, remaining_quantity, average_fill_price, time_in_force,
        created_at, updated_at, cancelled_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13,
        $14, $15, $16, $17,
        NOW(), NOW(), $18
      )
      RETURNING *;
    `;
    const params = [
      order.id,
      order.tenant_id,
      order.user_id,
      order.client_order_id || null,
      order.instrument_id,
      order.side,
      order.order_type,
      order.quantity,
      order.price,
      order.trigger_price ?? null,
      order.status,
      order.broker_order_id || null,
      order.normalized_status || null,
      order.filled_quantity ?? 0,
      order.remaining_quantity ?? order.quantity,
      order.average_fill_price ?? 0,
      order.time_in_force || 'DAY',
      order.cancelled_at ?? null,
    ];

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    return this.mapRow(res.rows[0]);
  }

  public async findById(tenantId: string, id: string, client?: DbClient): Promise<TradingOrder | null> {
    const sql = `SELECT * FROM trading_orders WHERE tenant_id = $1 AND id = $2 LIMIT 1;`;
    const res = client ? await client.query(sql, [tenantId, id]) : await pgDb.query(sql, [tenantId, id]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async findByClientOrderId(
    tenantId: string,
    userId: string,
    clientOrderId: string,
    client?: DbClient
  ): Promise<TradingOrder | null> {
    const sql = `SELECT * FROM trading_orders WHERE tenant_id = $1 AND user_id = $2 AND client_order_id = $3 LIMIT 1;`;
    const res = client
      ? await client.query(sql, [tenantId, userId, clientOrderId])
      : await pgDb.query(sql, [tenantId, userId, clientOrderId]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async getOrders(tenantId: string, userId?: string, status?: string, client?: DbClient): Promise<TradingOrder[]> {
    let sql = `SELECT * FROM trading_orders WHERE tenant_id = $1`;
    const params: any[] = [tenantId];

    if (userId) {
      params.push(userId);
      sql += ` AND user_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC;`;

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    return res.rows.map((r) => this.mapRow(r));
  }

  public async update(
    tenantId: string,
    id: string,
    updates: Partial<TradingOrder>,
    client?: DbClient
  ): Promise<TradingOrder | null> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: any[] = [tenantId, id];

    if (updates.status !== undefined) {
      params.push(updates.status);
      setClauses.push(`status = $${params.length}`);
    }
    if (updates.filled_quantity !== undefined) {
      params.push(updates.filled_quantity);
      setClauses.push(`filled_quantity = $${params.length}`);
    }
    if (updates.remaining_quantity !== undefined) {
      params.push(updates.remaining_quantity);
      setClauses.push(`remaining_quantity = $${params.length}`);
    }
    if (updates.average_fill_price !== undefined) {
      params.push(updates.average_fill_price);
      setClauses.push(`average_fill_price = $${params.length}`);
    }
    if (updates.cancelled_at !== undefined) {
      params.push(updates.cancelled_at);
      setClauses.push(`cancelled_at = $${params.length}`);
    }
    if (updates.price !== undefined) {
      params.push(updates.price);
      setClauses.push(`price = $${params.length}`);
    }
    if (updates.quantity !== undefined) {
      params.push(updates.quantity);
      setClauses.push(`quantity = $${params.length}`);
    }
    if (updates.broker_order_id !== undefined) {
      params.push(updates.broker_order_id);
      setClauses.push(`broker_order_id = $${params.length}`);
    }
    if (updates.normalized_status !== undefined) {
      params.push(updates.normalized_status);
      setClauses.push(`normalized_status = $${params.length}`);
    }

    const sql = `
      UPDATE trading_orders
      SET ${setClauses.join(', ')}
      WHERE tenant_id = $1 AND id = $2
      RETURNING *;
    `;

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async cancelOrders(
    tenantId: string,
    scope: 'TENANT' | 'USER',
    userId?: string,
    client?: DbClient
  ): Promise<number> {
    let sql = `
      UPDATE trading_orders
      SET status = 'CANCELLED', updated_at = NOW(), cancelled_at = NOW()
      WHERE tenant_id = $1 AND status = 'PENDING'
    `;
    const params: any[] = [tenantId];

    if (scope === 'USER' && userId) {
      params.push(userId);
      sql += ` AND user_id = $${params.length}`;
    }

    sql += ` RETURNING id;`;

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    return res.rowCount;
  }
}

export const postgresOrderRepository = new PostgresOrderRepository();
