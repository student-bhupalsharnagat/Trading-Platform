import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/authMiddleware.ts';
import { requireRole } from '../../middleware/requireRole.ts';
import { hierarchyGuard } from '../../middleware/hierarchyGuard.ts';
import { hierarchyService } from '../../services/hierarchyService.ts';

const router = Router();

// GET /api/admin/clients - List Clients (Trader accounts)
router.get(
  '/',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const clients = await hierarchyService.getScopedEntities(req.user as any, 'CLIENT');
      res.json({ success: true, data: clients });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// GET /api/admin/clients/:id
router.get(
  '/:id',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'),
  hierarchyGuard('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const client = await hierarchyService.getScopedEntityById(req.user as any, req.params.id);
      if (!client || client.role !== 'CLIENT') {
        res.status(404).json({ success: false, message: 'Client not found' });
        return;
      }
      res.json({ success: true, data: client });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// PATCH /api/admin/clients/:id/status
router.patch(
  '/:id/status',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'),
  hierarchyGuard('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status } = req.body;
      if (!['active', 'suspended', 'deactivated'].includes(status)) {
        res.status(400).json({ success: false, message: 'Invalid status value' });
        return;
      }

      const updated = await hierarchyService.updateEntityStatus(req.user as any, req.params.id, status);
      res.json({ success: true, data: updated, message: `Client status updated to ${status}` });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }
);

export default router;
