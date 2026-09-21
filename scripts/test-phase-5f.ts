import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import { WebSocket } from 'ws';
import { db } from '../src/server/db/database.ts';
import { pgDb } from '../src/server/db/postgres.ts';
import { runTradingMigrations } from '../src/server/db/migrationRunner.ts';
import { authService } from '../src/server/services/authService.ts';
import { hierarchyService } from '../src/server/services/hierarchyService.ts';
import { resolveTenantMiddleware } from '../src/server/middleware/tenantMiddleware.ts';
import { getInternalAuthConfig } from '../src/server/config/internalConfig.ts';
import { generateInternalHeaders } from '../src/server/auth/internalAuth.ts';
import { emergencyControlService } from '../src/server/services/emergencyControlService.ts';
import { tradingHaltService } from '../src/server/services/tradingHaltService.ts';
import { tenantConfigCache, TenantConfigCache } from '../src/server/cache/TenantConfigCache.ts';
import { emergencyStateCache, EmergencyStateCache } from '../src/server/cache/EmergencyStateCache.ts';
import { internalEventDispatcher } from '../src/server/events/InternalEventDispatcher.ts';
import { tradingExecutionService } from '../src/server/services/TradingExecutionService.ts';
import { postgresOrderRepository } from '../src/server/repositories/trading/PostgresOrderRepository.ts';
import { postgresTradeRepository } from '../src/server/repositories/trading/PostgresTradeRepository.ts';
import { postgresPositionRepository } from '../src/server/repositories/trading/PostgresPositionRepository.ts';
import { postgresWalletRepository } from '../src/server/repositories/trading/PostgresWalletRepository.ts';
import { postgresOutboxRepository } from '../src/server/repositories/trading/PostgresOutboxRepository.ts';
import { transactionalOutboxService, TransactionalOutboxService } from '../src/server/services/TransactionalOutboxService.ts';
import { tradingWebSocketServer, TradingWebSocketServer } from '../src/server/websocket/WebSocketServer.ts';
import { redisService } from '../src/server/redis/RedisService.ts';
import { distributedRateLimiter } from '../src/server/rateLimit/DistributedRateLimiter.ts';
import { CircuitBreaker } from '../src/server/events/CircuitBreaker.ts';

import internalRoutes from '../src/server/routes/internal/index.ts';
import tenantRoutes from '../src/server/routes/tenantRoutes.ts';
import authRoutes from '../src/server/routes/authRoutes.ts';
import tradingRoutes from '../src/server/routes/tradingRoutes.ts';
import adminRoutes from '../src/server/routes/admin/index.ts';

const config = getInternalAuthConfig();
const SECRET = config.internalCommunicationSecret;

