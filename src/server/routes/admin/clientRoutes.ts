import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/authMiddleware.ts';
import { requireRole } from '../../middleware/requireRole.ts';
import { hierarchyGuard } from '../../middleware/hierarchyGuard.ts';
import { hierarchyService } from '../../services/hierarchyService.ts';
import { authoritativeTradingDataService } from '../../services/authoritativeTradingDataService.ts';

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

// GET /api/admin/clients/:id/account
router.get(
  '/:id/account',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'),
  hierarchyGuard('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.user?.tenantId || 'vertex-default';
      const client = await hierarchyService.getScopedEntityById(req.user as any, req.params.id);
      if (!client) {
        res.status(404).json({ success: false, message: 'Client not found' });
        return;
      }
      const account = await authoritativeTradingDataService.getClientAccount(tenantId, client.userId);
      res.json({ success: true, data: account });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }
);

// GET /api/admin/clients/:id/orders
router.get(
  '/:id/orders',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'),
  hierarchyGuard('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.user?.tenantId || 'vertex-default';
      const client = await hierarchyService.getScopedEntityById(req.user as any, req.params.id);
      if (!client) {
        res.status(404).json({ success: false, message: 'Client not found' });
        return;
      }
      const orders = await authoritativeTradingDataService.getOrders(tenantId, { userId: client.userId });
      res.json({ success: true, data: orders });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }
);

// GET /api/admin/clients/:id/trades
router.get(
  '/:id/trades',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'),
  hierarchyGuard('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.user?.tenantId || 'vertex-default';
      const client = await hierarchyService.getScopedEntityById(req.user as any, req.params.id);
      if (!client) {
        res.status(404).json({ success: false, message: 'Client not found' });
        return;
      }
      const trades = await authoritativeTradingDataService.getTrades(tenantId, { userId: client.userId });
      res.json({ success: true, data: trades });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }
);

// GET /api/admin/clients/:id/positions
router.get(
  '/:id/positions',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'),
  hierarchyGuard('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.user?.tenantId || 'vertex-default';
      const client = await hierarchyService.getScopedEntityById(req.user as any, req.params.id);
      if (!client) {
        res.status(404).json({ success: false, message: 'Client not found' });
        return;
      }
      const positions = await authoritativeTradingDataService.getPositions(tenantId, { userId: client.userId });
      res.json({ success: true, data: positions });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
    }
  }
);

// GET /api/admin/clients/:id/funds
router.get(
  '/:id/funds',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'),
  hierarchyGuard('id'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.user?.tenantId || 'vertex-default';
      const client = await hierarchyService.getScopedEntityById(req.user as any, req.params.id);
      if (!client) {
        res.status(404).json({ success: false, message: 'Client not found' });
        return;
      }
      const funds = await authoritativeTradingDataService.getClientFunds(tenantId, client.userId);
      res.json({ success: true, data: funds });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ success: false, message: err.message });
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
