import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/authMiddleware.ts';
import { requireRole } from '../../middleware/requireRole.ts';
import { requirePermission } from '../../middleware/requirePermission.ts';
import { hierarchyGuard } from '../../middleware/hierarchyGuard.ts';
import { hierarchyService } from '../../services/hierarchyService.ts';

const router = Router();

// GET /api/admin/brokers - List Brokers
router.get(
  '/',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER', 'BROKER'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const brokers = await hierarchyService.getScopedEntities(req.user as any, 'BROKER');
      res.json({ success: true, data: brokers });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// POST /api/admin/brokers - Create Broker under Master
router.post(
  '/',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER'),
  requirePermission('brokers.create'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { fullName, userId, email, mobile, countryCode, password, parentId, company, address, commissionRate } = req.body;
      if (!fullName || !userId || !mobile || !parentId) {
        res.status(400).json({ success: false, message: 'Full name, User ID, Mobile, and Parent Master are required.' });
        return;
      }

      const broker = await hierarchyService.createBroker(req.user as any, {
        fullName,
        userId,
        email,
        mobile,
        countryCode,
        password,
        parentId,
        company,
        address,
        commissionRate,
      });

      res.status(201).json({ success: true, data: broker, message: 'Broker created successfully.' });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }
);

// GET /api/admin/brokers/:id
router.get(
  '/:id',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER', 'BROKER'),
  hierarchyGuard('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const broker = await hierarchyService.getScopedEntityById(req.user as any, req.params.id);
      if (!broker || broker.role !== 'BROKER') {
        res.status(404).json({ success: false, message: 'Broker not found' });
        return;
      }
      res.json({ success: true, data: broker });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// PATCH /api/admin/brokers/:id/status
router.patch(
  '/:id/status',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER'),
  hierarchyGuard('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status } = req.body;
      if (!['active', 'suspended', 'deactivated'].includes(status)) {
        res.status(400).json({ success: false, message: 'Invalid status value' });
        return;
      }

      const updated = await hierarchyService.updateEntityStatus(req.user as any, req.params.id, status);
      res.json({ success: true, data: updated, message: `Broker status updated to ${status}` });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }
);

export default router;
