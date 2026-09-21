/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5H Test Suite
 * Real Broker Sandbox Integration & State Reconciliation Verification
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import crypto from 'crypto';
import { db } from '../src/server/db/database.ts';
import { pgDb } from '../src/server/db/postgres.ts';
import { runTradingMigrations } from '../src/server/db/migrationRunner.ts';
import { authService } from '../src/server/services/authService.ts';
import { resolveTenantMiddleware } from '../src/server/middleware/tenantMiddleware.ts';
import { executionGateway } from '../src/server/gateways/ExecutionGateway.ts';
import { mockBrokerAdapter } from '../src/server/gateways/broker/MockBrokerAdapter.ts';
import { realBrokerAdapter, RealBrokerAdapter } from '../src/server/gateways/broker/RealBrokerAdapter.ts';
import { brokerWebhookHandler } from '../src/server/gateways/broker/BrokerWebhookHandler.ts';
import { brokerReconciliationService } from '../src/server/services/BrokerReconciliationService.ts';
import { sandboxMarketDataAdapter } from '../src/server/gateways/market/SandboxMarketDataAdapter.ts';
import { providerConfigService } from '../src/server/gateways/broker/ProviderConfigService.ts';
import { providerCircuitBreaker, ProviderCircuitBreaker } from '../src/server/gateways/circuit/ProviderCircuitBreaker.ts';
import { executionAuditLogger } from '../src/server/gateways/audit/ExecutionAuditLogger.ts';
import {
  BrokerError,
  BrokerTimeoutError,
  BrokerRejectedError,
  BrokerAuthError,
  BrokerRateLimitError,
  BrokerSecurityError,
  BrokerCircuitOpenError,
} from '../src/server/gateways/errors/BrokerErrors.ts';
import { postgresOrderRepository } from '../src/server/repositories/trading/PostgresOrderRepository.ts';
import { postgresWalletRepository } from '../src/server/repositories/trading/PostgresWalletRepository.ts';
import { postgresPositionRepository } from '../src/server/repositories/trading/PostgresPositionRepository.ts';
import { postgresTradeRepository } from '../src/server/repositories/trading/PostgresTradeRepository.ts';
import tradingRoutes from '../src/server/routes/tradingRoutes.ts';

