import { Response, NextFunction } from 'express';
import { jsonUserRepository } from '../repositories/JsonUserRepository.ts';
import { jsonHierarchyRepository } from '../repositories/JsonHierarchyRepository.ts';
import type { AuthenticatedRequest } from './authMiddleware.ts';

export function hierarchyGuard(paramName = 'id') {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const caller = req.user;
      if (!caller) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      if (caller.role === 'SUPER_ADMIN') {
        next();
        return;
      }

      const targetId = req.params[paramName];
      if (!targetId) {
        next();
        return;
      }

      const target = await jsonUserRepository.findById(targetId);
      if (!target) {
        res.status(404).json({ success: false, message: 'Resource not found' });
        return;
      }

      const callerPath = (caller as any).hierarchyPath || (caller as any).hierarchy_path || 'root';
      const targetPath = target.hierarchy_path || `root.${target.user_id}`;

      if (!jsonHierarchyRepository.isAncestor(callerPath, targetPath)) {
        // Return 404 to prevent ID enumeration across hierarchies
        res.status(404).json({ success: false, message: 'Resource not found' });
        return;
      }

      next();
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  };
}
