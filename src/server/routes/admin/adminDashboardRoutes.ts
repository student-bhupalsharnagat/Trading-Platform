import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/authMiddleware.ts';
import { requireAdmin } from '../../middleware/requireRole.ts';
import { adminDashboardService } from '../../services/adminDashboardService.ts';

const router = Router();

// GET /api/admin/dashboard/kpis
router.get('/kpis', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const kpis = await adminDashboardService.getKPIs(req.user as any);
    const charts = adminDashboardService.getChartData();
    res.json({
      success: true,
      data: {
        kpis,
        charts,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
