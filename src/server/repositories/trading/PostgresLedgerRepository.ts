import { pgDb, DbClient } from '../../db/postgres.ts';
import { ILedgerRepository, LedgerEntry } from '../ILedgerRepository.ts';
import crypto from 'crypto';

export interface TenantLedgerEntry extends LedgerEntry {
  tenant_id: string;
}

export class PostgresLedgerRepository implements ILedgerRepository {
  private mapRow(row: any): TenantLedgerEntry {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      user_id: row.user_id,
      transaction_id: row.transaction_id,
      type: row.type,
      category: row.category,
      amount: Number(row.amount),
      balance_before: Number(row.balance_before),
      balance_after: Number(row.balance_after),
      reference: row.reference || '',
      created_by: row.created_by || 'SYSTEM',
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  public async createEntry(
    entry: Omit<LedgerEntry, 'id' | 'created_at'> & { tenant_id?: string },
    client?: DbClient
  ): Promise<TenantLedgerEntry> {
    const id = `led-${Date.now()}-${crypto.randomUUID().substring(0, 8)}`;
    const tenantId = (entry as any).tenant_id || 'vertex-default';

    const sql = `
      INSERT INTO trading_ledger_entries (
        id, tenant_id, user_id, transaction_id, type, category,
        amount, balance_before, balance_after, reference, created_by, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, NOW()
      )
      RETURNING *;
    `;
    const params = [
      id,
      tenantId,
      entry.user_id,
      entry.transaction_id,
      entry.type,
      entry.category,
      entry.amount,
      entry.balance_before,
      entry.balance_after,
      entry.reference || null,
      entry.created_by || 'SYSTEM',
    ];

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    return this.mapRow(res.rows[0]);
  }

  public async getByUserId(userId: string, tenantId?: string, client?: DbClient): Promise<TenantLedgerEntry[]> {
    let sql = `SELECT * FROM trading_ledger_entries WHERE user_id = $1`;
    const params: any[] = [userId];

    if (tenantId) {
      params.push(tenantId);
      sql += ` AND tenant_id = $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC;`;

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    return res.rows.map((r) => this.mapRow(r));
  }

  public async getAll(tenantId?: string, client?: DbClient): Promise<TenantLedgerEntry[]> {
    let sql = `SELECT * FROM trading_ledger_entries`;
    const params: any[] = [];

    if (tenantId) {
      params.push(tenantId);
      sql += ` WHERE tenant_id = $1`;
    }

    sql += ` ORDER BY created_at DESC;`;

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    return res.rows.map((r) => this.mapRow(r));
  }
}

export const postgresLedgerRepository = new PostgresLedgerRepository();
