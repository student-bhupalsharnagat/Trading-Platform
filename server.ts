import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';

import authRoutes from './src/server/routes/authRoutes.ts';
import tradingRoutes from './src/server/routes/tradingRoutes.ts';
import adminRoutes from './src/server/routes/admin/index.ts';
import tenantRoutes from './src/server/routes/tenantRoutes.ts';
import internalRoutes from './src/server/routes/internal/index.ts';
import healthRoutes, { setServerShuttingDown } from './src/server/routes/healthRoutes.ts';
import { errorHandler } from './src/server/middleware/errorMiddleware.ts';
import { hierarchyService } from './src/server/services/hierarchyService.ts';
import { resolveTenantMiddleware } from './src/server/middleware/tenantMiddleware.ts';
import { getInternalAuthConfig } from './src/server/config/internalConfig.ts';
import { ProductionValidator } from './src/server/config/productionValidator.ts';
import {
  corsMiddleware,
  securityHeadersMiddleware,
  csrfProtectionMiddleware,
  sanitizeQueryParams,
} from './src/server/middleware/securityHeadersMiddleware.ts';
import { initializeCachesFromLocal } from './src/server/cache/initCache.ts';
import { runMigrations } from './src/server/db/migrationRunner.ts';
import { tradingWebSocketServer } from './src/server/websocket/WebSocketServer.ts';
import { redisService } from './src/server/redis/RedisService.ts';
import { transactionalOutboxService } from './src/server/services/TransactionalOutboxService.ts';
import { pgDb } from './src/server/db/postgres.ts';
import { db } from './src/server/db/database.ts';
import { clearDummyTradingStoreRecords } from './src/server/trading/tradingStore.ts';
import { postgresClientMappingRepository } from './src/server/repositories/PostgresClientMappingRepository.ts';

/**
 * Purges all test/dummy users, test client mappings, and seeded records
 * from PostgreSQL, in-memory tradingStore, and .vertex_db_store.json on boot.
 */
