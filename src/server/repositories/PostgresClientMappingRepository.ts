/**
 * VERTEX Multi-Tenant Trading Platform
 * PostgreSQL Client Mapping & Demo Persistence Repository
 */

import { pgDb, DbClient } from '../db/postgres.ts';
import { hierarchyService, HierarchyNodeView } from '../services/hierarchyService.ts';
import type { UserRecord } from '../db/database.ts';

export interface ClientMappingRecord {
  id: string;
  tenant_id: string;
  client_id: string;
  user_id: string;
  master_id?: string | null;
  broker_id?: string | null;
  sub_broker_id?: string | null;
  parent_id?: string | null;
  hierarchy_path?: string | null;
  account_type: 'real' | 'demo';
  created_at: string;
  updated_at: string;
}

export interface ClientWithAccountType extends HierarchyNodeView {
  account_type: 'demo' | 'real';
}

export class PostgresClientMappingRepository {
  /**
   * Safely persists demo user and client_mapping into PostgreSQL.
   */
  public async persistDemoUser(
    userData: {
      id: string;
      tenant_id?: string;
      full_name: string;
      user_id: string;
      country_code?: string;
      mobile: string;
      role?: string;
      parent_id?: string | null;
      hierarchy_path?: string;
      is_verified?: boolean;
      status?: string;
      account_type?: 'demo' | 'real';
      demo_balance?: number;
    },
    client?: DbClient
  ): Promise<void> {
    const executor = client || pgDb;
    const tenantId = userData.tenant_id || 'vertex-default';
    const userId = userData.user_id.toLowerCase().trim();
    const role = (userData.role || 'CLIENT').toUpperCase();
    const parentId = userData.parent_id || 'master-node-0001';
    const hierarchyPath = userData.hierarchy_path || `root.master_alpha.${userId}`;
    const accountType = userData.account_type || 'demo';
    const balance = userData.demo_balance !== undefined ? userData.demo_balance : 1000000.0;

    // 1. Insert or update users table
    const userSql = `
      INSERT INTO users (
        id, tenant_id, full_name, user_id, country_code, mobile,
        role, parent_id, hierarchy_path, is_verified, status,
        account_type, demo_balance, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, NOW(), NOW()
      )
      ON CONFLICT (tenant_id, user_id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        is_verified = EXCLUDED.is_verified,
        status = EXCLUDED.status,
        account_type = EXCLUDED.account_type,
        demo_balance = EXCLUDED.demo_balance,
        updated_at = NOW();
    `;

    await executor.query(userSql, [
      userData.id,
      tenantId,
      userData.full_name,
      userId,
      userData.country_code || '+91',
      userData.mobile,
      role,
      parentId,
      hierarchyPath,
      userData.is_verified !== undefined ? userData.is_verified : true,
      userData.status || 'active',
      accountType,
      balance,
    ]);

    // 2. Insert or update client_mappings table linking demo user to default master broker
    const mappingId = `map_${userData.id}`;
    const mappingSql = `
      INSERT INTO client_mappings (
        id, tenant_id, client_id, user_id, master_id,
        parent_id, hierarchy_path, account_type, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, NOW(), NOW()
      )
      ON CONFLICT (tenant_id, user_id) DO UPDATE SET
        client_id = EXCLUDED.client_id,
        master_id = EXCLUDED.master_id,
        parent_id = EXCLUDED.parent_id,
        hierarchy_path = EXCLUDED.hierarchy_path,
        account_type = EXCLUDED.account_type,
        updated_at = NOW();
    `;

    await executor.query(mappingSql, [
      mappingId,
      tenantId,
      userData.id,
      userId,
      parentId, // master_id
      parentId,
      hierarchyPath,
      accountType,
    ]);
  }

