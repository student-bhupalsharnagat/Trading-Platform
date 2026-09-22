import { jsonUserRepository } from '../repositories/JsonUserRepository.ts';
import { jsonHierarchyRepository } from '../repositories/JsonHierarchyRepository.ts';
import { auditService } from './auditService.ts';
import type { UserRecord, UserRole } from '../db/database.ts';
import crypto from 'crypto';

export interface HierarchyNodeView {
  id: string;
  userId: string;
  fullName: string;
  email?: string;
  mobile: string;
  countryCode: string;
  role: UserRole;
  parentId?: string | null;
  parentName?: string;
  hierarchyPath: string;
  status: 'active' | 'suspended' | 'demo' | 'deactivated';
  company?: string;
  address?: string;
  commissionRate?: number;
  balance?: number;
  brokersCount?: number;
  subBrokersCount?: number;
  clientsCount?: number;
  createdAt: string;
  updatedAt: string;
}

export class HierarchyService {
  public async ensureSuperAdmin(): Promise<UserRecord> {
    const admins = await jsonUserRepository.findByRole('SUPER_ADMIN');
    if (admins.length > 0) {
      return admins[0];
    }

    // Provision default Super Admin safely
    const superAdmin = await jsonUserRepository.create({
      id: 'super-admin-root-0001',
      full_name: 'Platform Super Admin',
      user_id: 'superadmin',
      country_code: '+91',
      mobile: '9999999999',
      email: 'admin@goldfut.com',
      password_hash: '$2a$10$wT8BfZF/Y/wZ84aG9U0t6eYxUo9Jg7v1sYqQ4M4e4K0n0s9N7w5vC', // hash for Admin@12345
      role: 'SUPER_ADMIN',
      parent_id: null,
      hierarchy_path: 'root',
      company: 'Goldfut Prime Global',
      address: 'Corporate Headquarters, Financial District',
      commission_rate: 100,
      is_verified: true,
      status: 'active',
    });

    // Seed 2 Masters, 2 Brokers, 2 Sub-Brokers if empty
    await this.seedInitialHierarchy(superAdmin);

    return superAdmin;
  }

  private async seedInitialHierarchy(superAdmin: UserRecord) {
    const existingMasters = await jsonUserRepository.findByRole('MASTER');
    if (existingMasters.length > 0) return;

    // Master 1
    const master1 = await jsonUserRepository.create({
      id: 'master-node-0001',
      full_name: 'Alpha Apex Master',
      user_id: 'master_alpha',
      country_code: '+91',
      mobile: '9810011111',
      email: 'alpha.master@goldfut.com',
      password_hash: '$2a$10$wT8BfZF/Y/wZ84aG9U0t6eYxUo9Jg7v1sYqQ4M4e4K0n0s9N7w5vC',
      role: 'MASTER',
      parent_id: superAdmin.id,
      hierarchy_path: 'root.master_alpha',
      company: 'Alpha Capital Ventures',
      address: 'Dalal Street, Mumbai',
      commission_rate: 20,
      is_verified: true,
      status: 'active',
    });

    // Master 2
    const master2 = await jsonUserRepository.create({
      id: 'master-node-0002',
      full_name: 'Zenith Prime Master',
      user_id: 'master_zenith',
      country_code: '+91',
      mobile: '9810022222',
      email: 'zenith.master@goldfut.com',
      password_hash: '$2a$10$wT8BfZF/Y/wZ84aG9U0t6eYxUo9Jg7v1sYqQ4M4e4K0n0s9N7w5vC',
      role: 'MASTER',
      parent_id: superAdmin.id,
      hierarchy_path: 'root.master_zenith',
      company: 'Zenith Financial House',
      address: 'Connaught Place, New Delhi',
      commission_rate: 18,
      is_verified: true,
      status: 'active',
    });

    // Broker under Master 1
    const broker1 = await jsonUserRepository.create({
      id: 'broker-node-0001',
      full_name: 'Metro Securities Broker',
      user_id: 'broker_metro',
      country_code: '+91',
      mobile: '9810033333',
      email: 'metro@securities.com',
      password_hash: '$2a$10$wT8BfZF/Y/wZ84aG9U0t6eYxUo9Jg7v1sYqQ4M4e4K0n0s9N7w5vC',
      role: 'BROKER',
      parent_id: master1.id,
      hierarchy_path: 'root.master_alpha.broker_metro',
      company: 'Metro Equities Ltd',
      address: 'Bandra Kurla Complex, Mumbai',
      commission_rate: 10,
      is_verified: true,
      status: 'active',
    });

    // Sub-Broker under Broker 1
    await jsonUserRepository.create({
      id: 'subbroker-node-0001',
      full_name: 'Kalyan Regional Sub-Broker',
      user_id: 'subbroker_kalyan',
      country_code: '+91',
      mobile: '9810044444',
      email: 'kalyan.branch@goldfut.com',
      password_hash: '$2a$10$wT8BfZF/Y/wZ84aG9U0t6eYxUo9Jg7v1sYqQ4M4e4K0n0s9N7w5vC',
      role: 'SUB_BROKER',
      parent_id: broker1.id,
      hierarchy_path: 'root.master_alpha.broker_metro.subbroker_kalyan',
      company: 'Kalyan Wealth Desk',
      address: 'Station Road, Kalyan',
      commission_rate: 5,
      is_verified: true,
      status: 'active',
    });
  }

