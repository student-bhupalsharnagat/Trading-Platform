import { db } from '../db/database.ts';
import { tenantRepository } from '../repositories/JsonTenantRepository.ts';
import {
  getTenantPositions,
  getTenantOrders,
  getTenantWallet,
  findInstrument,
} from '../trading/tradingStore.ts';
import { auditService } from './auditService.ts';
import { postgresPositionRepository } from '../repositories/trading/PostgresPositionRepository.ts';
import { postgresOrderRepository } from '../repositories/trading/PostgresOrderRepository.ts';
import { postgresWalletRepository } from '../repositories/trading/PostgresWalletRepository.ts';
import { tradingWebSocketServer } from '../websocket/WebSocketServer.ts';
import { emergencyStateCache } from '../cache/EmergencyStateCache.ts';

export interface FreezeUserResult {
  success: boolean;
  tenantId: string;
  userId: string;
  role?: string;
  frozen: boolean;
  isFrozen?: boolean;
  alreadyInState?: boolean;
  affectedDescendantsCount?: number;
  timestamp: string;
}

export interface RiskSummaryResult {
  tenantId: string;
  totalOpenPositions: number;
  totalOpenOrders: number;
  totalExposure: number;
  usedMargin: number;
  availableMargin: number;
  totalPnL: number;
  activeTraders: number;
  tradingHalted: boolean;
  timestamp: string;
}

export class EmergencyControlService {
  public async freezeUser(
    authoritativeTenantId: string,
    userId: string,
    freeze: boolean,
    reason?: string,
    source = 'CENTRAL_ADMIN'
  ): Promise<FreezeUserResult> {
    if (!authoritativeTenantId) {
      const err = new Error('Authoritative X-Tenant-ID is required.');
      (err as any).statusCode = 400;
      throw err;
    }

    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      const err = new Error('Field "userId" is required.');
      (err as any).statusCode = 400;
      throw err;
    }

    if (typeof freeze !== 'boolean') {
      const err = new Error('Field "freeze" must be a boolean.');
      (err as any).statusCode = 400;
      throw err;
    }

    const trimmedUserId = userId.trim();
    const userRecord = db.findUserById(trimmedUserId) || db.findUserByUserId(trimmedUserId);

    if (!userRecord) {
      const err = new Error(`User '${trimmedUserId}' not found.`);
      (err as any).statusCode = 404;
      throw err;
    }

    // Verify tenant isolation
    const userTenant = userRecord.tenant_id || 'vertex-default';
    if (userTenant !== authoritativeTenantId) {
      const err = new Error(
        `Tenant mismatch: User '${userRecord.user_id}' belongs to tenant '${userTenant}', not authoritative tenant '${authoritativeTenantId}'.`
      );
      (err as any).statusCode = 403;
      (err as any).code = 'TENANT_MISMATCH';
      throw err;
    }

    // Check if user is already in target freeze state (idempotency safety)
    const alreadyInState = Boolean(userRecord.is_frozen) === freeze;

    // Update freeze state in database
    const updatedUser = db.setUserFrozen(userRecord.user_id, freeze);
    if (!updatedUser) {
      const err = new Error(`Failed to update freeze status for user '${userRecord.user_id}'.`);
      (err as any).statusCode = 500;
      throw err;
    }

    // Count affected descendants in the hierarchy
    const allTenantUsers = db.getUsersByTenant(authoritativeTenantId);
    const userPath = userRecord.hierarchy_path || `root.${userRecord.user_id.toLowerCase()}`;
    const affectedDescendants = allTenantUsers.filter(
      (u) => u.user_id !== userRecord.user_id && (u.hierarchy_path || '').startsWith(userPath)
    );

    // Audit Logging
    auditService.logEmergencyEvent({
      action: freeze ? 'FREEZE_USER' : 'UNFREEZE_USER',
      source,
      tenantId: authoritativeTenantId,
      targetUser: userRecord.user_id,
      reason: reason || (freeze ? 'Emergency user freeze commanded by Central Admin' : 'User unfreeze commanded by Central Admin'),
      result: {
        frozen: freeze,
        alreadyInState,
        role: userRecord.role,
        hierarchyPath: userRecord.hierarchy_path,
        affectedDescendantsCount: affectedDescendants.length,
      },
    });

    // Broadcast WebSocket notification to tenant
    tradingWebSocketServer.broadcastToTenant(authoritativeTenantId, 'emergency.updated', {
      action: freeze ? 'FREEZE_USER' : 'UNFREEZE_USER',
      tenantId: authoritativeTenantId,
      userId: userRecord.user_id,
      role: userRecord.role,
      frozen: freeze,
      alreadyInState,
      affectedDescendantsCount: affectedDescendants.length,
      reason,
    });

    // Broadcast across instances via Redis Pub/Sub
    emergencyStateCache.broadcastEmergencyAction(
      freeze ? 'USER_FREEZE' : 'USER_UNFREEZE',
      authoritativeTenantId,
      { userId: userRecord.user_id, reason, alreadyInState }
    ).catch(() => {});

