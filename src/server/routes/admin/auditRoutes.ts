import { Router } from 'express';
import { requireAuth } from '../../middleware/authMiddleware.ts';
import { requireRole } from '../../middleware/requireRole.ts';
import { auditService } from '../../services/auditService.ts';

const router = Router();

// GET /api/admin/audit-logs
router.get(
  '/',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER'),
  (req, res) => {
    try {
      const logs = auditService.getLogs(100);
      res.json({ success: true, data: logs });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

export default router;