export async function purgeDummyAndTestRecords(): Promise<{
  usersPurged: number;
  ordersPurged: number;
  positionsPurged: number;
  tradesPurged: number;
  fundsPurged: number;
  ledgerPurged: number;
}> {
  let usersPurged = 0;
  let ordersPurged = 0;
  let positionsPurged = 0;
  let tradesPurged = 0;
  let fundsPurged = 0;
  let ledgerPurged = 0;

  // 1. Purge from in-memory DB and .vertex_db_store.json
  const isDummyPredicate = (u: any): boolean => {
    if (!u) return false;
    const uid = (typeof u === 'string' ? u : u.user_id || u.userId || '').toLowerCase().trim();
    const name = (typeof u === 'string' ? '' : u.full_name || u.name || '').trim();
    const nameLower = name.toLowerCase();
    const email = (typeof u === 'string' ? '' : u.email || '').toLowerCase().trim();

    // Always preserve core system nodes
    if (['superadmin', 'master_alpha', 'master_zenith', 'broker_metro', 'subbroker_kalyan'].includes(uid)) return false;
    if (['admin@goldfut.com', 'alpha.master@goldfut.com', 'zenith.master@goldfut.com', 'metro@securities.com', 'kalyan.branch@goldfut.com'].includes(email)) return false;

    // Dummy email patterns
    if (email.includes('@test.') || email.includes('@demo.') || email.includes('@example.') || email.includes('audit.trader') || email.includes('@vertex.trade')) return true;

    // Dummy name patterns
    if (nameLower.includes('persist audit') || nameLower.includes('test') || nameLower.includes('demo') || nameLower.includes('audit')) return true;
    if (nameLower.includes('user broker tester') || nameLower.includes('fallback test user') || nameLower.includes('immediate signup user') || nameLower.includes('integration trader') || nameLower.includes('production trader one') || nameLower.includes('verification test trader')) return true;
    if (nameLower.includes('trader 5j') || nameLower.includes('broker 5j') || nameLower.includes('master trader 5j')) return true;

    const dummyNames = [
      'aarav mehta', 'ananya iyer', 'arjun verma', 'diya kapoor', 'ishita singh',
      'kabir rao', 'meera nair', 'vivaan shah', 'ravi kumar', 'rahul sharma',
      'priya patel', 'amit verma', 'demo trader', 'test demo trader'
    ];
    if (dummyNames.includes(nameLower)) return true;

    // Dummy user_id patterns
    if (uid.startsWith('vtx') || uid.startsWith('demo') || uid.startsWith('test') || uid.includes('audit')) return true;
    if (uid.startsWith('trd_17') || uid.startsWith('admin_sync_') || uid.startsWith('client_17') || uid.startsWith('trader_17') || uid.startsWith('ub_trader_') || uid.startsWith('user_fall_') || uid.startsWith('fast_user_') || uid.startsWith('master_5j_') || uid.startsWith('broker_5j_') || uid.startsWith('trader_5j_') || uid.startsWith('trader-')) return true;
    if (['demo-trader', 'vtx_demo', 'test_demo_trader_01', 'vtx999', 'vtx123', 'vtx456', 'vtx101'].includes(uid)) return true;

    return false;
  };

  try {
    db.purgeUsers(isDummyPredicate);
    clearDummyTradingStoreRecords(isDummyPredicate);
  } catch (err: any) {
    console.warn('[PURGE] Store cleanup notice:', err.message);
  }

  // 2. Purge from PostgreSQL
  try {
    const dummyUsersRes = await pgDb.query(`
      SELECT id, user_id FROM users
      WHERE (
        email ILIKE '%@test.%'
        OR email ILIKE '%@demo.%'
        OR email ILIKE '%@example.%'
        OR email ILIKE '%audit.trader%'
        OR email ILIKE '%@vertex.trade%'
        OR full_name ILIKE '%Persist Audit%'
        OR full_name ILIKE '%test%'
        OR full_name ILIKE '%demo%'
        OR full_name ILIKE '%User Broker Tester%'
        OR full_name ILIKE '%Fallback Test User%'
        OR full_name ILIKE '%Immediate Signup User%'
        OR full_name ILIKE '%Integration Trader%'
        OR full_name ILIKE '%Production Trader One%'
        OR full_name ILIKE '%Verification Test Trader%'
        OR full_name ILIKE '%Trader 5J%'
        OR full_name ILIKE '%Broker 5J%'
        OR full_name ILIKE '%Master Trader 5J%'
        OR full_name IN ('Aarav Mehta', 'Ananya Iyer', 'Arjun Verma', 'Diya Kapoor', 'Ishita Singh', 'Kabir Rao', 'Meera Nair', 'Vivaan Shah', 'Rahul Sharma', 'Priya Patel', 'Amit Verma', 'Demo Trader', 'Test Demo Trader', 'Ravi Kumar')
        OR user_id ILIKE 'vtx%'
        OR user_id ILIKE 'demo%'
        OR user_id ILIKE 'test%'
        OR user_id ILIKE '%audit%'
        OR user_id ILIKE 'trd_17%'
        OR user_id ILIKE 'admin_sync_%'
        OR user_id ILIKE 'client_17%'
        OR user_id ILIKE 'trader_17%'
        OR user_id ILIKE 'ub_trader_%'
        OR user_id ILIKE 'user_fall_%'
        OR user_id ILIKE 'fast_user_%'
        OR user_id ILIKE 'master_5j_%'
        OR user_id ILIKE 'broker_5j_%'
        OR user_id ILIKE 'trader_5j_%'
        OR user_id ILIKE 'trader-test%'
        OR user_id ILIKE 'trader-5d%'
        OR user_id ILIKE 'trader-other%'
        OR user_id ILIKE 'trader_vtx%'
        OR user_id ILIKE 'trader_apx%'
        OR user_id ILIKE 'trader_alpha%'
        OR user_id ILIKE 'trader_beta%'
        OR user_id IN ('demo-trader', 'vtx_demo', 'test_demo_trader_01', 'vtx999', 'vtx123', 'vtx456', 'vtx101')
      )
      AND user_id NOT IN ('superadmin', 'master_alpha', 'master_zenith', 'broker_metro', 'subbroker_kalyan')
      AND id NOT IN ('super-admin-root-0001', 'master-node-0001', 'master-node-0002', 'broker-node-0001', 'subbroker-node-0001')
      AND (email IS NULL OR email NOT IN ('admin@goldfut.com', 'alpha.master@goldfut.com', 'zenith.master@goldfut.com', 'metro@securities.com', 'kalyan.branch@goldfut.com'));
    `).catch(() => ({ rows: [] }));

    const matchingUserIds = (dummyUsersRes.rows || []).map((r: any) => r.user_id);
    const matchingIds = (dummyUsersRes.rows || []).map((r: any) => r.id);
    const allDummyUserIds = Array.from(new Set([...matchingUserIds, 'vtx999', 'vtx123', 'vtx456', 'vtx101', 'demo-trader', 'vtx_demo', 'test_demo_trader_01']));
    const allDummyIds = Array.from(new Set([...matchingIds]));

    if (allDummyUserIds.length > 0 || allDummyIds.length > 0) {
      await pgDb.query(`DELETE FROM client_mappings WHERE user_id = ANY($1) OR client_id = ANY($1) OR client_id = ANY($2);`, [allDummyUserIds, allDummyIds]).catch(() => {});
      await pgDb.query(`DELETE FROM client_identity_mappings WHERE trading_user_id = ANY($1) OR external_client_id = ANY($1) OR external_client_id = ANY($2);`, [allDummyUserIds, allDummyIds]).catch(() => {});
      await pgDb.query(`DELETE FROM trading_wallets WHERE user_id = ANY($1);`, [allDummyUserIds]).catch(() => {});
    }

    const ordDel = await pgDb.query(`
      DELETE FROM trading_orders 
      WHERE user_id = ANY($1) 
         OR id LIKE 'ORD-vtx%' 
         OR id LIKE 'ORD-demo%' 
         OR client_order_id LIKE 'cli-ORD-%';
    `, [allDummyUserIds]).catch(() => ({ rowCount: 0 }));
    ordersPurged = ordDel.rowCount || 0;

    const posDel = await pgDb.query(`
      DELETE FROM trading_positions 
      WHERE user_id = ANY($1) 
         OR id LIKE 'POS-vtx%' 
         OR id LIKE 'POS-demo%';
    `, [allDummyUserIds]).catch(() => ({ rowCount: 0 }));
    positionsPurged = posDel.rowCount || 0;

    const trdDel = await pgDb.query(`
      DELETE FROM trading_trades 
      WHERE user_id = ANY($1) 
         OR id LIKE 'TRD-vtx%' 
         OR id LIKE 'TRD-demo%';
    `, [allDummyUserIds]).catch(() => ({ rowCount: 0 }));
    tradesPurged = trdDel.rowCount || 0;

    const fundDel = await pgDb.query(`
      DELETE FROM trading_fund_transactions 
      WHERE user_id = ANY($1) 
         OR id LIKE 'TX-DEP-%' 
         OR id LIKE 'TX-WDR-%' 
         OR reference_id LIKE 'DEP-%' 
         OR reference_id LIKE 'WDR-%';
    `, [allDummyUserIds]).catch(() => ({ rowCount: 0 }));
    fundsPurged = fundDel.rowCount || 0;

    const ledDel = await pgDb.query(`
      DELETE FROM trading_ledger_entries 
      WHERE user_id = ANY($1) 
         OR id LIKE 'LED-TX-%' 
         OR transaction_id LIKE 'TX-DEP-%' 
         OR transaction_id LIKE 'TX-WDR-%' 
         OR reference LIKE 'Authoritative %';
    `, [allDummyUserIds]).catch(() => ({ rowCount: 0 }));
    ledgerPurged = ledDel.rowCount || 0;

    await pgDb.query(`
      DELETE FROM trading_outbox_events 
      WHERE payload->>'userId' = ANY($1) 
         OR payload->>'tradingUserId' = ANY($1) 
         OR event_id LIKE 'sync-ord-ORD-vtx%' 
         OR event_id LIKE 'sync-pos-POS-vtx%' 
         OR event_id LIKE 'sync-fund-TX-%';
    `, [allDummyUserIds]).catch(() => {});

    const uDel = await pgDb.query(`
      DELETE FROM users 
      WHERE (id = ANY($2) OR user_id = ANY($1))
        AND user_id NOT IN ('superadmin', 'master_alpha', 'master_zenith', 'broker_metro', 'subbroker_kalyan')
        AND id NOT IN ('super-admin-root-0001', 'master-node-0001', 'master-node-0002', 'broker-node-0001', 'subbroker-node-0001');
    `, [allDummyUserIds, allDummyIds]).catch(() => ({ rowCount: 0 }));
    usersPurged = uDel.rowCount || 0;

    if (usersPurged > 0 || ordersPurged > 0 || positionsPurged > 0 || fundsPurged > 0 || ledgerPurged > 0) {
      console.log(`[PURGE] Successfully purged ${usersPurged} dummy users, ${ordersPurged} fake orders, ${positionsPurged} fake positions, ${tradesPurged} fake trades, ${fundsPurged} fake funds, ${ledgerPurged} fake ledger entries.`);
    }
  } catch (err: any) {
    console.warn('[PURGE] PostgreSQL cleanup notice:', err.message);
  }

  return { usersPurged, ordersPurged, positionsPurged, tradesPurged, fundsPurged, ledgerPurged };
}


