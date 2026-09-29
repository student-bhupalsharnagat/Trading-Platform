/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5K Test Suite
 * Authoritative Trading, Financial Data, Immutable Ledger, and S2S Endpoints
 */

import crypto from 'crypto';
import express from 'express';
import http from 'http';
import { pgDb } from '../src/server/db/postgres.ts';
import { runTradingMigrations } from '../src/server/db/migrationRunner.ts';
import internalRoutes from '../src/server/routes/internal/index.ts';
import { generateInternalHeaders } from '../src/server/auth/internalAuth.ts';
import { getInternalAuthConfig } from '../src/server/config/internalConfig.ts';
import { postgresOrderRepository } from '../src/server/repositories/trading/PostgresOrderRepository.ts';
import { postgresTradeRepository } from '../src/server/repositories/trading/PostgresTradeRepository.ts';
import { postgresPositionRepository } from '../src/server/repositories/trading/PostgresPositionRepository.ts';
import { postgresWalletRepository } from '../src/server/repositories/trading/PostgresWalletRepository.ts';
import { db } from '../src/server/db/database.ts';

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

async function runPhase5KTests() {
  console.log('\n================================================================');
  console.log('   VERTEX TRADING PLATFORM - PHASE 5K AUTHORITATIVE TEST SUITE');
  console.log('================================================================\n');

  // Initialize DB and run all migrations
  await pgDb.init();
  await runTradingMigrations();

  const app = express();
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );

  app.use('/api/internal/v1', internalRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const tenantA = `tenant_auth_a_${Date.now()}`;
  const tenantB = `tenant_auth_b_${Date.now()}`;
  const config = getInternalAuthConfig();
  const secret = config.internalCommunicationSecret;

  // Create tenants in repository so tenant validation passes
  await (await import('../src/server/repositories/JsonTenantRepository.ts')).tenantRepository.createTenant({
    tenant: {
      id: tenantA,
      name: 'Authoritative Tenant Alpha',
      slug: `alpha-${Date.now()}`,
      customDomain: `${tenantA}.vertex.local`,
      domains: [`${tenantA}.vertex.local`],
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });

  await (await import('../src/server/repositories/JsonTenantRepository.ts')).tenantRepository.createTenant({
    tenant: {
      id: tenantB,
      name: 'Authoritative Tenant Beta',
      slug: `beta-${Date.now()}`,
      customDomain: `${tenantB}.vertex.local`,
      domains: [`${tenantB}.vertex.local`],
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });

  try {
    // -------------------------------------------------------------
    // Test 1: S2S Health and Authentication
    // -------------------------------------------------------------
    console.log('--- TEST SUITE 1: S2S Authentication & Health Check ---');
    const healthHeaders = generateInternalHeaders({ secret, method: 'GET', path: '/api/internal/v1/health', tenantId: tenantA });
    const healthRes = await makeRequest(baseUrl, 'GET', '/api/internal/v1/health', healthHeaders);
    assert(healthRes.status === 200, 'Health check returns 200');
    assert(healthRes.data?.ok === true, 'Health check reports ok: true');

    // -------------------------------------------------------------
    // Test 2: Seed Authoritative Data for Tenant A
    // -------------------------------------------------------------
    console.log('--- TEST SUITE 2: Authoritative Financials & Trading Data ---');
    const userA = `user_alpha_${Date.now()}`;
    const userMobile = `${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    db.createUser({
      fullName: 'Alice Trader',
      userId: userA,
      countryCode: '+91',
      mobile: userMobile,
      passwordHash: 'hash',
      role: 'CLIENT',
      tenantId: tenantA,
      status: 'active',
    });

    await postgresWalletRepository.getOrCreateWallet(tenantA, userA, 500000);

    // Create an order
    const orderId = `ord-${Date.now()}-1`;
    await postgresOrderRepository.create({
      id: orderId,
      tenant_id: tenantA,
      user_id: userA,
      instrument_id: 'RELIANCE',
      side: 'BUY',
      order_type: 'MARKET',
      quantity: 10,
      price: 2500,
      status: 'EXECUTED',
      filled_quantity: 10,
      remaining_quantity: 0,
      average_fill_price: 2500,
      time_in_force: 'DAY',
    });

    // Create trade
    const tradeId = `trd-${Date.now()}-1`;
    await postgresTradeRepository.create({
      id: tradeId,
      tenant_id: tenantA,
      order_id: orderId,
      user_id: userA,
      instrument_id: 'RELIANCE',
      side: 'BUY',
      quantity: 10,
      execution_price: 2500,
      execution_value: 25000,
      realized_pnl: 0,
      executed_at: new Date().toISOString(),
    });

    // Create position
    await postgresPositionRepository.upsertPosition({
      id: `pos-${Date.now()}-1`,
      tenant_id: tenantA,
      user_id: userA,
      instrument_id: 'RELIANCE',
      quantity: 10,
      average_price: 2500,
      realized_pnl: 0,
      unrealized_pnl: 500,
      margin_used: 5000,
    });

    // -------------------------------------------------------------
    // Test 3: Read Endpoints for Tenant A
    // -------------------------------------------------------------
    const ordersHeaders = generateInternalHeaders({ secret, method: 'GET', path: '/api/internal/v1/trading/orders', tenantId: tenantA });
    const ordersRes = await makeRequest(baseUrl, 'GET', '/api/internal/v1/trading/orders', ordersHeaders);
    assert(ordersRes.status === 200, 'GET /trading/orders returns 200');
    assert(ordersRes.data?.orders?.length >= 1, 'GET /trading/orders returns created order');
    assert(ordersRes.data?.data_state === 'authoritative', 'Data state is authoritative');

    const tradesHeaders = generateInternalHeaders({ secret, method: 'GET', path: '/api/internal/v1/trading/trades', tenantId: tenantA });
    const tradesRes = await makeRequest(baseUrl, 'GET', '/api/internal/v1/trading/trades', tradesHeaders);
    assert(tradesRes.status === 200, 'GET /trading/trades returns 200');
    assert(tradesRes.data?.trades?.length >= 1, 'GET /trading/trades returns executed trade');

    const posHeaders = generateInternalHeaders({ secret, method: 'GET', path: '/api/internal/v1/trading/positions', tenantId: tenantA });
    const posRes = await makeRequest(baseUrl, 'GET', '/api/internal/v1/trading/positions', posHeaders);
    assert(posRes.status === 200, 'GET /trading/positions returns 200');
    assert(posRes.data?.positions?.length >= 1, 'GET /trading/positions returns open position');

    // -------------------------------------------------------------
    // Test 4: Financial Summary & Summary Aggregations
    // -------------------------------------------------------------
    console.log('--- TEST SUITE 3: Aggregated Financial Summary ---');
    const finHeaders = generateInternalHeaders({ secret, method: 'GET', path: '/api/internal/v1/trading/financial-summary', tenantId: tenantA });
    const finRes = await makeRequest(baseUrl, 'GET', '/api/internal/v1/trading/financial-summary', finHeaders);
    assert(finRes.status === 200, 'GET /trading/financial-summary returns 200');
    assert(finRes.data?.total_turnover >= 25000, 'Turnover calculated from executed trades');
    assert(finRes.data?.total_users >= 1, 'Total users calculated correctly');
    assert(finRes.data?.data_state === 'authoritative', 'Financial summary reports authoritative data state');

    // -------------------------------------------------------------
    // Test 5: Client Identity Mapping & Account View
    // -------------------------------------------------------------
    console.log('--- TEST SUITE 4: Client Identity Mapping & Account View ---');
    const mapBody = {
      tradingUserId: userA,
      externalClientId: 'EXT-CL-999',
      externalClientCode: 'ALICE-01',
    };
    const mapHeaders = generateInternalHeaders({ secret, method: 'POST', path: '/api/internal/v1/trading/clients/map', body: mapBody, tenantId: tenantA });
    const mapRes = await makeRequest(baseUrl, 'POST', '/api/internal/v1/trading/clients/map', mapHeaders, mapBody);
    assert(mapRes.status === 200, 'POST /trading/clients/map returns 200');
    assert(mapRes.data?.mapping?.external_client_id === 'EXT-CL-999', 'Mapping saved external client ID');

    // Query account via external client ID
    const accHeaders = generateInternalHeaders({ secret, method: 'GET', path: '/api/internal/v1/trading/clients/EXT-CL-999/account', tenantId: tenantA });
    const accRes = await makeRequest(baseUrl, 'GET', '/api/internal/v1/trading/clients/EXT-CL-999/account', accHeaders);
    assert(accRes.status === 200, 'GET /trading/clients/:clientId/account resolves external client ID');
    assert(accRes.data?.trading_user_id === userA, 'Resolved to correct trading user ID');
    assert(accRes.data?.account?.equity > 0, 'Authoritative equity returned');

    // -------------------------------------------------------------
    // Test 6: Fund Transactions & Immutable Ledger
    // -------------------------------------------------------------
    console.log('--- TEST SUITE 5: Fund Management & Immutable Ledger ---');
    const depositBody = {
      userId: userA,
      type: 'DEPOSIT',
      amount: 50000,
      paymentMethod: 'UPI',
      referenceId: 'UPI-REF-12345',
    };
    const depReqHeaders = generateInternalHeaders({ secret, method: 'POST', path: '/api/internal/v1/trading/funds/request', body: depositBody, tenantId: tenantA });
    const depReqRes = await makeRequest(baseUrl, 'POST', '/api/internal/v1/trading/funds/request', depReqHeaders, depositBody);
    assert(depReqRes.status === 200, 'POST /trading/funds/request returns 200');
    const txId = depReqRes.data?.transaction?.id;
    assert(Boolean(txId), 'Deposit transaction ID generated');

    // Approve deposit
    const approveBody = {
      transactionId: txId,
      action: 'APPROVE',
      adminId: 'ADMIN-SUPER',
    };
    const approveHeaders = generateInternalHeaders({ secret, method: 'POST', path: '/api/internal/v1/trading/funds/process', body: approveBody, tenantId: tenantA });
    const approveRes = await makeRequest(baseUrl, 'POST', '/api/internal/v1/trading/funds/process', approveHeaders, approveBody);
    assert(approveRes.status === 200, 'POST /trading/funds/process approval returns 200');
    assert(approveRes.data?.transaction?.status === 'APPROVED', 'Transaction status is APPROVED');

    // Verify ledger entry
    const ledgerHeaders = generateInternalHeaders({ secret, method: 'GET', path: `/api/internal/v1/trading/clients/${userA}/ledger`, tenantId: tenantA });
    const ledgerRes = await makeRequest(baseUrl, 'GET', `/api/internal/v1/trading/clients/${userA}/ledger`, ledgerHeaders);
    assert(ledgerRes.status === 200, 'GET /trading/clients/:clientId/ledger returns 200');
    assert(ledgerRes.data?.ledger?.length >= 1, 'Immutable ledger contains approved deposit entry');
    assert(ledgerRes.data?.ledger[0]?.type === 'CREDIT', 'Ledger recorded CREDIT entry');

    // -------------------------------------------------------------
    // Test 7: Multi-Tenant Isolation
    // -------------------------------------------------------------
    console.log('--- TEST SUITE 6: Multi-Tenant Isolation ---');
    const tenantBOrdersHeaders = generateInternalHeaders({ secret, method: 'GET', path: '/api/internal/v1/trading/orders', tenantId: tenantB });
    const tenantBOrdersRes = await makeRequest(baseUrl, 'GET', '/api/internal/v1/trading/orders', tenantBOrdersHeaders);
    assert(tenantBOrdersRes.status === 200, 'Tenant B orders query succeeds');
    assert(tenantBOrdersRes.data?.orders?.length === 0, 'Tenant B sees 0 orders (isolated from Tenant A)');

    const tenantBMismatchHeaders = generateInternalHeaders({ secret, method: 'GET', path: `/api/internal/v1/trading/clients/${userA}/account`, tenantId: tenantB });
    const tenantBMismatchRes = await makeRequest(baseUrl, 'GET', `/api/internal/v1/trading/clients/${userA}/account`, tenantBMismatchHeaders);
    assert(tenantBMismatchRes.status === 404 || tenantBMismatchRes.status === 403, 'Cross-tenant account access blocked');

    console.log('\n================================================================');
    console.log(`PHASE 5K TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log('================================================================\n');

    if (testsFailed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } finally {
    server.close();
  }
}

runPhase5KTests().catch((err) => {
  console.error('[FATAL TEST ERROR]', err);
  process.exit(1);
});
