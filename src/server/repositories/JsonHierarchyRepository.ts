import { IHierarchyRepository } from './IHierarchyRepository';
import { jsonUserRepository } from './JsonUserRepository';
import { UserRecord } from '../db/database';

export class JsonHierarchyRepository implements IHierarchyRepository {
  public async getDescendants(pathPrefix: string): Promise<UserRecord[]> {
    const allUsers = await jsonUserRepository.findAll();
    if (!pathPrefix || pathPrefix === 'root') {
      return allUsers;
    }
    // Path match: exact prefix followed by '.' or exact match
    return allUsers.filter(
      (u) =>
        u.hierarchy_path === pathPrefix ||
        (u.hierarchy_path && u.hierarchy_path.startsWith(`${pathPrefix}.`))
    );
  }

  public async getChildren(parentId: string): Promise<UserRecord[]> {
    return jsonUserRepository.findByParentId(parentId);
  }

  public async getNodeWithCounts(userId: string): Promise<{
    brokersCount: number;
    subBrokersCount: number;
    clientsCount: number;
  }> {
    const user = await jsonUserRepository.findById(userId);
    if (!user || !user.hierarchy_path) {
      return { brokersCount: 0, subBrokersCount: 0, clientsCount: 0 };
    }

    const descendants = await this.getDescendants(user.hierarchy_path);
    // Filter out the node itself
    const children = descendants.filter((d) => d.id !== user.id);

    return {
      brokersCount: children.filter((c) => c.role === 'BROKER').length,
      subBrokersCount: children.filter((c) => c.role === 'SUB_BROKER').length,
      clientsCount: children.filter((c) => c.role === 'CLIENT').length,
    };
  }

  public isAncestor(ancestorPath: string, targetPath: string): boolean {
    if (!ancestorPath || ancestorPath === 'root') return true;
    if (ancestorPath === targetPath) return true;
    return targetPath.startsWith(`${ancestorPath}.`);
  }
}

export const jsonHierarchyRepository = new JsonHierarchyRepository();
