/**
 * Emergency State Cache with Distributed Invalidation & Propagation
 *
 * Responsibilities:
 * - Store tenant emergency statuses in local memory (L1).
 * - Synchronize with shared Redis (L2) and listen on Pub/Sub channels
 *   so emergency halts, freezes, and controls propagate instantly across all instances.
 * - Serve microsecond lookups for security middlewares.
 * - Graceful degradation if Redis is unavailable.
 */

import { redisService } from '../redis/RedisService.ts';

export interface CachedEmergencyState {
  tenantId: string;
  tradingHalted: boolean;
  tenantFrozen: boolean;
  registrationFrozen: boolean;
  apiFrozen: boolean;
  maintenanceActive: boolean;
  reason?: string;
  version: number;
  lastUpdatedAt: string;
}

export type EmergencyBroadcastAction =
  | 'TRADING_HALT'
  | 'TRADING_RESUME'
  | 'USER_FREEZE'
  | 'USER_UNFREEZE'
  | 'BROKER_FREEZE'
  | 'BROKER_UNFREEZE'
  | 'API_DISABLE'
  | 'API_ENABLE'
  | 'REGISTRATION_DISABLE'
  | 'REGISTRATION_ENABLE';

export interface EmergencyBroadcastEvent {
  action: EmergencyBroadcastAction;
  tenantId: string;
  payload?: any;
  senderInstanceId: string;
  timestamp: string;
}

export const EMERGENCY_STATE_CHANNEL = 'vertex:cache:emergency';
export const EMERGENCY_BROADCAST_CHANNEL = 'vertex:emergency:broadcast';

