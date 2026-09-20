/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5J-A Test Suite
 * Central Admin ↔ Trading Platform End-to-End Integration & Readiness Verification
 */

import crypto from 'crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import { pgDb } from '../src/server/db/postgres.ts';
import { runTradingMigrations } from '../src/server/db/migrationRunner.ts';
import internalRoutes from '../src/server/routes/internal/index.ts';
import { tenantRepository } from '../src/server/repositories/JsonTenantRepository.ts';
import { emergencyControlService } from '../src/server/services/emergencyControlService.ts';
import { internalEventDispatcher } from '../src/server/events/InternalEventDispatcher.ts';
import { operationIdempotencyStore } from '../src/server/events/OperationIdempotencyStore.ts';
import { eventIdempotencyStore } from '../src/server/events/EventIdempotencyStore.ts';
import { CentralAdminEventClient } from '../src/server/events/CentralAdminEventClient.ts';
import { getInternalAuthConfig } from '../src/server/config/internalConfig.ts';
import { generateInternalHeaders } from '../src/server/auth/internalAuth.ts';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, details?: string): void {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${details ? ` -> ${details}` : ''}`);
    testsFailed++;
  }
}

async function makeRequest(
  serverUrl: string,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: any
): Promise<{ status: number; data: any; headers: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const options: http.RequestOptions = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let resData = '';
      res.on('data', (chunk) => {
        resData += chunk;
      });
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(resData);
        } catch {
          parsed = resData;
        }
        resolve({
          status: res.statusCode || 500,
          data: parsed,
          headers: res.headers,
        });
      });
    });

    req.on('error', (err) => reject(err));
    if (body !== undefined) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runPhase5JTests() {
  console.log('\n================================================================');
  console.log('   VERTEX TRADING PLATFORM - PHASE 5J-A INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  // Initialize DB and migrations
  await pgDb.init();
  await runTradingMigrations();

  // Create test express app replicating server.ts configuration
  const app = express();
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
  app.use('/api/internal/v1', internalRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const testTenantId = 'tenant_phase5j_test';
  const config = getInternalAuthConfig();
  const secret = config.internalCommunicationSecret;

  try {
    // -------------------------------------------------------------
    // TEST SUITE 1: TENANT SYNC & CONFIG SYNC
    // -------------------------------------------------------------
    console.log('--- TEST SUITE 1: Tenant Sync & Configuration Sync ---');

    // 1.1 Create Tenant commanded by Central Admin
    const createPath = '/api/internal/v1/tenant/create';
    const createPayload = {
      name: 'Phase 5J Test Tenant Brokerage',
      slug: 'phase5j-brokerage',
      customDomain: 'phase5j.vertex.trade',
      branding: {
        app_title: 'Phase 5J Pro Trading',
        primary_color: '#0ea5e9',
        secondary_color: '#0284c7',
      },
      config: {
        trading_enabled: true,
        registration_enabled: true,
        api_enabled: true,
      },
    };

    const createHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: createPath,
      body: createPayload,
    });
    const createRes = await makeRequest(baseUrl, 'POST', createPath, createHeaders, createPayload);
    assert(createRes.status === 200, 'Tenant create endpoint returns HTTP 200', `Got ${createRes.status}`);
    assert(createRes.data.success === true, 'Tenant create returns success: true');
    assert(createRes.data.tenant.slug === 'phase5j-brokerage', 'Tenant created with correct slug');

    // 1.2 Tenant Sync from Central Admin
    const syncPath = '/api/internal/v1/tenant/sync';
    const syncPayload = {
      tenantStatus: 'active',
      tradingEnabled: true,
      registrationEnabled: true,
      apiEnabled: true,
      maxLeverage: 50,
      configVersion: 1,
    };
    const syncHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: syncPath,
      body: syncPayload,
    });
    const syncRes = await makeRequest(baseUrl, 'POST', syncPath, syncHeaders, syncPayload);
    assert(syncRes.status === 200, 'Tenant sync endpoint returns HTTP 200');
    assert(syncRes.data.success === true, 'Tenant sync returns success: true');
    assert(syncRes.data.tenantId === testTenantId, 'Tenant sync returned correct tenantId');

    // 1.3 White-label Branding Sync
    const brandPath = '/api/internal/v1/tenant/branding';
    const brandingPayload = {
      branding: {
        app_title: 'Updated Vertex Brand 5J',
        primary_color: '#6366f1',
        theme: 'dark',
      },
      source: 'CENTRAL_ADMIN',
    };
    const brandHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: brandPath,
      body: brandingPayload,
    });
    const brandRes = await makeRequest(baseUrl, 'POST', brandPath, brandHeaders, brandingPayload);
    assert(brandRes.status === 200, 'Tenant branding sync returns HTTP 200');
    assert(brandRes.data.branding.app_title === 'Updated Vertex Brand 5J', 'Tenant branding successfully updated');
    assert(brandRes.data.brandingVersion > 1, 'Tenant branding version incremented');

    // 1.3 Platform Config Sync
    const confPath = '/api/internal/v1/platform/config';
    const configPayload = {
      config: {
        trading_enabled: true,
        max_leverage: 50,
        margin_call_threshold: 0.85,
      },
    };
    const configHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: confPath,
      body: configPayload,
    });
    const configRes = await makeRequest(baseUrl, 'POST', confPath, configHeaders, configPayload);
    assert(configRes.status === 200, 'Platform config sync returns HTTP 200');
    assert(configRes.data.config.max_leverage === 50, 'Platform configuration updated correctly');

    // 1.4 Tenant Status Change Sync
    const statPath = '/api/internal/v1/tenant/status';
    const statusPayload = {
      status: {
        trading_frozen: false,
        registration_frozen: true,
      },
    };
    const statusHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: statPath,
      body: statusPayload,
    });
    const statusRes = await makeRequest(baseUrl, 'POST', statPath, statusHeaders, statusPayload);
    assert(statusRes.status === 200, 'Tenant status update returns HTTP 200');
    assert(statusRes.data.status.registration_frozen === true, 'Tenant registration frozen status updated');

    // -------------------------------------------------------------
    // TEST SUITE 2: FEATURE TOGGLE CONTROLS
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 2: Trading, Registration & API Feature Toggles ---');

    // 2.1 Trading Toggle Disable
    const togglePath = '/api/internal/v1/tenant/trading-toggle';
    const tradeTogglePayload = { enabled: false, reason: 'Maintenance scheduled' };
    const tradeToggleHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: togglePath,
      body: tradeTogglePayload,
    });
    const tradeToggleRes = await makeRequest(baseUrl, 'POST', togglePath, tradeToggleHeaders, tradeTogglePayload);
    assert(tradeToggleRes.status === 200, 'Trading toggle disable returns HTTP 200');
    assert(tradeToggleRes.data.tradingEnabled === false, 'Trading state reflects disabled');

    // 2.2 Trading Toggle Enable
    const tradeEnablePayload = { enabled: true, reason: 'Maintenance completed' };
    const tradeEnableHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: togglePath,
      body: tradeEnablePayload,
    });
    const tradeEnableRes = await makeRequest(baseUrl, 'POST', togglePath, tradeEnableHeaders, tradeEnablePayload);
    assert(tradeEnableRes.status === 200, 'Trading toggle enable returns HTTP 200');
    assert(tradeEnableRes.data.tradingEnabled === true, 'Trading state reflects enabled');

    // 2.3 Registration Toggle
    const regPath = '/api/internal/v1/tenant/registration-toggle';
    const regTogglePayload = { enabled: false, reason: 'Capacity limit reached' };
    const regToggleHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: regPath,
      body: regTogglePayload,
    });
    const regToggleRes = await makeRequest(baseUrl, 'POST', regPath, regToggleHeaders, regTogglePayload);
    assert(regToggleRes.status === 200, 'Registration toggle returns HTTP 200');
    assert(regToggleRes.data.registrationEnabled === false, 'Registration state reflects disabled');

    // 2.4 API Access Toggle
    const apiPath = '/api/internal/v1/tenant/api-toggle';
    const apiTogglePayload = { enabled: false, reason: 'Security scan in progress' };
    const apiToggleHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: apiPath,
      body: apiTogglePayload,
    });
    const apiToggleRes = await makeRequest(baseUrl, 'POST', apiPath, apiToggleHeaders, apiTogglePayload);
    assert(apiToggleRes.status === 200, 'API access toggle returns HTTP 200');
    assert(apiToggleRes.data.apiEnabled === false, 'API state reflects disabled');

    // -------------------------------------------------------------
    // TEST SUITE 3: EMERGENCY CONTROLS & HIERARCHY FREEZES
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 3: Emergency Controls & Hierarchy Freezes ---');

    // 3.1 Provision test users for hierarchy
    const runId = Date.now().toString().slice(-6);
    const masterUserId = `master_5j_${runId}`;
    const brokerUserId = `broker_5j_${runId}`;
    const traderUserId = `trader_5j_${runId}`;
    const masterMobile = `987${runId}01`;
    const brokerMobile = `987${runId}02`;
    const traderMobile = `987${runId}03`;

    const provPath = '/api/internal/v1/hierarchy/provision-user';
    const masterPayload = {
      userId: masterUserId,
      fullName: 'Master Trader 5J',
      email: `${masterUserId}@vertex.trade`,
      role: 'master',
      mobile: masterMobile,
    };
    const provMasterHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: provPath,
      body: masterPayload,
    });
    const mRes = await makeRequest(baseUrl, 'POST', provPath, provMasterHeaders, masterPayload);
    assert(mRes.status === 200 || mRes.status === 201, 'Master user provisioned', JSON.stringify(mRes.data));

    const brokerPayload = {
      userId: brokerUserId,
      fullName: 'Broker 5J',
      email: `${brokerUserId}@vertex.trade`,
      role: 'broker',
      parentId: masterUserId,
      mobile: brokerMobile,
    };
    const provBrokerHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: provPath,
      body: brokerPayload,
    });
    const bRes = await makeRequest(baseUrl, 'POST', provPath, provBrokerHeaders, brokerPayload);
    assert(bRes.status === 200 || bRes.status === 201, 'Broker user provisioned', JSON.stringify(bRes.data));

    const traderPayload = {
      userId: traderUserId,
      fullName: 'Trader 5J',
      email: `${traderUserId}@vertex.trade`,
      role: 'user',
      parentId: brokerUserId,
      mobile: traderMobile,
    };
    const provTraderHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: provPath,
      body: traderPayload,
    });
    const tRes = await makeRequest(baseUrl, 'POST', provPath, provTraderHeaders, traderPayload);
    assert(tRes.status === 200 || tRes.status === 201, 'Trader user provisioned', JSON.stringify(tRes.data));

    // 3.2 Freeze Individual User
    const freezeUserPath = '/api/internal/v1/emergency/freeze-user';
    const freezeUserPayload = { userId: traderUserId, freeze: true, reason: 'Compliance audit' };
    const freezeUserHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: freezeUserPath,
      body: freezeUserPayload,
    });
    const freezeUserRes = await makeRequest(baseUrl, 'POST', freezeUserPath, freezeUserHeaders, freezeUserPayload);
    assert(freezeUserRes.status === 200, 'Freeze user returns HTTP 200', JSON.stringify(freezeUserRes.data));
    assert(freezeUserRes.data.isFrozen === true, 'User is marked frozen');

    // 3.3 Already in state check for user freeze
    const repeatFreezeHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: freezeUserPath,
      body: freezeUserPayload,
    });
    const repeatFreezeRes = await makeRequest(baseUrl, 'POST', freezeUserPath, repeatFreezeHeaders, freezeUserPayload);
    assert(repeatFreezeRes.data.alreadyInState === true, 'Freeze user detects alreadyInState gracefully');

    // 3.4 Freeze Broker (Hierarchy Cascade)
    const freezeBrokerPath = '/api/internal/v1/hierarchy/freeze-broker';
    const freezeBrokerPayload = { brokerId: brokerUserId, freeze: true, reason: 'Broker risk breach' };
    const freezeBrokerHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: freezeBrokerPath,
      body: freezeBrokerPayload,
    });
    const freezeBrokerRes = await makeRequest(baseUrl, 'POST', freezeBrokerPath, freezeBrokerHeaders, freezeBrokerPayload);
    assert(freezeBrokerRes.status === 200, 'Freeze broker returns HTTP 200');
    assert(freezeBrokerRes.data.role === 'broker', 'Broker role recognized in freeze');

    // 3.5 Freeze Master (Top Level Cascade)
    const freezeMasterPath = '/api/internal/v1/hierarchy/freeze-master';
    const freezeMasterPayload = { masterId: masterUserId, freeze: true, reason: 'Master investigation' };
    const freezeMasterHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: freezeMasterPath,
      body: freezeMasterPayload,
    });
    const freezeMasterRes = await makeRequest(baseUrl, 'POST', freezeMasterPath, freezeMasterHeaders, freezeMasterPayload);
    assert(freezeMasterRes.status === 200, 'Freeze master returns HTTP 200');
    assert(freezeMasterRes.data.role === 'master', 'Master role recognized in freeze');

    // 3.6 Tenant Kill Switch
    const killPath = '/api/internal/v1/emergency/killswitch';
    const killswitchPayload = { enabled: true, scope: 'TENANT', reason: 'High volatility emergency' };
    const killswitchHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: killPath,
      body: killswitchPayload,
    });
    const killswitchRes = await makeRequest(baseUrl, 'POST', killPath, killswitchHeaders, killswitchPayload);
    assert(killswitchRes.status === 200, 'Tenant kill switch returns HTTP 200');
    assert(killswitchRes.data.enabled === true, 'Tenant kill switch enabled');

    // 3.7 Cancel-All Orders
    const cancelPath = '/api/internal/v1/emergency/cancel-all-orders';
    const cancelAllPayload = { scope: 'TENANT', reason: 'Emergency circuit breaker' };
    const cancelAllHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: cancelPath,
      body: cancelAllPayload,
    });
    const cancelAllRes = await makeRequest(baseUrl, 'POST', cancelPath, cancelAllHeaders, cancelAllPayload);
    assert(cancelAllRes.status === 200, 'Cancel all orders returns HTTP 200');
    assert(cancelAllRes.data.success === true, 'Cancel all orders successful');

    // 3.8 Square-Off All Positions
    const sqPath = '/api/internal/v1/emergency/square-off-all';
    const squareOffPayload = { scope: 'TENANT', reason: 'Emergency square off' };
    const squareOffHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: sqPath,
      body: squareOffPayload,
    });
    const squareOffRes = await makeRequest(baseUrl, 'POST', sqPath, squareOffHeaders, squareOffPayload);
    assert(squareOffRes.status === 200, 'Square off positions returns HTTP 200');
    assert(squareOffRes.data.success === true, 'Square off successful');

    // -------------------------------------------------------------
    // TEST SUITE 4: OPERATION IDEMPOTENCY HANDLING
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 4: Operation Idempotency Handling ---');

    // 4.1 Repeated operation with X-Idempotency-Key
    const idemKey = `idem_key_${Date.now()}`;
    const opPayload = { scope: 'TENANT', reason: 'Idempotency test cancel' };
    const idemHeaders1 = {
      ...generateInternalHeaders({
        secret,
        tenantId: testTenantId,
        method: 'POST',
        path: cancelPath,
        body: opPayload,
      }),
      'X-Idempotency-Key': idemKey,
    };

    const firstCall = await makeRequest(baseUrl, 'POST', cancelPath, idemHeaders1, opPayload);
    assert(firstCall.status === 200, 'First call with idempotency key succeeds');

    const idemHeaders2 = {
      ...generateInternalHeaders({
        secret,
        tenantId: testTenantId,
        method: 'POST',
        path: cancelPath,
        body: opPayload,
      }),
      'X-Idempotency-Key': idemKey,
    };
    const secondCall = await makeRequest(baseUrl, 'POST', cancelPath, idemHeaders2, opPayload);
    assert(secondCall.status === 200, 'Second call with identical idempotency key succeeds');
    assert(secondCall.headers['x-cache-idempotent'] === 'HIT', 'Second call returns cached idempotent response');
    assert(secondCall.data.idempotencyKey === idemKey, 'Idempotency key retained in response');

    // -------------------------------------------------------------
    // TEST SUITE 5: EVENT RECEIVER & DEDUPLICATION (CENTRAL ADMIN ↔ PLATFORM)
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 5: Event Receiver & Ingestion Deduplication ---');

    // 5.1 trade.executed event
    const tradeEvtPath = '/api/internal/v1/events/trade-executed';
    const tradeEventId = `evt_trade_${Date.now()}`;
    const tradeEventPayload = {
      eventId: tradeEventId,
      eventType: 'trade.executed',
      payload: {
        orderId: 'ord_5j_101',
        userId: 'trader_5j_01',
        symbol: 'RELIANCE',
        side: 'BUY',
        quantity: 50,
        executionPrice: 2850.5,
      },
    };
    const tradeEvtHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: tradeEvtPath,
      body: tradeEventPayload,
    });
    const tradeEvtRes = await makeRequest(baseUrl, 'POST', tradeEvtPath, tradeEvtHeaders, tradeEventPayload);
    assert(tradeEvtRes.status === 200, 'trade.executed event ingestion returns HTTP 200');
    assert(tradeEvtRes.data.processed === true, 'Event marked processed');

    // Duplicate delivery check
    const tradeDupHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: tradeEvtPath,
      body: tradeEventPayload,
    });
    const tradeDupRes = await makeRequest(baseUrl, 'POST', tradeEvtPath, tradeDupHeaders, tradeEventPayload);
    assert(tradeDupRes.status === 200, 'Duplicate trade.executed returns HTTP 200');
    assert(tradeDupRes.data.alreadyProcessed === true, 'Duplicate trade.executed detected as already processed');

    // 5.2 risk.margin_breach event
    const breachEvtPath = '/api/internal/v1/events/margin-breach';
    const breachEventId = `evt_breach_${Date.now()}`;
    const breachEventPayload = {
      eventId: breachEventId,
      eventType: 'risk.margin_breach',
      payload: {
        userId: 'trader_5j_01',
        usedMargin: 120000,
        availableMargin: 100000,
        exposure: 500000,
      },
    };
    const breachEvtHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: breachEvtPath,
      body: breachEventPayload,
    });
    const breachEvtRes = await makeRequest(baseUrl, 'POST', breachEvtPath, breachEvtHeaders, breachEventPayload);
    assert(breachEvtRes.status === 200, 'risk.margin_breach event ingestion returns HTTP 200');
    assert(breachEvtRes.data.processed === true, 'Margin breach marked processed');

    // 5.3 execution.failure event
    const failEvtPath = '/api/internal/v1/events/execution-failure';
    const failEventId = `evt_fail_${Date.now()}`;
    const failEventPayload = {
      eventId: failEventId,
      eventType: 'execution.failure',
      payload: {
        orderId: 'ord_5j_fail_01',
        userId: 'trader_5j_01',
        symbol: 'INFY',
        failureReason: 'BROKER_REJECTED: Margin insufficient',
        code: 'INSUFFICIENT_FUNDS',
      },
    };
    const failEvtHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: failEvtPath,
      body: failEventPayload,
    });
    const failEvtRes = await makeRequest(baseUrl, 'POST', failEvtPath, failEvtHeaders, failEventPayload);
    assert(failEvtRes.status === 200, 'execution.failure event ingestion returns HTTP 200');
    assert(failEvtRes.data.processed === true, 'Execution failure marked processed');

    // 5.4 emergency.control_activated event
    const emergEvtPath = '/api/internal/v1/events/emergency-control';
    const emergEventId = `evt_emerg_${Date.now()}`;
    const emergEventPayload = {
      eventId: emergEventId,
      eventType: 'emergency.control_activated',
      payload: {
        action: 'TRADING_HALT',
        scope: 'TENANT',
        reason: 'Risk breaker trip',
      },
    };
    const emergEvtHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: emergEvtPath,
      body: emergEventPayload,
    });
    const emergEvtRes = await makeRequest(baseUrl, 'POST', emergEvtPath, emergEvtHeaders, emergEventPayload);
    assert(emergEvtRes.status === 200, 'emergency.control_activated event ingestion returns HTTP 200');
    assert(emergEvtRes.data.processed === true, 'Emergency control event processed');

    // 5.5 reconciliation.mismatch event
    const reconEvtPath = '/api/internal/v1/events/reconciliation-mismatch';
    const reconEventId = `evt_recon_${Date.now()}`;
    const reconEventPayload = {
      eventId: reconEventId,
      eventType: 'reconciliation.mismatch',
      payload: {
        mismatchType: 'POSITION_DISCREPANCY',
        details: 'Internal +100 vs Broker +80 for RELIANCE',
      },
    };
    const reconEvtHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: reconEvtPath,
      body: reconEventPayload,
    });
    const reconEvtRes = await makeRequest(baseUrl, 'POST', reconEvtPath, reconEvtHeaders, reconEventPayload);
    assert(reconEvtRes.status === 200, 'reconciliation.mismatch event ingestion returns HTTP 200');
    assert(reconEvtRes.data.processed === true, 'Reconciliation mismatch event processed');

    // 5.6 Event Dispatcher Health Check
    const healthPath = '/api/internal/v1/events/health';
    const healthHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'GET',
      path: healthPath,
    });
    const healthRes = await makeRequest(baseUrl, 'GET', healthPath, healthHeaders);
    assert(healthRes.status === 200, 'Events health endpoint returns HTTP 200');
    assert(healthRes.data.circuitState !== undefined, 'Circuit breaker state reported in health check');

    // -------------------------------------------------------------
    // TEST SUITE 6: EXPONENTIAL BACKOFF RETRY CLIENT
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 6: CentralAdminEventClient Exponential Backoff & Circuit Breaker ---');

    const mockAdminApp = express();
    mockAdminApp.use(express.json());
    let attempts = 0;
    mockAdminApp.post('/api/internal/v1/events/trade-executed', (req, res) => {
      attempts++;
      if (attempts < 2) {
        // Return 503 transient error first
        res.status(503).json({ error: 'Service temporarily unavailable' });
      } else {
        // Succeed on retry
        res.status(200).json({ success: true, processed: true, eventId: req.body?.eventId });
      }
    });

    const mockAdminServer = http.createServer(mockAdminApp);
    await new Promise<void>((resolve) => mockAdminServer.listen(0, resolve));
    const mockAdminPort = (mockAdminServer.address() as any).port;
    const mockAdminUrl = `http://127.0.0.1:${mockAdminPort}`;

    const client = new CentralAdminEventClient({
      endpointUrl: mockAdminUrl,
      hmacSecret: secret,
      maxRetries: 2,
      baseRetryDelayMs: 20,
      timeoutMs: 2000,
    });

    const retryResult = await client.sendEvent({
      eventId: `evt_retry_${Date.now()}`,
      tenantId: testTenantId,
      eventType: 'trade.executed',
      timestamp: new Date().toISOString(),
      version: 1,
      payload: {
        orderId: 'ord_retry_1',
        userId: 'trader_1',
        symbol: 'TCS',
        side: 'BUY',
        quantity: 10,
        executionPrice: 3500.0,
      },
    });

    assert(retryResult.success === true, 'Event delivered successfully after transient failure retry');
    assert(attempts >= 2, 'Client performed automatic retry on transient failure');
    await new Promise<void>((resolve) => mockAdminServer.close(() => resolve()));

    // -------------------------------------------------------------
    // TEST SUITE 7: SECURITY & TENANT ISOLATION
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 7: Security & Tenant Isolation ---');

    // 7.1 Invalid HMAC signature rejection
    const invalidSigHeaders = {
      ...generateInternalHeaders({
        secret,
        tenantId: testTenantId,
        method: 'POST',
        path: syncPath,
        body: syncPayload,
      }),
      'X-Internal-Signature': '0000000000000000000000000000000000000000000000000000000000000000',
    };
    const invalidSigRes = await makeRequest(baseUrl, 'POST', syncPath, invalidSigHeaders, syncPayload);
    assert(invalidSigRes.status === 401, 'Invalid HMAC signature rejected with 401 UNAUTHORIZED');

    // 7.2 Expired timestamp rejection (> 30000 ms)
    const expiredHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: syncPath,
      body: syncPayload,
      timestamp: Date.now() - 400000,
    });
    const expiredRes = await makeRequest(baseUrl, 'POST', syncPath, expiredHeaders, syncPayload);
    assert(expiredRes.status === 401, 'Expired timestamp rejected with 401');

    // 7.3 Tenant mismatch between header and body
    const mismatchedBody = { ...syncPayload, tenantId: 'attacker_tenant_xyz' };
    const mismatchHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'POST',
      path: syncPath,
      body: mismatchedBody,
    });
    const mismatchRes = await makeRequest(baseUrl, 'POST', syncPath, mismatchHeaders, mismatchedBody);
    assert(mismatchRes.status === 403, 'Cross-tenant spoofing rejected with 403 TENANT_MISMATCH');

    // 7.4 Tenant mismatch between header and query parameter
    const queryPath = '/api/internal/v1/risk/summary?tenantId=attacker_tenant_xyz';
    const queryMismatchHeaders = generateInternalHeaders({
      secret,
      tenantId: testTenantId,
      method: 'GET',
      path: queryPath,
    });
    const queryMismatchRes = await makeRequest(baseUrl, 'GET', queryPath, queryMismatchHeaders);
    assert(queryMismatchRes.status === 403, 'Cross-tenant query parameter spoofing rejected with 403');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n================================================================');
  console.log(`PHASE 5J-A TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase5JTests().catch((err) => {
  console.error('Fatal Phase 5J-A test runner error:', err);
  process.exit(1);
});
