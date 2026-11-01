import { pgDb, DbClient } from '../../db/postgres.ts';

export interface ManualDepositRecord {
  id: string;
  tenant_id: string;
  user_id: string;
  user_name?: string | null;
  user_mobile?: string | null;
  amount: number;
  utr_number: string;
  payment_method: string;
  proof_image_url?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejection_reason?: string | null;
  approved_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentSettingsRecord {
  id: string;
  tenant_id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  ifsc_code: string;
  upi_id: string;
  qr_code_url: string;
  updated_at: string;
}

export class PostgresManualDepositRepository {
  private mapDepositRow(row: any): ManualDepositRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      user_id: row.user_id,
      user_name: row.user_name || null,
      user_mobile: row.user_mobile || null,
      amount: Number(row.amount),
      utr_number: row.utr_number,
      payment_method: row.payment_method || 'BANK_TRANSFER',
      proof_image_url: row.proof_image_url || null,
      status: row.status,
      rejection_reason: row.rejection_reason || null,
      approved_by: row.approved_by || null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  private mapSettingsRow(row: any): PaymentSettingsRecord {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      bank_name: row.bank_name || '',
      account_name: row.account_name || '',
      account_number: row.account_number || '',
      ifsc_code: row.ifsc_code || '',
      upi_id: row.upi_id || '',
      qr_code_url: row.qr_code_url || '',
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  // --- Payment Settings Operations ---
  public async getPaymentSettings(tenantId = 'vertex-default'): Promise<PaymentSettingsRecord> {
    const sql = `
      SELECT * FROM payment_settings 
      WHERE tenant_id = $1 OR id = 'default' 
      ORDER BY (CASE WHEN tenant_id = $1 THEN 0 ELSE 1 END) 
      LIMIT 1;
    `;
    const res = await pgDb.query(sql, [tenantId]);
    if (res.rows.length > 0) {
      return this.mapSettingsRow(res.rows[0]);
    }

    return {
      id: 'default',
      tenant_id: tenantId,
      bank_name: 'HDFC Bank Ltd',
      account_name: 'VERTEX TRADING TECHNOLOGIES PVT LTD',
      account_number: '50200084729103',
      ifsc_code: 'HDFC0001234',
      upi_id: 'vertextrading@hdfcbank',
      qr_code_url: '',
      updated_at: new Date().toISOString(),
    };
  }

  public async updatePaymentSettings(
    tenantId = 'vertex-default',
    settings: Partial<PaymentSettingsRecord>
  ): Promise<PaymentSettingsRecord> {
    const existing = await this.getPaymentSettings(tenantId);
    const bankName = settings.bank_name ?? existing.bank_name;
    const accountName = settings.account_name ?? existing.account_name;
    const accountNumber = settings.account_number ?? existing.account_number;
    const ifscCode = settings.ifsc_code ?? existing.ifsc_code;
    const upiId = settings.upi_id ?? existing.upi_id;
    const qrCodeUrl = settings.qr_code_url ?? existing.qr_code_url;

    const sql = `
      INSERT INTO payment_settings (
        id, tenant_id, bank_name, account_name, account_number, ifsc_code, upi_id, qr_code_url, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        bank_name = EXCLUDED.bank_name,
        account_name = EXCLUDED.account_name,
        account_number = EXCLUDED.account_number,
        ifsc_code = EXCLUDED.ifsc_code,
        upi_id = EXCLUDED.upi_id,
        qr_code_url = EXCLUDED.qr_code_url,
        updated_at = NOW()
      RETURNING *;
    `;
    const id = existing.id || 'default';
    const res = await pgDb.query(sql, [
      id,
      tenantId,
      bankName,
      accountName,
      accountNumber,
      ifscCode,
      upiId,
      qrCodeUrl,
    ]);
    return this.mapSettingsRow(res.rows[0]);
  }

  // --- Manual Deposit Requests Operations ---
  public async getByUtr(utr: string): Promise<ManualDepositRecord | null> {
    const sql = `SELECT * FROM manual_deposit_requests WHERE LOWER(utr_number) = LOWER($1) LIMIT 1;`;
    const res = await pgDb.query(sql, [utr.trim()]);
    if (res.rows.length === 0) return null;
    return this.mapDepositRow(res.rows[0]);
  }

  public async getById(id: string, client?: DbClient): Promise<ManualDepositRecord | null> {
    const sql = `SELECT * FROM manual_deposit_requests WHERE id = $1 LIMIT 1;`;
    const res = client ? await client.query(sql, [id]) : await pgDb.query(sql, [id]);
    if (res.rows.length === 0) return null;
    return this.mapDepositRow(res.rows[0]);
  }

  public async lockByIdForUpdate(id: string, client: DbClient): Promise<ManualDepositRecord | null> {
    const sql = `SELECT * FROM manual_deposit_requests WHERE id = $1 FOR UPDATE;`;
    const res = await client.query(sql, [id]);
    if (res.rows.length === 0) return null;
    return this.mapDepositRow(res.rows[0]);
  }

  public async create(
    data: {
      tenant_id?: string;
      user_id: string;
      user_name?: string;
      user_mobile?: string;
      amount: number;
      utr_number: string;
      payment_method?: string;
      proof_image_url?: string | null;
    },
    client?: DbClient
  ): Promise<ManualDepositRecord> {
    const id = `dep-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const tenantId = data.tenant_id || 'vertex-default';
    const method = data.payment_method || 'BANK_TRANSFER';

    const sql = `
      INSERT INTO manual_deposit_requests (
        id, tenant_id, user_id, user_name, user_mobile, amount,
        utr_number, payment_method, proof_image_url, status, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, 'PENDING', NOW(), NOW()
      )
      RETURNING *;
    `;
    const params = [
      id,
      tenantId,
      data.user_id,
      data.user_name || null,
      data.user_mobile || null,
      data.amount,
      data.utr_number.trim(),
      method,
      data.proof_image_url || null,
    ];

    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    return this.mapDepositRow(res.rows[0]);
  }

  public async getByUser(tenantId: string, userId: string): Promise<ManualDepositRecord[]> {
    const sql = `
      SELECT * FROM manual_deposit_requests
      WHERE (tenant_id = $1 OR tenant_id = 'vertex-default') AND user_id = $2
      ORDER BY created_at DESC;
    `;
    const res = await pgDb.query(sql, [tenantId, userId]);
    return res.rows.map((r) => this.mapDepositRow(r));
  }

  public async getAll(
    tenantId: string,
    filters: {
      status?: string;
      search?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ requests: ManualDepositRecord[]; total: number; pendingCount: number }> {
    const conditions: string[] = [];
    const params: any[] = [];

    // Optional tenant filter (allow SUPER_ADMIN / default view)
    if (tenantId && tenantId !== 'ALL' && tenantId !== 'default') {
      params.push(tenantId);
      conditions.push(`(tenant_id = $${params.length} OR tenant_id = 'vertex-default')`);
    }

    if (filters.status && filters.status !== 'ALL') {
      params.push(filters.status.toUpperCase());
      conditions.push(`status = $${params.length}`);
    }

    if (filters.search && filters.search.trim()) {
      params.push(`%${filters.search.trim().toLowerCase()}%`);
      const sParam = `$${params.length}`;
      conditions.push(`(
        LOWER(utr_number) LIKE ${sParam} OR 
        LOWER(user_id) LIKE ${sParam} OR 
        LOWER(COALESCE(user_name, '')) LIKE ${sParam} OR 
        LOWER(COALESCE(user_mobile, '')) LIKE ${sParam}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countSql = `SELECT COUNT(*) as count FROM manual_deposit_requests ${whereClause};`;
    const countRes = await pgDb.query(countSql, params);
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const pendingSql = `SELECT COUNT(*) as count FROM manual_deposit_requests WHERE status = 'PENDING';`;
    const pendingRes = await pgDb.query(pendingSql);
    const pendingCount = parseInt(pendingRes.rows[0]?.count || '0', 10);

    const limit = filters.limit ? Math.min(Math.max(1, filters.limit), 100) : 50;
    const offset = filters.offset ? Math.max(0, filters.offset) : 0;

    params.push(limit);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    const dataSql = `
      SELECT * FROM manual_deposit_requests
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam};
    `;

    const dataRes = await pgDb.query(dataSql, params);
    return {
      requests: dataRes.rows.map((r) => this.mapDepositRow(r)),
      total,
      pendingCount,
    };
  }

  public async updateStatus(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    adminId: string,
    rejectionReason?: string | null,
    client?: DbClient
  ): Promise<ManualDepositRecord> {
    const sql = `
      UPDATE manual_deposit_requests
      SET status = $1, approved_by = $2, rejection_reason = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING *;
    `;
    const params = [status, adminId, rejectionReason || null, id];
    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    if (res.rows.length === 0) {
      throw new Error(`Deposit request with ID "${id}" not found`);
    }
    return this.mapDepositRow(res.rows[0]);
  }
}

export const postgresManualDepositRepository = new PostgresManualDepositRepository();
