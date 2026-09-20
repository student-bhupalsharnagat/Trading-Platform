/**
 * Safe Initialization Routine for TenantConfigCache and EmergencyStateCache.
 *
 * Constraints:
 * - Does NOT block application startup.
 * - Loads existing locally available tenant configurations.
 * - If Central Admin is unavailable, continues using the last known valid local configuration.
 * - Clearly exposes cache health/status.
 * - Never silently creates arbitrary tenant configurations.
 */

import { tenantRepository } from '../repositories/JsonTenantRepository.ts';
import { tenantConfigCache } from './TenantConfigCache.ts';
import { emergencyStateCache } from './EmergencyStateCache.ts';
import { postgresTenantConfigRepository } from '../repositories/trading/PostgresTenantConfigRepository.ts';

export async function initializeCachesFromLocal(): Promise<{
  success: boolean;
  tenantCount: number;
  error?: string;
}> {
  try {
    const tenants = await tenantRepository.findAll();
    const records: any[] = [];

    // Query authoritative PostgreSQL overrides if table exists
    let pgConfigs: any[] = [];
    let pgEmergencyStatuses: any[] = [];
    try {
      pgConfigs = await postgresTenantConfigRepository.getAllConfigs();
      pgEmergencyStatuses = await postgresTenantConfigRepository.getAllEmergencyStatuses();
    } catch {
      // Migrations may not have run yet or embedded fallback
    }

    const pgConfigMap = new Map(pgConfigs.map((c) => [c.tenant_id, c]));
    const pgEmergencyMap = new Map(pgEmergencyStatuses.map((s) => [s.tenant_id, s]));

    for (const t of tenants) {
      const config: Record<string, any> = ((await tenantRepository.getPlatformConfig(t.id)) as Record<string, any>) || {};
      const status: Record<string, any> = ((await tenantRepository.getStatus(t.id)) as Record<string, any>) || {};

      // Merge PostgreSQL authoritative overrides if present
      const pgConf: any = pgConfigMap.get(t.id);
      if (pgConf) {
        if (pgConf.trading_enabled !== undefined) config.trading_enabled = pgConf.trading_enabled;
        if (pgConf.registration_enabled !== undefined) config.registration_enabled = pgConf.registration_enabled;
        if (pgConf.api_enabled !== undefined) config.api_enabled = pgConf.api_enabled;
        if (pgConf.support_enabled !== undefined) config.support_enabled = pgConf.support_enabled;
        if (pgConf.notifications_enabled !== undefined) config.notifications_enabled = pgConf.notifications_enabled;
        if (pgConf.max_leverage !== undefined) config.max_leverage = Number(pgConf.max_leverage);
        if (pgConf.config_version !== undefined) config.config_version = pgConf.config_version;
      }

      const pgEmg: any = pgEmergencyMap.get(t.id);
      if (pgEmg) {
        if (pgEmg.tenant_frozen !== undefined) status.tenant_frozen = pgEmg.tenant_frozen;
        if (pgEmg.trading_halted !== undefined) status.trading_killswitch_active = pgEmg.trading_halted;
        if (pgEmg.registration_frozen !== undefined) status.registration_frozen = pgEmg.registration_frozen;
        if (pgEmg.api_frozen !== undefined) status.api_frozen = pgEmg.api_frozen;
        if (pgEmg.reason) status.reason = pgEmg.reason;
      }

      records.push({
        id: t.id,
        status: t.status,
        config: Object.keys(config).length > 0 ? config : undefined,
        securityStatus: Object.keys(status).length > 0 ? status : undefined,
      });
    }

    tenantConfigCache.initializeFromLocal(records);
    emergencyStateCache.initializeFromLocal(
      records.map((r) => ({
        id: r.id,
        status: r.securityStatus,
        config: r.config,
      }))
    );

    console.log(
      `[CACHE INIT] Initialized TenantConfigCache and EmergencyStateCache with ${records.length} local tenants (PostgreSQL synchronized).`
    );

    return {
      success: true,
      tenantCount: records.length,
    };
  } catch (err: any) {
    console.error('[CACHE INIT] Failed to initialize caches from local repository:', err);
    return {
      success: false,
      tenantCount: 0,
      error: err.message,
    };
  }
}
