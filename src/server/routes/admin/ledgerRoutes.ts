import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/authMiddleware.ts';
import { requireAdmin } from '../../middleware/requireRole.ts';
import { postgresLedgerRepository } from '../../repositories/trading/PostgresLedgerRepository.ts';
import { db } from '../../db/database.ts';

const router = Router();

// GET /api/admin/ledger - Platform immutable financial ledger
router.get('/', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || 'vertex-default';
    const userId = req.query.userId as string;

    const rawEntries = userId
      ? await postgresLedgerRepository.getByUserId(userId, tenantId)
      : await postgresLedgerRepository.getAll(tenantId);

    const enriched = rawEntries.map((e) => {
      const u = db.findUserByUserId(e.user_id) || db.findUserById(e.user_id);
      return {
        ...e,
        clientName: u?.full_name || e.user_id,
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Failed to fetch ledger entries' });
  }
});

export default router;
