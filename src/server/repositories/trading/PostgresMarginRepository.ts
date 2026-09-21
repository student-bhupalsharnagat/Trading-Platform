import { pgDb, DbClient } from '../../db/postgres.ts';
import { ITradingMarginRepository, TradingMarginSnapshot } from './ITradingMarginRepository.ts';

export class PostgresMarginRepository implements ITradingMarginRepository {
  private mapRow(row: any): TradingMarginSnapshot {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      user_id: row.user_id,
      equity: Number(row.equity),
      available_margin: Number(row.available_margin),
      used_margin: Number(row.used_margin),
      margin_level: Number(row.margin_level),
      unrealized_pnl: Number(row.unrealized_pnl || 0),
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  public async recordSnapshot(
    snapshot: Omit<TradingMarginSnapshot, 'created_at'>,
    client?: DbClient
  ): Promise<TradingMarginSnapshot> {
    const sql = `
      INSERT INTO trading_margin_snapshots (
        id, tenant_id, user_id, equity, available_margin,
        used_margin, margin_level, unrealized_pnl, created_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, NOW()
      )
      RETURNING *;
    `;
    const params = [
      snapshot.id,
      snapshot.tenant_id,
      snapshot.user_id,
      snapshot.equity,
      snapshot.available_margin,
      snapshot.used_margin,
      snapshot.margin_level,
      snapshot.unrealized_pnl ?? 0,
    ];

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    return this.mapRow(res.rows[0]);
  }

  public async getLatestSnapshot(
    tenantId: string,
    userId: string,
    client?: DbClient
  ): Promise<TradingMarginSnapshot | null> {
    const sql = `
      SELECT * FROM trading_margin_snapshots
      WHERE tenant_id = $1 AND user_id = $2
      ORDER BY created_at DESC
      LIMIT 1;
    `;
    const res = client ? await client.query(sql, [tenantId, userId]) : await pgDb.query(sql, [tenantId, userId]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async getSnapshots(
    tenantId: string,
    userId: string,
    limit = 50,
    client?: DbClient
  ): Promise<TradingMarginSnapshot[]> {
    const sql = `
      SELECT * FROM trading_margin_snapshots
      WHERE tenant_id = $1 AND user_id = $2
      ORDER BY created_at DESC
      LIMIT $3;
    `;
    const res = client ? await client.query(sql, [tenantId, userId, limit]) : await pgDb.query(sql, [tenantId, userId, limit]);
    return res.rows.map((r) => this.mapRow(r));
  }
}

export const postgresMarginRepository = new PostgresMarginRepository();
