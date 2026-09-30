import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/authMiddleware.ts';
import { requireAdmin } from '../../middleware/requireRole.ts';
import { authoritativeTradingDataService } from '../../services/authoritativeTradingDataService.ts';
import { postgresFundTransactionRepository } from '../../repositories/trading/PostgresFundTransactionRepository.ts';
import { db } from '../../db/database.ts';

const router = Router();

// GET /api/admin/funds - All fund transactions (deposits & withdrawals) for the tenant
router.get('/', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || 'vertex-default';
    const status = req.query.status as string;
    const type = req.query.type as string;

    const rawTxs = await postgresFundTransactionRepository.getByTenant(tenantId);

    // Enrich with client user name
    const enriched = rawTxs
      .filter((t) => (!status || t.status === status) && (!type || t.transaction_type === type))
      .map((t) => {
        const u = db.findUserByUserId(t.user_id) || db.findUserById(t.user_id);
        return {
          ...t,
          clientName: u?.full_name || t.user_id,
          clientMobile: u?.mobile || '',
        };
      });

    res.json({ success: true, data: enriched });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to fetch fund transactions' });
  }
});

// POST /api/admin/funds/process - Approve or reject fund transaction
router.post('/process', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || 'vertex-default';
    const adminId = req.user?.userId || req.user?.id || 'ADMIN';
    const { transactionId, action, reason } = req.body;

    if (!transactionId || !action || (action !== 'APPROVE' && action !== 'REJECT')) {
      res.status(400).json({ success: false, message: 'Fields "transactionId" and "action" (APPROVE|REJECT) are required' });
      return;
    }

    const updated = await authoritativeTradingDataService.processFundTransaction(
      tenantId,
      transactionId,
      action,
      adminId,
      reason
    );

    res.json({
      success: true,
      data: updated,
      message: `Fund transaction ${transactionId} has been ${action === 'APPROVE' ? 'approved' : 'rejected'} successfully`,
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to process fund transaction' });
  }
});

// POST /api/admin/funds/request - Manual admin fund credit/debit adjustment
router.post('/request', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || 'vertex-default';
    const { userId, type, amount, paymentMethod, referenceId } = req.body;

    if (!userId || !type || !amount || (type !== 'DEPOSIT' && type !== 'WITHDRAWAL')) {
      res.status(400).json({
        success: false,
        message: 'Fields "userId", "type" (DEPOSIT|WITHDRAWAL), and positive "amount" are required',
      });
      return;
    }

    const tx = await authoritativeTradingDataService.createFundTransaction(
      tenantId,
      userId,
      type,
      Number(amount),
      paymentMethod || 'ADMIN_ADJUSTMENT',
      referenceId || `ADM-${Date.now()}`
    );

    res.json({ success: true, data: tx, message: 'Fund transaction created successfully' });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to create fund transaction' });
  }
});

export default router;
