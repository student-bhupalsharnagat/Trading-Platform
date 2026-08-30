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
        req.user = sanitizeUser(user);
      }
    }
  }
  next();
}
