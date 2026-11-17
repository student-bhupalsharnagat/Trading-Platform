import { Response, NextFunction } from 'express';
import type { UserRole } from '../db/database.ts';
import type { AuthenticatedRequest } from './authMiddleware.ts';

export const ADMIN_ROLES: UserRole[] = ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'];

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const currentRole = (user.role || 'CLIENT').toUpperCase();

    if (!allowedRoles.map(r => r.toUpperCase()).includes(currentRole as any)) {
      const message =
        currentRole === 'CLIENT' || currentRole === 'TRADER' || currentRole === 'TRADER_CLIENT'
          ? 'Access Denied: Trader Clients cannot access the Admin Portal. Please login via the Trading Platform.'
          : 'Access denied: insufficient hierarchy role permissions';

      res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message,
      });
      return;
    }

    next();
  };
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  return requireRole(...ADMIN_ROLES)(req, res, next);
}
