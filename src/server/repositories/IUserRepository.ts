import type { UserRecord, UserRole } from '../db/database.ts';

export interface IUserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByUserId(userId: string): Promise<UserRecord | null>;
  findByMobile(mobile: string): Promise<UserRecord | null>;
  findAll(): Promise<UserRecord[]>;
  findByRole(role: UserRole): Promise<UserRecord[]>;
  findByParentId(parentId: string): Promise<UserRecord[]>;
  create(user: Omit<UserRecord, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<UserRecord>;
  update(id: string, updates: Partial<UserRecord>): Promise<UserRecord | null>;
  delete(id: string): Promise<boolean>;
}
