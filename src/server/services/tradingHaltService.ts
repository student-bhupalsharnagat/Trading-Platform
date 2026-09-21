import { tenantRepository } from '../repositories/JsonTenantRepository.ts';
import { auditService } from './auditService.ts';
import { emergencyStateCache } from '../cache/EmergencyStateCache.ts';
import { tenantConfigCache } from '../cache/TenantConfigCache.ts';
import { tradingWebSocketServer } from '../websocket/WebSocketServer.ts';
import { postgresTenantConfigRepository } from '../repositories/trading/PostgresTenantConfigRepository.ts';

export interface TradingHaltResult {
  success: boolean;
  tenantId: string;
  tradingHalted: boolean;
  reason?: string;
  timestamp: string;
}

export class TradingHaltService {
  public async setTradingHalt(
    authoritativeTenantId: string,
    enabled: boolean,
    reason?: string,
    source = 'CENTRAL_ADMIN'
  ): Promise<TradingHaltResult> {
    if (!authoritativeTenantId) {
      const err = new Error('Authoritative X-Tenant-ID is required.');
      (err as any).statusCode = 400;
      throw err;
    }

    if (typeof enabled !== 'boolean') {
      const err = new Error('Field "enabled" must be a boolean.');
      (err as any).statusCode = 400;
      throw err;
    }

    const currentStatus = await tenantRepository.getStatus(authoritativeTenantId);
    const currentConfig = await tenantRepository.getPlatformConfig(authoritativeTenantId);

    const isCurrentlyHalted =
      Boolean(currentStatus?.trading_killswitch_active) ||
      (currentConfig !== null && currentConfig.trading_enabled === false);

    if (enabled) {
      // Emergency Trading Halt
      const haltReason = reason || 'Emergency trading halt commanded by Central Admin';

      await tenantRepository.updateStatus(authoritativeTenantId, {
        trading_killswitch_active: true,
        reason: haltReason,
      });
      await tenantRepository.updatePlatformConfig(authoritativeTenantId, {
        trading_enabled: false,
      });

      // Update local in-memory caches
      emergencyStateCache.set(authoritativeTenantId, {
        tradingHalted: true,
        reason: haltReason,
      });
      tenantConfigCache.set(authoritativeTenantId, {
        tradingEnabled: false,
      });

      // Audit Log (Never log secrets or HMAC signatures)
      auditService.logEmergencyEvent({
        action: 'TRADING_HALT',
        source,
        tenantId: authoritativeTenantId,
        reason: haltReason,
        result: {
          tradingHalted: true,
          previousStateHalted: isCurrentlyHalted,
        },
      });

      tradingWebSocketServer.broadcastToTenant(authoritativeTenantId, 'emergency.updated', {
        action: 'TRADING_HALT',
        tradingHalted: true,
        reason: haltReason,
      });

      // Broadcast across instances via Redis
      emergencyStateCache.broadcastEmergencyAction(
        'TRADING_HALT',
        authoritativeTenantId,
        { reason: haltReason }
      ).catch(() => {});

      // Persist emergency status to PostgreSQL
      try {
        await postgresTenantConfigRepository.upsertEmergencyStatus({
          tenant_id: authoritativeTenantId,
          trading_halted: true,
          killswitch_active: true,
          reason: haltReason,
        });
        await postgresTenantConfigRepository.upsertConfig({
          tenant_id: authoritativeTenantId,
          trading_enabled: false,
        });
      } catch (pgErr: any) {
        console.warn('[PostgresSync] Non-blocking halt persistence warning:', pgErr.message);
      }

      return {
        success: true,
        tenantId: authoritativeTenantId,
        tradingHalted: true,
        reason: haltReason,
        timestamp: new Date().toISOString(),
      };
    } else {
      // Resume Trading
      // Check tenant base configuration
      const tenant = await tenantRepository.findById(authoritativeTenantId);
      const tenantSuspended = tenant?.status === 'suspended';

      if (tenantSuspended) {
        return {
          success: true,
          tenantId: authoritativeTenantId,
          tradingHalted: true,
          reason: 'Tenant account is suspended. Trading cannot be resumed.',
          timestamp: new Date().toISOString(),
        };
      }

      await tenantRepository.updateStatus(authoritativeTenantId, {
        trading_killswitch_active: false,
        reason: undefined,
      });
      await tenantRepository.updatePlatformConfig(authoritativeTenantId, {
        trading_enabled: true,
      });

      // Update local in-memory caches
      emergencyStateCache.set(authoritativeTenantId, {
        tradingHalted: false,
        reason: undefined,
      });
      tenantConfigCache.set(authoritativeTenantId, {
        tradingEnabled: true,
      });

      const resumeReason = reason || 'Trading resumed by Central Admin';

      auditService.logEmergencyEvent({
        action: 'TRADING_RESUME',
        source,
        tenantId: authoritativeTenantId,
        reason: resumeReason,
        result: {
          tradingHalted: false,
          previousStateHalted: isCurrentlyHalted,
        },
      });

      tradingWebSocketServer.broadcastToTenant(authoritativeTenantId, 'emergency.updated', {
        action: 'TRADING_RESUME',
        tradingHalted: false,
        reason: resumeReason,
      });

      // Broadcast across instances via Redis
      emergencyStateCache.broadcastEmergencyAction(
        'TRADING_RESUME',
        authoritativeTenantId,
        { reason: resumeReason }
      ).catch(() => {});

      // Persist emergency status to PostgreSQL
      try {
        await postgresTenantConfigRepository.upsertEmergencyStatus({
          tenant_id: authoritativeTenantId,
          trading_halted: false,
          killswitch_active: false,
          reason: undefined,
        });
        await postgresTenantConfigRepository.upsertConfig({
          tenant_id: authoritativeTenantId,
          trading_enabled: true,
        });
      } catch (pgErr: any) {
        console.warn('[PostgresSync] Non-blocking resume persistence warning:', pgErr.message);
      }

      return {
        success: true,
        tenantId: authoritativeTenantId,
        tradingHalted: false,
        reason: resumeReason,
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async isTradingHalted(tenantId: string): Promise<boolean> {
    const status = await tenantRepository.getStatus(tenantId);
    const config = await tenantRepository.getPlatformConfig(tenantId);
    return Boolean(status?.trading_killswitch_active) || config?.trading_enabled === false;
  }
}

export const tradingHaltService = new TradingHaltService();