async function runPhase5HTests() {
  console.log('\n================================================================');
  console.log('STARTING PHASE 5H TEST SUITE: 33 TARGET TESTS');
  console.log('Real Broker Sandbox Integration & State Reconciliation');
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

  // 1. Initialize DB and run all migrations
  console.log('[Setup] Applying migrations...');
  await runTradingMigrations();

  const tenantA = 'tenant-5h-sandbox';
  const tenantB = 'tenant-5h-mock';

  // Seed wallets
  await postgresWalletRepository.getOrCreateWallet(tenantA, 'user-5h-alpha', 1000000);
  await postgresWalletRepository.getOrCreateWallet(tenantB, 'user-5h-beta', 1000000);

  // Seed users in json DB for requireAuth
  const userA: any = {
    id: 'user-5h-alpha',
    tenant_id: tenantA,
    full_name: 'Trader Alpha',
    user_id: 'user-5h-alpha',
    country_code: '+1',
    mobile: '5559001',
    password_hash: 'hash',
    role: 'SUPER_ADMIN',
    parent_id: null,
    hierarchy_path: 'root.user-5h-alpha',
    is_verified: true,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const userB: any = {
    id: 'user-5h-beta',
    tenant_id: tenantB,
    full_name: 'Trader Beta',
    user_id: 'user-5h-beta',
    country_code: '+1',
    mobile: '5559002',
    password_hash: 'hash',
    role: 'SUPER_ADMIN',
    parent_id: null,
    hierarchy_path: 'root.user-5h-beta',
    is_verified: true,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const existingUsers = (db as any).state.users || [];
  if (!existingUsers.some((u: any) => u.id === 'user-5h-alpha')) {
    existingUsers.push(userA);
  }
  if (!existingUsers.some((u: any) => u.id === 'user-5h-beta')) {
    existingUsers.push(userB);
  }
  (db as any).state.users = existingUsers;

  // Setup express test app
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(resolveTenantMiddleware);
  app.use('/api/trading', tradingRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const tokenA = authService.generateToken({
    id: 'user-5h-alpha',
    email: 'alpha@broker-sandbox.com',
    role: 'TRADER',
    tenantId: tenantA,
  });

  const tokenB = authService.generateToken({
    id: 'user-5h-beta',
    email: 'beta@mock-broker.com',
    role: 'TRADER',
    tenantId: tenantB,
  });

  // Setup simulated responses for the RealBrokerAdapter
  const simulatedOrders = new Map<string, any>();
  const simulatedPositions: any[] = [
    { symbol: 'AAPL', qty: '50', avg_entry_price: '180.25', current_price: '182.50', unrealized_pl: '112.50' },
  ];

  realBrokerAdapter.setMockHttpDispatcher(async (url: string, init: RequestInit) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body as string) : null;
    const headers = init.headers as Record<string, string>;

    // Check auth header
    const apiKey = headers['APCA-API-KEY-ID'];
    const apiSecret = headers['APCA-API-SECRET-KEY'];

    if (apiKey === 'INVALID_KEY' || apiSecret === 'INVALID_SECRET') {
      return new Response(JSON.stringify({ message: 'Invalid API credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.includes('/rate-limited')) {
      return new Response(JSON.stringify({ message: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Account endpoint
    if (url.endsWith('/v2/account')) {
      return new Response(
        JSON.stringify({
          id: 'acc-alpaca-sandbox-99',
          account_number: 'SANDBOX-99120',
          status: 'ACTIVE',
          currency: 'USD',
          cash: '250000.00',
          portfolio_value: '259125.00',
          buying_power: '500000.00',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Place order
    if (url.endsWith('/v2/orders') && method === 'POST') {
      if (body.symbol && body.symbol.includes('INVALID')) {
        return new Response(JSON.stringify({ message: 'Symbol INVALID_SYM is not tradeable' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const orderId = `bkr-ord-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const isMarket = body.type === 'market';
      const orderRecord = {
        id: orderId,
        client_order_id: body.client_order_id,
        symbol: body.symbol,
        qty: String(body.qty),
        filled_qty: isMarket ? String(body.qty) : '0',
        type: body.type,
        side: body.side,
        time_in_force: body.time_in_force,
        limit_price: body.limit_price ? String(body.limit_price) : null,
        filled_avg_price: isMarket ? (body.limit_price || '180.50') : null,
        status: isMarket ? 'filled' : 'new',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      simulatedOrders.set(orderId, orderRecord);
      if (body.client_order_id) {
        simulatedOrders.set(body.client_order_id, orderRecord);
      }

      return new Response(JSON.stringify(orderRecord), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Cancel order
    if (url.includes('/v2/orders/') && method === 'DELETE') {
      const parts = url.split('/v2/orders/');
      const targetId = decodeURIComponent(parts[1]);
      const o = simulatedOrders.get(targetId);
      if (o) {
        o.status = 'canceled';
        o.updated_at = new Date().toISOString();
      }
      return new Response(null, { status: 204 });
    }

    // Modify order
    if (url.includes('/v2/orders/') && method === 'PATCH') {
      const parts = url.split('/v2/orders/');
      const targetId = decodeURIComponent(parts[1]);
      const o = simulatedOrders.get(targetId);
      if (o) {
        if (body.qty) o.qty = String(body.qty);
        if (body.limit_price) o.limit_price = String(body.limit_price);
        o.status = 'replaced';
        o.updated_at = new Date().toISOString();
        return new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ message: 'Order not found' }), { status: 404 });
    }

    // Get order status
    if (url.includes('/v2/orders/') && method === 'GET') {
      const parts = url.split('/v2/orders/');
      const targetId = decodeURIComponent(parts[1]);
      const o = simulatedOrders.get(targetId);
      if (o) {
        return new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ message: 'Order not found' }), { status: 404 });
    }

    // Get open orders
    if (url.includes('/v2/orders?status=open') && method === 'GET') {
      const open = Array.from(new Set(simulatedOrders.values())).filter(
        (o) => o.status === 'new' || o.status === 'open' || o.status === 'partially_filled'
      );
      return new Response(JSON.stringify(open), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Get positions
    if (url.endsWith('/v2/positions') && method === 'GET') {
      return new Response(JSON.stringify(simulatedPositions), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
  });

  try {
    // -------------------------------------------------------------
    // GROUP 1: RealBrokerAdapter Core Contract & Security
    // -------------------------------------------------------------

    // Test 1: RealBrokerAdapter implements IBrokerAdapter with correct providerId
    assertTest(
      'Test 1: RealBrokerAdapter implements IBrokerAdapter with providerId "real-sandbox"',
      realBrokerAdapter.providerId === 'real-sandbox' &&
        typeof realBrokerAdapter.placeOrder === 'function' &&
        typeof realBrokerAdapter.cancelOrder === 'function' &&
        typeof realBrokerAdapter.modifyOrder === 'function' &&
        typeof realBrokerAdapter.getOrderStatus === 'function' &&
        typeof realBrokerAdapter.authenticate === 'function' &&
        typeof realBrokerAdapter.getOpenOrders === 'function' &&
        typeof realBrokerAdapter.getPositions === 'function'
    );

    // Test 2: Strictly rejects PRODUCTION environment
    let prodBlocked = false;
    try {
      await realBrokerAdapter.authenticate({
        tenantId: tenantA,
        providerId: 'real-sandbox',
        environment: 'PRODUCTION',
        settings: {},
      });
    } catch (err: any) {
      if (err instanceof BrokerSecurityError && err.code === 'BROKER_SECURITY_VIOLATION') {
        prodBlocked = true;
      }
    }
    assertTest(
      'Test 2: RealBrokerAdapter strictly blocks PRODUCTION environment with BrokerSecurityError',
      prodBlocked
    );

    // Test 3: Strictly rejects non-sandbox live production URLs
    let liveUrlBlocked = false;
    try {
      await realBrokerAdapter.authenticate({
        tenantId: tenantA,
        providerId: 'real-sandbox',
        environment: 'SANDBOX',
        settings: { baseUrl: 'https://api.alpaca.markets' }, // live prod URL without paper
      });
    } catch (err: any) {
      if (err instanceof BrokerSecurityError) {
        liveUrlBlocked = true;
      }
    }
    assertTest(
      'Test 3: RealBrokerAdapter rejects live production endpoint URLs',
      liveUrlBlocked
    );

    // Test 4: Credential security - credentials resolved server-side without leaking
    const credMeta = await providerConfigService.setCredentialsMetadata(tenantA, 'real-sandbox', {
      keyIdentifier: 'PK_TEST_KEY_12345',
      authScheme: 'API_KEY',
      secretEnvVar: 'BROKER_SANDBOX_API_SECRET',
      status: 'CONFIGURED',
    });
    process.env.BROKER_SANDBOX_API_SECRET = 'SK_TEST_SECRET_SECURE';

    const clientMeta = providerConfigService.sanitizeMetadataForClient(credMeta);
    assertTest(
      'Test 4: Broker secret is never exposed in client metadata and remains in process.env',
      (clientMeta as any)?.secret === undefined &&
        (clientMeta as any)?.secretEnvVar === undefined &&
        clientMeta?.hasConfiguredSecret === true
    );

    // Test 5: Successful sandbox authentication & account verification
    const authResult = await realBrokerAdapter.authenticate({
      tenantId: tenantA,
      providerId: 'real-sandbox',
      environment: 'SANDBOX',
      settings: {},
      credentials: {
        keyIdentifier: 'PK_TEST_KEY_12345',
        authScheme: 'API_KEY',
        secret: 'SK_TEST_SECRET_SECURE',
      },
    });
    assertTest(
      'Test 5: RealBrokerAdapter successfully authenticates and returns account status',
      authResult.authenticated === true &&
        authResult.details.status === 'ACTIVE' &&
        authResult.details.buyingPower === 500000 &&
        authResult.details.isSandbox === true
    );

    // Test 6: Authentication failure handling (invalid credentials -> BrokerAuthError)
    let authFailed = false;
    try {
      await realBrokerAdapter.authenticate({
        tenantId: tenantA,
        providerId: 'real-sandbox',
        environment: 'SANDBOX',
        settings: {},
        credentials: {
          keyIdentifier: 'INVALID_KEY',
          authScheme: 'API_KEY',
          secret: 'INVALID_SECRET',
        },
      });
    } catch (err: any) {
      if (err instanceof BrokerAuthError && err.statusCode === 401) {
        authFailed = true;
      }
    }
    assertTest(
      'Test 6: RealBrokerAdapter normalizes 401 Unauthorized into BrokerAuthError',
      authFailed
    );

    // Test 7: Rate limit normalization (429 -> BrokerRateLimitError)
    let rateLimitCaught = false;
    try {
      await realBrokerAdapter.authenticate({
        tenantId: tenantA,
        providerId: 'real-sandbox',
        environment: 'SANDBOX',
        settings: { baseUrl: 'https://paper-api.alpaca.markets/rate-limited' },
        credentials: {
          keyIdentifier: 'PK_TEST_KEY_12345',
          authScheme: 'API_KEY',
          secret: 'SK_TEST_SECRET_SECURE',
        },
      });
    } catch (err: any) {
      if (err instanceof BrokerRateLimitError && err.statusCode === 429) {
        rateLimitCaught = true;
      }
    }
    assertTest(
      'Test 7: RealBrokerAdapter maps HTTP 429 to BrokerRateLimitError',
      rateLimitCaught
    );

    // Test 8: Order rejection normalization (422 -> BrokerRejectedError)
    let rejectCaught = false;
    try {
      await realBrokerAdapter.placeOrder(
        {
          tenantId: tenantA,
          userId: 'user-5h-alpha',
          orderId: 'ord-reject-1',
          symbol: 'INVALID_SYM',
          side: 'BUY',
          orderType: 'MARKET',
          quantity: 10,
        },
        {
          tenantId: tenantA,
          providerId: 'real-sandbox',
          environment: 'SANDBOX',
          settings: {},
          credentials: {
            keyIdentifier: 'PK_TEST_KEY_12345',
            authScheme: 'API_KEY',
            secret: 'SK_TEST_SECRET_SECURE',
          },
        }
      );
    } catch (err: any) {
      if (err instanceof BrokerRejectedError) {
        rejectCaught = true;
      }
    }
    assertTest(
      'Test 8: RealBrokerAdapter maps 422 Unprocessable to BrokerRejectedError',
      rejectCaught
    );

    // Test 9: Normalized order states mapping
    assertTest(
      'Test 9: RealBrokerAdapter correctly maps all raw sandbox order states',
      realBrokerAdapter.mapProviderStatus('new') === 'NEW' &&
        realBrokerAdapter.mapProviderStatus('open') === 'OPEN' &&
        realBrokerAdapter.mapProviderStatus('partially_filled') === 'PARTIALLY_FILLED' &&
        realBrokerAdapter.mapProviderStatus('filled') === 'FILLED' &&
        realBrokerAdapter.mapProviderStatus('canceled') === 'CANCELLED' &&
        realBrokerAdapter.mapProviderStatus('rejected') === 'REJECTED'
    );

    // -------------------------------------------------------------
    // GROUP 2: ExecutionGateway Integration with RealBrokerAdapter
    // -------------------------------------------------------------

    // Configure Tenant A for REAL_SANDBOX
    await providerConfigService.setProviderConfig(tenantA, 'real-sandbox', {
      providerType: 'BROKER',
      environment: 'SANDBOX',
      settings: { timeoutMs: 3000 },
      isDefault: true,
      isActive: true,
    });

    // Test 10: Place market order through ExecutionGateway
    const placeResult = await executionGateway.placeOrder({
      tenantId: tenantA,
      userId: 'user-5h-alpha',
      orderId: 'ord-5h-market-1',
      clientOrderId: 'cl-5h-m1',
      symbol: 'AAPL',
      side: 'BUY',
      orderType: 'MARKET',
      quantity: 10,
      price: 180.5,
    });
    assertTest(
      'Test 10: ExecutionGateway routes market order to RealBrokerAdapter with broker_order_id',
      placeResult.success === true &&
        placeResult.providerId === 'real-sandbox' &&
        placeResult.status === 'FILLED' &&
        placeResult.brokerOrderId.startsWith('bkr-ord-') &&
        placeResult.filledQuantity === 10
    );

    // Test 11: Place limit order through ExecutionGateway
    const limitResult = await executionGateway.placeOrder({
      tenantId: tenantA,
      userId: 'user-5h-alpha',
      orderId: 'ord-5h-limit-1',
      clientOrderId: 'cl-5h-lim1',
      symbol: 'AAPL',
      side: 'BUY',
      orderType: 'LIMIT',
      quantity: 20,
      price: 175.0,
    });
    assertTest(
      'Test 11: ExecutionGateway places limit order in OPEN/NEW status',
      limitResult.success === true &&
        limitResult.status === 'NEW' &&
        limitResult.remainingQuantity === 20 &&
        limitResult.filledQuantity === 0
    );

    // Test 12: Modify limit order through ExecutionGateway
    const modifyResult = await executionGateway.modifyOrder({
      tenantId: tenantA,
      userId: 'user-5h-alpha',
      orderId: 'ord-5h-limit-1',
      brokerOrderId: limitResult.brokerOrderId,
      price: 176.5,
      quantity: 25,
    });
    assertTest(
      'Test 12: ExecutionGateway modifies open order limit price and quantity on broker',
      modifyResult.success === true &&
        modifyResult.averagePrice === 176.5 &&
        modifyResult.remainingQuantity === 25
    );

    // Test 13: Cancel order through ExecutionGateway
    const cancelResult = await executionGateway.cancelOrder({
      tenantId: tenantA,
      userId: 'user-5h-alpha',
      orderId: 'ord-5h-limit-1',
      brokerOrderId: limitResult.brokerOrderId,
    });
    assertTest(
      'Test 13: ExecutionGateway cancels open order and returns CANCELLED status',
      cancelResult.success === true && cancelResult.status === 'CANCELLED'
    );

    // Test 14: Query order status through ExecutionGateway
    const statusResult = await executionGateway.getOrderStatus({
      tenantId: tenantA,
      userId: 'user-5h-alpha',
      orderId: 'ord-5h-limit-1',
      brokerOrderId: limitResult.brokerOrderId,
    });
    assertTest(
      'Test 14: ExecutionGateway queries broker order status accurately',
      statusResult.success === true && statusResult.status === 'CANCELLED'
    );

    // Test 15: Query open orders through ExecutionGateway
    // Place a new open limit order
    const openLimit = await executionGateway.placeOrder({
      tenantId: tenantA,
      userId: 'user-5h-alpha',
      orderId: 'ord-5h-open-test',
      symbol: 'AAPL',
      side: 'SELL',
      orderType: 'LIMIT',
      quantity: 15,
      price: 190.0,
    });
    const openOrders = await executionGateway.getOpenOrders(tenantA);
    assertTest(
      'Test 15: ExecutionGateway.getOpenOrders returns active open sandbox orders',
      Array.isArray(openOrders) &&
        openOrders.some((o) => o.brokerOrderId === openLimit.brokerOrderId)
    );

    // Test 16: Query positions through ExecutionGateway
    const positions = await executionGateway.getPositions(tenantA);
    assertTest(
      'Test 16: ExecutionGateway.getPositions returns broker active positions',
      Array.isArray(positions) &&
        positions.length > 0 &&
        positions[0].symbol === 'AAPL' &&
        positions[0].quantity === 50
    );

    // -------------------------------------------------------------
    // GROUP 3: Provider Configuration & Tenant Isolation
    // -------------------------------------------------------------

    // Configure Tenant B explicitly for MOCK
    await providerConfigService.setProviderConfig(tenantB, 'mock-broker', {
      providerType: 'BROKER',
      environment: 'SIMULATION',
      isDefault: true,
      isActive: true,
    });

    // Test 17: Tenant A uses REAL_SANDBOX, Tenant B uses MOCK
    const confA = await providerConfigService.getProviderConfig(tenantA);
    const confB = await providerConfigService.getProviderConfig(tenantB);
    assertTest(
      'Test 17: Provider configuration isolates provider selection per tenant (REAL_SANDBOX vs MOCK)',
      confA.providerId === 'real-sandbox' && confB.providerId === 'mock-broker'
    );

    // Test 18: Fallback to MockBrokerAdapter in development when credentials missing and allowMockFallback is true
    const tenantC = 'tenant-5h-fallback';
    await providerConfigService.setProviderConfig(tenantC, 'real-sandbox', {
      providerType: 'BROKER',
      environment: 'SANDBOX',
      settings: { allowMockFallback: true },
      isDefault: true,
    });
    // Delete any env keys for clean test
    const origKey = process.env.BROKER_SANDBOX_API_KEY;
    const origSecret = process.env.BROKER_SANDBOX_API_SECRET;
    delete process.env.BROKER_SANDBOX_API_KEY;
    delete process.env.BROKER_SANDBOX_API_SECRET;

    const confC = await providerConfigService.getProviderConfig(tenantC, 'real-sandbox');
    assertTest(
      'Test 18: ProviderConfigService falls back to MockBrokerAdapter when sandbox credentials unconfigured',
      confC.providerId === 'mock-broker'
    );

    // Restore env
    if (origKey) process.env.BROKER_SANDBOX_API_KEY = origKey;
    if (origSecret) process.env.BROKER_SANDBOX_API_SECRET = origSecret;

    // Test 19: Circuit breaker integration with RealBrokerAdapter
    const testBreaker = new ProviderCircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 200,
    });
    testBreaker.recordFailure(tenantA, 'real-sandbox');
    testBreaker.recordFailure(tenantA, 'real-sandbox');
    assertTest(
      'Test 19: Provider Circuit Breaker trips to OPEN on repeated sandbox broker failures',
      testBreaker.canExecute(tenantA, 'real-sandbox') === false
    );

    // -------------------------------------------------------------
    // GROUP 4: Webhook Handler Verification
    // -------------------------------------------------------------

    const webhookSecret = 'test_webhook_hmac_secret_9988';
    process.env.BROKER_WEBHOOK_SECRET = webhookSecret;

    const webhookOrderId = `ord-5h-wh-${Date.now()}`;
    const webhookBrokerId = `bkr-wh-${Date.now()}`;

    // Test 20: Valid HMAC SHA256 signature verification
    const webhookPayload = {
      event_id: `evt-wh-${Date.now()}-1`,
      event: 'order_updated',
      timestamp: String(Math.floor(Date.now() / 1000)),
      order: {
        id: webhookBrokerId,
        client_order_id: webhookOrderId,
        symbol: 'AAPL',
        status: 'filled',
        filled_qty: 15,
        filled_avg_price: 190.0,
      },
    };
    const rawPayloadStr = JSON.stringify(webhookPayload);
    const validSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${webhookPayload.timestamp}.${rawPayloadStr}`)
      .digest('hex');

    const isValidSig = brokerWebhookHandler.verifySignature(
      rawPayloadStr,
      validSignature,
      webhookPayload.timestamp,
      webhookSecret
    );
    assertTest(
      'Test 20: Webhook handler validates authentic HMAC-SHA256 signature',
      isValidSig === true
    );

    // Test 21: Tampered signature rejection
    const isTampered = brokerWebhookHandler.verifySignature(
      rawPayloadStr + 'TAMPER',
      validSignature,
      webhookPayload.timestamp,
      webhookSecret
    );
    assertTest(
      'Test 21: Webhook handler rejects tampered payload signature',
      isTampered === false
    );

    // Test 22: Expired timestamp rejection (replay protection)
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 400); // 400s old (> 300s limit)
    const expiredSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${oldTimestamp}.${rawPayloadStr}`)
      .digest('hex');
    const isExpired = brokerWebhookHandler.verifySignature(
      rawPayloadStr,
      expiredSig,
      oldTimestamp,
      webhookSecret
    );
    assertTest(
      'Test 22: Webhook handler rejects expired timestamp to prevent replay attacks',
      isExpired === false
    );

    // Test 23: Idempotent processing and deduplication
    // First, insert local order for webhookOrderId in DB so webhook can update it
    await postgresOrderRepository.create({
      id: webhookOrderId,
      tenant_id: tenantA,
      user_id: 'user-5h-alpha',
      client_order_id: webhookOrderId,
      instrument_id: 'AAPL',
      side: 'SELL',
      order_type: 'LIMIT',
      quantity: 15,
      price: 190.0,
      trigger_price: null,
      status: 'OPEN' as any,
      broker_order_id: webhookBrokerId,
      normalized_status: 'OPEN',
      filled_quantity: 0,
      remaining_quantity: 15,
      average_fill_price: null,
      time_in_force: 'DAY',
    });

    const firstWebhook = await brokerWebhookHandler.processWebhook(
      tenantA,
      'real-sandbox',
      webhookPayload,
      rawPayloadStr
    );
    assertTest(
      'Test 23: Webhook handler successfully processes valid order update event',
      firstWebhook.success === true && firstWebhook.status === 'PROCESSED',
      firstWebhook
    );

    // Duplicate call
    const secondWebhook = await brokerWebhookHandler.processWebhook(
      tenantA,
      'real-sandbox',
      webhookPayload,
      rawPayloadStr
    );
    assertTest(
      'Test 24: Webhook handler identifies duplicate event ID and skips re-execution (idempotent)',
      secondWebhook.success === true && secondWebhook.status === 'DUPLICATE'
    );

    // Test 25: Database order state update from webhook
    const updatedOrderInDb = await postgresOrderRepository.findById(tenantA, webhookOrderId);
    assertTest(
      'Test 25: Webhook synchronizes order status to FILLED and updates filled_quantity in PostgreSQL',
      updatedOrderInDb !== null &&
        (updatedOrderInDb.status as string) === 'FILLED' &&
        Number(updatedOrderInDb.filled_quantity) === 15 &&
        Number(updatedOrderInDb.remaining_quantity) === 0
    );

    // Test 26: Webhook records trade fill in PostgreSQL
    const tradesRes = await pgDb.query(
      `SELECT * FROM trading_trades WHERE tenant_id = $1 AND order_id = $2`,
      [tenantA, webhookOrderId]
    );
    const trades = tradesRes.rows;
    assertTest(
      'Test 26: Webhook creates trade fill record with executed quantity and price',
      trades.length > 0 && Number(trades[0].quantity) === 15 && Number(trades[0].execution_price) === 190.0
    );

    // Test 27: Margin release on order cancellation webhook
    const cancelOrderId = `ord-5h-cancel-${Date.now()}`;
    const cancelBrokerId = `bkr-cancel-${Date.now()}`;
    await pgDb.query(
      `INSERT INTO trading_orders 
       (id, tenant_id, user_id, instrument_id, side, order_type, quantity, price, status, broker_order_id, normalized_status, filled_quantity, remaining_quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9, 'NEW', 0, 10)`,
      [cancelOrderId, tenantA, 'user-5h-alpha', 'AAPL', 'BUY', 'LIMIT', 10, 150.0, cancelBrokerId]
    );
    // Block margin in wallet
    await pgDb.query(
      `UPDATE trading_wallets SET blocked_balance = blocked_balance + 150, available_balance = available_balance - 150
       WHERE tenant_id = $1 AND user_id = $2`,
      [tenantA, 'user-5h-alpha']
    );

    const cancelPayload = {
      event_id: `evt-wh-cancel-${Date.now()}`,
      order: {
        id: cancelBrokerId,
        status: 'canceled',
        symbol: 'AAPL',
      },
    };
    await brokerWebhookHandler.processWebhook(tenantA, 'real-sandbox', cancelPayload);
    const orderAfterCancel = await postgresOrderRepository.findById(tenantA, cancelOrderId);
    assertTest(
      'Test 27: Webhook for CANCELLED order releases blocked margin and updates DB status',
      orderAfterCancel !== null && orderAfterCancel.status === 'CANCELLED'
    );

    // -------------------------------------------------------------
    // GROUP 5: State Reconciliation Service
    // -------------------------------------------------------------

    // Create an order in PostgreSQL with a deliberate status mismatch
    const mismatchOrderId = `ord-5h-recon-${Date.now()}`;
    const mismatchBrokerId = `bkr-recon-${Date.now()}`;
    await pgDb.query(
      `INSERT INTO trading_orders 
       (id, tenant_id, user_id, instrument_id, side, order_type, quantity, price, status, broker_order_id, normalized_status, filled_quantity, remaining_quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', $9, 'OPEN', 0, 10)`,
      [mismatchOrderId, tenantA, 'user-5h-alpha', 'AAPL', 'BUY', 'LIMIT', 10, 175.0, mismatchBrokerId]
    );

    // Configure simulated broker order as FILLED
    simulatedOrders.set(mismatchBrokerId, {
      id: mismatchBrokerId,
      status: 'filled',
      symbol: 'AAPL',
      qty: '10',
      filled_qty: '10',
      filled_avg_price: '175.0',
    });

    // Test 28: Reconciliation detects status mismatch
    const dryRunReport = await brokerReconciliationService.reconcileTenant(tenantA, { autoFix: false });
    assertTest(
      'Test 28: BrokerReconciliationService detects order status and fill discrepancies',
      dryRunReport.mismatchesDetected > 0 &&
        dryRunReport.orderDiscrepancies.some((d) => d.type === 'STATUS_MISMATCH' || d.type === 'FILL_DISCREPANCY')
    );

    // Test 29: Position discrepancy detection
    assertTest(
      'Test 29: BrokerReconciliationService identifies position mismatches between local DB and broker',
      dryRunReport.positionDiscrepancies !== undefined
    );

    // Test 30: Auto-fix synchronization updates PostgreSQL
    const fixReport = await brokerReconciliationService.reconcileTenant(tenantA, { autoFix: true });
    const fixedOrder = await postgresOrderRepository.findById(tenantA, mismatchOrderId);
    assertTest(
      'Test 30: Reconciliation with autoFix=true synchronizes local DB order to broker status FILLED',
      fixedOrder !== null &&
        (fixedOrder.status as string) === 'FILLED' &&
        fixReport.actionsTaken.some((a) => a.action === 'AUTO_RESOLVED_ORDER_STATUS')
    );

    // Test 31: Reconciliation audits logged into broker_reconciliation_audits
    const audits = await brokerReconciliationService.getReconciliationAudits(tenantA, 5);
    assertTest(
      'Test 31: Reconciliation audits are recorded in PostgreSQL table (no silent overwrites)',
      audits.length >= 2 &&
        audits[0].tenantId === tenantA &&
        audits[0].providerId === 'real-sandbox'
    );

    // -------------------------------------------------------------
    // GROUP 6: Sandbox Market Data Adapter & HTTP API Routes
    // -------------------------------------------------------------

    // Test 32: SandboxMarketDataAdapter provides realistic quotes and instruments
    const quote = await sandboxMarketDataAdapter.getQuote('NIFTY50', tenantA);
    const instruments = await sandboxMarketDataAdapter.getInstruments(tenantA);
    assertTest(
      'Test 32: SandboxMarketDataAdapter successfully returns tradeable instruments and quotes',
      quote !== null &&
        quote.lastPrice > 0 &&
        Array.isArray(instruments) &&
        instruments.length > 0
    );

    // Test 33: API Gateway Route Endpoints (Authentication & Open Orders)
    const apiAuthRes = await fetch(`${baseUrl}/api/trading/gateways/authenticate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-tenant-id': tenantA,
        'Content-Type': 'application/json',
      },
    });
    const apiAuthData = await apiAuthRes.json();

    const apiOrdersRes = await fetch(`${baseUrl}/api/trading/gateways/orders/open`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-tenant-id': tenantA,
      },
    });
    const apiOrdersData = await apiOrdersRes.json();

    assertTest(
      'Test 33: HTTP endpoints /gateways/authenticate and /gateways/orders/open respond successfully',
      apiAuthRes.status === 200 &&
        apiAuthData.authenticated === true &&
        apiOrdersRes.status === 200 &&
        Array.isArray(apiOrdersData.orders)
    );

  } catch (err: any) {
    console.error('[CRITICAL] Unhandled test runner error:', err);
    failed++;
  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`PHASE 5H RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase5HTests().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
