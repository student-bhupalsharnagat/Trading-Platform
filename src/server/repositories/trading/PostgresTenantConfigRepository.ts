/**
-- VERTEX Multi-Tenant Trading Platform - Phase 5J-A
-- PostgreSQL Tenant Config and Emergency Status Repository
-- Ensures authoritative persistence survives process restarts
*/

import { pgDb, DbClient } from '../../db/postgres.ts';

export interface PostgresTenantConfigRecord {
  tenant_id: string;
  brand_name?: string;
  short_name?: string;
  logo_url?: string;
  favicon_url?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  support_email?: string;
  support_phone?: string;
  legal_links?: Record<string, any>;
  domain_config?: Record<string, any>;
  feature_flags?: Record<string, any>;
  trading_enabled: boolean;
  registration_enabled: boolean;
  api_enabled: boolean;
  support_enabled: boolean;
  notifications_enabled: boolean;
  max_leverage: number;
  config_version: number;
  branding_version: number;
  updated_at: string;
}

export interface PostgresEmergencyStatusRecord {
  tenant_id: string;
  tenant_frozen: boolean;
  trading_halted: boolean;
  registration_frozen: boolean;
  api_frozen: boolean;
  killswitch_active: boolean;
  reason?: string;
  updated_at: string;
}

export class PostgresTenantConfigRepository {
  public async upsertConfig(
    data: Partial<PostgresTenantConfigRecord> & { tenant_id: string },
    client?: DbClient
  ): Promise<PostgresTenantConfigRecord> {
    const executor = client || pgDb;
    const sql = `
      INSERT INTO tenant_configs (
        tenant_id, brand_name, short_name, logo_url, favicon_url,
        primary_color, secondary_color, accent_color, support_email, support_phone,
        legal_links, domain_config, feature_flags,
        trading_enabled, registration_enabled, api_enabled, support_enabled, notifications_enabled,
        max_leverage, config_version, branding_version, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13,
        $14, $15, $16, $17, $18,
        $19, $20, $21, NOW()
      )
      ON CONFLICT (tenant_id) DO UPDATE SET
        brand_name = COALESCE(EXCLUDED.brand_name, tenant_configs.brand_name),
        short_name = COALESCE(EXCLUDED.short_name, tenant_configs.short_name),
        logo_url = COALESCE(EXCLUDED.logo_url, tenant_configs.logo_url),
        favicon_url = COALESCE(EXCLUDED.favicon_url, tenant_configs.favicon_url),
        primary_color = COALESCE(EXCLUDED.primary_color, tenant_configs.primary_color),
        secondary_color = COALESCE(EXCLUDED.secondary_color, tenant_configs.secondary_color),
        accent_color = COALESCE(EXCLUDED.accent_color, tenant_configs.accent_color),
        support_email = COALESCE(EXCLUDED.support_email, tenant_configs.support_email),
        support_phone = COALESCE(EXCLUDED.support_phone, tenant_configs.support_phone),
        legal_links = COALESCE(EXCLUDED.legal_links, tenant_configs.legal_links),
        domain_config = COALESCE(EXCLUDED.domain_config, tenant_configs.domain_config),
        feature_flags = COALESCE(EXCLUDED.feature_flags, tenant_configs.feature_flags),
        trading_enabled = COALESCE(EXCLUDED.trading_enabled, tenant_configs.trading_enabled),
        registration_enabled = COALESCE(EXCLUDED.registration_enabled, tenant_configs.registration_enabled),
        api_enabled = COALESCE(EXCLUDED.api_enabled, tenant_configs.api_enabled),
        support_enabled = COALESCE(EXCLUDED.support_enabled, tenant_configs.support_enabled),
        notifications_enabled = COALESCE(EXCLUDED.notifications_enabled, tenant_configs.notifications_enabled),
        max_leverage = COALESCE(EXCLUDED.max_leverage, tenant_configs.max_leverage),
        config_version = COALESCE(EXCLUDED.config_version, tenant_configs.config_version),
        branding_version = COALESCE(EXCLUDED.branding_version, tenant_configs.branding_version),
        updated_at = NOW()
      RETURNING *;
    `;

    const res = await executor.query(sql, [
      data.tenant_id,
      data.brand_name ?? null,
      data.short_name ?? null,
      data.logo_url ?? null,
      data.favicon_url ?? null,
      data.primary_color ?? null,
      data.secondary_color ?? null,
      data.accent_color ?? null,
      data.support_email ?? null,
      data.support_phone ?? null,
      JSON.stringify(data.legal_links ?? {}),
      JSON.stringify(data.domain_config ?? {}),
      JSON.stringify(data.feature_flags ?? {}),
      data.trading_enabled ?? true,
      data.registration_enabled ?? true,
      data.api_enabled ?? true,
      data.support_enabled ?? true,
      data.notifications_enabled ?? true,
      data.max_leverage ?? 50,
      data.config_version ?? 1,
      data.branding_version ?? 1,
    ]);

    return res.rows[0];
  }

