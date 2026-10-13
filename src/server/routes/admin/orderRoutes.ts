import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/authMiddleware.ts';
import { requireAdmin } from '../../middleware/requireRole.ts';
import { authoritativeTradingDataService } from '../../services/authoritativeTradingDataService.ts';
import { postgresOrderRepository } from '../../repositories/trading/PostgresOrderRepository.ts';
import { postgresTradeRepository } from '../../repositories/trading/PostgresTradeRepository.ts';

const router = Router();

// GET /api/admin/orders - All platform orders scoped to tenant
router.get('/', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || 'vertex-default';
    const userId = req.query.userId as string;
    const status = req.query.status as string;

    const orders = await authoritativeTradingDataService.getOrders(tenantId, { userId, status });
    res.json({ success: true, data: orders });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to fetch orders' });
  }
});

// GET /api/admin/orders/trades - All executed trades scoped to tenant
router.get('/trades', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || 'vertex-default';
    const userId = req.query.userId as string;
    const orderId = req.query.orderId as string;

    const trades = await authoritativeTradingDataService.getTrades(tenantId, { userId, orderId });
    res.json({ success: true, data: trades });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to fetch trades' });
  }
});

export default router;