    return {
      success: true,
      tenantId: authoritativeTenantId,
      userId: userRecord.user_id,
      role: (userRecord.role || '').toLowerCase(),
      frozen: freeze,
      isFrozen: freeze,
      alreadyInState,
      affectedDescendantsCount: affectedDescendants.length,
      timestamp: new Date().toISOString(),
    };
  }

  public async freezeBroker(
    authoritativeTenantId: string,
    brokerId: string,
    freeze: boolean,
    reason?: string,
    source = 'CENTRAL_ADMIN'
  ): Promise<FreezeUserResult> {
    const user = db.findUserById(brokerId) || db.findUserByUserId(brokerId);
    if (!user) {
      const err = new Error(`Broker '${brokerId}' not found.`);
      (err as any).statusCode = 404;
      throw err;
    }
    const roleUpper = (user.role || '').toUpperCase();
    if (roleUpper !== 'BROKER' && roleUpper !== 'SUB_BROKER') {
      const err = new Error(`User '${brokerId}' has role '${user.role}', expected 'BROKER' or 'SUB_BROKER'.`);
      (err as any).statusCode = 400;
      throw err;
    }
    return this.freezeUser(authoritativeTenantId, brokerId, freeze, reason, source);
  }

  public async freezeMaster(
    authoritativeTenantId: string,
    masterId: string,
    freeze: boolean,
    reason?: string,
    source = 'CENTRAL_ADMIN'
  ): Promise<FreezeUserResult> {
    const user = db.findUserById(masterId) || db.findUserByUserId(masterId);
    if (!user) {
      const err = new Error(`Master '${masterId}' not found.`);
      (err as any).statusCode = 404;
      throw err;
    }
    const roleUpper = (user.role || '').toUpperCase();
    if (roleUpper !== 'MASTER' && roleUpper !== 'SUPER_ADMIN') {
      const err = new Error(`User '${masterId}' has role '${user.role}', expected 'MASTER' or 'SUPER_ADMIN'.`);
      (err as any).statusCode = 400;
      throw err;
    }
    return this.freezeUser(authoritativeTenantId, masterId, freeze, reason, source);
  }

  public async getRiskSummary(authoritativeTenantId: string): Promise<RiskSummaryResult> {
    if (!authoritativeTenantId) {
      const err = new Error('Authoritative X-Tenant-ID is required.');
      (err as any).statusCode = 400;
      throw err;
    }

    // Check PostgreSQL state
    let pgPositions: any[] = [];
    let pgOrders: any[] = [];
    try {
      pgPositions = await postgresPositionRepository.getPositions(authoritativeTenantId);
      pgOrders = await postgresOrderRepository.getOrders(authoritativeTenantId);
    } catch {
      // ignore
    }

    const positions = pgPositions.length > 0 ? pgPositions : getTenantPositions(authoritativeTenantId);
    const orders = pgOrders.length > 0 ? pgOrders : getTenantOrders(authoritativeTenantId);
    const wallet = getTenantWallet(authoritativeTenantId);

    // Calculate total exposure: sum(avgPrice * qty) for open positions
    let totalExposure = 0;
    for (const pos of positions) {
      const avgPrice = pos.average_price ?? pos.avgPrice ?? 0;
      const qty = pos.quantity ?? pos.qty ?? 0;
      totalExposure += Math.abs(avgPrice * qty);
    }

    // Calculate total open/pending orders
    const openOrders = orders.filter(
      (o) =>
        o.status === 'PENDING' ||
        (o.status !== 'EXECUTED' && o.status !== 'CANCELLED' && o.status !== 'REJECTED')
    );

    // Check trading halted state
    const tenantStatus = await tenantRepository.getStatus(authoritativeTenantId);
    const tenantConfig = await tenantRepository.getPlatformConfig(authoritativeTenantId);
    const tradingHalted =
      Boolean(tenantStatus?.trading_killswitch_active) ||
      (tenantConfig !== null && tenantConfig.trading_enabled === false);

    // Active traders for this tenant
    const tenantUsers = db.getUsersByTenant(authoritativeTenantId);
    const activeTraders = tenantUsers.filter((u) => u.status === 'active' && !u.is_frozen).length;

    return {
      tenantId: authoritativeTenantId,
      totalOpenPositions: positions.length,
      totalOpenOrders: openOrders.length,
      totalExposure: Number(totalExposure.toFixed(2)),
      usedMargin: Number(wallet.usedMargin.toFixed(2)),
      availableMargin: Number(wallet.availableBalance.toFixed(2)),
      totalPnL: Number(wallet.totalPnL.toFixed(2)),
      activeTraders,
      tradingHalted,
      timestamp: new Date().toISOString(),
    };
  }
}

export const emergencyControlService = new EmergencyControlService();
