import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/authMiddleware.ts';
import { requireRole } from '../../middleware/requireRole.ts';
import { manualDepositService } from '../../services/ManualDepositService.ts';

const router = Router();

function getReqTenantId(req: any): string {
  return (
    req.user?.tenantId ||
    req.tenant?.tenant?.id ||
    (req.headers && (req.headers['x-tenant-id'] as string)) ||
    'vertex-default'
  );
}

// Authorized roles for manual deposit review and approval
const ALLOWED_ADMIN_ROLES = ['SUPER_ADMIN', 'MASTER', 'BROKER'] as const;

/**
 * GET /api/admin/deposit-requests
 * Admin: List all manual deposit requests with status filtering, pagination, search
 */
router.get(
  '/',
  requireAuth,
  requireRole(...ALLOWED_ADMIN_ROLES),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.user?.role === 'SUPER_ADMIN' ? 'ALL' : getReqTenantId(req);
      const status = req.query.status as string;
      const search = req.query.search as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const result = await manualDepositService.getAdminRequests(tenantId, {
        status,
        search,
        limit,
        offset,
      });

      res.json({
        success: true,
        data: {
          requests: result.requests,
          total: result.total,
          pendingCount: result.pendingCount,
        },
        requests: result.requests,
        total: result.total,
        pendingCount: result.pendingCount,
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to fetch deposit requests',
      });
    }
  }
);

/**
 * POST /api/admin/deposit-requests/:id/approve
 * Admin: Approve deposit request with atomic database transaction and balance credit
 */
router.post(
  '/:id/approve',
  requireAuth,
  requireRole(...ALLOWED_ADMIN_ROLES),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = getReqTenantId(req);
      const requestId = req.params.id;

      if (!requestId) {
        res.status(400).json({ success: false, message: 'Request ID parameter is required' });
        return;
      }

      const approved = await manualDepositService.approveRequest(tenantId, requestId, req.user);

      res.json({
        success: true,
        message: `Deposit request ${requestId} of ₹${Number(approved.amount).toLocaleString('en-IN')} approved successfully. User wallet has been credited.`,
        data: approved,
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        success: false,
        code: err.code,
        message: err.message || 'Failed to approve deposit request',
      });
    }
  }
);

/**
 * POST /api/admin/deposit-requests/:id/reject
 * Admin: Reject deposit request with reason
 */
router.post(
  '/:id/reject',
  requireAuth,
  requireRole(...ALLOWED_ADMIN_ROLES),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = getReqTenantId(req);
      const requestId = req.params.id;
      const { rejection_reason, reason } = req.body;

      if (!requestId) {
        res.status(400).json({ success: false, message: 'Request ID parameter is required' });
        return;
      }

      const rejected = await manualDepositService.rejectRequest(
        tenantId,
        requestId,
        req.user,
        rejection_reason || reason
      );

      res.json({
        success: true,
        message: `Deposit request ${requestId} rejected.`,
        data: rejected,
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        success: false,
        code: err.code,
        message: err.message || 'Failed to reject deposit request',
      });
    }
  }
);

export default router;
