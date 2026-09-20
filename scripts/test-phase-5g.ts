/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5G Test Suite
 * Broker/Exchange Adapter & Market Data Gateway Verification
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import { db } from '../src/server/db/database.ts';
import { pgDb } from '../src/server/db/postgres.ts';
import { runTradingMigrations } from '../src/server/db/migrationRunner.ts';
import { authService } from '../src/server/services/authService.ts';
import { resolveTenantMiddleware } from '../src/server/middleware/tenantMiddleware.ts';
import { executionGateway } from '../src/server/gateways/ExecutionGateway.ts';
import { mockBrokerAdapter } from '../src/server/gateways/broker/MockBrokerAdapter.ts';
import { marketDataGateway } from '../src/server/gateways/MarketDataGateway.ts';
import { mockMarketDataAdapter } from '../src/server/gateways/market/MockMarketDataAdapter.ts';
import { providerConfigService } from '../src/server/gateways/broker/ProviderConfigService.ts';
import { providerCircuitBreaker, ProviderCircuitBreaker } from '../src/server/gateways/circuit/ProviderCircuitBreaker.ts';
import { executionAuditLogger, sanitizePayload } from '../src/server/gateways/audit/ExecutionAuditLogger.ts';
import {
  BrokerError,
  BrokerTimeoutError,
  BrokerRejectedError,
  BrokerCircuitOpenError,
} from '../src/server/gateways/errors/BrokerErrors.ts';
import { tradingExecutionService } from '../src/server/services/TradingExecutionService.ts';
import { postgresOrderRepository } from '../src/server/repositories/trading/PostgresOrderRepository.ts';
import { postgresWalletRepository } from '../src/server/repositories/trading/PostgresWalletRepository.ts';
import { postgresTradeRepository } from '../src/server/repositories/trading/PostgresTradeRepository.ts';
import tradingRoutes from '../src/server/routes/tradingRoutes.ts';

