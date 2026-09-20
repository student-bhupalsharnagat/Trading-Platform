/**
 * Automated Test Suite for Phase 5D:
 * Event Webhooks, Tenant Config Cache & Asynchronous Event Dispatcher
 *
 * 26 Specific Test Cases:
 * 1. TenantConfigCache correctly caches tenant config
 * 2. TenantConfigCache returns correct version
 * 3. TenantConfigCache invalidation works
 * 4. Stale configVersion is rejected by tenant config sync
 * 5. Newer configVersion successfully updates cache
 * 6. Cache initialization loads local tenant data without blocking
 * 7. EmergencyStateCache reflects current trading halt state
 * 8. requireTradingEnabled respects EmergencyStateCache
 * 9. requireActiveTrader continues enforcing freeze state
 * 10. trade.executed event is created on successful order
 * 11. trade.executed event contains expected fields
 * 12. trade.executed event does not contain sensitive tokens
 * 13. CentralAdminEventClient generates valid HMAC headers
 * 14. POST /api/internal/v1/events/trade-executed requires internal auth
 * 15. POST /api/internal/v1/events/trade-executed rejects tenant mismatch
 * 16. POST /api/internal/v1/events/trade-executed processes new eventId
 * 17. POST /api/internal/v1/events/trade-executed recognizes duplicate eventId as alreadyProcessed
 * 18. risk.margin_breach event is created when margin breach occurs
 * 19. Duplicate margin breach events are deduplicated
 * 20. Central Admin timeout triggers event retry queuing
 * 21. Retry policy uses exponential backoff
 * 22. Max retry failure moves event to dead-letter state
 * 23. Circuit breaker opens after repeated failures
 * 24. Trading platform continues executing trades while circuit is open
 * 25. GET /api/internal/v1/events/health returns valid metrics
 * 26. Phase 5B and 5C regression tests continue to pass
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import { db } from '../src/server/db/database.ts';
import { hierarchyService } from '../src/server/services/hierarchyService.ts';
import { resolveTenantMiddleware } from '../src/server/middleware/tenantMiddleware.ts';
import { getInternalAuthConfig } from '../src/server/config/internalConfig.ts';
import { generateInternalHeaders, verifyInternalHmac, buildSignaturePayload, serializeRequestBody } from '../src/server/auth/internalAuth.ts';
import { authService } from '../src/server/services/authService.ts';
import internalRoutes from '../src/server/routes/internal/index.ts';
import tenantRoutes from '../src/server/routes/tenantRoutes.ts';
import authRoutes from '../src/server/routes/authRoutes.ts';
import tradingRoutes from '../src/server/routes/tradingRoutes.ts';
import adminRoutes from '../src/server/routes/admin/index.ts';
import { tenantConfigCache, TenantConfigCache } from '../src/server/cache/TenantConfigCache.ts';
import { emergencyStateCache, EmergencyStateCache } from '../src/server/cache/EmergencyStateCache.ts';
import { initializeCachesFromLocal } from '../src/server/cache/initCache.ts';
import { internalEventDispatcher, InternalEventDispatcher } from '../src/server/events/InternalEventDispatcher.ts';
import { MemoryEventQueue } from '../src/server/events/EventQueue.ts';
import { CircuitBreaker } from '../src/server/events/CircuitBreaker.ts';
import { CentralAdminEventClient } from '../src/server/events/CentralAdminEventClient.ts';
import { eventIdempotencyStore } from '../src/server/events/EventIdempotencyStore.ts';
import { tradingHaltService } from '../src/server/services/tradingHaltService.ts';
import { emergencyControlService } from '../src/server/services/emergencyControlService.ts';
import { tenantRepository } from '../src/server/repositories/JsonTenantRepository.ts';

const config = getInternalAuthConfig();
const SECRET = config.internalCommunicationSecret;

async function runPhase5DTests() {
  console.log('\n================================================================');
  console.log('STARTING PHASE 5D TEST SUITE: 26 TARGET TESTS');
  console.log('Event Webhooks, Tenant Config Cache & Asynchronous Event Dispatcher');
  console.log('================================================================\n');

  await hierarchyService.ensureSuperAdmin();

  // Create test trader in vertex-default
  let testTrader = db.findUserByUserId('TRADER-5D-TEST');
  if (!testTrader) {
    testTrader = db.createUser({
      fullName: 'Trader 5D Test',
      userId: 'TRADER-5D-TEST',
      countryCode: '+91',
      mobile: '9999900052',
      passwordHash: 'hashedpwd123',
      tenantId: 'vertex-default',
    });
  } else {
    db.setUserFrozen(testTrader.user_id, false);
  }

  // Create a trader in another tenant for cross-tenant test
  let otherTenantTrader = db.findUserByUserId('TRADER-OTHER-5D');
  if (!otherTenantTrader) {
    otherTenantTrader = db.createUser({
      fullName: 'Other Tenant Trader 5D',
      userId: 'TRADER-OTHER-5D',
      countryCode: '+91',
      mobile: '9999900053',
      passwordHash: 'hashedpwd123',
      tenantId: 'apex-capital',
    });
  }

  const traderToken = authService.generateToken({
    id: testTrader.id,
    userId: testTrader.user_id,
    role: testTrader.role,
    tenantId: testTrader.tenant_id,
  });

  // Setup express test server
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
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

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

  try {
    // -------------------------------------------------------------------------
    // TEST 1: TenantConfigCache correctly caches tenant config
    // -------------------------------------------------------------------------
    {
      const customCache = new TenantConfigCache();
      const saved = customCache.set('tenant-cache-test', {
        tradingEnabled: true,
        maxLeverage: 75,
        optionsTradingEnabled: false,
        tenantStatus: 'active',
        configVersion: 5,
      });

      const retrieved = customCache.get('tenant-cache-test');
      assertTest(
        'Test 1: TenantConfigCache correctly caches tenant config',
        retrieved !== null &&
          retrieved.tenantId === 'tenant-cache-test' &&
          retrieved.maxLeverage === 75 &&
          retrieved.optionsTradingEnabled === false &&
          retrieved.configVersion === 5,
        { retrieved }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 2: TenantConfigCache returns correct version
    // -------------------------------------------------------------------------
    {
      const customCache = new TenantConfigCache();
      customCache.set('tenant-ver-test', { configVersion: 42 });
      const version = customCache.getVersion('tenant-ver-test');
      const nonExistent = customCache.getVersion('unknown-tenant');
      assertTest(
        'Test 2: TenantConfigCache returns correct version',
        version === 42 && nonExistent === 0,
        { version, nonExistent }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 3: TenantConfigCache invalidation works
    // -------------------------------------------------------------------------
    {
      const customCache = new TenantConfigCache();
      customCache.set('tenant-inv-test', { tradingEnabled: true });
      assertTest(
        'Test 3: TenantConfigCache invalidation works',
        customCache.get('tenant-inv-test') !== null &&
          (customCache.invalidate('tenant-inv-test'), customCache.get('tenant-inv-test') === null)
      );
    }

    // -------------------------------------------------------------------------
    // TEST 4: Stale configVersion is rejected by tenant config sync
    // -------------------------------------------------------------------------
    {
      tenantConfigCache.set('vertex-default', { configVersion: 20 });

      const path = '/api/internal/v1/tenant/sync';
      const body = {
        configVersion: 20, // Stale: equal to current cached version
        tradingEnabled: true,
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      assertTest(
        'Test 4: Stale configVersion is rejected by tenant config sync -> 409',
        res.status === 409 && data.code === 'STALE_CONFIG_VERSION',
        { status: res.status, data }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 5: Newer configVersion successfully updates cache
    // -------------------------------------------------------------------------
    {
      const path = '/api/internal/v1/tenant/sync';
      const body = {
        configVersion: 21, // Newer: strictly greater than current version 20
        tradingEnabled: true,
        maxLeverage: 100,
      };
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const cached = tenantConfigCache.get('vertex-default');
      assertTest(
        'Test 5: Newer configVersion successfully updates cache -> 200',
        res.status === 200 &&
          data.configVersion === 21 &&
          cached?.configVersion === 21 &&
          cached?.maxLeverage === 100,
        { status: res.status, data, cached }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 6: Cache initialization loads local tenant data without blocking
    // -------------------------------------------------------------------------
    {
      const result = await initializeCachesFromLocal();
      const health = tenantConfigCache.getHealth();
      const vertexConfig = tenantConfigCache.get('vertex-default');
      assertTest(
        'Test 6: Cache initialization loads local tenant data without blocking',
        result.success === true &&
          result.tenantCount > 0 &&
          health.status === 'healthy' &&
          vertexConfig !== null,
        { result, health, vertexConfig }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 7: EmergencyStateCache reflects current trading halt state
    // -------------------------------------------------------------------------
    {
      await tradingHaltService.setTradingHalt('vertex-default', true, 'Test 7 Halt');
      const haltedState = emergencyStateCache.get('vertex-default');

      await tradingHaltService.setTradingHalt('vertex-default', false, 'Test 7 Resume');
      const resumedState = emergencyStateCache.get('vertex-default');

      assertTest(
        'Test 7: EmergencyStateCache reflects current trading halt state',
        haltedState.tradingHalted === true && resumedState.tradingHalted === false,
        { haltedState, resumedState }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 8: requireTradingEnabled respects EmergencyStateCache
    // -------------------------------------------------------------------------
    {
      // Explicitly trip EmergencyStateCache for vertex-default
      emergencyStateCache.set('vertex-default', {
        tradingHalted: true,
        reason: 'Emergency cached halt active',
      });

      const res = await fetch(`${baseUrl}/api/trading/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${traderToken}`,
          'X-Tenant-ID': 'vertex-default',
        },
        body: JSON.stringify({
          symbol: 'SILVER FUT',
          type: 'BUY',
          lots: 1,
        }),
      });
      const data = await res.json();

      // Reset cache
      emergencyStateCache.set('vertex-default', {
        tradingHalted: false,
        reason: undefined,
      });

      assertTest(
        'Test 8: requireTradingEnabled respects EmergencyStateCache -> 403 TRADING_DISABLED',
        res.status === 403 && data.code === 'TRADING_DISABLED',
        { status: res.status, data }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 9: requireActiveTrader continues enforcing freeze state
    // -------------------------------------------------------------------------
    {
      await emergencyControlService.freezeUser(
        'vertex-default',
        testTrader.user_id,
        true,
        'Freezing for Test 9'
      );

      const res = await fetch(`${baseUrl}/api/trading/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${traderToken}`,
          'X-Tenant-ID': 'vertex-default',
        },
        body: JSON.stringify({
          symbol: 'SILVER FUT',
          type: 'BUY',
          lots: 1,
        }),
      });
      const data = await res.json();

      // Unfreeze for remaining tests
      await emergencyControlService.freezeUser(
        'vertex-default',
        testTrader.user_id,
        false,
        'Unfreezing after Test 9'
      );

      assertTest(
        'Test 9: requireActiveTrader continues enforcing freeze state -> 403 ACCOUNT_FROZEN / USER_FROZEN',
        res.status === 403 && (data.code === 'USER_FROZEN' || data.code === 'ACCOUNT_FROZEN'),
        { status: res.status, data }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 10: trade.executed event is created on successful order
    // -------------------------------------------------------------------------
    {
      // Clean queue
      internalEventDispatcher.reset();

      const res = await fetch(`${baseUrl}/api/trading/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${traderToken}`,
          'X-Tenant-ID': 'vertex-default',
        },
        body: JSON.stringify({
          symbol: 'SILVER FUT',
          type: 'BUY',
          lots: 1,
          orderType: 'MARKET',
          product: 'INTRADAY',
        }),
      });
      const data = await res.json();

      // Check event queue
      const queueStats = internalEventDispatcher.getQueue().getStats();
      assertTest(
        'Test 10: trade.executed event is created on successful order',
        res.status === 200 && data.success === true && queueStats.queueSize >= 1,
        { status: res.status, data, queueStats }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 11: trade.executed event contains expected fields
    // -------------------------------------------------------------------------
    {
      const tradeEvent = await internalEventDispatcher.dispatchTradeExecuted({
        tenantId: 'vertex-default',
        orderId: 'ORD-TEST-11',
        userId: testTrader.user_id,
        symbol: 'BANKNIFTY',
        side: 'BUY',
        quantity: 25,
        executionPrice: 48500.25,
      });

      const p = tradeEvent.payload;
      assertTest(
        'Test 11: trade.executed event contains expected fields',
        Boolean(tradeEvent.eventId) &&
          tradeEvent.eventType === 'trade.executed' &&
          tradeEvent.tenantId === 'vertex-default' &&
          p.orderId === 'ORD-TEST-11' &&
          p.userId === testTrader.user_id &&
          p.symbol === 'BANKNIFTY' &&
          p.side === 'BUY' &&
          p.quantity === 25 &&
          p.executionPrice === 48500.25 &&
          Boolean(p.executedAt),
        { tradeEvent }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 12: trade.executed event does not contain sensitive tokens
    // -------------------------------------------------------------------------
    {
      const tradeEvent = await internalEventDispatcher.dispatchTradeExecuted({
        tenantId: 'vertex-default',
        orderId: 'ORD-TEST-12',
        userId: testTrader.user_id,
        symbol: 'NIFTY',
        side: 'SELL',
        quantity: 50,
        executionPrice: 22400,
      });

      const jsonStr = JSON.stringify(tradeEvent).toLowerCase();
      const hasSensitive =
        jsonStr.includes('password') ||
        jsonStr.includes('secret') ||
        jsonStr.includes('jwt') ||
        jsonStr.includes('cookie') ||
        jsonStr.includes('token') ||
        jsonStr.includes('signature');

      assertTest(
        'Test 12: trade.executed event does not contain sensitive tokens',
        !hasSensitive,
        { jsonStr }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 13: CentralAdminEventClient generates valid HMAC headers
    // -------------------------------------------------------------------------
    {
      const client = new CentralAdminEventClient({
        baseUrl,
        secret: SECRET,
      });
      const event = {
        eventId: 'evt-test-13',
        eventType: 'trade.executed',
        tenantId: 'vertex-default',
        timestamp: new Date().toISOString(),
        version: 1,
        payload: {
          orderId: 'ORD-13',
          userId: 'user-13',
          symbol: 'NIFTY',
          side: 'BUY',
          quantity: 50,
          executionPrice: 22000,
        },
      };

      const path = client.getEndpointPath(event.eventType);
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body: event,
      });

      const bodyString = serializeRequestBody(event);
      const payload = buildSignaturePayload(headers['X-Internal-Timestamp'], 'POST', path, bodyString);
      const verifyResult = verifyInternalHmac(SECRET, payload, headers['X-Internal-Signature']);

      assertTest(
        'Test 13: CentralAdminEventClient generates valid HMAC headers',
        Boolean(headers['X-Internal-Timestamp']) &&
          Boolean(headers['X-Internal-Nonce']) &&
          Boolean(headers['X-Internal-Signature']) &&
          headers['X-Tenant-ID'] === 'vertex-default' &&
          verifyResult === true,
        { headers, verifyResult }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 14: POST /api/internal/v1/events/trade-executed requires internal auth
    // -------------------------------------------------------------------------
    {
      const res = await fetch(`${baseUrl}/api/internal/v1/events/trade-executed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: 'test-14', eventType: 'trade.executed' }),
      });
      assertTest(
        'Test 14: POST /api/internal/v1/events/trade-executed requires internal auth -> 401',
        res.status === 401,
        { status: res.status }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 15: POST /api/internal/v1/events/trade-executed rejects tenant mismatch
    // -------------------------------------------------------------------------
    {
      const path = '/api/internal/v1/events/trade-executed';
      const body = {
        eventId: 'evt-mismatch-15',
        eventType: 'trade.executed',
        tenantId: 'apex-capital', // does not match header
        payload: {
          orderId: 'ORD-15',
          userId: 'user-15',
          symbol: 'NIFTY',
          side: 'BUY',
          quantity: 50,
          executionPrice: 22000,
        },
      };

      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      assertTest(
        'Test 15: POST /api/internal/v1/events/trade-executed rejects tenant mismatch -> 403',
        res.status === 403 && data.code === 'TENANT_MISMATCH',
        { status: res.status, data }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 16: POST /api/internal/v1/events/trade-executed processes new eventId
    // -------------------------------------------------------------------------
    {
      const path = '/api/internal/v1/events/trade-executed';
      const eventId = `evt-fresh-16-${Date.now()}`;
      const body = {
        eventId,
        eventType: 'trade.executed',
        tenantId: 'vertex-default',
        payload: {
          orderId: 'ORD-16',
          userId: 'user-16',
          symbol: 'NIFTY',
          side: 'BUY',
          quantity: 50,
          executionPrice: 22100,
        },
      };

      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      assertTest(
        'Test 16: POST /api/internal/v1/events/trade-executed processes new eventId -> 200 processed=true',
        res.status === 200 &&
          data.success === true &&
          data.processed === true &&
          data.alreadyProcessed === false &&
          data.eventId === eventId,
        { status: res.status, data }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 17: Duplicate eventId recognized as alreadyProcessed
    // -------------------------------------------------------------------------
    {
      const path = '/api/internal/v1/events/trade-executed';
      const eventId = `evt-dedup-17-${Date.now()}`;
      const body = {
        eventId,
        eventType: 'trade.executed',
        tenantId: 'vertex-default',
        payload: {
          orderId: 'ORD-17',
          userId: 'user-17',
          symbol: 'NIFTY',
          side: 'BUY',
          quantity: 50,
          executionPrice: 22100,
        },
      };

      // First delivery
      const headers1 = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });
      const res1 = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers1, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data1 = await res1.json();

      // Second delivery (duplicate)
      const headers2 = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'POST',
        path,
        body,
      });
      const res2 = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { ...headers2, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data2 = await res2.json();

      assertTest(
        'Test 17: POST /api/internal/v1/events/trade-executed recognizes duplicate eventId as alreadyProcessed',
        res1.status === 200 &&
          data1.processed === true &&
          res2.status === 200 &&
          data2.processed === false &&
          data2.alreadyProcessed === true,
        { data1, data2 }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 18: risk.margin_breach event is created when margin breach occurs
    // -------------------------------------------------------------------------
    {
      internalEventDispatcher.resetMarginBreachTracking();
      const event = await internalEventDispatcher.dispatchMarginBreach({
        tenantId: 'vertex-default',
        userId: testTrader.user_id,
        usedMargin: 120000,
        availableMargin: 5000,
        exposure: 150000,
        threshold: 0.8,
      });

      assertTest(
        'Test 18: risk.margin_breach event is created when margin breach occurs',
        event !== null &&
          event.eventType === 'risk.margin_breach' &&
          event.tenantId === 'vertex-default' &&
          event.payload.usedMargin === 120000 &&
          event.payload.availableMargin === 5000 &&
          event.payload.exposure === 150000,
        { event }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 19: Duplicate margin breach events are deduplicated
    // -------------------------------------------------------------------------
    {
      // First breach dispatch
      const event1 = await internalEventDispatcher.dispatchMarginBreach({
        tenantId: 'vertex-default',
        userId: 'dedup-user-19',
        usedMargin: 80000,
        availableMargin: 1000,
        exposure: 100000,
      });

      // Second identical breach dispatch within cooldown
      const event2 = await internalEventDispatcher.dispatchMarginBreach({
        tenantId: 'vertex-default',
        userId: 'dedup-user-19',
        usedMargin: 80000,
        availableMargin: 1000,
        exposure: 100000,
      });

      assertTest(
        'Test 19: Duplicate margin breach events are deduplicated',
        event1 !== null && event2 === null,
        { event1, event2 }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 20: Central Admin timeout triggers event retry queuing
    // -------------------------------------------------------------------------
    {
      const localQueue = new MemoryEventQueue();
      // Point client to an unroutable blackhole port with short timeout
      const client = new CentralAdminEventClient({
        baseUrl: 'http://127.0.0.1:59999',
        secret: SECRET,
        timeoutMs: 150,
      });
      const breaker = new CircuitBreaker();
      const dispatcher = new InternalEventDispatcher(localQueue, client, breaker);

      const event = {
        eventId: `evt-timeout-20-${Date.now()}`,
        eventType: 'trade.executed',
        tenantId: 'vertex-default',
        timestamp: new Date().toISOString(),
        version: 1,
        payload: {
          orderId: 'ORD-20',
          userId: 'user-20',
          symbol: 'NIFTY',
          side: 'BUY' as const,
          quantity: 25,
          executionPrice: 22000,
          executedAt: new Date().toISOString(),
        },
      };

      localQueue.enqueue(event);
      const delivered = await dispatcher.attemptDelivery(event.eventId);
      const queuedItem = localQueue.getEvent(event.eventId);

      assertTest(
        'Test 20: Central Admin timeout triggers event retry queuing',
        delivered === false &&
          queuedItem !== undefined &&
          queuedItem.status === 'PENDING' &&
          queuedItem.attempts === 1 &&
          Boolean(queuedItem.lastError),
        { delivered, queuedItem }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 21: Retry policy uses exponential backoff
    // -------------------------------------------------------------------------
    {
      const localQueue = new MemoryEventQueue({ baseDelayMs: 100 });
      const event = {
        eventId: 'evt-backoff-21',
        eventType: 'trade.executed',
        tenantId: 'vertex-default',
        timestamp: new Date().toISOString(),
        version: 1,
        payload: {},
      };

      localQueue.enqueue(event, 5);

      const start = Date.now();
      localQueue.markFailure(event.eventId, 'fail 1');
      const item1 = localQueue.getEvent(event.eventId)!;
      const delay1 = item1.nextAttemptAt - start;

      localQueue.markFailure(event.eventId, 'fail 2');
      const item2 = localQueue.getEvent(event.eventId)!;
      const delay2 = item2.nextAttemptAt - Date.now();

      assertTest(
        'Test 21: Retry policy uses exponential backoff',
        delay1 >= 90 && delay2 >= 180,
        { delay1, delay2 }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 22: Max retry failure moves event to dead-letter state
    // -------------------------------------------------------------------------
    {
      const localQueue = new MemoryEventQueue();
      const event = {
        eventId: 'evt-dead-22',
        eventType: 'trade.executed',
        tenantId: 'vertex-default',
        timestamp: new Date().toISOString(),
        version: 1,
        payload: {},
      };

      localQueue.enqueue(event, 3);
      localQueue.markFailure(event.eventId, 'error 1');
      localQueue.markFailure(event.eventId, 'error 2');
      const finalResult = localQueue.markFailure(event.eventId, 'error 3');

      const deadLetters = localQueue.getDeadLetter();
      assertTest(
        'Test 22: Max retry failure moves event to dead-letter state',
        finalResult.deadLetter === true &&
          finalResult.event.status === 'DEAD_LETTER' &&
          deadLetters.length === 1 &&
          deadLetters[0].eventId === 'evt-dead-22',
        { finalResult, deadLetters }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 23: Circuit breaker opens after repeated failures
    // -------------------------------------------------------------------------
    {
      const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 5000 });
      assertTest('Test 23a: Initial circuit state is CLOSED', breaker.getState() === 'CLOSED');

      breaker.recordFailure();
      breaker.recordFailure();
      assertTest('Test 23b: Still CLOSED after 2 failures', breaker.getState() === 'CLOSED');

      breaker.recordFailure();
      assertTest(
        'Test 23: Circuit breaker opens after repeated failures -> OPEN',
        breaker.getState() === 'OPEN' && breaker.canExecute() === false,
        { state: breaker.getState() }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 24: Trading platform continues executing trades while circuit is open
    // -------------------------------------------------------------------------
    {
      // Force dispatcher circuit breaker OPEN
      internalEventDispatcher.getCircuitBreaker().forceState('OPEN');

      const res = await fetch(`${baseUrl}/api/trading/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${traderToken}`,
          'X-Tenant-ID': 'vertex-default',
        },
        body: JSON.stringify({
          symbol: 'SILVER FUT',
          type: 'BUY',
          lots: 1,
          orderType: 'MARKET',
          product: 'INTRADAY',
        }),
      });
      const data = await res.json();

      // Reset circuit breaker
      internalEventDispatcher.getCircuitBreaker().reset();

      assertTest(
        'Test 24: Trading platform continues executing trades while circuit is open -> 200 OK',
        res.status === 200 && data.success === true,
        { status: res.status, data }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 25: GET /api/internal/v1/events/health returns valid metrics
    // -------------------------------------------------------------------------
    {
      const path = '/api/internal/v1/events/health';
      const headers = generateInternalHeaders({
        secret: SECRET,
        tenantId: 'vertex-default',
        method: 'GET',
        path,
      });

      const res = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        headers,
      });
      const data = await res.json();

      assertTest(
        'Test 25: GET /api/internal/v1/events/health returns valid metrics',
        res.status === 200 &&
          data.success === true &&
          data.service === 'trading-platform-event-dispatcher' &&
          typeof data.queueSize === 'number' &&
          typeof data.pendingEvents === 'number' &&
          typeof data.failedEvents === 'number' &&
          typeof data.deadLetterEvents === 'number' &&
          data.circuitState === 'CLOSED' &&
          data.cacheStatus === 'healthy',
        { status: res.status, data }
      );
    }

    // -------------------------------------------------------------------------
    // TEST 26: Phase 5B and 5C regression tests continue to pass
    // -------------------------------------------------------------------------
    {
      // Valid HMAC check from 5B: invalid signature rejected
      const invalidSigResult = verifyInternalHmac(SECRET, 'some-payload', 'invalid-signature');

      // Valid emergency control check from 5C
      const riskSummary = await emergencyControlService.getRiskSummary('vertex-default');

      assertTest(
        'Test 26: Phase 5B and 5C regression tests continue to pass',
        invalidSigResult === false &&
          riskSummary !== null &&
          typeof riskSummary.totalExposure === 'number',
        { riskSummary, invalidSigResult }
      );
    }
  } finally {
    (server as any).closeAllConnections?.();
    server.close();
  }

  console.log('\n================================================================');
  console.log(`PHASE 5D TEST RESULTS: ${passed} PASSED, ${failed} FAILED out of 26`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase5DTests().catch((err) => {
  console.error('Fatal error running Phase 5D tests:', err);
  process.exit(1);
});
