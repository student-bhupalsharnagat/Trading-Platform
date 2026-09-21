import { Response, NextFunction } from 'express';
import { UserRole } from '../db/database';
import { AuthenticatedRequest } from './authMiddleware';

export const ADMIN_ROLES: UserRole[] = ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'];

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const currentRole = user.role || 'CLIENT';

    if (!allowedRoles.includes(currentRole as UserRole)) {
      res.status(403).json({
        success: false,
        message: 'Access denied: insufficient hierarchy role permissions',
      });
      return;
    }

    next();
  };
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  return requireRole(...ADMIN_ROLES)(req, res, next);
}
