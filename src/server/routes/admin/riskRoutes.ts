import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/authMiddleware.ts';
import { requireAdmin } from '../../middleware/requireRole.ts';
import { emergencyControlService } from '../../services/emergencyControlService.ts';
import { authoritativeTradingDataService } from '../../services/authoritativeTradingDataService.ts';
import { tradingExecutionService } from '../../services/TradingExecutionService.ts';
import { postgresPositionRepository } from '../../repositories/trading/PostgresPositionRepository.ts';
import { findInstrument } from '../../trading/tradingStore.ts';
import { db } from '../../db/database.ts';

const router = Router();

// GET /api/admin/risk/summary - Platform RMS Overview
router.get('/summary', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || 'vertex-default';
    const summary = await emergencyControlService.getRiskSummary(tenantId);
    const riskDetails = await authoritativeTradingDataService.getRiskSummary(tenantId);

    // Identify clients with margin utilization > 80% (Warning) or > 100% (Breach)
    const positions = await postgresPositionRepository.getPositions(tenantId);
    const clientPositionsMap = new Map<string, any[]>();
    for (const p of positions) {
      if (!clientPositionsMap.has(p.user_id)) {
        clientPositionsMap.set(p.user_id, []);
      }
      clientPositionsMap.get(p.user_id)!.push(p);
    }

    const highRiskClients: any[] = [];
    for (const [uid, uPos] of clientPositionsMap.entries()) {
      const uAccount = await authoritativeTradingDataService.getClientAccount(tenantId, uid).catch(() => null);
      if (uAccount && (uAccount.account.margin_utilization > 70 || uAccount.account.risk_status !== 'NORMAL')) {
        highRiskClients.push({
          userId: uid,
          fullName: uAccount.identity.full_name,
          equity: uAccount.account.equity,
          usedMargin: uAccount.account.used_margin,
          availableMargin: uAccount.account.available_margin,
          marginUtilization: uAccount.account.margin_utilization,
          unrealizedPnl: uAccount.account.unrealized_pnl,
          riskStatus: uAccount.account.risk_status,
          openPositionsCount: uPos.length,
          isFrozen: uAccount.identity.is_frozen,
        });
      }
    }

    res.json({
      success: true,
      data: {
        ...summary,
        ...riskDetails,
        highRiskClients,
      },
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to fetch risk summary' });
  }
});

// GET /api/admin/risk/positions - All open positions across all clients
router.get('/positions', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || 'vertex-default';
    const rawPositions = await postgresPositionRepository.getPositions(tenantId);

    // Enrich positions with live instrument prices and client names
    const enriched = rawPositions.map((p) => {
      const inst = findInstrument(p.instrument_id);
      const avgPrice = Number(p.average_price);
      const ltp = inst ? inst.lastPrice : avgPrice;
      const qty = Math.abs(Number(p.quantity));
      const posType: 'BUY' | 'SELL' = Number(p.quantity) >= 0 ? 'BUY' : 'SELL';
      const pnl = posType === 'BUY' ? (ltp - avgPrice) * qty : (avgPrice - ltp) * qty;

      const user = db.findUserByUserId(p.user_id) || db.findUserById(p.user_id);

      return {
        id: p.id,
        userId: p.user_id,
        clientName: user?.full_name || p.user_id,
        symbol: p.instrument_id,
        side: posType,
        quantity: qty,
        averagePrice: avgPrice,
        currentPrice: ltp,
        unrealizedPnl: Number(pnl.toFixed(2)),
        realizedPnl: Number(p.realized_pnl || 0),
        marginUsed: Number(p.margin_used || 0),
        updatedAt: p.updated_at,
        status: Number(p.quantity) === 0 ? 'CLOSED' : 'OPEN',
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to fetch positions' });
  }
});

// POST /api/admin/risk/square-off - Force square off position
router.post('/square-off', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || 'vertex-default';
    const { userId, positionId } = req.body;

    if (!userId || !positionId) {
      res.status(400).json({ success: false, message: 'Fields "userId" and "positionId" are required' });
      return;
    }

    const result = await tradingExecutionService.closePosition(tenantId, userId, positionId);
    res.json({ success: true, data: result, message: 'Position squared off successfully' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to square off position' });
  }
});

// POST /api/admin/risk/freeze-client - Freeze/unfreeze client trading
router.post('/freeze-client', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || 'vertex-default';
    const { userId, freeze, reason } = req.body;

    if (!userId || typeof freeze !== 'boolean') {
      res.status(400).json({ success: false, message: 'Fields "userId" and boolean "freeze" are required' });
      return;
    }

    const result = await emergencyControlService.freezeUser(
      tenantId,
      userId,
      freeze,
      reason || (freeze ? 'Risk threshold breach freeze by admin' : 'Unfrozen by admin'),
      'ADMIN_PANEL'
    );

    res.json({
      success: true,
      data: result,
      message: `Client ${userId} has been ${freeze ? 'frozen' : 'unfrozen'} successfully`,
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to update client freeze status' });
  }
});

export default router;