  public async getConfig(tenantId: string, client?: DbClient): Promise<PostgresTenantConfigRecord | null> {
    const executor = client || pgDb;
    const res = await executor.query('SELECT * FROM tenant_configs WHERE tenant_id = $1 LIMIT 1', [tenantId]);
    return res.rows[0] || null;
  }

  public async getAllConfigs(client?: DbClient): Promise<PostgresTenantConfigRecord[]> {
    const executor = client || pgDb;
    const res = await executor.query('SELECT * FROM tenant_configs ORDER BY tenant_id ASC');
    return res.rows || [];
  }

  public async upsertEmergencyStatus(
    data: Partial<PostgresEmergencyStatusRecord> & { tenant_id: string },
    client?: DbClient
  ): Promise<PostgresEmergencyStatusRecord> {
    const executor = client || pgDb;
    const sql = `
      INSERT INTO tenant_emergency_status (
        tenant_id, tenant_frozen, trading_halted, registration_frozen,
        api_frozen, killswitch_active, reason, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, NOW()
      )
      ON CONFLICT (tenant_id) DO UPDATE SET
        tenant_frozen = COALESCE(EXCLUDED.tenant_frozen, tenant_emergency_status.tenant_frozen),
        trading_halted = COALESCE(EXCLUDED.trading_halted, tenant_emergency_status.trading_halted),
        registration_frozen = COALESCE(EXCLUDED.registration_frozen, tenant_emergency_status.registration_frozen),
        api_frozen = COALESCE(EXCLUDED.api_frozen, tenant_emergency_status.api_frozen),
        killswitch_active = COALESCE(EXCLUDED.killswitch_active, tenant_emergency_status.killswitch_active),
        reason = COALESCE(EXCLUDED.reason, tenant_emergency_status.reason),
        updated_at = NOW()
      RETURNING *;
    `;

    const res = await executor.query(sql, [
      data.tenant_id,
      data.tenant_frozen ?? false,
      data.trading_halted ?? false,
      data.registration_frozen ?? false,
      data.api_frozen ?? false,
      data.killswitch_active ?? false,
      data.reason ?? null,
    ]);

    return res.rows[0];
  }

  public async getEmergencyStatus(tenantId: string, client?: DbClient): Promise<PostgresEmergencyStatusRecord | null> {
    const executor = client || pgDb;
    const res = await executor.query('SELECT * FROM tenant_emergency_status WHERE tenant_id = $1 LIMIT 1', [tenantId]);
    return res.rows[0] || null;
  }

  public async getAllEmergencyStatuses(client?: DbClient): Promise<PostgresEmergencyStatusRecord[]> {
    const executor = client || pgDb;
    const res = await executor.query('SELECT * FROM tenant_emergency_status ORDER BY tenant_id ASC');
    return res.rows || [];
  }
}

export const postgresTenantConfigRepository = new PostgresTenantConfigRepository();
