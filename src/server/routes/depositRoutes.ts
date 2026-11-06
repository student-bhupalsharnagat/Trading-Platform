import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import { fundsRateLimiter } from '../middleware/rateLimitMiddleware.ts';
import { manualDepositService } from '../services/ManualDepositService.ts';

const router = Router();

function getReqTenantId(req: any): string {
  return (
    req.user?.tenantId ||
    req.tenant?.tenant?.id ||
    (req.headers && (req.headers['x-tenant-id'] as string)) ||
    'vertex-default'
  );
}

/**
 * GET /api/deposit/payment-details
 * Public / Authenticated: Returns active Admin Bank & QR Code details for deposits
 */
router.get('/payment-details', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const settings = await manualDepositService.getPaymentDetails(tenantId);

    res.json({
      success: true,
      data: {
        bank_name: settings.bank_name,
        account_name: settings.account_name,
        account_number: settings.account_number,
        ifsc_code: settings.ifsc_code,
        upi_id: settings.upi_id,
        qr_code_url: settings.qr_code_url,
      },
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to fetch payment details',
    });
  }
});

/**
 * POST /api/deposit/manual-request
 * User: Submit a manual deposit request (Bank Transfer / QR Code with UTR)
 */
router.post('/manual-request', requireAuth, fundsRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const user = req.user;

    const { amount, utr_number, payment_method, proof_image, proof_image_url } = req.body;

    const newRequest = await manualDepositService.submitManualRequest(tenantId, user, {
      amount,
      utr_number,
      payment_method,
      proof_image: proof_image || proof_image_url,
    });

    res.status(201).json({
      success: true,
      message: 'Deposit request submitted successfully. It will be credited once verified by the admin desk.',
      data: newRequest,
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({
      success: false,
      code: err.code,
      message: err.message || 'Failed to submit deposit request',
    });
  }
});

/**
 * GET /api/deposit/my-requests
 * User: Fetch personal deposit request history and statuses
 */
router.get('/my-requests', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = getReqTenantId(req);
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, message: 'User identification missing' });
      return;
    }

    const requests = await manualDepositService.getUserRequests(tenantId, userId);

    res.json({
      success: true,
      data: requests,
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to fetch deposit requests',
    });
  }
});

export default router;
