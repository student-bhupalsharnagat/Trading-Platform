import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/authMiddleware';
import { requireRole } from '../../middleware/requireRole';
import { requirePermission } from '../../middleware/requirePermission';
import { hierarchyGuard } from '../../middleware/hierarchyGuard';
import { hierarchyService } from '../../services/hierarchyService';

const router = Router();

// GET /api/admin/masters - List Masters (Super Admin sees all, Master sees itself)
router.get(
  '/',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const masters = await hierarchyService.getScopedEntities(req.user as any, 'MASTER');
      res.json({ success: true, data: masters });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// POST /api/admin/masters - Create Master (Super Admin only)
router.post(
  '/',
  requireAuth,
  requireRole('SUPER_ADMIN'),
  requirePermission('masters.create'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { fullName, userId, email, mobile, countryCode, password, company, address, commissionRate } = req.body;
      if (!fullName || !userId || !mobile) {
        res.status(400).json({ success: false, message: 'Full name, User ID, and Mobile are required.' });
        return;
      }

      const master = await hierarchyService.createMaster(req.user as any, {
        fullName,
        userId,
        email,
        mobile,
        countryCode,
        password,
        company,
        address,
        commissionRate,
      });

      res.status(201).json({ success: true, data: master, message: 'Master account created successfully.' });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }
);

// GET /api/admin/masters/:id
router.get(
  '/:id',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER'),
  hierarchyGuard('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const master = await hierarchyService.getScopedEntityById(req.user as any, req.params.id);
      if (!master || master.role !== 'MASTER') {
        res.status(404).json({ success: false, message: 'Master not found' });
        return;
      }
      res.json({ success: true, data: master });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// PATCH /api/admin/masters/:id/status
router.patch(
  '/:id/status',
  requireAuth,
  requireRole('SUPER_ADMIN'),
  hierarchyGuard('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status } = req.body;
      if (!['active', 'suspended', 'deactivated'].includes(status)) {
        res.status(400).json({ success: false, message: 'Invalid status value' });
        return;
      }

      const updated = await hierarchyService.updateEntityStatus(req.user as any, req.params.id, status);
      res.json({ success: true, data: updated, message: `Master status updated to ${status}` });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }
);

export default router;
