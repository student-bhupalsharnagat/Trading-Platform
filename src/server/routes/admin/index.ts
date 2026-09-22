import { Router } from 'express';
import adminDashboardRoutes from './adminDashboardRoutes.ts';
import masterRoutes from './masterRoutes.ts';
import brokerRoutes from './brokerRoutes.ts';
import subBrokerRoutes from './subBrokerRoutes.ts';
import clientRoutes from './clientRoutes.ts';
import auditRoutes from './auditRoutes.ts';

const router = Router();

router.use('/dashboard', adminDashboardRoutes);
router.use('/masters', masterRoutes);
router.use('/brokers', brokerRoutes);
router.use('/sub-brokers', subBrokerRoutes);
router.use('/clients', clientRoutes);
router.use('/audit-logs', auditRoutes);

export default router;
