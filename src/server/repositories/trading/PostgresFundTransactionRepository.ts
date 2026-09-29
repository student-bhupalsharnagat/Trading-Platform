import { pgDb, DbClient } from '../../db/postgres.ts';
import { ITradingFundTransactionRepository, TradingFundTransaction } from './ITradingFundTransactionRepository.ts';

export class PostgresFundTransactionRepository implements ITradingFundTransactionRepository {
  private mapRow(row: any): TradingFundTransaction {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      user_id: row.user_id,
      transaction_type: row.transaction_type,
      amount: Number(row.amount),
      status: row.status,
      payment_method: row.payment_method || 'BANK_TRANSFER',
      reference_id: row.reference_id || null,
      approved_by: row.approved_by || null,
      approved_at: row.approved_at ? new Date(row.approved_at).toISOString() : null,
      rejected_by: row.rejected_by || null,
      rejected_at: row.rejected_at ? new Date(row.rejected_at).toISOString() : null,
      failure_reason: row.failure_reason || null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  public async create(
    tx: Omit<TradingFundTransaction, 'created_at' | 'updated_at'>,
    client?: DbClient
  ): Promise<TradingFundTransaction> {
    const sql = `
      INSERT INTO trading_fund_transactions (
        id, tenant_id, user_id, transaction_type, amount,
        status, payment_method, reference_id, approved_by, approved_at,
        rejected_by, rejected_at, failure_reason, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, NOW(), NOW()
      )
      RETURNING *;
    `;
    const params = [
      tx.id,
      tx.tenant_id,
      tx.user_id,
      tx.transaction_type,
      tx.amount,
      tx.status || 'PENDING',
      tx.payment_method || 'BANK_TRANSFER',
      tx.reference_id || null,
      tx.approved_by || null,
      tx.approved_at || null,
      tx.rejected_by || null,
      tx.rejected_at || null,
      tx.failure_reason || null,
    ];

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    return this.mapRow(res.rows[0]);
  }

  public async findById(tenantId: string, id: string, client?: DbClient): Promise<TradingFundTransaction | null> {
    const sql = `SELECT * FROM trading_fund_transactions WHERE tenant_id = $1 AND id = $2 LIMIT 1;`;
    const res = client ? await client.query(sql, [tenantId, id]) : await pgDb.query(sql, [tenantId, id]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async getByTenant(
    tenantId: string,
    userId?: string,
    type?: 'DEPOSIT' | 'WITHDRAWAL',
    status?: string,
    client?: DbClient
  ): Promise<TradingFundTransaction[]> {
    let sql = `SELECT * FROM trading_fund_transactions WHERE tenant_id = $1`;
    const params: any[] = [tenantId];

    if (userId) {
      params.push(userId);
      sql += ` AND user_id = $${params.length}`;
    }
    if (type) {
      params.push(type);
      sql += ` AND transaction_type = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC;`;

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    return res.rows.map((r) => this.mapRow(r));
  }

  public async updateStatus(
    tenantId: string,
    id: string,
    status: 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED',
    adminId?: string,
    reason?: string,
    client?: DbClient
  ): Promise<TradingFundTransaction | null> {
    const isApproved = status === 'APPROVED' || status === 'COMPLETED';
    const isRejected = status === 'REJECTED';

    const sql = `
      UPDATE trading_fund_transactions
      SET status = $1,
          approved_by = CASE WHEN $2 THEN $3 ELSE approved_by END,
          approved_at = CASE WHEN $2 THEN NOW() ELSE approved_at END,
          rejected_by = CASE WHEN $4 THEN $3 ELSE rejected_by END,
          rejected_at = CASE WHEN $4 THEN NOW() ELSE rejected_at END,
          failure_reason = CASE WHEN $4 THEN $5 ELSE failure_reason END,
          updated_at = NOW()
      WHERE tenant_id = $6 AND id = $7
      RETURNING *;
    `;
    const params = [status, isApproved, adminId || 'SYSTEM', isRejected, reason || null, tenantId, id];

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }
}

export const postgresFundTransactionRepository = new PostgresFundTransactionRepository();
