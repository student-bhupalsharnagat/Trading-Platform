import { pgDb, DbClient } from '../../db/postgres.ts';
import { IClientMappingRepository, ClientIdentityMapping } from './IClientMappingRepository.ts';
import crypto from 'crypto';

export class PostgresClientMappingRepository implements IClientMappingRepository {
  private mapRow(row: any): ClientIdentityMapping {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      trading_user_id: row.trading_user_id,
      external_client_id: row.external_client_id || null,
      external_client_code: row.external_client_code || null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  public async createOrUpdate(
    tenantId: string,
    tradingUserId: string,
    externalClientId?: string | null,
    externalClientCode?: string | null,
    client?: DbClient
  ): Promise<ClientIdentityMapping> {
    const id = `map-${crypto.randomUUID()}`;
    const sql = `
      INSERT INTO client_identity_mappings (
        id, tenant_id, trading_user_id, external_client_id, external_client_code, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, NOW(), NOW()
      )
      ON CONFLICT (tenant_id, trading_user_id)
      DO UPDATE SET
        external_client_id = COALESCE(EXCLUDED.external_client_id, client_identity_mappings.external_client_id),
        external_client_code = COALESCE(EXCLUDED.external_client_code, client_identity_mappings.external_client_code),
        updated_at = NOW()
      RETURNING *;
    `;
    const params = [id, tenantId, tradingUserId, externalClientId || null, externalClientCode || null];
    const res = client ? await client.query(sql, params) : await pgDb.query(sql, params);
    return this.mapRow(res.rows[0]);
  }

  public async findByTradingUserId(
    tenantId: string,
    tradingUserId: string,
    client?: DbClient
  ): Promise<ClientIdentityMapping | null> {
    const sql = `SELECT * FROM client_identity_mappings WHERE tenant_id = $1 AND trading_user_id = $2 LIMIT 1;`;
    const res = client ? await client.query(sql, [tenantId, tradingUserId]) : await pgDb.query(sql, [tenantId, tradingUserId]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async findByExternalClientId(
    tenantId: string,
    externalClientId: string,
    client?: DbClient
  ): Promise<ClientIdentityMapping | null> {
    const sql = `SELECT * FROM client_identity_mappings WHERE tenant_id = $1 AND external_client_id = $2 LIMIT 1;`;
    const res = client ? await client.query(sql, [tenantId, externalClientId]) : await pgDb.query(sql, [tenantId, externalClientId]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async findByExternalClientCode(
    tenantId: string,
    externalClientCode: string,
    client?: DbClient
  ): Promise<ClientIdentityMapping | null> {
    const sql = `SELECT * FROM client_identity_mappings WHERE tenant_id = $1 AND external_client_code = $2 LIMIT 1;`;
    const res = client ? await client.query(sql, [tenantId, externalClientCode]) : await pgDb.query(sql, [tenantId, externalClientCode]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async getAll(tenantId: string, client?: DbClient): Promise<ClientIdentityMapping[]> {
    const sql = `SELECT * FROM client_identity_mappings WHERE tenant_id = $1 ORDER BY created_at DESC;`;
    const res = client ? await client.query(sql, [tenantId]) : await pgDb.query(sql, [tenantId]);
    return res.rows.map((r) => this.mapRow(r));
  }
}

export const postgresClientMappingRepository = new PostgresClientMappingRepository();
