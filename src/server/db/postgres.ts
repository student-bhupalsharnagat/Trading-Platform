import { Pool, PoolConfig, PoolClient } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface DbClient {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  release(): void | Promise<void>;
}

class PostgresDatabase {
  private pool: Pool | null = null;
  private pglite: PGlite | null = null;
  private isPgLite = false;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  public async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const databaseUrl = process.env.DATABASE_URL;

      // Check if external PostgreSQL server is explicitly configured and not default local placeholder
      const hasExplicitPgUrl =
        Boolean(databaseUrl) &&
        !databaseUrl?.includes('localhost:5432/vertex_db') &&
        !databaseUrl?.includes('127.0.0.1:5432/vertex_db');

      if (hasExplicitPgUrl && databaseUrl) {
        try {
          const poolConfig: PoolConfig = {
            connectionString: databaseUrl,
            connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT_MS || '5000', 10),
            idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT_MS || '30000', 10),
            max: parseInt(process.env.PG_MAX_POOL_SIZE || '20', 10),
            min: parseInt(process.env.PG_MIN_POOL_SIZE || '2', 10),
          };

          const testPool = new Pool(poolConfig);
          // Verify connectivity
          const client = await testPool.connect();
          client.release();
          this.pool = testPool;
          this.isPgLite = false;
          console.log('[Postgres] Connected to external PostgreSQL pool');
        } catch (err: any) {
          console.warn('[Postgres] External pool connection failed, using high-performance PGlite:', err.message);
          await this.initPgLite();
        }
      } else {
        await this.initPgLite();
      }

      this.initialized = true;
    })();

    return this.initPromise;
  }

  private async initPgLite(): Promise<void> {
    const dataDir = path.join(process.cwd(), '.vertex_pg_data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch {
        // Fallback to memory
      }
    }

    try {
      this.pglite = new PGlite(dataDir);
    } catch {
      this.pglite = new PGlite();
    }
    this.isPgLite = true;
    console.log('[Postgres] Initialized embedded PostgreSQL engine (PGlite)');
  }

  public async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    await this.init();

    if (this.pool) {
      const res = await this.pool.query(sql, params);
      return {
        rows: res.rows,
        rowCount: res.rowCount ?? res.rows.length,
      };
    }

    if (this.pglite) {
      const res: any = await this.pglite.query<T>(sql, params);
      return {
        rows: res.rows || [],
        rowCount: res.affectedRows !== undefined ? res.affectedRows : (res.rows ? res.rows.length : 0),
      };
    }

    throw new Error('PostgreSQL database not initialized');
  }

  public async getClient(): Promise<DbClient> {
    await this.init();

    if (this.pool) {
      const client: PoolClient = await this.pool.connect();
      return {
        query: async <T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> => {
          const res = await client.query(sql, params);
          return {
            rows: res.rows,
            rowCount: res.rowCount ?? res.rows.length,
          };
        },
        release: () => client.release(),
      };
    }

    if (this.pglite) {
      const pglite = this.pglite;
      return {
        query: async <T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> => {
          const res: any = await pglite.query<T>(sql, params);
          return {
            rows: res.rows || [],
            rowCount: res.affectedRows !== undefined ? res.affectedRows : (res.rows ? res.rows.length : 0),
          };
        },
        release: () => {
          // No-op for embedded pglite
        },
      };
    }

    throw new Error('PostgreSQL database not initialized');
  }

  private transactionMutex: Promise<any> = Promise.resolve();

  /**
   * Executes a transaction callback.
   * Begins transaction, passes client to callback, commits if callback resolves,
   * rolls back if callback throws.
   */
  public async transaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
    if (this.isPgLite) {
      let releaseMutex: () => void = () => {};
      const prev = this.transactionMutex;
      this.transactionMutex = new Promise<void>((resolve) => {
        releaseMutex = resolve;
      });
      await prev;

      const client = await this.getClient();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch (rbErr) {
          console.error('[Postgres] Rollback error:', rbErr);
        }
        throw err;
      } finally {
        client.release();
        releaseMutex();
      }
    }

    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        console.error('[Postgres] Rollback error:', rbErr);
      }
      throw err;
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    if (this.pglite) {
      await this.pglite.close();
      this.pglite = null;
    }
    this.initialized = false;
    this.initPromise = null;
  }

  public isUsingPgLite(): boolean {
    return this.isPgLite;
  }
}

export const pgDb = new PostgresDatabase();
