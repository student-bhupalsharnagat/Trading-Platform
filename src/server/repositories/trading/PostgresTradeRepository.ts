import { pgDb, DbClient } from '../../db/postgres.ts';
import { ITradingTradeRepository, TradingTrade } from './ITradingTradeRepository.ts';

export class PostgresTradeRepository implements ITradingTradeRepository {
  private mapRow(row: any): TradingTrade {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      order_id: row.order_id,
      user_id: row.user_id,
      instrument_id: row.instrument_id,
      side: row.side,
      quantity: Number(row.quantity),
      execution_price: Number(row.execution_price),
      execution_value: Number(row.execution_value),
      realized_pnl: Number(row.realized_pnl || 0),
      executed_at: new Date(row.executed_at).toISOString(),
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  public async create(trade: Omit<TradingTrade, 'created_at'>, client?: DbClient): Promise<TradingTrade> {
    const sql = `
      INSERT INTO trading_trades (
        id, tenant_id, order_id, user_id, instrument_id,
        side, quantity, execution_price, execution_value,
        realized_pnl, executed_at, created_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, NOW()
      )
      RETURNING *;
    `;
    const params = [
      trade.id,
      trade.tenant_id,
      trade.order_id,
      trade.user_id,
      trade.instrument_id,
      trade.side,
      trade.quantity,
      trade.execution_price,
      trade.execution_value,
      trade.realized_pnl ?? 0,
      trade.executed_at || new Date().toISOString(),
    ];

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    return this.mapRow(res.rows[0]);
  }

  public async findById(tenantId: string, id: string, client?: DbClient): Promise<TradingTrade | null> {
    const sql = `SELECT * FROM trading_trades WHERE tenant_id = $1 AND id = $2 LIMIT 1;`;
    const res = client ? await client.query(sql, [tenantId, id]) : await pgDb.query(sql, [tenantId, id]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async getTrades(tenantId: string, userId?: string, client?: DbClient): Promise<TradingTrade[]> {
    let sql = `SELECT * FROM trading_trades WHERE tenant_id = $1`;
    const params: any[] = [tenantId];

    if (userId) {
      params.push(userId);
      sql += ` AND user_id = $${params.length}`;
    }

    sql += ` ORDER BY executed_at DESC;`;

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    return res.rows.map((r) => this.mapRow(r));
  }

  public async getTradesByOrder(tenantId: string, orderId: string, client?: DbClient): Promise<TradingTrade[]> {
    const sql = `SELECT * FROM trading_trades WHERE tenant_id = $1 AND order_id = $2 ORDER BY executed_at ASC;`;
    const res = client ? await client.query(sql, [tenantId, orderId]) : await pgDb.query(sql, [tenantId, orderId]);
    return res.rows.map((r) => this.mapRow(r));
  }
}

export const postgresTradeRepository = new PostgresTradeRepository();