  public async toNodeView(record: UserRecord): Promise<HierarchyNodeView> {
    let parentName: string | undefined = undefined;
    if (record.parent_id) {
      const parent = await jsonUserRepository.findById(record.parent_id);
      if (parent) parentName = parent.full_name;
    }

    const counts = await jsonHierarchyRepository.getNodeWithCounts(record.id);

    return {
      id: record.id,
      userId: record.user_id,
      fullName: record.full_name,
      email: record.email,
      mobile: record.mobile,
      countryCode: record.country_code,
      role: record.role || 'CLIENT',
      parentId: record.parent_id,
      parentName,
      hierarchyPath: record.hierarchy_path || `root.${record.user_id}`,
      status: record.status || 'active',
      company: record.company,
      address: record.address,
      commissionRate: record.commission_rate,
      balance: record.demo_balance,
      brokersCount: counts.brokersCount,
      subBrokersCount: counts.subBrokersCount,
      clientsCount: counts.clientsCount,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }

  // --- Hierarchy-Scoped Queries ---
  public async getScopedEntities(
    caller: UserRecord,
    targetRole?: UserRole
  ): Promise<HierarchyNodeView[]> {
    const pathPrefix = caller.hierarchy_path || 'root';
    const descendants = await jsonHierarchyRepository.getDescendants(pathPrefix);

    const filtered = targetRole
      ? descendants.filter((d) => d.role === targetRole)
      : descendants;

    const views = await Promise.all(filtered.map((r) => this.toNodeView(r)));
    return views;
  }

  public async getScopedEntityById(
    caller: UserRecord,
    targetId: string
  ): Promise<HierarchyNodeView | null> {
    const target = await jsonUserRepository.findById(targetId);
    if (!target) return null;

    // Check hierarchy boundary
    const callerPath = caller.hierarchy_path || 'root';
    const targetPath = target.hierarchy_path || `root.${target.user_id}`;

    if (!jsonHierarchyRepository.isAncestor(callerPath, targetPath)) {
      return null; // Return null so controller responds with 404 (prevents ID enumeration)
    }

    return this.toNodeView(target);
  }

  // --- Creation Operations with Strict Hierarchy Inheritance ---
  public async createMaster(
    caller: UserRecord,
    data: {
      fullName: string;
      userId: string;
      email?: string;
      mobile: string;
      countryCode?: string;
      password?: string;
      company?: string;
      address?: string;
      commissionRate?: number;
    }
  ): Promise<HierarchyNodeView> {
    if (caller.role !== 'SUPER_ADMIN') {
      const err = new Error('Only Super Admin can create a Master');
      (err as any).statusCode = 403;
      throw err;
    }

    const normalizedUserId = data.userId.trim().toLowerCase();
    const passwordHash = data.password
      ? crypto.createHash('sha256').update(data.password).digest('hex')
      : '$2a$10$wT8BfZF/Y/wZ84aG9U0t6eYxUo9Jg7v1sYqQ4M4e4K0n0s9N7w5vC';

    const record = await jsonUserRepository.create({
      full_name: data.fullName,
      user_id: normalizedUserId,
      country_code: data.countryCode || '+91',
      mobile: data.mobile,
      email: data.email,
      password_hash: passwordHash,
      role: 'MASTER',
      parent_id: caller.id,
      hierarchy_path: `root.${normalizedUserId}`,
      company: data.company,
      address: data.address,
      commission_rate: data.commissionRate ?? 20,
      is_verified: true,
      status: 'active',
    });

    auditService.log({
      actorId: caller.id,
      actorName: caller.full_name,
      actorRole: caller.role,
      action: 'CREATE_MASTER',
      module: 'HIERARCHY',
      targetId: record.id,
      targetName: record.full_name,
      targetRole: 'MASTER',
      newValue: { userId: record.user_id, company: record.company },
    });

    return this.toNodeView(record);
  }

  public async createBroker(
    caller: UserRecord,
    data: {
      fullName: string;
      userId: string;
      email?: string;
      mobile: string;
      countryCode?: string;
      password?: string;
      parentId: string; // Must be a Master ID
      company?: string;
      address?: string;
      commissionRate?: number;
    }
  ): Promise<HierarchyNodeView> {
    const parentMaster = await jsonUserRepository.findById(data.parentId);
    if (!parentMaster || parentMaster.role !== 'MASTER') {
      const err = new Error('Invalid parent Master specified.');
      (err as any).statusCode = 400;
      throw err;
    }

    // Verify caller owns this Master
    const callerPath = caller.hierarchy_path || 'root';
    if (!jsonHierarchyRepository.isAncestor(callerPath, parentMaster.hierarchy_path || '')) {
      const err = new Error('You do not have authorization to create a broker under this Master.');
      (err as any).statusCode = 403;
      throw err;
    }

    const normalizedUserId = data.userId.trim().toLowerCase();
    const passwordHash = data.password
      ? crypto.createHash('sha256').update(data.password).digest('hex')
      : '$2a$10$wT8BfZF/Y/wZ84aG9U0t6eYxUo9Jg7v1sYqQ4M4e4K0n0s9N7w5vC';

    const record = await jsonUserRepository.create({
      full_name: data.fullName,
      user_id: normalizedUserId,
      country_code: data.countryCode || '+91',
      mobile: data.mobile,
      email: data.email,
      password_hash: passwordHash,
      role: 'BROKER',
      parent_id: parentMaster.id,
      hierarchy_path: `${parentMaster.hierarchy_path}.${normalizedUserId}`,
      company: data.company,
      address: data.address,
      commission_rate: data.commissionRate ?? 12,
      is_verified: true,
      status: 'active',
    });

    auditService.log({
      actorId: caller.id,
      actorName: caller.full_name,
      actorRole: caller.role,
      action: 'CREATE_BROKER',
      module: 'HIERARCHY',
      targetId: record.id,
      targetName: record.full_name,
      targetRole: 'BROKER',
      newValue: { parentId: parentMaster.id, userId: record.user_id },
    });

    return this.toNodeView(record);
  }

  public async createSubBroker(
    caller: UserRecord,
    data: {
      fullName: string;
      userId: string;
      email?: string;
      mobile: string;
      countryCode?: string;
      password?: string;
      parentId: string; // Must be a Broker ID
      company?: string;
      address?: string;
      commissionRate?: number;
    }
  ): Promise<HierarchyNodeView> {
    const parentBroker = await jsonUserRepository.findById(data.parentId);
    if (!parentBroker || parentBroker.role !== 'BROKER') {
      const err = new Error('Invalid parent Broker specified.');
      (err as any).statusCode = 400;
      throw err;
    }

    const callerPath = caller.hierarchy_path || 'root';
    if (!jsonHierarchyRepository.isAncestor(callerPath, parentBroker.hierarchy_path || '')) {
      const err = new Error('You do not have authorization to create a sub-broker under this Broker.');
      (err as any).statusCode = 403;
      throw err;
    }

    const normalizedUserId = data.userId.trim().toLowerCase();
    const passwordHash = data.password
      ? crypto.createHash('sha256').update(data.password).digest('hex')
      : '$2a$10$wT8BfZF/Y/wZ84aG9U0t6eYxUo9Jg7v1sYqQ4M4e4K0n0s9N7w5vC';

    const record = await jsonUserRepository.create({
      full_name: data.fullName,
      user_id: normalizedUserId,
      country_code: data.countryCode || '+91',
      mobile: data.mobile,
      email: data.email,
      password_hash: passwordHash,
      role: 'SUB_BROKER',
      parent_id: parentBroker.id,
      hierarchy_path: `${parentBroker.hierarchy_path}.${normalizedUserId}`,
      company: data.company,
      address: data.address,
      commission_rate: data.commissionRate ?? 6,
      is_verified: true,
      status: 'active',
    });

    auditService.log({
      actorId: caller.id,
      actorName: caller.full_name,
      actorRole: caller.role,
      action: 'CREATE_SUB_BROKER',
      module: 'HIERARCHY',
      targetId: record.id,
      targetName: record.full_name,
      targetRole: 'SUB_BROKER',
      newValue: { parentId: parentBroker.id, userId: record.user_id },
    });

    return this.toNodeView(record);
  }

  public async updateEntityStatus(
    caller: UserRecord,
    targetId: string,
    newStatus: 'active' | 'suspended' | 'deactivated'
  ): Promise<HierarchyNodeView> {
    const target = await jsonUserRepository.findById(targetId);
    if (!target) {
      const err = new Error('Entity not found');
      (err as any).statusCode = 404;
      throw err;
    }

    // Verify hierarchy boundary
    const callerPath = caller.hierarchy_path || 'root';
    if (!jsonHierarchyRepository.isAncestor(callerPath, target.hierarchy_path || '')) {
      const err = new Error('Entity not found');
      (err as any).statusCode = 404;
      throw err;
    }

    const oldStatus = target.status;
    const updated = await jsonUserRepository.update(targetId, { status: newStatus });

    auditService.log({
      actorId: caller.id,
      actorName: caller.full_name,
      actorRole: caller.role,
      action: `STATUS_CHANGE_TO_${newStatus.toUpperCase()}`,
      module: 'HIERARCHY',
      targetId: target.id,
      targetName: target.full_name,
      targetRole: target.role,
      oldValue: { status: oldStatus },
      newValue: { status: newStatus },
    });

    return this.toNodeView(updated!);
  }
}

export const hierarchyService = new HierarchyService();