  /**
   * Retrieves clients filtered by hierarchy scope and optional account_type ('all' | 'real' | 'demo').
   */
  public async getClients(params: {
    caller: UserRecord;
    accountType?: 'all' | 'real' | 'demo';
  }): Promise<ClientWithAccountType[]> {
    const filterType = params.accountType || 'all';

    // 1. Get base scoped entities from hierarchy service
    const baseClients = await hierarchyService.getScopedEntities(params.caller, 'CLIENT');

    // 2. Query PostgreSQL users and client_mappings
    let pgClients: any[] = [];
    try {
      const pgSql = `
        SELECT 
          u.id,
          u.user_id as "userId",
          u.full_name as "fullName",
          u.email,
          u.mobile,
          u.country_code as "countryCode",
          u.role,
          u.parent_id as "parentId",
          u.hierarchy_path as "hierarchyPath",
          u.status,
          u.company,
          u.demo_balance as "balance",
          u.created_at as "createdAt",
          u.updated_at as "updatedAt",
          COALESCE(cm.account_type, u.account_type, 'real') as "account_type"
        FROM users u
        LEFT JOIN client_mappings cm ON (u.id = cm.client_id OR u.user_id = cm.user_id)
        WHERE UPPER(u.role) = 'CLIENT'
      `;
      const res = await pgDb.query(pgSql);
      pgClients = res.rows || [];
    } catch (err: any) {
      console.warn('[PostgresClientMappingRepository] Postgres query notice:', err.message);
    }

    // Map PG clients by userId
    const pgClientMap = new Map<string, any>();
    for (const pg of pgClients) {
      pgClientMap.set(pg.userId.toLowerCase(), pg);
    }

    // Caller hierarchy path check
    const callerPath = params.caller.hierarchy_path || 'root';
    const isAncestor = (ancestorPath: string, targetPath: string): boolean => {
      if (!ancestorPath || ancestorPath === 'root') return true;
      if (ancestorPath === targetPath) return true;
      return targetPath.startsWith(`${ancestorPath}.`);
    };

    // Combine and deduplicate
    const combinedMap = new Map<string, ClientWithAccountType>();

    // Process hierarchyService clients
    for (const c of baseClients) {
      const normUserId = c.userId.toLowerCase();
      const pgMatch = pgClientMap.get(normUserId);
      const accType: 'demo' | 'real' =
        pgMatch?.account_type === 'demo' ||
        c.status === 'demo' ||
        (c as any).account_type === 'demo' ||
        normUserId.includes('demo')
          ? 'demo'
          : 'real';

      combinedMap.set(normUserId, {
        ...c,
        account_type: accType,
      });
    }

    // Process any PG clients not in in-memory list that fall under caller scope
    for (const pg of pgClients) {
      const normUserId = pg.userId.toLowerCase();
      if (!combinedMap.has(normUserId)) {
        const targetPath = pg.hierarchyPath || `root.${normUserId}`;
        if (isAncestor(callerPath, targetPath)) {
          combinedMap.set(normUserId, {
            id: pg.id,
            userId: pg.userId,
            fullName: pg.fullName,
            email: pg.email,
            mobile: pg.mobile,
            countryCode: pg.countryCode || '+91',
            role: 'CLIENT',
            parentId: pg.parentId || 'master-node-0001',
            parentName: 'Alpha Apex Master',
            hierarchyPath: targetPath,
            status: pg.status || 'active',
            company: pg.company,
            balance: Number(pg.balance || 0),
            brokersCount: 0,
            subBrokersCount: 0,
            clientsCount: 0,
            createdAt: pg.createdAt || new Date().toISOString(),
            updatedAt: pg.updatedAt || new Date().toISOString(),
            account_type: pg.account_type === 'demo' ? 'demo' : 'real',
          });
        }
      }
    }

    let result = Array.from(combinedMap.values());

    // Filter by account_type if requested
    if (filterType === 'demo') {
      result = result.filter((c) => c.account_type === 'demo');
    } else if (filterType === 'real') {
      result = result.filter((c) => c.account_type === 'real');
    }

    return result;
  }

  /**
   * Retrieves a single client entity by ID with account_type.
   */
  public async getClientById(
    caller: UserRecord,
    targetId: string
  ): Promise<ClientWithAccountType | null> {
    const clients = await this.getClients({ caller, accountType: 'all' });
    const found = clients.find((c) => c.id === targetId || c.userId.toLowerCase() === targetId.toLowerCase());
    return found || null;
  }
}

export const postgresClientMappingRepository = new PostgresClientMappingRepository();
