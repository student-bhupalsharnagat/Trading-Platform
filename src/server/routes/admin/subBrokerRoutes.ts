import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/authMiddleware';
import { requireRole } from '../../middleware/requireRole';
import { requirePermission } from '../../middleware/requirePermission';
import { hierarchyGuard } from '../../middleware/hierarchyGuard';
import { hierarchyService } from '../../services/hierarchyService';

const router = Router();

// GET /api/admin/sub-brokers - List Sub-Brokers
router.get(
  '/',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const subBrokers = await hierarchyService.getScopedEntities(req.user as any, 'SUB_BROKER');
      res.json({ success: true, data: subBrokers });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// POST /api/admin/sub-brokers - Create Sub-Broker under Broker
router.post(
  '/',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER', 'BROKER'),
  requirePermission('sub_brokers.create'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { fullName, userId, email, mobile, countryCode, password, parentId, company, address, commissionRate } = req.body;
      if (!fullName || !userId || !mobile || !parentId) {
        res.status(400).json({ success: false, message: 'Full name, User ID, Mobile, and Parent Broker are required.' });
        return;
      }

      const subBroker = await hierarchyService.createSubBroker(req.user as any, {
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

      res.status(201).json({ success: true, data: subBroker, message: 'Sub-Broker created successfully.' });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }
);

// GET /api/admin/sub-brokers/:id
router.get(
  '/:id',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'),
  hierarchyGuard('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const subBroker = await hierarchyService.getScopedEntityById(req.user as any, req.params.id);
      if (!subBroker || subBroker.role !== 'SUB_BROKER') {
        res.status(404).json({ success: false, message: 'Sub-Broker not found' });
        return;
      }
      res.json({ success: true, data: subBroker });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// PATCH /api/admin/sub-brokers/:id/status
router.patch(
  '/:id/status',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER', 'BROKER'),
  hierarchyGuard('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status } = req.body;
      if (!['active', 'suspended', 'deactivated'].includes(status)) {
        res.status(400).json({ success: false, message: 'Invalid status value' });
        return;
      }

      const updated = await hierarchyService.updateEntityStatus(req.user as any, req.params.id, status);
      res.json({ success: true, data: updated, message: `Sub-Broker status updated to ${status}` });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }
);

export default router;
