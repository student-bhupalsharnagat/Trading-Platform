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

  /**
   * Immediately provisions client_mappings, client_identity_mappings, and trading_wallets
   * during user registration/signup.
   */
  public async createClientMappingAndWallet(
    userData: {
      id?: string;
      user_id: string;
      full_name?: string;
      country_code?: string;
      mobile?: string;
      email?: string | null;
      role?: string;
      parent_id?: string | null;
      hierarchy_path?: string;
      status?: string;
      is_verified?: boolean;
      account_type?: string;
      demo_balance?: number;
      tenant_id?: string;
    },
    targetTenantId = 'TNT-001'
  ): Promise<void> {
    const tId = userData.tenant_id && userData.tenant_id !== 'vertex-default' && userData.tenant_id !== 'default'
      ? userData.tenant_id
      : targetTenantId || 'TNT-001';
    const normUserId = userData.user_id.toLowerCase().trim();
    const id = userData.id || `usr-${normUserId}`;
    const role = (userData.role || 'CLIENT').toUpperCase();
    const parentId = userData.parent_id || 'master-node-0001';
    const hierarchyPath = userData.hierarchy_path || `root.master_alpha.${normUserId}`;
    const accountType = userData.account_type || (normUserId.includes('demo') ? 'demo' : 'real');
    const balance = userData.demo_balance !== undefined ? Number(userData.demo_balance) : 1000000.0;

    const tenants = Array.from(new Set([tId, targetTenantId, 'TNT-001', 'vertex-default']));

    for (const tenant of tenants) {
      try {
        await pgDb.query(
          `INSERT INTO users (
            id, tenant_id, full_name, user_id, country_code, mobile, email,
            role, parent_id, hierarchy_path, is_verified, status,
            account_type, demo_balance, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12,
            $13, $14, NOW(), NOW()
          )
          ON CONFLICT (tenant_id, user_id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            email = COALESCE(EXCLUDED.email, users.email),
            status = EXCLUDED.status,
            is_verified = EXCLUDED.is_verified,
            updated_at = NOW();`,
          [
            tenant === tId ? id : `usr-${tenant}-${normUserId}`,
            tenant,
            userData.full_name || normUserId,
            normUserId,
            userData.country_code || '+91',
            userData.mobile || '9999999999',
            userData.email || null,
            role,
            parentId,
            hierarchyPath,
            userData.is_verified !== false,
            userData.status || 'active',
            accountType,
            balance,
          ]
        );

        await pgDb.query(
          `INSERT INTO client_mappings (
            id, tenant_id, client_id, user_id, master_id,
            parent_id, hierarchy_path, account_type, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, NOW(), NOW()
          )
          ON CONFLICT (tenant_id, user_id) DO UPDATE SET
            client_id = EXCLUDED.client_id,
            master_id = EXCLUDED.master_id,
            account_type = EXCLUDED.account_type,
            updated_at = NOW();`,
          [`map_${tenant}_${normUserId}`, tenant, id, normUserId, parentId, parentId, hierarchyPath, accountType]
        );

        await pgDb.query(
          `INSERT INTO client_identity_mappings (
            id, tenant_id, trading_user_id, external_client_id, external_client_code, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, NOW(), NOW()
          )
          ON CONFLICT (tenant_id, trading_user_id) DO UPDATE SET
            external_client_id = COALESCE(EXCLUDED.external_client_id, client_identity_mappings.external_client_id),
            external_client_code = COALESCE(EXCLUDED.external_client_code, client_identity_mappings.external_client_code),
            updated_at = NOW();`,
          [`cid_${tenant}_${normUserId}`, tenant, normUserId, id, normUserId.toUpperCase()]
        );

        await pgDb.query(
          `INSERT INTO trading_wallets (
            id, tenant_id, user_id, available_balance, blocked_balance, used_margin, realized_pnl, updated_at
          ) VALUES (
            $1, $2, $3, $4, 0, 0, 0, NOW()
          )
          ON CONFLICT (tenant_id, user_id) DO NOTHING;`,
          [`wal_${tenant}_${normUserId}`, tenant, normUserId, balance]
        );
      } catch (err: any) {
        console.warn(`[PostgresClientMappingRepository] provision notice for ${tenant}/${normUserId}:`, err.message);
      }
    }
  }

  /**
   * Automatically ensures every user in database.ts and postgres users table
   * has corresponding records in client_mappings (defaulting to TNT-001)
   * and trading_wallets using fast set-based batch SQL operations.
   */
  public async backfillClientMappingsAndWallets(
    targetTenantId = 'TNT-001'
  ): Promise<{ processed: number; mappingsCreated: number; walletsCreated: number }> {
    let processed = 0;
    let mappingsCreated = 0;
    let walletsCreated = 0;

    try {
      const { db } = await import('../db/database.ts');
      const allDbUsers = db.getAllUsers();
      processed = allDbUsers.length;

      // 1. Ensure all memory/store users exist in PostgreSQL users table
      for (const u of allDbUsers) {
        const tId = u.tenant_id && u.tenant_id !== 'vertex-default' && u.tenant_id !== 'default' ? u.tenant_id : targetTenantId;
        const normUserId = u.user_id.toLowerCase().trim();
        const role = (u.role || 'CLIENT').toUpperCase();
        const parentId = u.parent_id || 'master-node-0001';
        const hierarchyPath = u.hierarchy_path || `root.master_alpha.${normUserId}`;
        const accountType = u.account_type || (normUserId.includes('demo') ? 'demo' : 'real');
        const balance = u.demo_balance !== undefined ? u.demo_balance : 1000000.0;

        try {
          await pgDb.query(
            `INSERT INTO users (
              id, tenant_id, full_name, user_id, country_code, mobile, email,
              role, parent_id, hierarchy_path, is_verified, status,
              account_type, demo_balance, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7,
              $8, $9, $10, $11, $12,
              $13, $14, NOW(), NOW()
            )
            ON CONFLICT (tenant_id, user_id) DO UPDATE SET
              full_name = EXCLUDED.full_name,
              role = EXCLUDED.role,
              email = COALESCE(EXCLUDED.email, users.email),
              status = EXCLUDED.status,
              updated_at = NOW();`,
            [
              u.id || `usr-${normUserId}`,
              tId,
              u.full_name || normUserId,
              normUserId,
              u.country_code || '+91',
              u.mobile || '9999999999',
              u.email || null,
              role,
              parentId,
              hierarchyPath,
              u.is_verified !== false,
              u.status || 'active',
              accountType,
              balance,
            ]
          );
        } catch {
          // Ignore
        }
      }

      // 2. High-performance set-based backfill for client_mappings (target tenant & native tenant)
      const cmTarget = await pgDb.query(
        `INSERT INTO client_mappings (
          id, tenant_id, client_id, user_id, master_id, parent_id, hierarchy_path, account_type, created_at, updated_at
        )
        SELECT DISTINCT ON (u.user_id)
          'map_' || $1 || '_' || u.user_id,
          $1,
          u.id,
          u.user_id,
          COALESCE(u.parent_id, 'master-node-0001'),
          COALESCE(u.parent_id, 'master-node-0001'),
          COALESCE(u.hierarchy_path, 'root.master_alpha.' || u.user_id),
          COALESCE(u.account_type, 'real'),
          NOW(),
          NOW()
        FROM users u
        ORDER BY u.user_id, u.created_at DESC
        ON CONFLICT (tenant_id, user_id) DO NOTHING
        RETURNING id;`,
        [targetTenantId]
      );
      mappingsCreated += cmTarget.rowCount || 0;

      const cmNative = await pgDb.query(
        `INSERT INTO client_mappings (
          id, tenant_id, client_id, user_id, master_id, parent_id, hierarchy_path, account_type, created_at, updated_at
        )
        SELECT DISTINCT ON (u.tenant_id, u.user_id)
          'map_' || u.tenant_id || '_' || u.user_id,
          u.tenant_id,
          u.id,
          u.user_id,
          COALESCE(u.parent_id, 'master-node-0001'),
          COALESCE(u.parent_id, 'master-node-0001'),
          COALESCE(u.hierarchy_path, 'root.master_alpha.' || u.user_id),
          COALESCE(u.account_type, 'real'),
          NOW(),
          NOW()
        FROM users u
        WHERE u.tenant_id != $1
        ORDER BY u.tenant_id, u.user_id, u.created_at DESC
        ON CONFLICT (tenant_id, user_id) DO NOTHING
        RETURNING id;`,
        [targetTenantId]
      );
      mappingsCreated += cmNative.rowCount || 0;

      // 3. High-performance set-based backfill for client_identity_mappings
      await pgDb.query(
        `INSERT INTO client_identity_mappings (
          id, tenant_id, trading_user_id, external_client_id, external_client_code, created_at, updated_at
        )
        SELECT DISTINCT ON (u.user_id)
          'cid_' || $1 || '_' || u.user_id,
          $1,
          u.user_id,
          u.id,
          UPPER(u.user_id),
          NOW(),
          NOW()
        FROM users u
        ORDER BY u.user_id, u.created_at DESC
        ON CONFLICT (tenant_id, trading_user_id) DO UPDATE SET
          external_client_id = COALESCE(EXCLUDED.external_client_id, client_identity_mappings.external_client_id),
          external_client_code = COALESCE(EXCLUDED.external_client_code, client_identity_mappings.external_client_code),
          updated_at = NOW();`,
        [targetTenantId]
      );

      // 4. High-performance set-based backfill for trading_wallets (target tenant & native tenant)
      const walTarget = await pgDb.query(
        `INSERT INTO trading_wallets (
          id, tenant_id, user_id, available_balance, blocked_balance, used_margin, realized_pnl, updated_at
        )
        SELECT DISTINCT ON (u.user_id)
          'wal_' || $1 || '_' || u.user_id,
          $1,
          u.user_id,
          COALESCE(u.demo_balance, 1000000.00),
          0,
          0,
          0,
          NOW()
        FROM users u
        ORDER BY u.user_id, u.created_at DESC
        ON CONFLICT (tenant_id, user_id) DO NOTHING
        RETURNING id;`,
        [targetTenantId]
      );
      walletsCreated += walTarget.rowCount || 0;

      const walNative = await pgDb.query(
        `INSERT INTO trading_wallets (
          id, tenant_id, user_id, available_balance, blocked_balance, used_margin, realized_pnl, updated_at
        )
        SELECT DISTINCT ON (u.tenant_id, u.user_id)
          'wal_' || u.tenant_id || '_' || u.user_id,
          u.tenant_id,
          u.user_id,
          COALESCE(u.demo_balance, 1000000.00),
          0,
          0,
          0,
          NOW()
        FROM users u
        WHERE u.tenant_id != $1
        ORDER BY u.tenant_id, u.user_id, u.created_at DESC
        ON CONFLICT (tenant_id, user_id) DO NOTHING
        RETURNING id;`,
        [targetTenantId]
      );
      walletsCreated += walNative.rowCount || 0;

      // Update total processed users from DB count if higher
      const totalPgUsers = await pgDb.query(`SELECT count(*) as count FROM users;`);
      const pgCount = parseInt(totalPgUsers.rows?.[0]?.count, 10);
      if (!isNaN(pgCount) && pgCount > processed) {
        processed = pgCount;
      }
    } catch (e: any) {
      console.warn('[PostgresClientMappingRepository] backfill notice:', e.message);
    }

    return { processed, mappingsCreated, walletsCreated };
  }
}

export const postgresClientMappingRepository = new PostgresClientMappingRepository();
