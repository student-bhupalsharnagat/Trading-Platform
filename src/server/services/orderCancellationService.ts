import { db } from '../db/database.ts';
import { getTenantOrders } from '../trading/tradingStore.ts';
import { auditService } from './auditService.ts';
import { postgresOrderRepository } from '../repositories/trading/PostgresOrderRepository.ts';
import { postgresOrderEventRepository } from '../repositories/trading/PostgresOrderEventRepository.ts';
import { tradingWebSocketServer } from '../websocket/WebSocketServer.ts';
import { pgDb } from '../db/postgres.ts';

export interface CancelOrdersResult {
  success: boolean;
  tenantId: string;
  cancelledCount: number;
  scope: 'TENANT' | 'USER';
  timestamp: string;
}

export class OrderCancellationService {
  public async cancelOrders(
    authoritativeTenantId: string,
    scope: 'TENANT' | 'USER',
    userId?: string,
    reason?: string,
    source = 'CENTRAL_ADMIN'
  ): Promise<CancelOrdersResult> {
    if (!authoritativeTenantId) {
      const err = new Error('Authoritative X-Tenant-ID is required.');
      (err as any).statusCode = 400;
      throw err;
    }

    const normalizedScope = (scope || '').toUpperCase() as 'TENANT' | 'USER';
    if (normalizedScope !== 'TENANT' && normalizedScope !== 'USER') {
      const err = new Error('Scope must be either "TENANT" or "USER".');
      (err as any).statusCode = 400;
      throw err;
    }

    let targetUserRecord: any = null;

    if (normalizedScope === 'USER') {
      if (!userId || typeof userId !== 'string' || !userId.trim()) {
        const err = new Error('Field "userId" is required when scope is "USER".');
        (err as any).statusCode = 400;
        throw err;
      }

      // Look up user in database by ID or user_id
      const trimmedUserId = userId.trim();
      targetUserRecord = db.findUserById(trimmedUserId) || db.findUserByUserId(trimmedUserId);

      if (!targetUserRecord) {
        const err = new Error(`User '${trimmedUserId}' not found.`);
        (err as any).statusCode = 404;
        throw err;
      }

      // Strictly verify tenant boundary (prevent cross-tenant operations)
      const userTenant = targetUserRecord.tenant_id || 'vertex-default';
      if (userTenant !== authoritativeTenantId) {
        const err = new Error(
          `Tenant mismatch: User '${targetUserRecord.user_id}' belongs to tenant '${userTenant}', not authoritative tenant '${authoritativeTenantId}'.`
        );
        (err as any).statusCode = 403;
        (err as any).code = 'TENANT_MISMATCH';
        throw err;
      }
    }

    const targetUserId = normalizedScope === 'USER' ? targetUserRecord?.user_id : undefined;

    // Execute cancellation in PostgreSQL inside an ACID transaction
    let cancelledCount = 0;
    try {
      cancelledCount = await pgDb.transaction(async (client) => {
        const count = await postgresOrderRepository.cancelOrders(
          authoritativeTenantId,
          normalizedScope,
          targetUserId,
          client
        );

        // Record emergency audit event in order events
        await postgresOrderEventRepository.recordEvent(
          {
            id: `evt-emg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            tenant_id: authoritativeTenantId,
            order_id: 'ALL_PENDING',
            event_type: 'ORDER_CANCELLED',
            event_payload: {
              reason: reason || 'Emergency cancellation commanded by Central Admin',
              scope: normalizedScope,
              targetUserId,
              cancelledCount: count,
            },
          },
          client
        );

        return count;
      });
    } catch (pgErr) {
      console.warn('[Emergency] PostgreSQL order cancellation notice:', pgErr);
    }

    // Also update in-memory orders for backward compatibility
    const allOrders = getTenantOrders(authoritativeTenantId);
    let memCancelled = 0;
    const isPendingOrder = (o: any) =>
      o.status === 'PENDING' ||
      (o.status !== 'EXECUTED' && o.status !== 'CANCELLED' && o.status !== 'REJECTED');

    for (const order of allOrders) {
      if (!isPendingOrder(order)) continue;

      let matches = false;
      if (normalizedScope === 'TENANT') {
        matches = true;
      } else if (normalizedScope === 'USER' && targetUserRecord) {
        matches =
          order.userId === targetUserRecord.id ||
          order.userId === targetUserRecord.user_id ||
          (order as any).user_id === targetUserRecord.user_id;
      }

      if (matches) {
        order.status = 'CANCELLED';
        memCancelled++;
      }
    }

    const finalCount = Math.max(cancelledCount, memCancelled);

    // Audit Logging
    auditService.logEmergencyEvent({
      action: 'CANCEL_ALL_ORDERS',
      source,
      tenantId: authoritativeTenantId,
      targetUser: normalizedScope === 'USER' ? targetUserRecord?.user_id : undefined,
      reason: reason || 'Emergency order cancellation commanded by Central Admin',
      result: {
        cancelledCount: finalCount,
        scope: normalizedScope,
      },
    });

    // Broadcast WebSocket notification to tenant
    tradingWebSocketServer.broadcastToTenant(authoritativeTenantId, 'order.cancelled', {
      action: 'CANCEL_ALL_ORDERS',
      scope: normalizedScope,
      cancelledCount: finalCount,
      targetUser: targetUserId,
      reason,
    });

    return {
      success: true,
      tenantId: authoritativeTenantId,
      cancelledCount: finalCount,
      scope: normalizedScope,
      timestamp: new Date().toISOString(),
    };
  }
}

export const orderCancellationService = new OrderCancellationService();
