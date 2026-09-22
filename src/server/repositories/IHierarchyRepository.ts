import type { UserRecord, UserRole } from '../db/database.ts';

export interface IHierarchyRepository {
  getDescendants(pathPrefix: string): Promise<UserRecord[]>;
  getChildren(parentId: string): Promise<UserRecord[]>;
  getNodeWithCounts(userId: string): Promise<{
    brokersCount: number;
    subBrokersCount: number;
    clientsCount: number;
  }>;
  isAncestor(ancestorPath: string, targetPath: string): boolean;
}
