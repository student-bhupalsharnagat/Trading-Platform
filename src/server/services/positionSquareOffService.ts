import { db } from '../db/database.ts';
import {
  getTenantPositions,
  getTenantWallet,
  findInstrument,
  getTenantNotifications,
} from '../trading/tradingStore.ts';
import { auditService } from './auditService.ts';
import { postgresPositionRepository } from '../repositories/trading/PostgresPositionRepository.ts';
import { postgresWalletRepository } from '../repositories/trading/PostgresWalletRepository.ts';
import { postgresOrderEventRepository } from '../repositories/trading/PostgresOrderEventRepository.ts';
import { tradingWebSocketServer } from '../websocket/WebSocketServer.ts';
import { pgDb } from '../db/postgres.ts';

export interface SquareOffResult {
  success: boolean;
  tenantId: string;
  squaredOffCount: number;
  totalRealizedPnL: number;
  timestamp: string;
}

export class PositionSquareOffService {
  public async squareOffPositions(
    authoritativeTenantId: string,
    scope: 'TENANT' | 'USER',
    userId?: string,
    reason?: string,
    source = 'CENTRAL_ADMIN'
  ): Promise<SquareOffResult> {
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

      const trimmedUserId = userId.trim();
      targetUserRecord = db.findUserById(trimmedUserId) || db.findUserByUserId(trimmedUserId);

      if (!targetUserRecord) {
        const err = new Error(`User '${trimmedUserId}' not found.`);
        (err as any).statusCode = 404;
        throw err;
      }

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
    let pgSquaredOff = 0;
    let pgRealizedPnL = 0;

    // Execute square-off in PostgreSQL inside an ACID transaction
    try {
      await pgDb.transaction(async (client) => {
        const pgPositions = await postgresPositionRepository.getPositions(
          authoritativeTenantId,
          targetUserId,
          client
        );

        for (const pos of pgPositions) {
          const inst = findInstrument(pos.instrument_id);
          const releasedMargin = pos.margin_used || (inst?.intraday || 30000);
          const pnl = pos.realized_pnl || 0;

          // Lock and update wallet
          const wallet = await postgresWalletRepository.lockWalletForUpdate(
            authoritativeTenantId,
            pos.user_id,
            client
          );

          await postgresWalletRepository.updateWallet(
            authoritativeTenantId,
            pos.user_id,
            {
              available_balance: wallet.available_balance + releasedMargin + pnl,
              used_margin: Math.max(0, wallet.used_margin - releasedMargin),
              realized_pnl: wallet.realized_pnl + pnl,
            },
            client
          );

          // Delete position
          await postgresPositionRepository.deletePosition(authoritativeTenantId, pos.id, client);

          // Record order event
          await postgresOrderEventRepository.recordEvent(
            {
              id: `evt-sq-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              tenant_id: authoritativeTenantId,
              order_id: pos.id,
              event_type: 'POSITION_UPDATED',
              event_payload: {
                positionId: pos.id,
                instrumentId: pos.instrument_id,
                action: 'SQUARE_OFF',
                releasedMargin,
                realizedPnL: pnl,
                reason,
              },
            },
            client
          );

          pgSquaredOff++;
          pgRealizedPnL += pnl;
        }
      });
    } catch (pgErr) {
      console.warn('[Emergency] PostgreSQL square-off notice:', pgErr);
    }

    // Also update in-memory positions and wallet for backward compatibility
    const positions = getTenantPositions(authoritativeTenantId);
    const wallet = getTenantWallet(authoritativeTenantId);
    const notifications = getTenantNotifications(authoritativeTenantId);

    let squaredOffCount = 0;
    let totalRealizedPnL = 0;
    const remainingPositions: any[] = [];

    for (const pos of positions) {
      let shouldClose = false;

      if (normalizedScope === 'TENANT') {
        shouldClose = true;
      } else if (normalizedScope === 'USER' && targetUserRecord) {
        shouldClose =
          pos.userId === targetUserRecord.id ||
          pos.userId === targetUserRecord.user_id ||
          (pos as any).user_id === targetUserRecord.user_id;
      }

      if (shouldClose) {
        try {
          const inst = findInstrument(pos.symbol);
          const releasedMargin = (inst?.intraday || 30000) * pos.lots;

          // Release margin and credit / debit realized PnL to wallet
          wallet.availableBalance += releasedMargin + pos.pnl;
          wallet.usedMargin = Math.max(0, wallet.usedMargin - releasedMargin);
          wallet.todayPnL = Number((wallet.todayPnL + pos.pnl).toFixed(2));
          wallet.totalPnL = Number((wallet.totalPnL + pos.pnl).toFixed(2));

          totalRealizedPnL += pos.pnl;
          squaredOffCount++;

          notifications.unshift({
            id: `ntf-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type: 'SYSTEM',
            title: 'Emergency Square-Off',
            message: `Position ${pos.symbol} (${pos.type} ${pos.lots} lots) was squared off by Emergency Control. P&L: ₹${pos.pnl.toLocaleString('en-IN')}.`,
            time: 'Just now',
            read: false,
          });
        } catch (closeErr) {
          console.error(`Error squaring off position ${pos.id}:`, closeErr);
          remainingPositions.push(pos);
          throw closeErr;
        }
      } else {
        remainingPositions.push(pos);
      }
    }

    positions.length = 0;
    positions.push(...remainingPositions);

    const finalCount = Math.max(pgSquaredOff, squaredOffCount);
    const finalPnL = pgSquaredOff > 0 ? pgRealizedPnL : totalRealizedPnL;

    // Audit Logging
    auditService.logEmergencyEvent({
      action: 'SQUARE_OFF_ALL',
      source,
      tenantId: authoritativeTenantId,
      targetUser: normalizedScope === 'USER' ? targetUserRecord?.user_id : undefined,
      reason: reason || 'Emergency square-off commanded by Central Admin',
      result: {
        squaredOffCount: finalCount,
        totalRealizedPnL: Number(finalPnL.toFixed(2)),
        scope: normalizedScope,
      },
    });

    // Broadcast WebSocket notification to tenant
    tradingWebSocketServer.broadcastToTenant(authoritativeTenantId, 'position.updated', {
      action: 'SQUARE_OFF_ALL',
      scope: normalizedScope,
      squaredOffCount: finalCount,
      totalRealizedPnL: Number(finalPnL.toFixed(2)),
      targetUser: targetUserId,
      reason,
    });
    tradingWebSocketServer.broadcastToTenant(authoritativeTenantId, 'emergency.updated', {
      action: 'SQUARE_OFF_ALL',
      tenantId: authoritativeTenantId,
      scope: normalizedScope,
      targetUser: targetUserId,
    });

    return {
      success: true,
      tenantId: authoritativeTenantId,
      squaredOffCount: finalCount,
      totalRealizedPnL: Number(finalPnL.toFixed(2)),
      timestamp: new Date().toISOString(),
    };
  }
}

export const positionSquareOffService = new PositionSquareOffService();