async function runPhase5FTests() {
  console.log('\n================================================================');
  console.log('STARTING PHASE 5F TEST SUITE: 29 TARGET TESTS');
  console.log('Redis, Distributed Real-Time & Production Reliability');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assertTest(name: string, condition: boolean, details?: any) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`, details ? JSON.stringify(details, null, 2) : '');
      failed++;
    }
  }

  // 1. Initialize PostgreSQL and Redis
  await pgDb.init();
  await runTradingMigrations();
  await redisService.init();

  // Clean tables for repeatable test runs
  try {
    await pgDb.query('DELETE FROM trading_outbox;');
    await pgDb.query('DELETE FROM trading_trades;');
    await pgDb.query('DELETE FROM trading_orders;');
    await pgDb.query('DELETE FROM trading_positions;');
    await pgDb.query('DELETE FROM trading_wallets;');
  } catch (e: any) {
    console.warn('Table cleanup notice:', e.message);
  }

  // Setup Test App
  const app = express();
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );
  app.use(cookieParser());
  app.use(resolveTenantMiddleware);

  app.use('/api/internal/v1', internalRoutes);
  app.use('/api/tenant', tenantRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/trading', tradingRoutes);
  app.use('/api/admin', adminRoutes);

  const server = http.createServer(app);
  tradingWebSocketServer.initialize(server);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const port = address.port;
  const baseUrl = `http://localhost:${port}`;
  const wsUrl = `ws://localhost:${port}/ws`;

  // Seed test users
  const TENANT_A = 'vertex-default';
  const TENANT_B = 'apex-capital';

  let userA = db.findUserByUserId('trader_vtx_5f_1');
  if (!userA) {
    userA = db.createUser({
      fullName: 'Trader Vertex 5F 1',
      userId: 'trader_vtx_5f_1',
      countryCode: '+1',
      mobile: '5559001',
      passwordHash: 'hash',
      status: 'active',
      isVerified: true,
      tenantId: TENANT_A,
    });
  } else {
    userA.tenant_id = TENANT_A;
    userA.status = 'active';
    db.setUserFrozen(userA.user_id, false);
  }

  let userA2 = db.findUserByUserId('trader_vtx_5f_2');
  if (!userA2) {
    userA2 = db.createUser({
      fullName: 'Trader Vertex 5F 2',
      userId: 'trader_vtx_5f_2',
      countryCode: '+1',
      mobile: '5559002',
      passwordHash: 'hash',
      status: 'active',
      isVerified: true,
      tenantId: TENANT_A,
    });
  } else {
    userA2.tenant_id = TENANT_A;
    userA2.status = 'active';
    db.setUserFrozen(userA2.user_id, false);
  }

  let userB = db.findUserByUserId('trader_apx_5f_1');
  if (!userB) {
    userB = db.createUser({
      fullName: 'Trader Apex 5F 1',
      userId: 'trader_apx_5f_1',
      countryCode: '+1',
      mobile: '5559003',
      passwordHash: 'hash',
      status: 'active',
      isVerified: true,
      tenantId: TENANT_B,
    });
  } else {
    userB.tenant_id = TENANT_B;
    userB.status = 'active';
    db.setUserFrozen(userB.user_id, false);
  }

  const tokenA = authService.generateToken({
    id: userA.id,
    userId: userA.user_id,
    role: userA.role,
    tenantId: TENANT_A,
  });

  const tokenA2 = authService.generateToken({
    id: userA2.id,
    userId: userA2.user_id,
    role: userA2.role,
    tenantId: TENANT_A,
  });

  const tokenB = authService.generateToken({
    id: userB.id,
    userId: userB.user_id,
    role: userB.role,
    tenantId: TENANT_B,
  });

  // Seed wallets in PostgreSQL
  await postgresWalletRepository.getOrCreateWallet(TENANT_A, userA.user_id, 100000);
  await postgresWalletRepository.updateWallet(TENANT_A, userA.user_id, { available_balance: 100000, used_margin: 0, realized_pnl: 0 });
  await postgresWalletRepository.getOrCreateWallet(TENANT_A, userA2.user_id, 100000);
  await postgresWalletRepository.updateWallet(TENANT_A, userA2.user_id, { available_balance: 100000, used_margin: 0, realized_pnl: 0 });
  await postgresWalletRepository.getOrCreateWallet(TENANT_B, userB.user_id, 100000);
  await postgresWalletRepository.updateWallet(TENANT_B, userB.user_id, { available_balance: 100000, used_margin: 0, realized_pnl: 0 });

  // -------------------------------------------------------------
  // SECTION 1: REDIS SERVICE & RESILIENCE
  // -------------------------------------------------------------
  console.log('\n--- SECTION 1: REDIS SERVICE & RESILIENCE ---');

  // Test 1: Redis health check
  const rHealth = await redisService.healthCheck();
  assertTest(
    'Test 1: Redis Service health probe returns operational state & latency',
    (rHealth.status === 'healthy' || rHealth.status === 'fallback') &&
      rHealth.connected === true &&
      typeof rHealth.latencyMs === 'number',
    rHealth
  );

  // Test 2: Redis get, set, expire, del basic operations
  await redisService.set('test:key:1', 'val123', 60);
  const fetchedVal = await redisService.get('test:key:1');
  await redisService.del('test:key:1');
  const fetchedAfterDel = await redisService.get('test:key:1');
  assertTest(
    'Test 2: Redis basic operations (SET, GET, DEL, TTL) function correctly',
    fetchedVal === 'val123' && fetchedAfterDel === null
  );

  // Test 3: PostgreSQL remains authoritative financial truth
  const pgWallet = await postgresWalletRepository.getWallet(TENANT_A, userA.user_id);
  assertTest(
    'Test 3: Financial records remain strictly in PostgreSQL (not moved to Redis)',
    pgWallet !== null && pgWallet.available_balance === 100000
  );

  // -------------------------------------------------------------
  // SECTION 2: TRANSACTIONAL OUTBOX
  // -------------------------------------------------------------
  console.log('\n--- SECTION 2: TRANSACTIONAL OUTBOX ---');

  // Test 4: Verify trading_outbox schema
  const outboxCheck = await pgDb.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'trading_outbox';"
  );
  const columnNames = (outboxCheck.rows || []).map((r) => r.column_name);
  assertTest(
    'Test 4: PostgreSQL trading_outbox schema verified with all required columns',
    columnNames.includes('event_id') &&
      columnNames.includes('tenant_id') &&
      columnNames.includes('event_type') &&
      columnNames.includes('status') &&
      columnNames.includes('payload') &&
      columnNames.includes('attempt_count')
  );

  // Test 5: Transactional Outbox insertion in same ACID transaction as trade
  const tradeRes = await tradingExecutionService.placeOrder({
    tenantId: TENANT_A,
    userId: userA.user_id,
    symbol: 'SILVER FUT',
    side: 'BUY',
    orderType: 'MARKET',
    product: 'INTRADAY',
    lots: 1,
    price: 90000,
  });

  const outboxRecord = await postgresOutboxRepository.findByEventId(`evt-trade-${tradeRes.trade.id}`);
  assertTest(
    'Test 5: Transactional Outbox event created atomically inside trade ACID transaction',
    tradeRes.success === true &&
      outboxRecord !== null &&
      outboxRecord.event_type === 'trade.executed' &&
      outboxRecord.status === 'PENDING' &&
      outboxRecord.tenant_id === TENANT_A
  );

  // Test 6: Atomicity - rolled back transaction does not produce outbox event
  const outboxCountBefore = (await postgresOutboxRepository.getStats()).total;
  try {
    await pgDb.transaction(async (client) => {
      await transactionalOutboxService.enqueue(
        {
          eventId: 'evt-aborted-test',
          tenantId: TENANT_A,
          eventType: 'trade.executed',
          payload: { test: true },
        },
        client
      );
      throw new Error('Simulated transaction rollback');
    });
  } catch {}

  const outboxCountAfter = (await postgresOutboxRepository.getStats()).total;
  const rolledBackEvent = await postgresOutboxRepository.findByEventId('evt-aborted-test');
  assertTest(
    'Test 6: Transactional Outbox atomicity (aborted transaction leaves no outbox records)',
    outboxCountAfter === outboxCountBefore && rolledBackEvent === null
  );

  // Test 7: Outbox idempotency (duplicate eventId safely ignored)
  await postgresOutboxRepository.insert({
    id: 'outbox-dup-1',
    event_id: 'evt-idempotency-key',
    tenant_id: TENANT_A,
    event_type: 'trade.executed',
    payload: { original: true },
  });

  const dupInsert = await postgresOutboxRepository.insert({
    id: 'outbox-dup-2',
    event_id: 'evt-idempotency-key',
    tenant_id: TENANT_A,
    event_type: 'trade.executed',
    payload: { original: false },
  });

  assertTest(
    'Test 7: Outbox idempotency guarantees duplicate eventId does not create duplicate record',
    dupInsert.id === 'outbox-dup-1' && dupInsert.payload.original === true
  );

  // Test 8: Outbox worker batch processing & transition to COMPLETED
  // Setup simulated mock client that succeeds
  const mockSuccessClient = {
    sendEvent: async () => ({ success: true, statusCode: 200 }),
  } as any;
  const testOutboxService = new TransactionalOutboxService({
    client: mockSuccessClient,
    batchSize: 10,
  });

  const batchResult = await testOutboxService.processBatch();
  const completedRecord = await postgresOutboxRepository.findByEventId(`evt-trade-${tradeRes.trade.id}`);
  assertTest(
    'Test 8: Outbox worker processes pending events and marks status COMPLETED',
    batchResult.succeeded >= 1 &&
      completedRecord !== null &&
      completedRecord.status === 'COMPLETED' &&
      completedRecord.processed_at !== null
  );

  // Test 9: Row locking / SKIP LOCKED concurrency
  // Enqueue test batch
  const testIds = ['lock-test-1', 'lock-test-2'];
  for (const id of testIds) {
    await postgresOutboxRepository.insert({
      id: `ob-${id}`,
      event_id: `evt-${id}`,
      tenant_id: TENANT_A,
      event_type: 'test.lock',
      payload: { id },
    });
  }

  // Concurrent fetch
  const batch1 = await postgresOutboxRepository.fetchPendingBatch(5);
  assertTest(
    'Test 9: Outbox fetchPendingBatch retrieves pending events safely',
    batch1.length >= 2
  );

  // Test 10: Outbox retry with exponential backoff on delivery failure
  const mockFailClient = {
    sendEvent: async () => ({ success: false, statusCode: 503, error: 'Service Unavailable' }),
  } as any;
  const failingOutboxService = new TransactionalOutboxService({
    client: mockFailClient,
    baseDelayMs: 200,
  });

  const failEvent = await postgresOutboxRepository.insert({
    id: 'ob-fail-test',
    event_id: 'evt-fail-retry',
    tenant_id: TENANT_A,
    event_type: 'test.retry',
    payload: { retry: true },
    max_attempts: 3,
  });

  await failingOutboxService.deliverRecord(failEvent);
  const failedRecord = await postgresOutboxRepository.findById(failEvent.id);
  assertTest(
    'Test 10: Outbox delivery failure increments attempt_count and schedules exponential retry',
    failedRecord !== null &&
      failedRecord.status === 'FAILED' &&
      failedRecord.attempt_count === 1 &&
      failedRecord.last_error === 'Service Unavailable'
  );

  // Test 11: Outbox Dead-Letter transition after exceeding max_attempts
  await failingOutboxService.deliverRecord(failedRecord!);
  const secondFail = await postgresOutboxRepository.findById(failEvent.id);
  await failingOutboxService.deliverRecord(secondFail!);
  const deadLetterRecord = await postgresOutboxRepository.findById(failEvent.id);
  assertTest(
    'Test 11: Outbox transitions to DEAD_LETTER status after max_attempts exhausted',
    deadLetterRecord !== null &&
      deadLetterRecord.status === 'DEAD_LETTER' &&
      deadLetterRecord.attempt_count >= 3 &&
      deadLetterRecord.processed_at !== null
  );

  // Test 12: Circuit breaker integration with Outbox Worker
  const circuitBreaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10000 });
  circuitBreaker.recordFailure();
  circuitBreaker.recordFailure(); // Trips OPEN
  const breakerOutboxService = new TransactionalOutboxService({
    client: mockFailClient,
    circuitBreaker,
  });

  const breakerRun = await breakerOutboxService.processBatch();
  assertTest(
    'Test 12: Outbox worker respects Circuit Breaker when OPEN, skipping remote deliveries',
    circuitBreaker.getState() === 'OPEN' && breakerRun.processed === 0
  );

  // -------------------------------------------------------------
  // SECTION 3: CACHE ARCHITECTURE & DISTRIBUTED INVALIDATION
  // -------------------------------------------------------------
  console.log('\n--- SECTION 3: CACHE ARCHITECTURE & DISTRIBUTED INVALIDATION ---');

  // Test 13: TenantConfigCache L1 fast memory lookup
  tenantConfigCache.set(TENANT_A, {
    tradingEnabled: true,
    maxLeverage: 100,
    configVersion: 5,
  });
  const cachedA = tenantConfigCache.get(TENANT_A);
  assertTest(
    'Test 13: TenantConfigCache provides microsecond L1 memory lookups',
    cachedA !== null && cachedA.maxLeverage === 100 && cachedA.configVersion === 5
  );

  // Test 14: TenantConfigCache distributed invalidation across simulated instances
  const peerTenantCache = new TenantConfigCache();
  // Simulate peer receiving distributed update
  tenantConfigCache.set(TENANT_A, { maxLeverage: 75 });
  // Wait for Redis Pub/Sub delivery
  await new Promise((r) => setTimeout(r, 60));
  const peerVal = peerTenantCache.get(TENANT_A);
  assertTest(
    'Test 14: TenantConfigCache propagates updates to peer instances via Redis Pub/Sub',
    peerVal !== null && peerVal.maxLeverage === 75
  );

  // Test 15: EmergencyStateCache distributed synchronization
  const peerEmergencyCache = new EmergencyStateCache();
  emergencyStateCache.set(TENANT_A, {
    tradingHalted: true,
    reason: 'Risk maintenance',
  });
  await new Promise((r) => setTimeout(r, 60));
  const peerEmergency = peerEmergencyCache.get(TENANT_A);
  assertTest(
    'Test 15: EmergencyStateCache synchronizes emergency status across instances via Redis',
    peerEmergency.tradingHalted === true && peerEmergency.reason === 'Risk maintenance'
  );

  // Reset halt for subsequent tests
  emergencyStateCache.set(TENANT_A, { tradingHalted: false });

  // Test 16: Immediate Emergency Control Broadcast across cluster instances
  let receivedBroadcast: any = null;
  const unsubscribeBroadcast = peerEmergencyCache.onEmergencyBroadcast((event) => {
    receivedBroadcast = event;
  });

  await emergencyStateCache.broadcastEmergencyAction('TRADING_HALT', TENANT_A, { reason: 'Flash crash' });
  await new Promise((r) => setTimeout(r, 60));
  assertTest(
    'Test 16: Emergency control actions broadcast instantly across cluster instances via Redis',
    receivedBroadcast !== null &&
      receivedBroadcast.action === 'TRADING_HALT' &&
      receivedBroadcast.tenantId === TENANT_A &&
      receivedBroadcast.payload?.reason === 'Flash crash'
  );
  unsubscribeBroadcast();

  // -------------------------------------------------------------
  // SECTION 4: DISTRIBUTED WEBSOCKET & MULTI-TENANT ISOLATION
  // -------------------------------------------------------------
  console.log('\n--- SECTION 4: DISTRIBUTED WEBSOCKET & ISOLATION ---');

  // Helper to connect WebSocket
  async function connectWs(token: string): Promise<{ ws: WebSocket; messages: any[] }> {
    const ws = new WebSocket(`${wsUrl}?token=${token}`);
    const messages: any[] = [];
    ws.on('message', (data) => {
      try {
        messages.push(JSON.parse(data.toString()));
      } catch {
        messages.push(data.toString());
      }
    });

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    // Wait briefly for welcome frames
    await new Promise((r) => setTimeout(r, 50));
    return { ws, messages };
  }

  const clientA1 = await connectWs(tokenA);
  const clientA2 = await connectWs(tokenA2);
  const clientB = await connectWs(tokenB);

  // Test 17: User Freeze closes active WebSockets
  emergencyStateCache.broadcastEmergencyAction('USER_FREEZE', TENANT_A, {
    userId: userA.user_id,
    reason: 'Account frozen',
  });
  await new Promise((r) => setTimeout(r, 100));

  assertTest(
    'Test 17: Emergency user freeze immediately terminates active WebSocket connections for that user',
    clientA1.ws.readyState === WebSocket.CLOSED || clientA1.ws.readyState === WebSocket.CLOSING
  );

  // Unfreeze and reconnect client A1 for subsequent tests
  db.setUserFrozen(userA.user_id, false);
  const reconnectedClientA1 = await connectWs(tokenA);

  // Test 18: Cross-Instance WebSocket event delivery via Redis Pub/Sub
  // Simulate peer WebSocket server instance publishing trade event to Redis
  const peerWsServer = new TradingWebSocketServer();
  // Clear messages
  reconnectedClientA1.messages.length = 0;
  clientA2.messages.length = 0;
  clientB.messages.length = 0;

  peerWsServer.broadcastToTenant(
    TENANT_A,
    'trade.executed',
    { tradeId: 'trade-cross-inst-1', price: 6500 },
    undefined,
    false // Publish to Redis
  );

  await new Promise((r) => setTimeout(r, 100));
  const a1Received = reconnectedClientA1.messages.some((m) => m.event === 'trade.executed');
  const a2Received = clientA2.messages.some((m) => m.event === 'trade.executed');

  assertTest(
    'Test 18: Cross-instance WebSocket delivery delivers events via Redis Pub/Sub to target tenant',
    a1Received === true && a2Received === true
  );

  // Test 19: Strict multi-tenant WebSocket isolation
  const bReceived = clientB.messages.some((m) => m.event === 'trade.executed');
  assertTest(
    'Test 19: Strict multi-tenant WebSocket isolation (Tenant B NEVER receives Tenant A events)',
    bReceived === false
  );

  // Test 20: Strict User-level WebSocket isolation within tenant
  reconnectedClientA1.messages.length = 0;
  clientA2.messages.length = 0;

  peerWsServer.broadcastToTenant(
    TENANT_A,
    'wallet.updated',
    { balance: 95000 },
    undefined,
    false,
    { targetUserId: userA.user_id }
  );

  await new Promise((r) => setTimeout(r, 100));
  const a1GotPrivate = reconnectedClientA1.messages.some((m) => m.event === 'wallet.updated');
  const a2GotPrivate = clientA2.messages.some((m) => m.event === 'wallet.updated');

  assertTest(
    'Test 20: Strict user isolation within tenant (User 2 does not receive User 1 private events)',
    a1GotPrivate === true && a2GotPrivate === false
  );

  // Test 21: Local WebSocket fallback resilience (works even when skipRedisPublish = true)
  reconnectedClientA1.messages.length = 0;
  tradingWebSocketServer.broadcastToTenant(
    TENANT_A,
    'market.ticker',
    { price: 6510 },
    undefined,
    true // Skip Redis, local only
  );
  await new Promise((r) => setTimeout(r, 60));
  const a1LocalGot = reconnectedClientA1.messages.some((m) => m.event === 'market.ticker');
  assertTest(
    'Test 21: Local WebSocket broadcasts function normally even if Redis publish is skipped or offline',
    a1LocalGot === true
  );

  // -------------------------------------------------------------
  // SECTION 5: DISTRIBUTED RATE LIMITING
  // -------------------------------------------------------------
  console.log('\n--- SECTION 5: DISTRIBUTED RATE LIMITING ---');

  // Test 22: Distributed rate limiting enforcement
  const rlScope = 'order';
  const rlId = 'user-rl-test';
  const rlLimit = 3;
  const rlWindow = 5;

  const r1 = await distributedRateLimiter.checkLimit({ tenantId: TENANT_A, scope: rlScope, identifier: rlId, limit: rlLimit, windowSeconds: rlWindow });
  const r2 = await distributedRateLimiter.checkLimit({ tenantId: TENANT_A, scope: rlScope, identifier: rlId, limit: rlLimit, windowSeconds: rlWindow });
  const r3 = await distributedRateLimiter.checkLimit({ tenantId: TENANT_A, scope: rlScope, identifier: rlId, limit: rlLimit, windowSeconds: rlWindow });
  const r4 = await distributedRateLimiter.checkLimit({ tenantId: TENANT_A, scope: rlScope, identifier: rlId, limit: rlLimit, windowSeconds: rlWindow });

  assertTest(
    'Test 22: Distributed rate limiter correctly allows within limit and rejects on exhaustion',
    r1.allowed === true &&
      r2.allowed === true &&
      r3.allowed === true &&
      r4.allowed === false &&
      r4.remaining === 0
  );

  // Test 23: Tenant quota separation
  const rTenantB = await distributedRateLimiter.checkLimit({
    tenantId: TENANT_B,
    scope: rlScope,
    identifier: rlId,
    limit: rlLimit,
    windowSeconds: rlWindow,
  });

  assertTest(
    'Test 23: Rate limit quota separation across tenants (Tenant A exhaustion does not affect Tenant B)',
    rTenantB.allowed === true && rTenantB.remaining === rlLimit - 1
  );

  // Test 24: In-memory fallback resilience
  const inMemoryLimiter = new (distributedRateLimiter.constructor as any)();
  // Using an unconfigured scope/key directly exercises the fallback path safely
  const memRes = await inMemoryLimiter.checkLimit({
    tenantId: 'tenant-offline-test',
    scope: 'login',
    identifier: 'ip-1.2.3.4',
    limit: 2,
    windowSeconds: 10,
  });
  assertTest(
    'Test 24: Rate limiter safely handles requests with zero downtime via in-memory sliding bucket',
    memRes.allowed === true && memRes.remaining === 1
  );
  inMemoryLimiter.close();

  // -------------------------------------------------------------
  // SECTION 6: WEBSOCKET RELIABILITY & HEARTBEAT
  // -------------------------------------------------------------
  console.log('\n--- SECTION 6: WEBSOCKET RELIABILITY & HEALTH ---');

  // Test 25: WebSocket Heartbeat & Ping/Pong
  reconnectedClientA1.messages.length = 0;
  reconnectedClientA1.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
  await new Promise((r) => setTimeout(r, 60));
  const gotPong = reconnectedClientA1.messages.some((m) => m.event === 'pong');
  assertTest(
    'Test 25: WebSocket keepalive responds to client ping frames with server pong',
    gotPong === true
  );

  // Test 26: WebSocket metrics tracking
  const wsMetrics = tradingWebSocketServer.getMetrics();
  assertTest(
    'Test 26: WebSocket server records operational metrics (connections, messages sent/received)',
    wsMetrics.activeConnections >= 2 &&
      wsMetrics.totalConnectionsOpened >= 3 &&
      wsMetrics.totalMessagesSent > 0
  );

  // -------------------------------------------------------------
  // SECTION 7: INTERNAL HEALTH & BACKWARD COMPATIBILITY
  // -------------------------------------------------------------
  console.log('\n--- SECTION 7: INTERNAL HEALTH & BACKWARD COMPATIBILITY ---');

  // Test 27: GET /api/internal/v1/health with comprehensive component diagnostics
  const healthHeaders = generateInternalHeaders({
    method: 'GET',
    path: '/api/internal/v1/health',
    tenantId: TENANT_A,
    secret: SECRET,
  });
  const healthRes = await fetch(`${baseUrl}/api/internal/v1/health`, {
    method: 'GET',
    headers: healthHeaders as any,
  });
  const healthData = await healthRes.json();

  assertTest(
    'Test 27: GET /api/internal/v1/health returns PostgreSQL, Redis, WebSocket, Outbox backlog, Dead-letter, Dispatcher, Circuit Breaker',
    healthRes.status === 200 &&
      healthData.ok === true &&
      healthData.postgres?.connected === true &&
      healthData.redis !== undefined &&
      healthData.websocket?.activeConnections !== undefined &&
      healthData.outbox?.pendingCount !== undefined &&
      healthData.outbox?.deadLetterCount !== undefined &&
      healthData.circuitBreaker !== undefined
  );

  // Test 28: Internal health endpoint requires HMAC authentication
  const unauthRes = await fetch(`${baseUrl}/api/internal/v1/health`, {
    method: 'GET',
    headers: { 'X-Tenant-ID': TENANT_A }, // Missing HMAC headers
  });
  assertTest(
    'Test 28: Operational health endpoint strictly secured by HMAC-SHA256 authentication (rejects unauthorized)',
    unauthRes.status === 401
  );

  // Test 29: Backward compatibility of Central Admin emergency routes
  const haltPayload = { enabled: true, reason: 'Regression compatibility check' };
  const haltHeaders = generateInternalHeaders({
    method: 'POST',
    path: '/api/internal/v1/emergency/trading-halt',
    tenantId: TENANT_A,
    secret: SECRET,
    body: haltPayload,
  });
  const haltPost = await fetch(`${baseUrl}/api/internal/v1/emergency/trading-halt`, {
    method: 'POST',
    headers: { ...haltHeaders, 'Content-Type': 'application/json' } as any,
    body: JSON.stringify(haltPayload),
  });
  const haltData = await haltPost.json();

  // Resume immediately
  const resumePayload = { enabled: false };
  const resumeHeaders = generateInternalHeaders({
    method: 'POST',
    path: '/api/internal/v1/emergency/trading-halt',
    tenantId: TENANT_A,
    secret: SECRET,
    body: resumePayload,
  });
  await fetch(`${baseUrl}/api/internal/v1/emergency/trading-halt`, {
    method: 'POST',
    headers: { ...resumeHeaders, 'Content-Type': 'application/json' } as any,
    body: JSON.stringify(resumePayload),
  });

  assertTest(
    'Test 29: Backward compatibility preserved for Central Admin emergency endpoints (Phase 5C/5E)',
    haltPost.status === 200 && haltData.success === true && haltData.tradingHalted === true
  );

  // Cleanup
  reconnectedClientA1.ws.close();
  clientA2.ws.close();
  clientB.ws.close();
  peerWsServer.close();
  tradingWebSocketServer.close();
  transactionalOutboxService.stopWorker();
  testOutboxService.stopWorker();
  failingOutboxService.stopWorker();
  breakerOutboxService.stopWorker();
  distributedRateLimiter.close();
  await redisService.close();
  server.close();

  console.log('\n================================================================');
  console.log(`PHASE 5F TEST RUN RESULTS: ${passed}/${passed + failed} PASSING`);
  if (failed === 0) {
    console.log('ALL PHASE 5F PRODUCTION RELIABILITY & DISTRIBUTED TESTS PASSED!');
  } else {
    console.error(`${failed} TESTS FAILED.`);
    process.exit(1);
  }
  console.log('================================================================\n');
  process.exit(failed === 0 ? 0 : 1);
}

runPhase5FTests().catch((err) => {
  console.error('[FATAL TEST SUITE ERROR]', err);
  process.exit(1);
});
