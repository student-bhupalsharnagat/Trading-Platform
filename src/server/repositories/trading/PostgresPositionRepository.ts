import { pgDb, DbClient } from '../../db/postgres.ts';
import { ITradingPositionRepository, TradingPosition } from './ITradingPositionRepository.ts';

export class PostgresPositionRepository implements ITradingPositionRepository {
  private mapRow(row: any): TradingPosition {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      user_id: row.user_id,
      instrument_id: row.instrument_id,
      quantity: Number(row.quantity),
      average_price: Number(row.average_price),
      realized_pnl: Number(row.realized_pnl || 0),
      unrealized_pnl: Number(row.unrealized_pnl || 0),
      margin_used: Number(row.margin_used || 0),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  public async getPositions(tenantId: string, userId?: string, client?: DbClient): Promise<TradingPosition[]> {
    let sql = `SELECT * FROM trading_positions WHERE tenant_id = $1`;
    const params: any[] = [tenantId];

    if (userId) {
      params.push(userId);
      sql += ` AND user_id = $${params.length}`;
    }

    sql += ` ORDER BY updated_at DESC;`;

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    return res.rows.map((r) => this.mapRow(r));
  }

  public async findPosition(
    tenantId: string,
    userId: string,
    instrumentId: string,
    client?: DbClient
  ): Promise<TradingPosition | null> {
    const sql = `SELECT * FROM trading_positions WHERE tenant_id = $1 AND user_id = $2 AND instrument_id = $3 LIMIT 1;`;
    const res = client
      ? await client.query(sql, [tenantId, userId, instrumentId])
      : await pgDb.query(sql, [tenantId, userId, instrumentId]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async lockPositionForUpdate(
    tenantId: string,
    userId: string,
    instrumentId: string,
    client: DbClient
  ): Promise<TradingPosition | null> {
    const sql = `SELECT * FROM trading_positions WHERE tenant_id = $1 AND user_id = $2 AND instrument_id = $3 FOR UPDATE;`;
    const res = await client.query(sql, [tenantId, userId, instrumentId]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async upsertPosition(
    position: Omit<TradingPosition, 'updated_at'>,
    client?: DbClient
  ): Promise<TradingPosition> {
    const sql = `
      INSERT INTO trading_positions (
        id, tenant_id, user_id, instrument_id, quantity,
        average_price, realized_pnl, unrealized_pnl, margin_used, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, NOW()
      )
      ON CONFLICT (tenant_id, user_id, instrument_id)
      DO UPDATE SET
        quantity = EXCLUDED.quantity,
        average_price = EXCLUDED.average_price,
        realized_pnl = EXCLUDED.realized_pnl,
        unrealized_pnl = EXCLUDED.unrealized_pnl,
        margin_used = EXCLUDED.margin_used,
        updated_at = NOW()
      RETURNING *;
    `;
    const params = [
      position.id,
      position.tenant_id,
      position.user_id,
      position.instrument_id,
      position.quantity,
      position.average_price,
      position.realized_pnl ?? 0,
      position.unrealized_pnl ?? 0,
      position.margin_used ?? 0,
    ];

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    return this.mapRow(res.rows[0]);
  }

  public async deletePosition(tenantId: string, id: string, client?: DbClient): Promise<boolean> {
    const sql = `DELETE FROM trading_positions WHERE tenant_id = $1 AND id = $2;`;
    const res = client ? await client.query(sql, [tenantId, id]) : await pgDb.query(sql, [tenantId, id]);
    return res.rowCount > 0;
  }
}

export const postgresPositionRepository = new PostgresPositionRepository();
