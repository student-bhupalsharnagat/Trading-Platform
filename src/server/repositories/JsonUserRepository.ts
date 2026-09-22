import type { IUserRepository } from './IUserRepository.ts';
import { db, type UserRecord, type UserRole } from '../db/database.ts';
import crypto from 'crypto';

export class JsonUserRepository implements IUserRepository {
  private normalizeUser(user: UserRecord): UserRecord {
    return {
      ...user,
      role: user.role || 'CLIENT',
      hierarchy_path: user.hierarchy_path || `root.${user.user_id}`,
      status: user.status || 'active',
      is_verified: user.is_verified ?? true,
    };
  }

  public async findById(id: string): Promise<UserRecord | null> {
    const user = db.findUserById(id);
    return user ? this.normalizeUser(user) : null;
  }

  public async findByUserId(userId: string): Promise<UserRecord | null> {
    const user = db.findUserByUserId(userId);
    return user ? this.normalizeUser(user) : null;
  }

  public async findByMobile(mobile: string): Promise<UserRecord | null> {
    const user = db.findUserByMobile(mobile);
    return user ? this.normalizeUser(user) : null;
  }

  public async findAll(): Promise<UserRecord[]> {
    const users = db.getAllUsers();
    return users.map((u) => this.normalizeUser(u));
  }

  public async findByRole(role: UserRole): Promise<UserRecord[]> {
    const users = await this.findAll();
    return users.filter((u) => u.role === role);
  }

  public async findByParentId(parentId: string): Promise<UserRecord[]> {
    const users = await this.findAll();
    return users.filter((u) => u.parent_id === parentId);
  }

  public async create(
    user: Omit<UserRecord, 'id' | 'created_at' | 'updated_at'> & { id?: string }
  ): Promise<UserRecord> {
    const now = new Date().toISOString();
    const id = user.id || crypto.randomUUID();
    const normalizedUserId = user.user_id.trim().toLowerCase();
    const cleanMobile = user.mobile.replace(/\D/g, '');

    const record: UserRecord = {
      id,
      full_name: user.full_name.trim(),
      user_id: normalizedUserId,
      country_code: user.country_code || '+91',
      mobile: cleanMobile,
      email: user.email,
      password_hash: user.password_hash,
      role: user.role || 'CLIENT',
      parent_id: user.parent_id || null,
      hierarchy_path: user.hierarchy_path || `root.${normalizedUserId}`,
      company: user.company,
      address: user.address,
      commission_rate: user.commission_rate ?? 0,
      is_verified: user.is_verified ?? true,
      status: user.status || 'active',
      referral_code: user.referral_code,
      referred_by: user.referred_by,
      created_at: now,
      updated_at: now,
      demo_balance: user.demo_balance ?? 1000000.0,
    };

    const existing = db.findUserByUserId(normalizedUserId);
    if (existing) {
      const err = new Error(`User ID '${normalizedUserId}' already exists.`);
      (err as any).statusCode = 409;
      throw err;
    }

    db.updateUser(id, record); // or push directly through internal mechanism
    // To ensure persistent storage in state:
    const users = (db as any).state.users as UserRecord[];
    users.push(record);
    (db as any).save();

    return this.normalizeUser(record);
  }

  public async update(id: string, updates: Partial<UserRecord>): Promise<UserRecord | null> {
    const updated = db.updateUser(id, updates);
    return updated ? this.normalizeUser(updated) : null;
  }

  public async delete(id: string): Promise<boolean> {
    const users = (db as any).state.users as UserRecord[];
    const index = users.findIndex((u) => u.id === id);
    if (index !== -1) {
      users.splice(index, 1);
      (db as any).save();
      return true;
    }
    return false;
  }
}

export const jsonUserRepository = new JsonUserRepository();
