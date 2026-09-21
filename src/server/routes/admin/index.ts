import { Router } from 'express';
import adminDashboardRoutes from './adminDashboardRoutes';
import masterRoutes from './masterRoutes';
import brokerRoutes from './brokerRoutes';
import subBrokerRoutes from './subBrokerRoutes';
import clientRoutes from './clientRoutes';
import auditRoutes from './auditRoutes';

const router = Router();

router.use('/dashboard', adminDashboardRoutes);
router.use('/masters', masterRoutes);
router.use('/brokers', brokerRoutes);
router.use('/sub-brokers', subBrokerRoutes);
router.use('/clients', clientRoutes);
router.use('/audit-logs', auditRoutes);

export default router;
