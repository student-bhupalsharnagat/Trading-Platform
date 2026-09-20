import { tenantConfigStore, ITenantConfigStore, SyncedTenantConfig } from './tenantConfigStore.ts';
import { tenantRepository } from '../repositories/JsonTenantRepository.ts';
import { auditService } from './auditService.ts';
import { tenantConfigCache } from '../cache/TenantConfigCache.ts';
import { emergencyStateCache } from '../cache/EmergencyStateCache.ts';
import { postgresTenantConfigRepository } from '../repositories/trading/PostgresTenantConfigRepository.ts';

export interface TenantSyncPayload {
  tenantId?: string;
  tenantStatus?: string;
  tradingEnabled?: boolean;
  registrationEnabled?: boolean;
  apiEnabled?: boolean;
  maintenanceMode?: boolean;
  optionsTradingEnabled?: boolean;
  maxLeverage?: number;
  brandingVersion?: number;
  configVersion?: number;
}

export interface TenantSyncResult {
  success: boolean;
  tenantId: string;
  configVersion: number;
  timestamp: string;
}

export class TenantConfigSyncService {
  constructor(private store: ITenantConfigStore = tenantConfigStore) {}

  public async syncTenantConfig(
    authoritativeTenantId: string,
    payload: TenantSyncPayload,
    source = 'CENTRAL_ADMIN'
  ): Promise<TenantSyncResult> {
    if (!authoritativeTenantId || typeof authoritativeTenantId !== 'string') {
      const err = new Error('Authoritative X-Tenant-ID is required.');
      (err as any).statusCode = 400;
      throw err;
    }

    // 1. Verify tenant identity match: payload tenantId must match X-Tenant-ID if supplied
    if (payload.tenantId && payload.tenantId.trim() !== authoritativeTenantId.trim()) {
      const err = new Error(
        `Tenant mismatch: Payload tenantId '${payload.tenantId}' does not match authoritative X-Tenant-ID '${authoritativeTenantId}'.`
      );
      (err as any).statusCode = 403;
      (err as any).code = 'TENANT_MISMATCH';
      throw err;
    }

    // 2. Validate field types and constraints
    if (payload.tradingEnabled !== undefined && typeof payload.tradingEnabled !== 'boolean') {
      const err = new Error('Field "tradingEnabled" must be a boolean.');
      (err as any).statusCode = 400;
      throw err;
    }
    if (payload.registrationEnabled !== undefined && typeof payload.registrationEnabled !== 'boolean') {
      const err = new Error('Field "registrationEnabled" must be a boolean.');
      (err as any).statusCode = 400;
      throw err;
    }
    if (payload.apiEnabled !== undefined && typeof payload.apiEnabled !== 'boolean') {
      const err = new Error('Field "apiEnabled" must be a boolean.');
      (err as any).statusCode = 400;
      throw err;
    }
    if (payload.maintenanceMode !== undefined && typeof payload.maintenanceMode !== 'boolean') {
      const err = new Error('Field "maintenanceMode" must be a boolean.');
      (err as any).statusCode = 400;
      throw err;
    }
    if (payload.optionsTradingEnabled !== undefined && typeof payload.optionsTradingEnabled !== 'boolean') {
      const err = new Error('Field "optionsTradingEnabled" must be a boolean.');
      (err as any).statusCode = 400;
      throw err;
    }
    if (payload.maxLeverage !== undefined) {
      if (typeof payload.maxLeverage !== 'number' || payload.maxLeverage < 1 || payload.maxLeverage > 500) {
        const err = new Error('Field "maxLeverage" must be a positive number between 1 and 500.');
        (err as any).statusCode = 400;
        throw err;
      }
    }
    if (payload.configVersion !== undefined) {
      if (typeof payload.configVersion !== 'number' || payload.configVersion < 0) {
        const err = new Error('Field "configVersion" must be a non-negative integer.');
        (err as any).statusCode = 400;
        throw err;
      }

      // Reject stale configuration versions
      const currentCachedVersion = tenantConfigCache.getVersion(authoritativeTenantId);
      if (currentCachedVersion > 0 && payload.configVersion <= currentCachedVersion) {
        const err = new Error(
          `Stale configuration version: received ${payload.configVersion}, current cached version is ${currentCachedVersion}.`
        );
        (err as any).statusCode = 409;
        (err as any).code = 'STALE_CONFIG_VERSION';
        throw err;
      }
    }
    if (payload.brandingVersion !== undefined) {
      if (typeof payload.brandingVersion !== 'number' || payload.brandingVersion < 0) {
        const err = new Error('Field "brandingVersion" must be a non-negative integer.');
        (err as any).statusCode = 400;
        throw err;
      }
    }
    if (payload.tenantStatus !== undefined) {
      const allowedStatuses = ['active', 'suspended', 'frozen', 'maintenance', 'ACTIVE', 'SUSPENDED', 'FROZEN', 'MAINTENANCE'];
      if (!allowedStatuses.includes(payload.tenantStatus)) {
        const err = new Error(`Invalid tenantStatus: ${payload.tenantStatus}`);
        (err as any).statusCode = 400;
        throw err;
      }
    }

    // 3. Update TenantConfigCache
    const cached = tenantConfigCache.set(authoritativeTenantId, {
      tenantId: authoritativeTenantId,
      tenantStatus: payload.tenantStatus?.toLowerCase(),
      tradingEnabled: payload.tradingEnabled,
      registrationEnabled: payload.registrationEnabled,
      apiEnabled: payload.apiEnabled,
      maintenanceMode: payload.maintenanceMode,
      optionsTradingEnabled: payload.optionsTradingEnabled,
      maxLeverage: payload.maxLeverage,
      brandingVersion: payload.brandingVersion,
      configVersion: payload.configVersion,
    });

    // 4. Update EmergencyStateCache
    const emergencyUpdates: any = {};
    if (payload.tradingEnabled !== undefined) {
      emergencyUpdates.tradingHalted = !payload.tradingEnabled;
      if (payload.tradingEnabled === false) {
        emergencyUpdates.reason = 'Trading disabled by central configuration sync';
      }
    }
    if (payload.maintenanceMode !== undefined) {
      emergencyUpdates.maintenanceActive = payload.maintenanceMode;
    }
    if (payload.tenantStatus !== undefined) {
      const norm = payload.tenantStatus.toLowerCase();
      emergencyUpdates.tenantFrozen = norm === 'frozen' || norm === 'suspended';
    }
    if (payload.registrationEnabled !== undefined) {
      emergencyUpdates.registrationFrozen = !payload.registrationEnabled;
    }
    if (payload.apiEnabled !== undefined) {
      emergencyUpdates.apiFrozen = !payload.apiEnabled;
    }
    if (Object.keys(emergencyUpdates).length > 0) {
      emergencyStateCache.set(authoritativeTenantId, emergencyUpdates);
    }

    // 5. Update the abstraction store (TenantConfigStore)
    const synced = await this.store.saveConfig(authoritativeTenantId, {
      tenantId: authoritativeTenantId,
      tenantStatus: payload.tenantStatus?.toLowerCase(),
      tradingEnabled: payload.tradingEnabled,
      registrationEnabled: payload.registrationEnabled,
      apiEnabled: payload.apiEnabled,
      maintenanceMode: payload.maintenanceMode,
      optionsTradingEnabled: payload.optionsTradingEnabled,
      maxLeverage: payload.maxLeverage,
      brandingVersion: payload.brandingVersion,
      configVersion: cached.configVersion,
    });

    // 6. Update the local tenant repository so runtime security middlewares observe it immediately
    const repoUpdates: any = {};
    if (payload.tradingEnabled !== undefined) repoUpdates.trading_enabled = payload.tradingEnabled;
    if (payload.registrationEnabled !== undefined) repoUpdates.registration_enabled = payload.registrationEnabled;
    if (payload.apiEnabled !== undefined) repoUpdates.api_enabled = payload.apiEnabled;
    if (payload.maintenanceMode !== undefined) repoUpdates.maintenance_mode = payload.maintenanceMode;
    if (payload.optionsTradingEnabled !== undefined) repoUpdates.options_trading_enabled = payload.optionsTradingEnabled;
    if (payload.maxLeverage !== undefined) repoUpdates.max_leverage = payload.maxLeverage;

    if (Object.keys(repoUpdates).length > 0) {
      await tenantRepository.updatePlatformConfig(authoritativeTenantId, repoUpdates);
    }

    if (payload.maintenanceMode !== undefined || payload.tenantStatus !== undefined || payload.tradingEnabled !== undefined) {
      const statusUpdates: any = {};
      if (payload.maintenanceMode !== undefined) {
        statusUpdates.maintenance_active = payload.maintenanceMode;
      }
      if (payload.tenantStatus !== undefined) {
        const norm = payload.tenantStatus.toLowerCase();
        statusUpdates.tenant_frozen = norm === 'frozen' || norm === 'suspended';
      }
      if (payload.tradingEnabled !== undefined) {
        // If trading was disabled via sync, activate killswitch state
        if (payload.tradingEnabled === false) {
          statusUpdates.trading_killswitch_active = true;
          statusUpdates.reason = 'Trading disabled by central configuration sync';
        } else {
          statusUpdates.trading_killswitch_active = false;
          statusUpdates.reason = undefined;
        }
      }
      await tenantRepository.updateStatus(authoritativeTenantId, statusUpdates);
    }

    // 7. Persist to PostgreSQL database for crash-proof durable storage
    try {
      await postgresTenantConfigRepository.upsertConfig({
        tenant_id: authoritativeTenantId,
        trading_enabled: cached.tradingEnabled ?? true,
        registration_enabled: cached.registrationEnabled ?? true,
        api_enabled: cached.apiEnabled ?? true,
        max_leverage: cached.maxLeverage ?? 50,
        config_version: cached.configVersion ?? 1,
        branding_version: cached.brandingVersion ?? 1,
      });

      const currentEmg = emergencyStateCache.get(authoritativeTenantId);
      await postgresTenantConfigRepository.upsertEmergencyStatus({
        tenant_id: authoritativeTenantId,
        tenant_frozen: currentEmg.tenantFrozen ?? false,
        trading_halted: currentEmg.tradingHalted ?? false,
        registration_frozen: currentEmg.registrationFrozen ?? false,
        api_frozen: currentEmg.apiFrozen ?? false,
        reason: currentEmg.reason,
      });
    } catch (pgErr: any) {
      console.warn('[PostgresSync] Non-blocking PostgreSQL persistence warning:', pgErr.message);
    }

    // 8. Audit Logging (Never log secrets or HMAC signatures)
    auditService.logEmergencyEvent({
      action: 'TENANT_CONFIG_SYNC',
      source,
      tenantId: authoritativeTenantId,
      reason: 'Authoritative tenant configuration synchronized from Central Admin',
      result: {
        configVersion: cached.configVersion,
        tradingEnabled: cached.tradingEnabled,
        tenantStatus: cached.tenantStatus,
      },
    });

    return {
      success: true,
      tenantId: authoritativeTenantId,
      configVersion: cached.configVersion,
      timestamp: cached.lastUpdatedAt,
    };
  }

  public async getTenantConfig(tenantId: string): Promise<SyncedTenantConfig | null> {
    return this.store.getConfig(tenantId);
  }
}

export const tenantConfigSyncService = new TenantConfigSyncService();
