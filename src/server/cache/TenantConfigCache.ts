/**
 * Server-Side Tenant Configuration Cache with Distributed Invalidation
 *
 * Architecture:
 * - L1: High-speed local in-memory Map for microsecond request path lookups.
 * - L2: Redis-backed shared cache & coordination layer.
 * - Distributed Invalidation: When any instance updates or syncs tenant configuration,
 *   a Redis Pub/Sub message invalidates or refreshes all peer instances' L1 caches.
 * - Resilience: Transparently degrades to local L1 cache if Redis is unavailable.
 */

import { redisService } from '../redis/RedisService.ts';

export interface CachedTenantConfig {
  tenantId: string;
  tenantStatus: string;
  tradingEnabled: boolean;
  registrationEnabled: boolean;
  apiEnabled: boolean;
  maintenanceMode: boolean;
  optionsTradingEnabled: boolean;
  maxLeverage: number;
  brandingVersion: number;
  configVersion: number;
  lastUpdatedAt: string;
}

export interface CacheHealthStatus {
  status: 'healthy' | 'degraded' | 'uninitialized';
  initialized: boolean;
  cachedTenantsCount: number;
  lastUpdatedAt: string | null;
  distributedSyncActive: boolean;
}

export const TENANT_CONFIG_CHANNEL = 'vertex:cache:tenant-config';