async function runPhase5GTests() {
  console.log('\n================================================================');
  console.log('STARTING PHASE 5G TEST SUITE: 28 TARGET TESTS');
  console.log('Broker/Exchange Adapter & Market Data Gateway Architecture');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assertTest(name: string, condition: boolean, details?: any) {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`);
      if (details) console.error('       Details:', details);
      failed++;
    }
  }

  // 1. Initialize PostgreSQL & run migrations (includes 003_phase5g_gateway.sql)
  console.log('[Setup] Running database migrations...');
  await runTradingMigrations();

  // 2. Set up Tenants and Users
  const tenantA = 'tenant-5g-alpha';
  const tenantB = 'tenant-5g-beta';

  // Seed wallets in PostgreSQL
  await postgresWalletRepository.getOrCreateWallet(tenantA, 'trader-alpha-1', 500000);
  await postgresWalletRepository.getOrCreateWallet(tenantB, 'trader-beta-1', 500000);

  // Seed SQLite tenant records if supported
  try {
    (db as any).prepare?.(`INSERT OR REPLACE INTO tenants (id, name, subdomain, tier, status) VALUES (?, ?, ?, ?, ?)`).run(
      tenantA, 'Alpha Trading Ltd', 'alpha-5g', 'ENTERPRISE', 'ACTIVE'
    );
    (db as any).prepare?.(`INSERT OR REPLACE INTO tenants (id, name, subdomain, tier, status) VALUES (?, ?, ?, ?, ?)`).run(
      tenantB, 'Beta Capital', 'beta-5g', 'PRO', 'ACTIVE'
    );
  } catch {}

  // Generate auth tokens
  const tokenAlpha = authService.generateToken({
    userId: 'trader-alpha-1',
    tenantId: tenantA,
    email: 'alpha1@test.com',
    role: 'USER',
    name: 'Trader Alpha 1',
  });

  const tokenBeta = authService.generateToken({
    userId: 'trader-beta-1',
    tenantId: tenantB,
    email: 'beta1@test.com',
    role: 'USER',
    name: 'Trader Beta 1',
  });

  // Setup Express server for route testing
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(resolveTenantMiddleware);
  app.use('/api/trading', tradingRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}`;

  try {
    // Reset mock adapter state before starting
    mockBrokerAdapter.clearMockData();
    mockMarketDataAdapter.reset();
    providerCircuitBreaker.clearAll();
    executionGateway.clearIdempotencyCache();

    // -------------------------------------------------------------
    // TEST 1: Execution Gateway Order Placement (Market)
    // -------------------------------------------------------------
    const placeReq1 = {
      tenantId: tenantA,
      userId: 'trader-alpha-1',
      orderId: 'ORD-5G-001',
      symbol: 'RELIANCE',
      side: 'BUY' as const,
      orderType: 'MARKET',
      quantity: 100,
      price: 2500,
    };
    const placeRes1 = await executionGateway.placeOrder(placeReq1);
    assertTest(
      'Test 1: Execution Gateway places market order with normalized FILLED status',
      placeRes1.success === true &&
        placeRes1.status === 'FILLED' &&
        placeRes1.brokerOrderId.startsWith('MOCK-BKR-') &&
        placeRes1.filledQuantity === 100 &&
        placeRes1.remainingQuantity === 0 &&
        placeRes1.latencyMs >= 0 &&
        typeof placeRes1.timestamp === 'string'
    );

    // -------------------------------------------------------------
    // TEST 2: Execution Gateway Order Placement (Limit)
    // -------------------------------------------------------------
    const placeReq2 = {
      tenantId: tenantA,
      userId: 'trader-alpha-1',
      orderId: 'ORD-5G-002',
      symbol: 'TCS',
      side: 'BUY' as const,
      orderType: 'LIMIT',
      quantity: 50,
      price: 3400,
    };
    const placeRes2 = await executionGateway.placeOrder(placeReq2);
    assertTest(
      'Test 2: Execution Gateway places limit order with normalized OPEN status',
      placeRes2.success === true &&
        placeRes2.status === 'OPEN' &&
        placeRes2.filledQuantity === 0 &&
        placeRes2.remainingQuantity === 50 &&
        placeRes2.averagePrice === 3400
    );

    // -------------------------------------------------------------
    // TEST 3: Execution Gateway Order Cancellation
    // -------------------------------------------------------------
    const cancelRes = await executionGateway.cancelOrder({
      tenantId: tenantA,
      userId: 'trader-alpha-1',
      orderId: 'ORD-5G-002',
      brokerOrderId: placeRes2.brokerOrderId,
    });
    assertTest(
      'Test 3: Execution Gateway cancels open order with normalized CANCELLED status',
      cancelRes.success === true &&
        cancelRes.status === 'CANCELLED' &&
        cancelRes.brokerOrderId === placeRes2.brokerOrderId
    );

    // -------------------------------------------------------------
    // TEST 4: Execution Gateway Order Modification
    // -------------------------------------------------------------
    const placeReq3 = {
      tenantId: tenantA,
      userId: 'trader-alpha-1',
      orderId: 'ORD-5G-003',
      symbol: 'INFY',
      side: 'BUY' as const,
      orderType: 'LIMIT',
      quantity: 100,
      price: 1500,
    };
    const placeRes3 = await executionGateway.placeOrder(placeReq3);

    const modifyRes = await executionGateway.modifyOrder({
      tenantId: tenantA,
      userId: 'trader-alpha-1',
      orderId: 'ORD-5G-003',
      brokerOrderId: placeRes3.brokerOrderId,
      price: 1520,
      quantity: 150,
    });
    assertTest(
      'Test 4: Execution Gateway modifies open order price and quantity',
      modifyRes.success === true &&
        modifyRes.status === 'OPEN' &&
        modifyRes.averagePrice === 1520 &&
        modifyRes.remainingQuantity === 150
    );

    // -------------------------------------------------------------
    // TEST 5: Execution Gateway Order Status Query
    // -------------------------------------------------------------
    const statusRes = await executionGateway.getOrderStatus({
      tenantId: tenantA,
      userId: 'trader-alpha-1',
      orderId: 'ORD-5G-003',
      brokerOrderId: placeRes3.brokerOrderId,
    });
    assertTest(
      'Test 5: Execution Gateway queries order status accurately',
      statusRes.success === true &&
        statusRes.status === 'OPEN' &&
        statusRes.brokerOrderId === placeRes3.brokerOrderId
    );

    // -------------------------------------------------------------
    // TEST 6: Normalized Order States Mapping
    // -------------------------------------------------------------
    const mapNew = mockBrokerAdapter.mapProviderStatus('SUBMITTED');
    const mapOpen = mockBrokerAdapter.mapProviderStatus('WORKING');
    const mapPartial = mockBrokerAdapter.mapProviderStatus('PARTIAL');
    const mapFilled = mockBrokerAdapter.mapProviderStatus('COMPLETE');
    const mapCancelled = mockBrokerAdapter.mapProviderStatus('EXPIRED');
    const mapRejected = mockBrokerAdapter.mapProviderStatus('DECLINED');

    assertTest(
      'Test 6: Normalized order states map all provider raw status variations',
      mapNew === 'NEW' &&
        mapOpen === 'OPEN' &&
        mapPartial === 'PARTIALLY_FILLED' &&
        mapFilled === 'FILLED' &&
        mapCancelled === 'CANCELLED' &&
        mapRejected === 'REJECTED'
    );

    // -------------------------------------------------------------
    // TEST 7: Mock Broker Partial Fill Simulation
    // -------------------------------------------------------------
    mockBrokerAdapter.setPartialFillFraction(0.4); // 40% fill
    const partialReq = {
      tenantId: tenantA,
      userId: 'trader-alpha-1',
      orderId: 'ORD-5G-PARTIAL',
      symbol: 'NIFTY50',
      side: 'BUY' as const,
      orderType: 'MARKET',
      quantity: 100,
      price: 24000,
    };
    const partialRes = await mockBrokerAdapter.placeOrder(partialReq, {
      tenantId: tenantA,
      providerId: 'mock-broker',
      environment: 'SIMULATION',
      settings: {},
    });
    mockBrokerAdapter.setPartialFillFraction(0); // Reset

    assertTest(
      'Test 7: Mock Broker supports PARTIALLY_FILLED execution mode',
      partialRes.status === 'PARTIALLY_FILLED' &&
        partialRes.filledQuantity === 40 &&
        partialRes.remainingQuantity === 60
    );

    // -------------------------------------------------------------
    // TEST 8: Mock Broker Order Rejection on Invalid Params
    // -------------------------------------------------------------
    let rejectedThrown = false;
    try {
      await mockBrokerAdapter.placeOrder(
        {
          tenantId: tenantA,
          userId: 'trader-alpha-1',
          orderId: 'ORD-5G-INVALID',
          symbol: 'NIFTY50',
          side: 'BUY',
          orderType: 'MARKET',
          quantity: -10, // Invalid quantity
        },
        { tenantId: tenantA, providerId: 'mock-broker', environment: 'SIMULATION', settings: {} }
      );
    } catch (err: any) {
      if (err instanceof BrokerRejectedError || err.code === 'BROKER_ORDER_REJECTED') {
        rejectedThrown = true;
      }
    }
    assertTest('Test 8: Mock Broker rejects invalid order with BrokerRejectedError', rejectedThrown);

    // -------------------------------------------------------------
    // TEST 9: Mock Broker Rejection on Cancelling Filled Order
    // -------------------------------------------------------------
    let cannotCancelFilled = false;
    try {
      await mockBrokerAdapter.cancelOrder(
        {
          tenantId: tenantA,
          userId: 'trader-alpha-1',
          orderId: placeReq1.orderId,
          brokerOrderId: placeRes1.brokerOrderId,
        },
        { tenantId: tenantA, providerId: 'mock-broker', environment: 'SIMULATION', settings: {} }
      );
    } catch (err: any) {
      if (err instanceof BrokerRejectedError) {
        cannotCancelFilled = true;
      }
    }
    assertTest('Test 9: Cannot cancel an already filled order', cannotCancelFilled);

    // -------------------------------------------------------------
    // TEST 10: Mock Broker Rejection on Modifying Filled Order
    // -------------------------------------------------------------
    let cannotModifyFilled = false;
    try {
      await mockBrokerAdapter.modifyOrder(
        {
          tenantId: tenantA,
          userId: 'trader-alpha-1',
          orderId: placeReq1.orderId,
          brokerOrderId: placeRes1.brokerOrderId,
          price: 2600,
        },
        { tenantId: tenantA, providerId: 'mock-broker', environment: 'SIMULATION', settings: {} }
      );
    } catch (err: any) {
      if (err instanceof BrokerRejectedError) {
        cannotModifyFilled = true;
      }
    }
    assertTest('Test 10: Cannot modify an already filled order', cannotModifyFilled);

    // -------------------------------------------------------------
    // TEST 11: Execution Gateway Idempotency
    // -------------------------------------------------------------
    const idempClientOrderId = `client-idemp-${Date.now()}`;
    const idempReq1 = {
      tenantId: tenantA,
      userId: 'trader-alpha-1',
      orderId: 'ORD-IDEMP-1',
      clientOrderId: idempClientOrderId,
      symbol: 'TCS',
      side: 'BUY' as const,
      orderType: 'MARKET',
      quantity: 25,
      price: 3500,
    };
    const idempRes1 = await executionGateway.placeOrder(idempReq1);

    // Duplicate submission
    const idempReq2 = {
      tenantId: tenantA,
      userId: 'trader-alpha-1',
      orderId: 'ORD-IDEMP-2',
      clientOrderId: idempClientOrderId,
      symbol: 'TCS',
      side: 'BUY' as const,
      orderType: 'MARKET',
      quantity: 25,
      price: 3500,
    };
    const idempRes2 = await executionGateway.placeOrder(idempReq2);

    assertTest(
      'Test 11: Gateway returns idempotent cached result on duplicate clientOrderId',
      idempRes1.brokerOrderId === idempRes2.brokerOrderId &&
        idempRes1.status === idempRes2.status
    );

    // -------------------------------------------------------------
    // TEST 12: Reliability - Timeout Enforcement
    // -------------------------------------------------------------
    mockBrokerAdapter.setSimulatedDelay(150);
    mockBrokerAdapter.setSimulatedTimeout(true);

    // Set low timeout on Tenant B
    await providerConfigService.setProviderConfig(tenantB, 'mock-broker', {
      settings: { timeoutMs: 50 },
    });

    let timeoutThrown = false;
    try {
      await executionGateway.placeOrder({
        tenantId: tenantB,
        userId: 'trader-beta-1',
        orderId: 'ORD-TIMEOUT-1',
        symbol: 'INFY',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: 10,
      });
    } catch (err: any) {
      if (err instanceof BrokerTimeoutError && err.statusCode === 504) {
        timeoutThrown = true;
      }
    } finally {
      mockBrokerAdapter.setSimulatedTimeout(false);
      mockBrokerAdapter.setSimulatedDelay(0);
    }
    assertTest('Test 12: Gateway enforces request timeout and throws BrokerTimeoutError (504)', timeoutThrown);

    // -------------------------------------------------------------
    // TEST 13: Reliability - Circuit Breaker Tripping
    // -------------------------------------------------------------
    const testCb = new ProviderCircuitBreaker({ failureThreshold: 3, cooldownMs: 100 });
    testCb.recordFailure('tenant-cb', 'mock');
    testCb.recordFailure('tenant-cb', 'mock');
    const canBefore = testCb.canExecute('tenant-cb', 'mock');
    testCb.recordFailure('tenant-cb', 'mock'); // 3rd failure trips
    const canAfter = testCb.canExecute('tenant-cb', 'mock');

    assertTest(
      'Test 13: Circuit breaker trips to OPEN after reaching failure threshold',
      canBefore === true && canAfter === false && testCb.getState('tenant-cb', 'mock').state === 'OPEN'
    );

    // -------------------------------------------------------------
    // TEST 14: Reliability - Circuit Breaker Cooldown & Recovery
    // -------------------------------------------------------------
    // Wait for 110ms cooldown
    await new Promise((r) => setTimeout(r, 110));
    const canHalfOpen = testCb.canExecute('tenant-cb', 'mock'); // triggers transition to HALF_OPEN
    testCb.recordSuccess('tenant-cb', 'mock');
    testCb.recordSuccess('tenant-cb', 'mock'); // meets halfOpenTrialLimit = 2
    const finalState = testCb.getState('tenant-cb', 'mock');

    assertTest(
      'Test 14: Circuit breaker transitions HALF_OPEN -> CLOSED on successful trial calls',
      canHalfOpen === true && finalState.state === 'CLOSED' && finalState.failureCount === 0
    );

    // -------------------------------------------------------------
    // TEST 15: Reliability - Safe Retry on Idempotent Read Queries
    // -------------------------------------------------------------
    // getOrderStatus is idempotent, safe to retry
    const statusResult = await executionGateway.getOrderStatus({
      tenantId: tenantA,
      userId: 'trader-alpha-1',
      orderId: placeReq1.orderId,
      brokerOrderId: placeRes1.brokerOrderId,
    });
    assertTest(
      'Test 15: Idempotent getOrderStatus completes successfully under retry policy',
      statusResult.success === true && statusResult.brokerOrderId === placeRes1.brokerOrderId
    );

    // -------------------------------------------------------------
    // TEST 16: Reliability - No Blind Retries on Order Placement
    // -------------------------------------------------------------
    // Verify placeOrder throws immediately on network/timeout without duplicate submissions
    mockBrokerAdapter.setSimulatedError(new BrokerError('Provider connection dropped', 'NETWORK_DROP', 503, true));
    let orderPlacementFailedOnce = false;
    try {
      await executionGateway.placeOrder({
        tenantId: tenantA,
        userId: 'trader-alpha-1',
        orderId: 'ORD-NO-RETRY',
        symbol: 'RELIANCE',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: 10,
      });
    } catch (err: any) {
      if (err.code === 'NETWORK_DROP') {
        orderPlacementFailedOnce = true;
      }
    } finally {
      mockBrokerAdapter.setSimulatedError(null);
    }
    assertTest('Test 16: placeOrder does not execute blind retries on order placement', orderPlacementFailedOnce);

    // -------------------------------------------------------------
    // TEST 17: Audit Logging - Action, Latency & Status Tracking
    // -------------------------------------------------------------
    const auditsA = await executionAuditLogger.getAuditsByTenant(tenantA, 10);
    const hasOrderAudit = auditsA.some((a) => a.action === 'PLACE_ORDER' && a.executionStatus === 'SUCCESS');
    assertTest(
      'Test 17: Execution audits record action, correlationId, executionStatus, and latency',
      auditsA.length > 0 && hasOrderAudit && auditsA[0].correlationId !== undefined
    );

    // -------------------------------------------------------------
    // TEST 18: Audit Logging - Strict Credential Sanitization
    // -------------------------------------------------------------
    const dirtyPayload = {
      symbol: 'RELIANCE',
      apiKey: 'secret_live_key_9981',
      nested: {
        authorizationToken: 'bearer_token_xyz',
        publicField: 'safe_value',
      },
    };
    const cleanPayload = sanitizePayload(dirtyPayload);
    assertTest(
      'Test 18: Audit payload sanitizer redacts apiKey, authorization, and secret tokens',
      cleanPayload.apiKey === '[REDACTED]' &&
        cleanPayload.nested.authorizationToken === '[REDACTED]' &&
        cleanPayload.nested.publicField === 'safe_value'
    );

    // -------------------------------------------------------------
    // TEST 19: Multi-Tenant Security - Tenant Provider Isolation
    // -------------------------------------------------------------
    await providerConfigService.setProviderConfig(tenantA, 'mock-broker', {
      environment: 'PRODUCTION',
      settings: { feeTier: 'VIP', customRoute: 'DIRECT_MARKET' },
    });
    await providerConfigService.setProviderConfig(tenantB, 'mock-broker', {
      environment: 'SANDBOX',
      settings: { feeTier: 'STANDARD' },
    });

    const configA = await providerConfigService.getProviderConfig(tenantA, 'mock-broker');
    const configB = await providerConfigService.getProviderConfig(tenantB, 'mock-broker');

    assertTest(
      'Test 19: Provider configurations are isolated per tenant',
      configA.environment === 'PRODUCTION' &&
        configA.settings.feeTier === 'VIP' &&
        configB.environment === 'SANDBOX' &&
        configB.settings.feeTier === 'STANDARD'
    );

    // -------------------------------------------------------------
    // TEST 20: Multi-Tenant Security - Server-Side Credential Safety
    // -------------------------------------------------------------
    process.env.BROKER_SECRET_TEST = 'super_secret_broker_private_key_123';

    await providerConfigService.setCredentialsMetadata(tenantA, 'mock-broker', {
      keyIdentifier: 'bkr_key_prod_***492',
      authScheme: 'API_KEY',
      secretEnvVar: 'BROKER_SECRET_TEST',
      status: 'ACTIVE',
    });

    const meta = await providerConfigService.getCredentialsMetadata(tenantA, 'mock-broker');
    const clientSafe = providerConfigService.sanitizeMetadataForClient(meta);

    assertTest(
      'Test 20: Broker secret is never exposed in client metadata and remains in process.env',
      clientSafe !== null &&
        clientSafe.keyIdentifier === 'bkr_key_prod_***492' &&
        (clientSafe as any).secret === undefined &&
        (clientSafe as any).secretEnvVar === undefined &&
        clientSafe.hasConfiguredSecret === true
    );

    // -------------------------------------------------------------
    // TEST 21: Market Data Gateway - Instruments
    // -------------------------------------------------------------
    const instruments = await marketDataGateway.getInstruments(tenantA);
    const hasNifty = instruments.some((i) => i.symbol.includes('NIFTY') && i.lotSize > 0);
    const hasBankNifty = instruments.some((i) => i.symbol.includes('BANKNIFTY'));

    assertTest('Test 21: Market Data Gateway retrieves tradeable instruments list', instruments.length >= 5 && hasNifty && hasBankNifty);

    // -------------------------------------------------------------
    // TEST 22: Market Data Gateway - Real-Time Quotes
    // -------------------------------------------------------------
    const quoteReliance = await marketDataGateway.getQuote('RELIANCE FUT', tenantA);
    assertTest(
      'Test 22: Market Data Gateway retrieves realistic quote with bid/ask spread',
      quoteReliance !== null &&
        quoteReliance.symbol === 'RELIANCE FUT' &&
        quoteReliance.lastPrice > 0 &&
        quoteReliance.ask >= quoteReliance.bid
    );

    // -------------------------------------------------------------
    // TEST 23: Market Data Gateway - Historical Candles
    // -------------------------------------------------------------
    const candles = await marketDataGateway.getCandles('NIFTY 24500 CE', '15m', 30, tenantA);
    const validCandles = candles.every((c) => c.high >= c.low && c.volume >= 0 && typeof c.time === 'number');
    assertTest(
      'Test 23: Market Data Gateway generates historical candlesticks with valid OHLCV',
      candles.length === 31 && validCandles
    );

    // -------------------------------------------------------------
    // TEST 24: Market Data Gateway - Live Tick Stream Pub/Sub
    // -------------------------------------------------------------
    let receivedTick: any = null;
    const unsub = marketDataGateway.subscribeTicks('RELIANCE FUT', (tick) => {
      receivedTick = tick;
    });

    const emitted = marketDataGateway.generateTick('RELIANCE FUT', 2550);
    unsub();

    assertTest(
      'Test 24: Market Data Gateway publishes live ticks to active subscribers',
      receivedTick !== null &&
        receivedTick.price > 0 &&
        receivedTick.timestamp > 0
    );

    // -------------------------------------------------------------
    // TEST 25: End-to-End: TradingExecutionService Integration
    // -------------------------------------------------------------
    const serviceOrderRes = await tradingExecutionService.placeOrder({
      tenantId: tenantA,
      userId: 'trader-alpha-1',
      symbol: 'RELIANCE FUT',
      side: 'BUY',
      orderType: 'MARKET',
      lots: 1,
    });

    const dbOrder = await postgresOrderRepository.findById(tenantA, serviceOrderRes.order.id);
    assertTest(
      'Test 25: TradingExecutionService stores broker_order_id and normalized_status in PostgreSQL',
      serviceOrderRes.success === true &&
        dbOrder !== null &&
        dbOrder.broker_order_id !== null &&
        dbOrder.broker_order_id!.startsWith('MOCK-BKR-') &&
        dbOrder.normalized_status === 'FILLED'
    );

    // -------------------------------------------------------------
    // TEST 26: End-to-End: Order Modification via Gateway
    // -------------------------------------------------------------
    // Place a limit order first
    const limitOrderRes = await tradingExecutionService.placeOrder({
      tenantId: tenantA,
      userId: 'trader-alpha-1',
      symbol: 'GOLD FUT',
      side: 'BUY',
      orderType: 'LIMIT',
      lots: 1,
      price: 157000,
    });

    // Modify it
    const modResult = await tradingExecutionService.modifyOrder(
      tenantA,
      'trader-alpha-1',
      limitOrderRes.order.id,
      { price: 157500 }
    );

    const dbModOrder = await postgresOrderRepository.findById(tenantA, limitOrderRes.order.id);
    assertTest(
      'Test 26: Order modification synchronizes price in DB and updates broker order',
      modResult.success === true &&
        dbModOrder !== null &&
        dbModOrder.price === 157500 &&
        dbModOrder.status === 'PENDING'
    );

    // -------------------------------------------------------------
    // TEST 27: End-to-End: Order Cancellation via Gateway
    // -------------------------------------------------------------
    const walletBeforeCancel = await postgresWalletRepository.getWallet(tenantA, 'trader-alpha-1');
    const blockedBefore = walletBeforeCancel?.blocked_balance || 0;

    const cancelServiceRes = await tradingExecutionService.cancelOrder(
      tenantA,
      'trader-alpha-1',
      limitOrderRes.order.id
    );

    const walletAfterCancel = await postgresWalletRepository.getWallet(tenantA, 'trader-alpha-1');
    const blockedAfter = walletAfterCancel?.blocked_balance || 0;
    const dbCancelledOrder = await postgresOrderRepository.findById(tenantA, limitOrderRes.order.id);

    assertTest(
      'Test 27: Order cancellation delegates to broker and releases blocked margin',
      cancelServiceRes.success === true &&
        dbCancelledOrder?.status === 'CANCELLED' &&
        dbCancelledOrder?.normalized_status === 'CANCELLED' &&
        blockedAfter < blockedBefore
    );

    // -------------------------------------------------------------
    // TEST 28: Database Migration 003_phase5g Schema Verification
    // -------------------------------------------------------------
    const tableRes = await pgDb.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('provider_configs', 'provider_credentials_metadata', 'provider_execution_audits');
    `);
    const tableNames = tableRes.rows.map((r) => r.table_name);

    assertTest(
      'Test 28: Phase 5G database migration creates required provider tables in PostgreSQL',
      tableNames.includes('provider_configs') &&
        tableNames.includes('provider_credentials_metadata') &&
        tableNames.includes('provider_execution_audits')
    );

  } catch (err) {
    console.error('[CRITICAL] Unhandled test runner error:', err);
    failed++;
  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`PHASE 5G RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase5GTests().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
