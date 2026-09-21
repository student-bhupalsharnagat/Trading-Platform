import { Request, Response, NextFunction } from 'express';
import { authService, SafeUser, sanitizeUser } from '../services/authService.ts';
import { db } from '../db/database.ts';

export interface AuthenticatedRequest extends Request {
  user?: SafeUser;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.vertex_auth_token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Authentication required. Please sign in.',
    });
    return;
  }

  const payload = authService.verifyToken(token);
  if (!payload || !payload.id) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired session. Please sign in again.',
    });
    return;
  }

  const user = db.findUserById(payload.id);
  if (!user) {
    res.status(401).json({
      success: false,
      message: 'User account no longer exists.',
    });
    return;
  }

  if (user.status === 'suspended') {
    res.status(403).json({
      success: false,
      message: 'Account is suspended.',
    });
    return;
  }

  // Tenant context security verification:
  // Verify that the token's tenantId and user's tenant_id match the server-resolved active tenant.
  // We do NOT trust only the JWT tenantId.
  // SUPER_ADMIN has platform-wide authority across tenant domains.
  // For MASTER, BROKER, SUB_BROKER, and CLIENT, cross-tenant token replay is strictly prohibited.
  const activeTenantId = (req as any).tenant?.tenant?.id;
  const tokenTenantId = payload.tenantId;
  const userTenantId = user.tenant_id;

  if (user.role !== 'SUPER_ADMIN' && activeTenantId) {
    if (tokenTenantId && tokenTenantId !== activeTenantId) {
      res.status(403).json({
        success: false,
        code: 'TENANT_MISMATCH',
        message: 'Access denied: Token tenant does not match the active tenant domain context.',
      });
      return;
    }
    if (userTenantId && userTenantId !== activeTenantId) {
      res.status(403).json({
        success: false,
        code: 'TENANT_MISMATCH',
        message: 'Access denied: User account does not belong to the active tenant domain context.',
      });
      return;
    }
  }

  req.user = sanitizeUser(user);
  next();
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.vertex_auth_token || req.headers.authorization?.replace('Bearer ', '');

  if (token) {
    const payload = authService.verifyToken(token);
    if (payload && payload.id) {
      const user = db.findUserById(payload.id);
      if (user && user.status !== 'suspended') {
        const activeTenantId = (req as any).tenant?.tenant?.id;
        const tokenTenantId = payload.tenantId;
        const userTenantId = user.tenant_id;
        const isSuperAdmin = user.role === 'SUPER_ADMIN';

        const matchesTenant =
          isSuperAdmin ||
          !activeTenantId ||
          ((!tokenTenantId || tokenTenantId === activeTenantId) &&
            (!userTenantId || userTenantId === activeTenantId));

        if (matchesTenant) {
          req.user = sanitizeUser(user);
        }
      }
    }
  }
  next();
}
