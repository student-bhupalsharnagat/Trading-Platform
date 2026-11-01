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

const ALLOWED_ADMIN_ROLES = ['SUPER_ADMIN', 'MASTER'] as const;

/**
 * GET /api/admin/payment-settings
 * Admin: Retrieve current bank details and QR code configuration
 */
router.get(
  '/',
  requireAuth,
  requireRole('SUPER_ADMIN', 'MASTER', 'BROKER'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = getReqTenantId(req);
      const settings = await manualDepositService.getPaymentDetails(tenantId);

      res.json({
        success: true,
        data: settings,
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to fetch payment settings',
      });
    }
  }
);

/**
 * PUT /api/admin/payment-settings
 * Admin: Update bank account details, IFSC, UPI ID, and QR code URL
 */
router.put(
  '/',
  requireAuth,
  requireRole(...ALLOWED_ADMIN_ROLES),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = getReqTenantId(req);
      const { bank_name, account_name, account_number, ifsc_code, upi_id, qr_code_url } = req.body;

      const updated = await manualDepositService.updatePaymentSettings(tenantId, req.user, {
        bank_name,
        account_name,
        account_number,
        ifsc_code,
        upi_id,
        qr_code_url,
      });

      res.json({
        success: true,
        message: 'Bank and QR payment settings updated successfully.',
        data: updated,
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || 'Failed to update payment settings',
      });
    }
  }
);

export default router;