const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  // Validate production configuration and required secrets
  const configValidation = ProductionValidator.validateEnv(isProd);
  if (!configValidation.valid) {
    console.warn('[CONFIG NOTICE] Environment configuration recommendations:');
    configValidation.errors.forEach((e) => console.warn(`  - ${e}`));
    if (process.env.STRICT_PRODUCTION_CONFIG === 'true') {
      console.error('[FATAL CONFIG ERROR] STRICT_PRODUCTION_CONFIG is enabled; halting.');
      process.exit(1);
    }
  }
  if (configValidation.warnings.length > 0) {
    configValidation.warnings.forEach((w) => console.warn(`[CONFIG WARNING] ${w}`));
  }

  // Validate internal S2S authentication configuration at startup
  try {
    getInternalAuthConfig();
  } catch (err: any) {
    console.error('[FATAL CONFIG ERROR]', err.message);
    process.exit(1);
  }

  // Initialize Redis distributed coordination layer
  try {
    await redisService.init();
  } catch (redisErr: any) {
    console.warn('[Redis] Initialization warning (degraded mode active):', redisErr.message);
  }

  // Safe non-blocking initialization of tenant config and emergency state caches
  await initializeCachesFromLocal();

  // Run PostgreSQL database migrations
  try {
    await runMigrations();
  } catch (migErr: any) {
    console.error('[DB] Migration error during startup:', migErr.message);
  }

  // Purge all test/dummy users & seeded records from PostgreSQL, tradingStore, and .vertex_db_store.json
  await purgeDummyAndTestRecords();

  // Auto-backfill missing client mappings & wallets for legitimate users
  postgresClientMappingRepository
    .backfillClientMappingsAndWallets('TNT-001')
    .then(async (bf) => {
      console.log(`[STARTUP] Auto-backfilled client mappings: ${bf.mappingsCreated} mappings, ${bf.walletsCreated} wallets.`);
      await transactionalOutboxService.syncAllCurrentDataToCentralAdmin('TNT-001');
    })
    .catch((backfillErr: any) => {
      console.warn('[STARTUP] Client mappings backfill notice:', backfillErr.message);
      transactionalOutboxService.syncAllCurrentDataToCentralAdmin('TNT-001').catch(() => {});
    });

  // Start Transactional Outbox background worker
  transactionalOutboxService.startWorker();

  const app = express();
  app.set('trust proxy', 1);

  // Basic security & parsing middlewares with rawBody retention for HMAC verification
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Production Security Headers & Parameter Sanitization & CORS
  app.use(corsMiddleware);
  app.use(securityHeadersMiddleware);
  app.use(sanitizeQueryParams);

  // Health, Liveness, and Readiness Endpoints (accessible without tenant resolution or CSRF)
  app.use(healthRoutes);

  // CSRF Protection for state-changing browser API requests
  app.use(csrfProtectionMiddleware);

  // Multi-Tenant Resolution Middleware (Domain-based with dev fallback, never trusts client headers)
  app.use(resolveTenantMiddleware);

  // Internal Server-to-Server Routes (Central Admin -> Trading Platform)
  // Protected by HMAC-SHA256, Nonce, Timestamp, and Tenant ID validation
  app.use('/api/internal/v1', internalRoutes);

  // Browser & Client API Routes
  app.use('/api/tenant', tenantRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/trading', tradingRoutes);
  app.use('/api/admin', adminRoutes);

  // Catch-all 404 for unmatched /api routes so they return JSON and NEVER fall through to HTML
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      success: false,
      message: `API route not found: ${req.method} ${req.originalUrl}`,
    });
  });

  // Central Error Handler for API routes
  app.use(errorHandler);

  // Frontend Serving (Vite middleware in dev, static files in prod)
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global fallback error handler
  app.use(errorHandler);

  const httpServer = http.createServer(app);

  // Initialize Real-time WebSocket Server on /ws
  tradingWebSocketServer.initialize(httpServer);

  httpServer.listen(PORT, '0.0.0.0', async () => {
    try {
      await hierarchyService.ensureSuperAdmin();
    } catch (e) {
      console.warn('[ADMIN] Super admin hierarchy init notice:', e);
    }
    console.log(`[VERTEX] Server running on http://localhost:${PORT} (env: ${process.env.NODE_ENV || 'development'})`);
    console.log(`[VERTEX] Network URL: http://127.0.0.1:${PORT}`);
  });

  const gracefulShutdown = async (signal: string) => {
    console.log(`[VERTEX] Received ${signal}, initiating graceful shutdown...`);
    setServerShuttingDown(true);

    try {
      transactionalOutboxService.stopWorker();
      tradingWebSocketServer.close();
      await redisService.close();
      await pgDb.close();
    } catch (shutdownErr: any) {
      console.warn('[VERTEX] Warning during shutdown cleanup:', shutdownErr.message);
    }

    httpServer.close(() => {
      console.log('[VERTEX] HTTP server closed gracefully');
      process.exit(0);
    });

    // Hard fallback termination after 10s
    setTimeout(() => {
      console.error('[VERTEX] Graceful shutdown timed out, force exiting');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('[VERTEX] Failed to start server:', err);
  process.exit(1);
});
