import { Request, Response, NextFunction } from 'express';
import { authService, SafeUser, sanitizeUser } from '../services/authService.ts';
import { db } from '../db/database.ts';
import { pgDb } from '../db/postgres.ts';

export interface AuthenticatedRequest extends Request {
  user?: SafeUser;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
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

  let user = db.findUserById(payload.id);
  if (!user && payload.userId) {
    user = db.findUserByUserId(payload.userId);
  }
  if (!user) {
    try {
      const pgRes = await pgDb.query(
        `SELECT * FROM users WHERE id = $1 OR LOWER(user_id) = LOWER($2) LIMIT 1;`,
        [payload.id, payload.userId || payload.id]
      );
      if (pgRes.rows.length > 0) {
        const row = pgRes.rows[0];
        user = {
          id: row.id,
          full_name: row.full_name,
          user_id: row.user_id,
          country_code: row.country_code || '+91',
          mobile: row.mobile || '',
          email: row.email,
          role: row.role || 'CLIENT',
          parent_id: row.parent_id,
          hierarchy_path: row.hierarchy_path || `root.${row.user_id}`,
          is_verified: Boolean(row.is_verified),
          status: row.status || 'active',
          tenant_id: row.tenant_id || 'vertex-default',
          created_at: new Date(row.created_at).toISOString(),
          updated_at: new Date(row.updated_at).toISOString(),
          password_hash: '',
        };
        db.addUser(user);
      }
    } catch {}
  }

  if (!user) {
    res.status(401).json({
      success: false,
      message: 'User account no longer exists.',
    });
    return;
  }

  if (user.status === 'PENDING_PHONE_VERIFICATION' || !user.is_verified) {
    res.status(403).json({
      success: false,
      code: 'UNVERIFIED_ACCOUNT',
      message: 'Account phone verification is pending. Please verify your OTP code.',
    });
    return;
  }

  if (user.status === 'suspended' || user.status === 'SUSPENDED' || user.is_frozen) {
    res.status(403).json({
      success: false,
      code: 'ACCOUNT_SUSPENDED',
      message: 'Account is suspended. Please contact support.',
    });
    return;
  }

  if (user.status === 'LOCKED') {
    res.status(403).json({
      success: false,
      code: 'ACCOUNT_LOCKED',
      message: 'Account is locked. Please contact support or reset your password.',
    });
    return;
  }

  if (user.status === 'DISABLED' || user.status === 'deactivated') {
    res.status(403).json({
      success: false,
      code: 'ACCOUNT_DISABLED',
      message: 'Account has been disabled.',
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

export async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = (req.headers['authorization'] || req.headers.authorization || '') as string;
  const token = req.cookies?.vertex_auth_token || authHeader.replace(/^Bearer\s+/i, '').trim();

  if (token) {
    const payload = authService.verifyToken(token);
    if (payload && (payload.id || payload.userId)) {
      let user = (payload.id ? db.findUserById(payload.id) : undefined) || db.findUserByUserId(payload.userId || payload.id);
      if (!user) {
        try {
          const pgRes = await pgDb.query(
            `SELECT * FROM users WHERE id = $1 OR LOWER(user_id) = LOWER($2) LIMIT 1;`,
            [payload.id, payload.userId || payload.id]
          );
          if (pgRes.rows.length > 0) {
            const row = pgRes.rows[0];
            user = {
              id: row.id,
              full_name: row.full_name,
              user_id: row.user_id,
              country_code: row.country_code || '+91',
              mobile: row.mobile || '',
              email: row.email,
              role: row.role || 'CLIENT',
              parent_id: row.parent_id,
              hierarchy_path: row.hierarchy_path || `root.${row.user_id}`,
              is_verified: Boolean(row.is_verified),
              status: row.status || 'active',
              tenant_id: row.tenant_id || 'vertex-default',
              created_at: new Date(row.created_at).toISOString(),
              updated_at: new Date(row.updated_at).toISOString(),
              password_hash: '',
            };
            db.addUser(user);
          }
        } catch {}
      }
      if (user) {
        req.user = sanitizeUser(user);
      }
    }
  }
  next();
}