export class TenantConfigCache {
  private cache = new Map<string, CachedTenantConfig>();
  private initialized = false;
  private lastUpdate: string | null = null;
  private instanceId = `inst-tc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  private isSubscribed = false;

  constructor() {
    this.setupDistributedListener();
  }

  private async setupDistributedListener(): Promise<void> {
    if (this.isSubscribed) return;

    try {
      await redisService.subscribe(TENANT_CONFIG_CHANNEL, (channel, message) => {
        try {
          const event = JSON.parse(message);
          if (!event || event.senderInstanceId === this.instanceId) {
            return; // Ignore own echoes
          }

          if (event.action === 'UPDATE' && event.config && event.tenantId) {
            this.setLocal(event.tenantId, event.config);
          } else if (event.action === 'INVALIDATE' && event.tenantId) {
            this.cache.delete(event.tenantId);
          }
        } catch (err: any) {
          console.warn('[TenantConfigCache] Distributed message parse error:', err.message);
        }
      });
      this.isSubscribed = true;
    } catch (err: any) {
      console.warn('[TenantConfigCache] Distributed subscription deferred:', err.message);
    }
  }

  public getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Retrieves tenant configuration from L1 local cache.
   */
  public get(tenantId: string): CachedTenantConfig | null {
    if (!tenantId) return null;
    const config = this.cache.get(tenantId);
    return config ? { ...config } : null;
  }

  /**
   * Sets or merges tenant configuration into L1 cache and coordinates across L2 Redis.
   */
  public set(
    tenantId: string,
    updates: Partial<CachedTenantConfig>,
    broadcast = true
  ): CachedTenantConfig {
    if (!tenantId) {
      throw new Error('TenantConfigCache.set requires a valid tenantId.');
    }

    const merged = this.setLocal(tenantId, updates);

    // Asynchronously write to Redis L2 and broadcast invalidation to peer instances
    if (broadcast) {
      this.syncToRedis(tenantId, merged).catch((err) => {
        console.warn(`[TenantConfigCache] Redis sync error for ${tenantId}:`, err.message);
      });
    }

    return merged;
  }

  private setLocal(tenantId: string, updates: Partial<CachedTenantConfig>): CachedTenantConfig {
    const existing = this.cache.get(tenantId);
    const now = new Date().toISOString();

    const currentVersion = existing?.configVersion ?? 0;
    const nextVersion =
      typeof updates.configVersion === 'number'
        ? updates.configVersion
        : (existing?.configVersion ?? currentVersion + 1);

    const merged: CachedTenantConfig = {
      tenantId,
      tenantStatus: updates.tenantStatus ?? existing?.tenantStatus ?? 'active',
      tradingEnabled:
        updates.tradingEnabled !== undefined
          ? updates.tradingEnabled
          : existing?.tradingEnabled ?? true,
      registrationEnabled:
        updates.registrationEnabled !== undefined
          ? updates.registrationEnabled
          : existing?.registrationEnabled ?? true,
      apiEnabled:
        updates.apiEnabled !== undefined
          ? updates.apiEnabled
          : existing?.apiEnabled ?? true,
      maintenanceMode:
        updates.maintenanceMode !== undefined
          ? updates.maintenanceMode
          : existing?.maintenanceMode ?? false,
      optionsTradingEnabled:
        updates.optionsTradingEnabled !== undefined
          ? updates.optionsTradingEnabled
          : existing?.optionsTradingEnabled ?? true,
      maxLeverage:
        typeof updates.maxLeverage === 'number'
          ? updates.maxLeverage
          : existing?.maxLeverage ?? 50,
      brandingVersion:
        typeof updates.brandingVersion === 'number'
          ? updates.brandingVersion
          : existing?.brandingVersion ?? 1,
      configVersion: nextVersion,
      lastUpdatedAt: updates.lastUpdatedAt ?? now,
    };

    this.cache.set(tenantId, merged);
    this.lastUpdate = now;
    return { ...merged };
  }

  private async syncToRedis(tenantId: string, config: CachedTenantConfig): Promise<void> {
    const redisKey = `cache:tenant_config:${tenantId}`;
    await redisService.set(redisKey, JSON.stringify(config), 86400); // 24hr L2 cache

    await redisService.publish(TENANT_CONFIG_CHANNEL, {
      action: 'UPDATE',
      tenantId,
      config,
      senderInstanceId: this.instanceId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Returns current config version for tenant, or 0 if not cached.
   */
  public getVersion(tenantId: string): number {
    if (!tenantId) return 0;
    return this.cache.get(tenantId)?.configVersion ?? 0;
  }

  /**
   * Invalidates cached configuration for a specific tenant across all instances.
   */
  public invalidate(tenantId: string, broadcast = true): void {
    if (!tenantId) return;
    this.cache.delete(tenantId);

    if (broadcast) {
      const redisKey = `cache:tenant_config:${tenantId}`;
      redisService.del(redisKey).catch(() => {});
      redisService.publish(TENANT_CONFIG_CHANNEL, {
        action: 'INVALIDATE',
        tenantId,
        senderInstanceId: this.instanceId,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  /**
   * Retrieves all cached configurations.
   */
  public getAll(): CachedTenantConfig[] {
    return Array.from(this.cache.values()).map((c) => ({ ...c }));
  }

  /**
   * Returns whether the cache has completed initial load.
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Returns safe health and observability metrics.
   */
  public getHealth(): CacheHealthStatus {
    return {
      status: this.initialized ? 'healthy' : 'degraded',
      initialized: this.initialized,
      cachedTenantsCount: this.cache.size,
      lastUpdatedAt: this.lastUpdate,
      distributedSyncActive: this.isSubscribed && redisService.isConnected(),
    };
  }

  /**
   * Safe non-blocking initialization from local tenant records.
   */
  public initializeFromLocal(
    records: Array<{
      id: string;
      status?: string;
      config?: {
        trading_enabled?: boolean;
        registration_enabled?: boolean;
        api_enabled?: boolean;
        maintenance_mode?: boolean;
        options_trading_enabled?: boolean;
        max_leverage?: number;
      };
      securityStatus?: {
        tenant_frozen?: boolean;
        trading_killswitch_active?: boolean;
        maintenance_active?: boolean;
      };
    }>
  ): void {
    try {
      const now = new Date().toISOString();
      for (const rec of records) {
        if (!rec.id) continue;
        const tenantStatus =
          rec.securityStatus?.tenant_frozen || rec.status === 'frozen'
            ? 'frozen'
            : rec.status || 'active';

        const tradingEnabled =
          rec.securityStatus?.trading_killswitch_active === true
            ? false
            : rec.config?.trading_enabled !== false;

        const maintenanceMode =
          rec.securityStatus?.maintenance_active === true
            ? true
            : rec.config?.maintenance_mode === true;

        this.setLocal(rec.id, {
          tenantId: rec.id,
          tenantStatus,
          tradingEnabled,
          registrationEnabled: rec.config?.registration_enabled !== false,
          apiEnabled: rec.config?.api_enabled !== false,
          maintenanceMode,
          optionsTradingEnabled: rec.config?.options_trading_enabled !== false,
          maxLeverage: rec.config?.max_leverage ?? 50,
          brandingVersion: 1,
          configVersion: 1,
          lastUpdatedAt: now,
        });
      }
      this.initialized = true;
      this.lastUpdate = now;
    } catch (err) {
      console.error('[TenantConfigCache] Error during local initialization:', err);
    }
  }

  /**
   * Resets cache state (primarily for test isolation).
   */
  public reset(): void {
    this.cache.clear();
    this.initialized = false;
    this.lastUpdate = null;
  }
}

export const tenantConfigCache = new TenantConfigCache();
