import { pgDb, DbClient } from '../../db/postgres.ts';
import { ITradingWalletRepository, TradingWallet } from './ITradingWalletRepository.ts';

export class PostgresWalletRepository implements ITradingWalletRepository {
  private mapRow(row: any): TradingWallet {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      user_id: row.user_id,
      available_balance: Number(row.available_balance || 0),
      blocked_balance: Number(row.blocked_balance || 0),
      used_margin: Number(row.used_margin || 0),
      realized_pnl: Number(row.realized_pnl || 0),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  public async getWallet(tenantId: string, userId: string, client?: DbClient): Promise<TradingWallet | null> {
    const sql = `SELECT * FROM trading_wallets WHERE tenant_id = $1 AND user_id = $2 LIMIT 1;`;
    const res = client ? await client.query(sql, [tenantId, userId]) : await pgDb.query(sql, [tenantId, userId]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async getOrCreateWallet(
    tenantId: string,
    userId: string,
    initialBalance = 1000000,
    client?: DbClient
  ): Promise<TradingWallet> {
    const existing = await this.getWallet(tenantId, userId, client);
    if (existing) return existing;

    const walletId = `wal-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const sql = `
      INSERT INTO trading_wallets (
        id, tenant_id, user_id, available_balance, blocked_balance,
        used_margin, realized_pnl, updated_at
      ) VALUES (
        $1, $2, $3, $4, 0,
        0, 0, NOW()
      )
      ON CONFLICT (tenant_id, user_id)
      DO UPDATE SET updated_at = NOW()
      RETURNING *;
    `;
    const params = [walletId, tenantId, userId, initialBalance];

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    return this.mapRow(res.rows[0]);
  }

  public async lockWalletForUpdate(tenantId: string, userId: string, client: DbClient): Promise<TradingWallet> {
    const sql = `SELECT * FROM trading_wallets WHERE tenant_id = $1 AND user_id = $2 FOR UPDATE;`;
    const res = await client.query(sql, [tenantId, userId]);

    if (res.rows.length === 0) {
      // Create wallet if it didn't exist yet, then lock it
      await this.getOrCreateWallet(tenantId, userId, 1000000, client);
      const lockedRes = await client.query(sql, [tenantId, userId]);
      return this.mapRow(lockedRes.rows[0]);
    }

    return this.mapRow(res.rows[0]);
  }

  public async updateWallet(
    tenantId: string,
    userId: string,
    updates: Partial<TradingWallet>,
    client?: DbClient
  ): Promise<TradingWallet> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: any[] = [tenantId, userId];

    if (updates.available_balance !== undefined) {
      params.push(updates.available_balance);
      setClauses.push(`available_balance = $${params.length}`);
    }
    if (updates.blocked_balance !== undefined) {
      params.push(updates.blocked_balance);
      setClauses.push(`blocked_balance = $${params.length}`);
    }
    if (updates.used_margin !== undefined) {
      params.push(updates.used_margin);
      setClauses.push(`used_margin = $${params.length}`);
    }
    if (updates.realized_pnl !== undefined) {
      params.push(updates.realized_pnl);
      setClauses.push(`realized_pnl = $${params.length}`);
    }

    const sql = `
      UPDATE trading_wallets
      SET ${setClauses.join(', ')}
      WHERE tenant_id = $1 AND user_id = $2
      RETURNING *;
    `;

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    if (res.rows.length === 0) {
      // If no row was updated, create it with updates
      return this.getOrCreateWallet(tenantId, userId, updates.available_balance ?? 1000000, client);
    }
    return this.mapRow(res.rows[0]);
  }
}

export const postgresWalletRepository = new PostgresWalletRepository();
