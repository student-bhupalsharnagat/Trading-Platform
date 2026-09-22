import { Response, NextFunction } from 'express';
import type { UserRole } from '../db/database.ts';
import type { AuthenticatedRequest } from './authMiddleware.ts';

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  SUPER_ADMIN: [
    'dashboard.view',
    'masters.view',
    'masters.create',
    'masters.edit',
    'masters.suspend',
    'brokers.view',
    'brokers.create',
    'brokers.edit',
    'brokers.suspend',
    'sub_brokers.view',
    'sub_brokers.create',
    'sub_brokers.edit',
    'sub_brokers.suspend',
    'clients.view',
    'clients.create',
    'clients.edit',
    'clients.suspend',
    'kyc.view',
    'kyc.approve',
    'kyc.reject',
    'funds.view',
    'funds.adjust',
    'audit_logs.view',
  ],
  MASTER: [
    'dashboard.view',
    'brokers.view',
    'brokers.create',
    'brokers.edit',
    'sub_brokers.view',
    'sub_brokers.create',
    'clients.view',
    'clients.create',
    'clients.edit',
    'kyc.view',
    'funds.view',
    'audit_logs.view',
  ],
  BROKER: [
    'dashboard.view',
    'sub_brokers.view',
    'sub_brokers.create',
    'clients.view',
    'clients.create',
    'kyc.view',
    'funds.view',
  ],
  SUB_BROKER: [
    'dashboard.view',
    'clients.view',
    'clients.create',
    'kyc.view',
  ],
  CLIENT: [
    'trading.trade',
    'trading.view_portfolio',
  ],
};

export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const role = (user.role || 'CLIENT') as UserRole;
    const permissions = ROLE_PERMISSIONS[role] || [];

    if (!permissions.includes(permission)) {
      res.status(403).json({
        success: false,
        message: `Forbidden: role '${role}' lacks permission '${permission}'`,
      });
      return;
    }

    next();
  };
}
