import { jsonUserRepository } from '../repositories/JsonUserRepository.ts';
import { jsonHierarchyRepository } from '../repositories/JsonHierarchyRepository.ts';
import { auditService } from './auditService.ts';
import { db, type UserRecord, type UserRole, type AccountStatus } from '../db/database.ts';
import crypto from 'crypto';
import { pgDb } from '../db/postgres.ts';
import { PasswordHashUtil } from '../utils/passwordHash.ts';
import { transactionalOutboxService } from './TransactionalOutboxService.ts';
import { tradingWebSocketServer } from '../websocket/WebSocketServer.ts';
import { internalEventDispatcher } from '../events/InternalEventDispatcher.ts';
import { postgresClientMappingRepository } from '../repositories/PostgresClientMappingRepository.ts';

let _authServiceRef: any = null;
async function getAuthServiceRef() {
  if (!_authServiceRef) {
    const mod = await import('./authService.ts');
    _authServiceRef = mod.authService;
  }
  return _authServiceRef;
}

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
  status: AccountStatus;
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
      const sa = admins[0];
      if (!sa.email_verified_at || !sa.phone_verified_at) {
        await jsonUserRepository.update(sa.id, {
          email_verified_at: sa.email_verified_at || new Date().toISOString(),
          phone_verified_at: sa.phone_verified_at || new Date().toISOString(),
          is_verified: true,
          status: 'active',
        });
      }
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
      email_verified_at: new Date().toISOString(),
      phone_verified_at: new Date().toISOString(),
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

  private async persistUserToPostgres(user: UserRecord, tenantId = 'vertex-default'): Promise<void> {
    try {
      await pgDb.query(`
        INSERT INTO users (
          id, tenant_id, full_name, user_id, country_code, mobile, email,
          password_hash, role, parent_id, hierarchy_path, company, address,
          commission_rate, referral_code, is_verified, status, account_type, demo_balance,
          master_id, broker_id, sub_broker_id,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19,
          $20, $21, $22,
          NOW(), NOW()
        )
        ON CONFLICT (tenant_id, user_id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          mobile = EXCLUDED.mobile,
          email = EXCLUDED.email,
          password_hash = COALESCE(NULLIF(EXCLUDED.password_hash, ''), users.password_hash),
          role = EXCLUDED.role,
          parent_id = EXCLUDED.parent_id,
          hierarchy_path = EXCLUDED.hierarchy_path,
          company = EXCLUDED.company,
          address = EXCLUDED.address,
          commission_rate = EXCLUDED.commission_rate,
          referral_code = COALESCE(NULLIF(EXCLUDED.referral_code, ''), users.referral_code),
          master_id = COALESCE(EXCLUDED.master_id, users.master_id),
          broker_id = COALESCE(EXCLUDED.broker_id, users.broker_id),
          sub_broker_id = COALESCE(EXCLUDED.sub_broker_id, users.sub_broker_id),
          status = EXCLUDED.status,
          is_verified = COALESCE(EXCLUDED.is_verified, users.is_verified),
          demo_balance = CASE WHEN EXCLUDED.demo_balance > 0 THEN EXCLUDED.demo_balance ELSE users.demo_balance END,
          updated_at = NOW();
      `, [
        user.id,
        tenantId,
        user.full_name,
        user.user_id,
        user.country_code || '+91',
        user.mobile,
        user.email || `${user.user_id}@goldfut.com`,
        user.password_hash,
        user.role || 'CLIENT',
        user.parent_id,
        user.hierarchy_path,
        user.company || null,
        user.address || null,
        user.commission_rate ?? 0,
        user.referral_code || null,
        user.is_verified ?? true,
        user.status || 'active',
        user.account_type || 'real',
        user.demo_balance || 1000000.0,
        user.master_id || null,
        user.broker_id || null,
        user.sub_broker_id || null,
      ]);

      await pgDb.query(`
        INSERT INTO trading_platform_accounts (
          id, tenant_id, user_id, client_code, name, email, phone,
          password_hash, role, broker_id, status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, NOW(), NOW()
        )
        ON CONFLICT (tenant_id, user_id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          password_hash = CASE WHEN EXCLUDED.password_hash != '' THEN EXCLUDED.password_hash ELSE trading_platform_accounts.password_hash END,
          client_code = COALESCE(EXCLUDED.client_code, trading_platform_accounts.client_code),
          broker_id = COALESCE(EXCLUDED.broker_id, trading_platform_accounts.broker_id),
          status = EXCLUDED.status,
          updated_at = NOW();
      `, [
        user.id,
        tenantId,
        user.user_id,
        user.client_code || user.user_id.toUpperCase(),
        user.full_name,
        user.email,
        user.mobile,
        user.password_hash,
        user.role || 'CLIENT',
        user.broker_id || 'BRK-001',
        user.status || 'ACTIVE',
      ]).catch(() => {});
    } catch (pgErr: any) {
      // Fallback update if conflict target differs
      await pgDb.query(`
        UPDATE users SET
          full_name = $1, mobile = $2, email = $3, role = $4,
          parent_id = $5, hierarchy_path = $6, company = $7,
          address = $8, commission_rate = $9, referral_code = COALESCE(NULLIF($10, ''), referral_code),
          master_id = COALESCE(NULLIF($11, ''), master_id),
          broker_id = COALESCE(NULLIF($12, ''), broker_id),
          sub_broker_id = COALESCE(NULLIF($13, ''), sub_broker_id),
          status = $14, updated_at = NOW()
        WHERE id = $15 OR (tenant_id = $16 AND LOWER(user_id) = LOWER($17))
      `, [
        user.full_name, user.mobile, user.email, user.role,
        user.parent_id, user.hierarchy_path, user.company,
        user.address, user.commission_rate, user.referral_code || '',
        user.master_id || '', user.broker_id || '', user.sub_broker_id || '',
        user.status, user.id, tenantId, user.user_id
      ]).catch(() => {});
    }
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
    const passwordHash = await PasswordHashUtil.hashPassword(data.password || 'Password@123');

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

    const tenantId = caller.tenant_id || 'vertex-default';
    await this.persistUserToPostgres(record, tenantId);

    // Enqueue outbox event for central admin / live synchronization
    await transactionalOutboxService.enqueue({
      eventId: `hrc-mst-${record.id}`,
      eventType: 'hierarchy.updated',
      tenantId,
      payload: {
        action: 'created',
        type: 'master',
        id: record.id,
        userId: record.user_id,
        name: record.full_name,
        fullName: record.full_name,
        email: record.email,
        phone: record.mobile,
        role: 'MASTER',
        parentId: record.parent_id,
        masterId: record.id,
        commissionRate: record.commission_rate,
        tenantId,
        status: record.status,
        createdAt: record.created_at,
      },
    }).catch(() => {});

    // Broadcast WebSocket event
    const masterNodeView = await this.toNodeView(record);
    tradingWebSocketServer.broadcastToTenant(tenantId, 'hierarchy.updated', {
      type: 'master',
      action: 'created',
      tenantId,
      masterId: record.id,
      brokerId: null,
      subBrokerId: null,
      node: masterNodeView,
    });

    internalEventDispatcher.dispatchBrokerAdded({
      tenantId,
      id: record.id,
      userId: record.user_id,
      name: record.full_name,
      fullName: record.full_name,
      email: record.email,
      phone: record.mobile,
      role: 'MASTER',
      parentId: record.parent_id,
      masterId: record.id,
      brokerId: null,
      subBrokerId: null,
      commissionRate: record.commission_rate,
      status: record.status,
      createdAt: record.created_at,
    }).catch(() => {});

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
    const passwordHash = await PasswordHashUtil.hashPassword(data.password || 'Password@123');

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

    const tenantId = caller.tenant_id || parentMaster.tenant_id || 'vertex-default';
    await this.persistUserToPostgres(record, tenantId);

    // Enqueue outbox event
    await transactionalOutboxService.enqueue({
      eventId: `hrc-brk-${record.id}`,
      eventType: 'hierarchy.updated',
      tenantId,
      payload: {
        action: 'created',
        type: 'broker',
        id: record.id,
        userId: record.user_id,
        name: record.full_name,
        fullName: record.full_name,
        email: record.email,
        phone: record.mobile,
        role: 'BROKER',
        parentId: parentMaster.id,
        masterId: parentMaster.id,
        brokerId: record.id,
        commissionRate: record.commission_rate,
        tenantId,
        status: record.status,
        createdAt: record.created_at,
      },
    }).catch(() => {});

    // Broadcast WebSocket event
    const brokerNodeView = await this.toNodeView(record);
    tradingWebSocketServer.broadcastToTenant(tenantId, 'hierarchy.updated', {
      type: 'broker',
      action: 'created',
      tenantId,
      masterId: parentMaster.id,
      brokerId: record.id,
      subBrokerId: null,
      node: brokerNodeView,
    });

    internalEventDispatcher.dispatchBrokerAdded({
      tenantId,
      id: record.id,
      userId: record.user_id,
      name: record.full_name,
      fullName: record.full_name,
      email: record.email,
      phone: record.mobile,
      role: 'BROKER',
      parentId: parentMaster.id,
      masterId: parentMaster.id,
      brokerId: record.id,
      subBrokerId: null,
      commissionRate: record.commission_rate,
      status: record.status,
      createdAt: record.created_at,
    }).catch(() => {});

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
    const passwordHash = await PasswordHashUtil.hashPassword(data.password || 'Password@123');

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

    const tenantId = caller.tenant_id || parentBroker.tenant_id || 'vertex-default';
    await this.persistUserToPostgres(record, tenantId);

    // Resolve master id from broker parent
    const masterId = parentBroker.parent_id;

    // Enqueue outbox event
    await transactionalOutboxService.enqueue({
      eventId: `hrc-sub-${record.id}`,
      eventType: 'hierarchy.updated',
      tenantId,
      payload: {
        action: 'created',
        type: 'sub_broker',
        id: record.id,
        userId: record.user_id,
        name: record.full_name,
        fullName: record.full_name,
        email: record.email,
        phone: record.mobile,
        role: 'SUB_BROKER',
        parentId: parentBroker.id,
        masterId,
        brokerId: parentBroker.id,
        subBrokerId: record.id,
        commissionRate: record.commission_rate,
        tenantId,
        status: record.status,
        createdAt: record.created_at,
      },
    }).catch(() => {});

    // Broadcast WebSocket event
    const subBrokerNodeView = await this.toNodeView(record);
    tradingWebSocketServer.broadcastToTenant(tenantId, 'hierarchy.updated', {
      type: 'sub_broker',
      action: 'created',
      tenantId,
      masterId: masterId || null,
      brokerId: parentBroker.id,
      subBrokerId: record.id,
      node: subBrokerNodeView,
    });

    internalEventDispatcher.dispatchBrokerAdded({
      tenantId,
      id: record.id,
      userId: record.user_id,
      name: record.full_name,
      fullName: record.full_name,
      email: record.email,
      phone: record.mobile,
      role: 'SUB_BROKER',
      parentId: parentBroker.id,
      masterId: masterId || null,
      brokerId: parentBroker.id,
      subBrokerId: record.id,
      commissionRate: record.commission_rate,
      status: record.status,
      createdAt: record.created_at,
    }).catch(() => {});

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
    const tenantId = target.tenant_id || caller.tenant_id || 'vertex-default';

    // Update in Postgres
    await pgDb.query(
      `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 OR LOWER(user_id) = LOWER($3)`,
      [newStatus, target.id, target.user_id]
    ).catch(() => {});

    // Enqueue outbox event
    await transactionalOutboxService.enqueue({
      eventId: `hrc-stat-${target.id}-${Date.now()}`,
      eventType: 'hierarchy.updated',
      tenantId,
      payload: {
        action: 'status_updated',
        type: target.role?.toLowerCase() || 'user',
        id: target.id,
        userId: target.user_id,
        status: newStatus,
        tenantId,
      },
    }).catch(() => {});

    tradingWebSocketServer.broadcastToTenant(tenantId, 'hierarchy.updated', {
      type: target.role?.toLowerCase(),
      action: 'status_updated',
      node: await this.toNodeView(updated!),
    });

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

  public async assignClientHierarchy(
    caller: UserRecord,
    clientId: string,
    params: { brokerId?: string; subBrokerId?: string }
  ): Promise<any> {
    const client = (await jsonUserRepository.findById(clientId)) || (await jsonUserRepository.findByUserId(clientId));
    if (!client) {
      const err = new Error('Client not found');
      (err as any).statusCode = 404;
      throw err;
    }

    let brokerId = params.brokerId;
    let subBrokerId = params.subBrokerId;
    let masterId: string | undefined = undefined;

    if (subBrokerId) {
      const subBroker = (await jsonUserRepository.findById(subBrokerId)) || (await jsonUserRepository.findByUserId(subBrokerId));
      if (subBroker) {
        if (!brokerId) brokerId = subBroker.parent_id || undefined;
      }
    }

    if (brokerId) {
      const broker = (await jsonUserRepository.findById(brokerId)) || (await jsonUserRepository.findByUserId(brokerId));
      if (broker) {
        masterId = broker.parent_id || undefined;
      }
    }

    const parentId = subBrokerId || brokerId || masterId || client.parent_id;
    let hierarchyPath = `root.${masterId || 'master_alpha'}.${brokerId || 'broker_metro'}`;
    if (subBrokerId) hierarchyPath += `.${subBrokerId}`;
    hierarchyPath += `.${client.user_id}`;

    // Update json store
    await jsonUserRepository.update(client.id, {
      parent_id: parentId,
      hierarchy_path: hierarchyPath,
      broker_id: brokerId,
    });

    const tenantId = client.tenant_id || caller.tenant_id || 'vertex-default';

    // Update Postgres users
    await pgDb.query(
      `UPDATE users SET parent_id = $1, hierarchy_path = $2, broker_id = $3, updated_at = NOW() WHERE id = $4 OR LOWER(user_id) = LOWER($5)`,
      [parentId, hierarchyPath, brokerId || null, client.id, client.user_id]
    ).catch(() => {});

    // Update or insert client_mappings
    await pgDb.query(`
      INSERT INTO client_mappings (
        id, tenant_id, client_id, user_id, master_id, broker_id, sub_broker_id, parent_id, hierarchy_path, account_type, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
      )
      ON CONFLICT (tenant_id, user_id) DO UPDATE SET
        master_id = EXCLUDED.master_id,
        broker_id = EXCLUDED.broker_id,
        sub_broker_id = EXCLUDED.sub_broker_id,
        parent_id = EXCLUDED.parent_id,
        hierarchy_path = EXCLUDED.hierarchy_path,
        updated_at = NOW();
    `, [
      `map_${client.id}`,
      tenantId,
      client.id,
      client.user_id,
      masterId || null,
      brokerId || null,
      subBrokerId || null,
      parentId,
      hierarchyPath,
      client.account_type || 'real',
    ]).catch(() => {});

    const payload = {
      action: 'updated',
      type: 'client',
      id: client.id,
      userId: client.user_id,
      clientCode: client.user_id.toUpperCase(),
      masterId: masterId || null,
      brokerId: brokerId || null,
      subBrokerId: subBrokerId || null,
      parentId,
      hierarchyPath,
      tenantId,
    };

    await transactionalOutboxService.enqueue({
      eventId: `hrc-clt-assign-${client.id}-${Date.now()}`,
      eventType: 'client.updated',
      tenantId,
      payload,
    }).catch(() => {});

    tradingWebSocketServer.broadcastToTenant(tenantId, 'client.updated', payload);
    tradingWebSocketServer.broadcastToTenant(tenantId, 'hierarchy.updated', payload);

    return {
      success: true,
      data: {
        id: client.id,
        userId: client.user_id,
        masterId,
        brokerId,
        subBrokerId,
        parentId,
        hierarchyPath,
      },
    };
  }

  public async syncFromCentralAdmin(payload: any): Promise<any> {
    const rawType = (payload?.type || payload?.role || 'user').toLowerCase();
    const actionUpper = String(payload?.action || 'UPSERT').toUpperCase();
    const node = payload?.node || payload || {};
    const tenantId = payload?.tenantId || node?.tenant_id || node?.tenantId || 'vertex-default';

    const userId = (node.user_id || node.userId || node.code || node.id || (node.email ? String(node.email).split('@')[0] : '') || '').toLowerCase().trim();
    if (!userId) {
      return { success: false, error: 'User identifier missing in node' };
    }
    const targetId = node.id || userId;
    const authSvc = await getAuthServiceRef();

    // 1. Action: DELETE
    if (actionUpper === 'DELETE' || actionUpper === 'DELETED') {
      authSvc?.revokeUser(userId);
      authSvc?.revokeUser(targetId);

      await pgDb.query(
        `UPDATE users SET status = 'DELETED', updated_at = NOW() WHERE id = $1 OR LOWER(user_id) = LOWER($2);`,
        [targetId, userId]
      ).catch(() => {});
      await pgDb.query(
        `UPDATE client_mappings SET status = 'DELETED', updated_at = NOW() WHERE client_id = $1 OR LOWER(user_id) = LOWER($2);`,
        [targetId, userId]
      ).catch(() => {});

      await jsonUserRepository.update(targetId, { status: 'DELETED' as any });
      db.updateUser(targetId, { status: 'DELETED' });
      db.updateUser(userId, { status: 'DELETED' });

      tradingWebSocketServer.broadcastToTenant(tenantId, 'hierarchy.deleted', {
        type: rawType,
        action: 'DELETE',
        tenantId,
        id: targetId,
        userId,
      });
      if (rawType.includes('client')) {
        tradingWebSocketServer.broadcastToTenant(tenantId, 'client.deleted', {
          tenantId,
          id: targetId,
          userId,
        });
      }

      return {
        success: true,
        processed: true,
        action: 'DELETE',
        id: targetId,
        userId,
      };
    }

    // 2. Action: STATUS_CHANGE
    if (actionUpper === 'STATUS_CHANGE' || actionUpper === 'STATUS_UPDATED') {
      const newStatus = (node.status || payload.status || 'ACTIVE').toUpperCase();
      const isSuspended = newStatus === 'SUSPENDED' || newStatus === 'DELETED';

      if (isSuspended) {
        authSvc?.revokeUser(userId);
        authSvc?.revokeUser(targetId);
      } else if (newStatus === 'ACTIVE') {
        authSvc?.unrevokeUser(userId);
        authSvc?.unrevokeUser(targetId);
      }

      await pgDb.query(
        `UPDATE users SET status = $1, is_frozen = $2, updated_at = NOW() WHERE id = $3 OR LOWER(user_id) = LOWER($4);`,
        [newStatus, isSuspended, targetId, userId]
      ).catch(() => {});
      await pgDb.query(
        `UPDATE client_mappings SET status = $1, updated_at = NOW() WHERE client_id = $2 OR LOWER(user_id) = LOWER($3);`,
        [newStatus, targetId, userId]
      ).catch(() => {});

      const existing = (await jsonUserRepository.findByUserId(userId)) || (await jsonUserRepository.findById(targetId));
      if (existing) {
        await jsonUserRepository.update(existing.id, {
          status: newStatus as any,
          is_frozen: isSuspended,
        });
        db.updateUser(existing.id, {
          status: newStatus as any,
          is_frozen: isSuspended,
        });
      }

      tradingWebSocketServer.broadcastToTenant(tenantId, 'hierarchy.updated', {
        type: rawType,
        action: 'STATUS_CHANGE',
        tenantId,
        id: targetId,
        userId,
        status: newStatus,
      });

      return {
        success: true,
        processed: true,
        action: 'STATUS_CHANGE',
        status: newStatus,
        id: targetId,
        userId,
      };
    }

    // 3. Action: PASSWORD_RESET
    if (actionUpper === 'PASSWORD_RESET' || actionUpper === 'PASSWORD_UPDATED') {
      const incomingHash = node.passwordHash || node.password_hash || payload?.passwordHash || payload?.password_hash || '';
      const passwordHash = node.password
        ? await PasswordHashUtil.hashPassword(node.password)
        : (incomingHash || '$2a$10$wT8BfZF/Y/wZ84aG9U0t6eYxUo9Jg7v1sYqQ4M4e4K0n0s9N7w5vC');

      authSvc?.revokeUser(userId);
      authSvc?.revokeUser(targetId);

      await pgDb.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 OR LOWER(user_id) = LOWER($3);`,
        [passwordHash, targetId, userId]
      ).catch(() => {});
      await pgDb.query(
        `UPDATE trading_platform_accounts SET password_hash = $1, updated_at = NOW() WHERE LOWER(user_id) = LOWER($2);`,
        [passwordHash, userId]
      ).catch(() => {});

      const existing = (await jsonUserRepository.findByUserId(userId)) || (await jsonUserRepository.findById(targetId));
      if (existing) {
        await jsonUserRepository.update(existing.id, { password_hash: passwordHash });
        db.updateUserPassword(existing.user_id, passwordHash);
      }

      return {
        success: true,
        processed: true,
        action: 'PASSWORD_RESET',
        id: targetId,
        userId,
      };
    }

    // 4. Action: UPSERT (created / updated / default)
    const action = payload?.action || 'updated';
    const fullName = node.name || node.fullName || node.full_name || userId;
    const cleanEmail = (node.email || `${userId}@tradematrix.io`).trim().toLowerCase();
    const rawPhone = String(node.phone || node.mobile || '').trim();
    const digitsOnly = rawPhone.replace(/\D/g, '');
    const cleanMobile = (digitsOnly.length === 12 && digitsOnly.startsWith('91')
      ? digitsOnly.slice(2)
      : (digitsOnly.length === 11 && digitsOnly.startsWith('0') ? digitsOnly.slice(1) : digitsOnly))
      || (digitsOnly.length === 10 ? digitsOnly : digitsOnly.slice(-10))
      || '9999999999';
    const phoneE164 = rawPhone.startsWith('+') ? rawPhone : (cleanMobile ? `+91${cleanMobile}` : '+919999999999');
    const rawBal = node.initialBalance ?? node.initial_balance ?? node.balance ?? node.wallet_balance ?? payload?.initialBalance ?? 0;
    const initialBalance = typeof rawBal === 'number' ? rawBal : parseFloat(String(rawBal).replace(/[^0-9.-]/g, '')) || 0;
    const commissionRate = Number(node.commissionShare || node.commissionRate || node.commission || 0);
    const referralCode = node.referralCode || node.referral_code || undefined;
    const incomingHash = node.passwordHash || node.password_hash || payload?.passwordHash || payload?.password_hash || '';
    let existing = (await jsonUserRepository.findByUserId(userId)) || (node.id ? await jsonUserRepository.findById(node.id) : null);
    const passwordHash = node.password
      ? await PasswordHashUtil.hashPassword(node.password)
      : (incomingHash || (existing?.password_hash ? existing.password_hash : await PasswordHashUtil.hashPassword('Password@123')));
    const status = (node.status || 'ACTIVE').toUpperCase();

    if (status === 'SUSPENDED' || status === 'DELETED') {
      authSvc?.revokeUser(userId);
      authSvc?.revokeUser(targetId);
    } else if (status === 'ACTIVE') {
      authSvc?.unrevokeUser(userId);
      authSvc?.unrevokeUser(targetId);
    }

    let role: UserRole = 'CLIENT';
    let parentId: string | null = null;
    let hierarchyPath = `root.${userId}`;
    let masterId: string | null = node.master_id || node.masterId || null;
    let brokerId: string | null = node.broker_id || node.brokerId || null;
    let subBrokerId: string | null = node.sub_broker_id || node.subBrokerId || null;

    if (rawType.includes('master')) {
      role = 'MASTER';
      parentId = 'super-admin-root-0001';
      hierarchyPath = `root.${userId}`;
      masterId = targetId;
    } else if (rawType.includes('sub_broker') || rawType.includes('subbroker')) {
      role = 'SUB_BROKER';
      parentId = node.broker_id || node.brokerId || node.parentId || 'broker-node-0001';
      const parentBroker = (await jsonUserRepository.findById(parentId)) || (await jsonUserRepository.findByUserId(parentId));
      const bPath = parentBroker?.hierarchy_path || 'root.master_alpha.broker_metro';
      hierarchyPath = `${bPath}.${userId}`;
      subBrokerId = targetId;
      brokerId = brokerId || parentId;
    } else if (rawType.includes('broker')) {
      role = 'BROKER';
      parentId = node.master_id || node.masterId || node.parentId || 'master-node-0001';
      const parentMaster = (await jsonUserRepository.findById(parentId)) || (await jsonUserRepository.findByUserId(parentId));
      const mPath = parentMaster?.hierarchy_path || 'root.master_alpha';
      hierarchyPath = `${mPath}.${userId}`;
      brokerId = targetId;
      masterId = masterId || parentId;
    } else {
      role = 'CLIENT';
      const bId = node.broker_id || node.brokerId;
      const sbId = node.sub_broker_id || node.subBrokerId;
      parentId = sbId || bId || 'broker-node-0001';
      hierarchyPath = `root.master_alpha.${bId || 'broker_metro'}${sbId ? `.${sbId}` : ''}.${userId}`;
    }

    // Upsert in in-memory repository
    if (!existing) {
      existing = await jsonUserRepository.create({
        id: node.id || `node-${role.toLowerCase()}-${Date.now()}`,
        full_name: fullName,
        user_id: userId,
        country_code: node.countryCode || '+91',
        mobile: cleanMobile,
        email: cleanEmail,
        password_hash: passwordHash,
        role,
        parent_id: parentId,
        master_id: masterId,
        broker_id: brokerId,
        sub_broker_id: subBrokerId,
        hierarchy_path: hierarchyPath,
        company: node.company || null,
        address: node.address || null,
        commission_rate: commissionRate,
        referral_code: referralCode,
        tenant_id: tenantId,
        is_verified: true,
        status: status as any,
      });
    } else {
      existing =
        (await jsonUserRepository.update(existing.id, {
          full_name: fullName,
          email: cleanEmail,
          mobile: cleanMobile,
          role,
          parent_id: parentId,
          master_id: masterId || existing.master_id,
          broker_id: brokerId || existing.broker_id,
          sub_broker_id: subBrokerId || existing.sub_broker_id,
          hierarchy_path: hierarchyPath,
          commission_rate: commissionRate,
          referral_code: referralCode || existing.referral_code,
          tenant_id: tenantId || existing.tenant_id,
          status: status as any,
          company: node.company || existing.company,
          password_hash: (node.password || incomingHash) ? passwordHash : existing.password_hash,
          is_verified: true,
        })) || existing;
    }

    // Keep database.ts in-memory state fully synchronized
    const userForDb: UserRecord = {
      id: existing.id,
      full_name: fullName,
      user_id: existing.user_id,
      country_code: node.countryCode || '+91',
      mobile: cleanMobile,
      phone_e164: phoneE164,
      email: cleanEmail,
      email_verified_at: new Date().toISOString(),
      password_hash: (node.password || incomingHash) ? passwordHash : (existing.password_hash || passwordHash),
      role,
      parent_id: parentId,
      master_id: masterId,
      broker_id: brokerId,
      sub_broker_id: subBrokerId,
      hierarchy_path: hierarchyPath,
      company: node.company || undefined,
      address: node.address || undefined,
      commission_rate: commissionRate,
      referral_code: referralCode,
      tenant_id: tenantId,
      is_verified: true,
      status: status as any,
      demo_balance: initialBalance > 0 ? initialBalance : (existing.demo_balance || 1000000.0),
      client_code: existing.user_id.toUpperCase(),
      created_at: (existing as any).created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (db.findUserByUserIdOrMobile(existing.user_id) || db.findUserByUserIdOrMobile(existing.id)) {
      db.updateUser(existing.id, userForDb);
    } else {
      db.addUser(userForDb);
    }

    // Persist to Postgres
    existing.demo_balance = initialBalance > 0 ? initialBalance : (existing.demo_balance || 1000000.0);
    existing.is_verified = true;
    await this.persistUserToPostgres(existing, tenantId);

    // If client, ensure full mapping and trading wallet provisioning
    if (role === 'CLIENT') {
      try {
        await postgresClientMappingRepository.createClientMappingAndWallet({
          id: existing.id,
          user_id: existing.user_id,
          full_name: fullName,
          country_code: node.countryCode || '+91',
          mobile: cleanMobile,
          email: cleanEmail,
          password_hash: passwordHash,
          passwordHash,
          client_code: existing.user_id.toUpperCase(),
          master_id: masterId,
          broker_id: brokerId,
          sub_broker_id: subBrokerId,
          parent_id: parentId,
          hierarchy_path: hierarchyPath,
          referral_code: referralCode,
          role: 'CLIENT',
          status,
          is_verified: true,
          account_type: 'real',
          demo_balance: initialBalance > 0 ? initialBalance : 1000000.0,
          tenant_id: tenantId,
        }, tenantId);
      } catch (mapErr: any) {
        console.warn('[hierarchyService] Notice: createClientMappingAndWallet notice:', mapErr.message);
      }

      // Ensure trading_wallets has initialBalance set across all tenant aliases
      const tenants = Array.from(new Set([tenantId, 'TNT-001', 'vertex-default']));
      for (const t of tenants) {
        await pgDb.query(`
          INSERT INTO trading_wallets (
            id, tenant_id, user_id, available_balance, blocked_balance, used_margin, realized_pnl, updated_at
          ) VALUES (
            $1, $2, $3, $4, 0, 0, 0, NOW()
          )
          ON CONFLICT (tenant_id, user_id) DO UPDATE SET
            available_balance = CASE WHEN EXCLUDED.available_balance > 0 THEN EXCLUDED.available_balance ELSE trading_wallets.available_balance END,
            updated_at = NOW();
        `, [`wal_${t}_${existing.user_id}`, t, existing.user_id, Math.max(0, initialBalance)]).catch(() => {});
      }

      await pgDb.query(`
        INSERT INTO client_mappings (
          id, tenant_id, client_id, user_id, master_id, broker_id, sub_broker_id, parent_id, hierarchy_path, referral_code, account_type, status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()
        )
        ON CONFLICT (tenant_id, user_id) DO UPDATE SET
          master_id = EXCLUDED.master_id,
          broker_id = EXCLUDED.broker_id,
          sub_broker_id = EXCLUDED.sub_broker_id,
          parent_id = EXCLUDED.parent_id,
          hierarchy_path = EXCLUDED.hierarchy_path,
          referral_code = COALESCE(NULLIF(EXCLUDED.referral_code, ''), client_mappings.referral_code),
          status = EXCLUDED.status,
          updated_at = NOW();
      `, [
        `map_${existing.id}`,
        tenantId,
        existing.id,
        existing.user_id,
        masterId || 'master-node-0001',
        brokerId || 'BRK-001',
        subBrokerId || null,
        parentId,
        hierarchyPath,
        referralCode || null,
        'real',
        status,
      ]).catch(() => {});
    }

    // Broadcast WebSocket & SSE events
    const syncedView = await this.toNodeView(existing);
    const syncedMasterId = role === 'MASTER' ? existing.id : (node.master_id || node.masterId || null);
    const syncedBrokerId = role === 'BROKER' ? existing.id : (role === 'SUB_BROKER' ? parentId : (node.broker_id || node.brokerId || null));
    const syncedSubBrokerId = role === 'SUB_BROKER' ? existing.id : (node.sub_broker_id || node.subBrokerId || null);

    tradingWebSocketServer.broadcastToTenant(tenantId, 'hierarchy.updated', {
      type: role.toLowerCase(),
      action,
      tenantId,
      masterId: syncedMasterId,
      brokerId: syncedBrokerId,
      subBrokerId: syncedSubBrokerId,
      node: syncedView,
    });

    if (action === 'created') {
      if (role === 'CLIENT') {
        internalEventDispatcher.broadcastRealtimeEvent('client.registered', tenantId, {
          tenantId,
          tradingUserId: existing.user_id,
          userId: existing.user_id,
          clientId: existing.id,
          clientCode: existing.user_id.toUpperCase(),
          name: existing.full_name,
          email: existing.email || '',
          phone: existing.mobile || '',
          status: existing.status,
          masterId: syncedMasterId,
          brokerId: syncedBrokerId,
          subBrokerId: syncedSubBrokerId,
          createdAt: existing.created_at,
        }, { targetUserId: existing.user_id });
      } else if (role === 'MASTER' || role === 'BROKER' || role === 'SUB_BROKER') {
        internalEventDispatcher.broadcastRealtimeEvent('broker.added', tenantId, {
          tenantId,
          id: existing.id,
          userId: existing.user_id,
          name: existing.full_name,
          fullName: existing.full_name,
          email: existing.email || '',
          phone: existing.mobile || '',
          role,
          parentId,
          masterId: syncedMasterId,
          brokerId: syncedBrokerId,
          subBrokerId: syncedSubBrokerId,
          commissionRate: existing.commission_rate,
          status: existing.status,
          createdAt: existing.created_at,
        }, { privilegedOnly: true });
      }
    }

    return {
      success: true,
      processed: true,
      action,
      node: syncedView,
    };
  }

  /**
   * Looks up a partner (Master, Broker, Sub-Broker) by referralCode / userId / id
   */
  public async findPartnerByReferralCode(rawCode?: string): Promise<{
    partner: UserRecord;
    role: 'MASTER' | 'BROKER' | 'SUB_BROKER' | 'SUPER_ADMIN';
    tenantId: string;
    masterId: string | null;
    brokerId: string | null;
    subBrokerId: string | null;
  } | null> {
    if (!rawCode || !rawCode.trim()) return null;
    const cleanCode = rawCode.trim().toUpperCase();

    // 1. Search in memory
    const allUsers = await jsonUserRepository.findAll();
    let partner = allUsers.find((u) => {
      const r = (u.role || '').toUpperCase();
      if (!['MASTER', 'BROKER', 'SUB_BROKER', 'SUPER_ADMIN'].includes(r)) return false;
      const ref = (u.referral_code || (u as any).referralCode || '').toUpperCase();
      const uid = (u.user_id || '').toUpperCase();
      const id = (u.id || '').toUpperCase();
      const clientCode = ((u as any).client_code || '').toUpperCase();
      return (ref && ref === cleanCode) || uid === cleanCode || id === cleanCode || clientCode === cleanCode;
    });

    // 2. Search in PostgreSQL users
    if (!partner) {
      try {
        const pgRes = await pgDb.query(`
          SELECT * FROM users
          WHERE UPPER(role) IN ('MASTER', 'BROKER', 'SUB_BROKER', 'SUPER_ADMIN')
            AND (
              (referral_code IS NOT NULL AND UPPER(referral_code) = $1)
              OR UPPER(user_id) = $1
              OR UPPER(id) = $1
              OR (client_code IS NOT NULL AND UPPER(client_code) = $1)
            )
          LIMIT 1;
        `, [cleanCode]);
        if (pgRes.rows && pgRes.rows.length > 0) {
          const r = pgRes.rows[0];
          partner = {
            id: r.id,
            full_name: r.full_name,
            user_id: r.user_id,
            country_code: r.country_code || '+91',
            mobile: r.mobile,
            email: r.email,
            password_hash: r.password_hash || '',
            role: r.role,
            parent_id: r.parent_id,
            hierarchy_path: r.hierarchy_path,
            company: r.company,
            tenant_id: r.tenant_id,
            referral_code: r.referral_code,
            is_verified: true,
            status: r.status,
            created_at: r.created_at,
            updated_at: r.updated_at,
          };
        }
      } catch {}
    }

    // 3. Search in trading_platform_accounts
    if (!partner) {
      try {
        const tpaRes = await pgDb.query(`
          SELECT * FROM trading_platform_accounts
          WHERE UPPER(role) IN ('MASTER', 'BROKER', 'SUB_BROKER', 'SUPER_ADMIN')
            AND (
              UPPER(user_id) = $1
              OR UPPER(id) = $1
              OR (client_code IS NOT NULL AND UPPER(client_code) = $1)
            )
          LIMIT 1;
        `, [cleanCode]);
        if (tpaRes.rows && tpaRes.rows.length > 0) {
          const r = tpaRes.rows[0];
          partner = {
            id: r.id,
            full_name: r.name,
            user_id: r.user_id,
            country_code: '+91',
            mobile: r.phone || '',
            email: r.email,
            password_hash: r.password_hash || '',
            role: r.role as any,
            parent_id: null,
            tenant_id: r.tenant_id,
            is_verified: true,
            status: r.status,
            created_at: r.created_at,
            updated_at: r.updated_at,
          };
        }
      } catch {}
    }

    if (!partner) return null;

    const partnerRole = (partner.role || 'BROKER').toUpperCase() as 'MASTER' | 'BROKER' | 'SUB_BROKER' | 'SUPER_ADMIN';
    const tenantId = partner.tenant_id && partner.tenant_id !== 'default' ? partner.tenant_id : 'TNT-001';
    let masterId: string | null = null;
    let brokerId: string | null = null;
    let subBrokerId: string | null = null;

    if (partnerRole === 'SUB_BROKER') {
      subBrokerId = partner.id || partner.user_id;
      brokerId = partner.parent_id || null;
      if (brokerId) {
        const parentBroker = (await jsonUserRepository.findById(brokerId)) || (await jsonUserRepository.findByUserId(brokerId));
        masterId = parentBroker?.parent_id || null;
      }
    } else if (partnerRole === 'BROKER') {
      brokerId = partner.id || partner.user_id;
      masterId = partner.parent_id || null;
    } else if (partnerRole === 'MASTER') {
      masterId = partner.id || partner.user_id;
      brokerId = null;
    }

    // Fallback parsing from hierarchy_path
    if (partner.hierarchy_path && partner.hierarchy_path.startsWith('root.')) {
      const parts = partner.hierarchy_path.split('.');
      if (parts.length >= 2 && !masterId) masterId = parts[1];
      if (parts.length >= 3 && !brokerId) brokerId = parts[2];
      if (parts.length >= 4 && !subBrokerId) subBrokerId = parts[3];
    }

    return {
      partner,
      role: partnerRole,
      tenantId,
      masterId,
      brokerId,
      subBrokerId,
    };
  }
}

export const hierarchyService = new HierarchyService();
