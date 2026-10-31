import { Router } from 'express';
import adminDashboardRoutes from './adminDashboardRoutes.ts';
import masterRoutes from './masterRoutes.ts';
import brokerRoutes from './brokerRoutes.ts';
import subBrokerRoutes from './subBrokerRoutes.ts';
import clientRoutes from './clientRoutes.ts';
import auditRoutes from './auditRoutes.ts';
import orderRoutes from './orderRoutes.ts';
import riskRoutes from './riskRoutes.ts';
import fundRoutes from './fundRoutes.ts';
import ledgerRoutes from './ledgerRoutes.ts';
import kycRoutes from './kycRoutes.ts';
import whiteLabelRoutes from './whiteLabelRoutes.ts';

import { requireAuth } from '../../middleware/authMiddleware.ts';
import { requireAdmin } from '../../middleware/requireRole.ts';

const router = Router();

// Strict Defense-in-Depth: Enforce backend JWT verification and Admin RBAC on all /api/admin/* endpoints
router.use(requireAuth);
router.use(requireAdmin);

router.use('/dashboard', adminDashboardRoutes);
router.use('/masters', masterRoutes);
router.use('/brokers', brokerRoutes);
router.use('/sub-brokers', subBrokerRoutes);
router.use('/clients', clientRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/orders', orderRoutes);
router.use('/risk', riskRoutes);
router.use('/funds', fundRoutes);
router.use('/ledger', ledgerRoutes);
router.use('/kyc', kycRoutes);
router.use('/white-label', whiteLabelRoutes);

export default router;
