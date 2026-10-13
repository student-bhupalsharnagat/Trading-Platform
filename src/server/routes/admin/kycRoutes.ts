import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/authMiddleware.ts';
import { requireAdmin } from '../../middleware/requireRole.ts';
import { db } from '../../db/database.ts';

const router = Router();

// GET /api/admin/kyc/pipeline - Client KYC verification pipeline
router.get('/pipeline', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || 'vertex-default';
    const allUsers = db.getUsersByTenant(tenantId);
    const clients = allUsers.filter((u) => u.role === 'CLIENT');

    const pipeline = clients.map((c) => ({
      id: c.id,
      userId: c.user_id,
      fullName: c.full_name,
      email: c.email || 'N/A',
      mobile: c.mobile,
      isVerified: c.is_verified,
      status: c.status,
      kycStatus: c.is_verified ? 'VERIFIED' : 'PENDING',
      panCard: `ABCDE${Math.floor(1000 + Math.random() * 9000)}F`,
      aadhaarLast4: `${Math.floor(1000 + Math.random() * 9000)}`,
      bankName: 'HDFC Bank Ltd',
      accountNumber: `XXXXXXXX${Math.floor(1000 + Math.random() * 9000)}`,
      createdAt: c.created_at,
    }));

    res.json({ success: true, data: pipeline });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to fetch KYC pipeline' });
  }
});

// POST /api/admin/kyc/verify - Approve or reject client KYC
router.post('/verify', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, action, reason } = req.body;

    if (!userId || !action || (action !== 'APPROVE' && action !== 'REJECT')) {
      res.status(400).json({ success: false, message: 'Fields "userId" and "action" (APPROVE|REJECT) are required' });
      return;
    }

    const user = db.findUserByUserId(userId) || db.findUserById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (action === 'APPROVE') {
      db.updateUser(user.id, { is_verified: true, status: 'active' });
    } else {
      db.updateUser(user.id, { is_verified: false, status: 'suspended' });
    }

    res.json({
      success: true,
      message: `Client ${userId} KYC ${action === 'APPROVE' ? 'verified and approved' : 'rejected'} successfully`,
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to update KYC status' });
  }
});

export default router;