export class EmergencyStateCache {
  private cache = new Map<string, CachedEmergencyState>();
  private instanceId = `inst-esc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  private isSubscribed = false;
  private emergencyListeners = new Set<(event: EmergencyBroadcastEvent) => void>();

  constructor() {
    this.setupDistributedListener();
  }

  private async setupDistributedListener(): Promise<void> {
    if (this.isSubscribed) return;

    try {
      await redisService.subscribe(EMERGENCY_STATE_CHANNEL, (channel, message) => {
        try {
          const event = JSON.parse(message);
          if (!event || event.senderInstanceId === this.instanceId) return;

          if (event.action === 'UPDATE' && event.tenantId && event.state) {
            this.setLocal(event.tenantId, event.state);
          } else if (event.action === 'INVALIDATE' && event.tenantId) {
            this.cache.delete(event.tenantId);
          }
        } catch (err: any) {
          console.warn('[EmergencyStateCache] Distributed sync parse error:', err.message);
        }
      });

      await redisService.subscribe(EMERGENCY_BROADCAST_CHANNEL, (channel, message) => {
        try {
          const event: EmergencyBroadcastEvent = JSON.parse(message);
          if (!event) return;

          // Notify registered listeners (e.g. WebSocket or security handlers)
          this.emergencyListeners.forEach((listener) => {
            try {
              listener(event);
            } catch (lErr) {
              console.error('[EmergencyStateCache] Listener error:', lErr);
            }
          });
        } catch (err: any) {
          console.warn('[EmergencyStateCache] Emergency broadcast parse error:', err.message);
        }
      });

      this.isSubscribed = true;
    } catch (err: any) {
      console.warn('[EmergencyStateCache] Distributed subscription deferred:', err.message);
    }
  }

  public getInstanceId(): string {
    return this.instanceId;
  }

  public onEmergencyBroadcast(listener: (event: EmergencyBroadcastEvent) => void): () => void {
    this.emergencyListeners.add(listener);
    return () => this.emergencyListeners.delete(listener);
  }

  /**
   * Retrieves emergency state for a tenant from L1.
   */
  public get(tenantId: string): CachedEmergencyState {
    if (!tenantId) {
      return this.createDefaultState('unknown');
    }

    const state = this.cache.get(tenantId);
    if (state) {
      return { ...state };
    }

    return this.createDefaultState(tenantId);
  }

  /**
   * Updates emergency state in L1 and broadcasts to L2 Redis & peers.
   */
  public set(
    tenantId: string,
    updates: Partial<CachedEmergencyState>,
    broadcast = true
  ): CachedEmergencyState {
    if (!tenantId) {
      throw new Error('EmergencyStateCache.set requires a valid tenantId.');
    }

    const merged = this.setLocal(tenantId, updates);

    if (broadcast) {
      this.syncToRedis(tenantId, merged).catch((err) => {
        console.warn(`[EmergencyStateCache] Redis sync error for ${tenantId}:`, err.message);
      });
    }

    return merged;
  }

  private setLocal(tenantId: string, updates: Partial<CachedEmergencyState>): CachedEmergencyState {
    const existing = this.cache.get(tenantId) || this.createDefaultState(tenantId);
    const now = new Date().toISOString();

    const currentVersion = existing.version || 0;
    const nextVersion =
      typeof updates.version === 'number'
        ? updates.version
        : currentVersion + 1;

    const merged: CachedEmergencyState = {
      tenantId,
      tradingHalted:
        updates.tradingHalted !== undefined
          ? updates.tradingHalted
          : existing.tradingHalted,
      tenantFrozen:
        updates.tenantFrozen !== undefined
          ? updates.tenantFrozen
          : existing.tenantFrozen,
      registrationFrozen:
        updates.registrationFrozen !== undefined
          ? updates.registrationFrozen
          : existing.registrationFrozen,
      apiFrozen:
        updates.apiFrozen !== undefined
          ? updates.apiFrozen
          : existing.apiFrozen,
      maintenanceActive:
        updates.maintenanceActive !== undefined
          ? updates.maintenanceActive
          : existing.maintenanceActive,
      reason: updates.reason !== undefined ? updates.reason : existing.reason,
      version: nextVersion,
      lastUpdatedAt: updates.lastUpdatedAt || now,
    };

    this.cache.set(tenantId, merged);
    return { ...merged };
  }

  private async syncToRedis(tenantId: string, state: CachedEmergencyState): Promise<void> {
    const redisKey = `cache:emergency:${tenantId}`;
    await redisService.set(redisKey, JSON.stringify(state), 86400);

    await redisService.publish(EMERGENCY_STATE_CHANNEL, {
      action: 'UPDATE',
      tenantId,
      state,
      senderInstanceId: this.instanceId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcasts an immediate emergency control command across all cluster instances.
   */
  public async broadcastEmergencyAction(
    action: EmergencyBroadcastAction,
    tenantId: string,
    payload?: any
  ): Promise<void> {
    const event: EmergencyBroadcastEvent = {
      action,
      tenantId,
      payload,
      senderInstanceId: this.instanceId,
      timestamp: new Date().toISOString(),
    };

    // Trigger local listeners first
    this.emergencyListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('[EmergencyStateCache] Local broadcast listener error:', err);
      }
    });

    // Broadcast across instances via Redis
    await redisService.publish(EMERGENCY_BROADCAST_CHANNEL, event);
  }

  /**
   * Gets version of emergency state for a tenant.
   */
  public getVersion(tenantId: string): number {
    return this.cache.get(tenantId)?.version ?? 0;
  }

  /**
   * Invalidates cached emergency state for tenant.
   */
  public invalidate(tenantId: string, broadcast = true): void {
    if (!tenantId) return;
    this.cache.delete(tenantId);

    if (broadcast) {
      const redisKey = `cache:emergency:${tenantId}`;
      redisService.del(redisKey).catch(() => {});
      redisService.publish(EMERGENCY_STATE_CHANNEL, {
        action: 'INVALIDATE',
        tenantId,
        senderInstanceId: this.instanceId,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  /**
   * Initializes emergency cache from local records.
   */
  public initializeFromLocal(
    records: Array<{
      id: string;
      status?: {
        tenant_frozen?: boolean;
        trading_killswitch_active?: boolean;
        registration_frozen?: boolean;
        api_frozen?: boolean;
        maintenance_active?: boolean;
        reason?: string;
      };
      config?: {
        trading_enabled?: boolean;
        maintenance_mode?: boolean;
      };
    }>
  ): void {
    const now = new Date().toISOString();
    for (const rec of records) {
      if (!rec.id) continue;
      const tradingHalted =
        rec.status?.trading_killswitch_active === true ||
        rec.config?.trading_enabled === false;

      const maintenanceActive =
        rec.status?.maintenance_active === true ||
        rec.config?.maintenance_mode === true;

      this.setLocal(rec.id, {
        tenantId: rec.id,
        tradingHalted,
        tenantFrozen: rec.status?.tenant_frozen === true,
        registrationFrozen: rec.status?.registration_frozen === true,
        apiFrozen: rec.status?.api_frozen === true,
        maintenanceActive,
        reason: rec.status?.reason,
        version: 1,
        lastUpdatedAt: now,
      });
    }
  }

  /**
   * Resets cache state (for testing).
   */
  public reset(): void {
    this.cache.clear();
  }

  private createDefaultState(tenantId: string): CachedEmergencyState {
    return {
      tenantId,
      tradingHalted: false,
      tenantFrozen: false,
      registrationFrozen: false,
      apiFrozen: false,
      maintenanceActive: false,
      version: 0,
      lastUpdatedAt: new Date().toISOString(),
    };
  }
}

export const emergencyStateCache = new EmergencyStateCache();
