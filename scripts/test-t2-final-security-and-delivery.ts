/**
 * T2-FINAL Verification Test Suite: Security, Multi-Tenancy, HMAC, Outbox Persistence & Backfill
 */

import express from 'express';
import http from 'http';
import { db } from '../src/server/db/database.ts';
import { runMigrations } from '../src/server/db/migrationRunner.ts';
import { pgDb } from '../src/server/db/postgres.ts';
import { tenantRepository } from '../src/server/repositories/JsonTenantRepository.ts';
import {
  generateInternalHeaders,
  buildSignaturePayload,
  generateInternalHmac,
  internalNonceStore,
} from '../src/server/auth/internalAuth.ts';
import internalRouter from '../src/server/routes/internal/index.ts';
import { CentralAdminEventClient } from '../src/server/events/CentralAdminEventClient.ts';
import { transactionalOutboxService } from '../src/server/services/TransactionalOutboxService.ts';
import { postgresOutboxRepository } from '../src/server/repositories/trading/PostgresOutboxRepository.ts';
import { authoritativeTradingDataService } from '../src/server/services/authoritativeTradingDataService.ts';
import { tradingExecutionService } from '../src/server/services/TradingExecutionService.ts';
import { postgresWalletRepository } from '../src/server/repositories/trading/PostgresWalletRepository.ts';
import { authService } from '../src/server/services/authService.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, title: string, details?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${title}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${title}${details ? ` -> ${details}` : ''}`);
    failed++;
  }
}

async function runTestSuite() {
  console.log('\n================================================================');
  console.log('       T2-FINAL: SECURITY, HMAC, OUTBOX & BACKFILL TEST SUITE   ');
  console.log('================================================================\n');

  await runMigrations();

  const secret = process.env.INTERNAL_COMMUNICATION_SECRET || 'vertex_internal_comm_secret_test_key_32_chars_long!';
  process.env.INTERNAL_COMMUNICATION_SECRET = secret;

  // Spin up an Express server hosting the internal routes
  const app = express();
  app.use(express.json());
  app.use('/api/internal/v1', internalRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const runId = Date.now();
    const tenantA = `tenant-alpha-${runId}`;
    const tenantB = `tenant-beta-${runId}`;
    const userA = `user_alpha_${runId}`;
    const userB = `user_beta_${runId}`;

    await tenantRepository.createTenant({
      tenant: {
        id: tenantA,
        name: 'Alpha Tenant',
        slug: `alpha-${runId}`,
        customDomain: `alpha-${runId}.trading.test`,
        domains: [`alpha-${runId}.trading.test`],
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    await tenantRepository.createTenant({
      tenant: {
        id: tenantB,
        name: 'Beta Tenant',
        slug: `beta-${runId}`,
        customDomain: `beta-${runId}.trading.test`,
        domains: [`beta-${runId}.trading.test`],
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    // Seed users in Tenant A and Tenant B
    db.createUser({
      userId: userA,
      fullName: 'Alpha User One',
      email: `${userA}@test.com`,
      mobile: '9876543210',
      passwordHash: 'hash',
      tenantId: tenantA,
      status: 'active',
      isVerified: true,
      role: 'CLIENT',
    });

    db.createUser({
      userId: userB,
      fullName: 'Beta User One',
      email: `${userB}@test.com`,
      mobile: '9876543211',
      passwordHash: 'hash',
      tenantId: tenantB,
      status: 'active',
      isVerified: true,
      role: 'CLIENT',
    });

    await postgresWalletRepository.upsertWallet({
      tenant_id: tenantA,
      user_id: userA,
      available_balance: 100000,
      used_margin: 0,
      blocked_balance: 0,
      realized_pnl: 0,
    });

    await postgresWalletRepository.upsertWallet({
      tenant_id: tenantB,
      user_id: userB,
      available_balance: 200000,
      used_margin: 0,
      blocked_balance: 0,
      realized_pnl: 0,
    });

    // -----------------------------------------------------------------
    // Section 1: HMAC & Authentication Protocol Tests
    // -----------------------------------------------------------------
    console.log('--- Section 1: HMAC & Security Tests ---');

    // 1.1 Valid HMAC on GET /api/internal/v1/health
    const validHealthHeaders = generateInternalHeaders({
      secret,
      tenantId: tenantA,
      method: 'GET',
      path: '/api/internal/v1/health',
    });

    const res1 = await fetch(`${baseUrl}/api/internal/v1/health`, {
      method: 'GET',
      headers: validHealthHeaders,
    });
    assert(res1.status === 200, 'Valid HMAC request returns 200 OK');

    // 1.2 Missing HMAC signature
    const res2 = await fetch(`${baseUrl}/api/internal/v1/health`, {
      method: 'GET',
      headers: {
        'X-Tenant-ID': tenantA,
        'X-Internal-Timestamp': String(Date.now()),
        'X-Internal-Nonce': 'test-nonce-1',
      },
    });
    assert(res2.status === 401, 'Missing HMAC signature returns 401 Unauthorized');

    // 1.3 Invalid HMAC signature
    const res3 = await fetch(`${baseUrl}/api/internal/v1/health`, {
      method: 'GET',
      headers: {
        ...validHealthHeaders,
        'X-Internal-Signature': 'deadbeef0000111122223333444455556666777788889999aaaabbbbccccdddd',
      },
    });
    assert(res3.status === 401, 'Invalid HMAC signature returns 401 Unauthorized');

    // 1.4 Replayed Nonce
    const replayNonce = `nonce-replay-${Date.now()}`;
    const headersFirst = generateInternalHeaders({
      secret,
      tenantId: tenantA,
      method: 'GET',
      path: '/api/internal/v1/health',
      nonce: replayNonce,
    });

    const resFirst = await fetch(`${baseUrl}/api/internal/v1/health`, {
      method: 'GET',
      headers: headersFirst,
    });
    assert(resFirst.status === 200, 'First request with fresh nonce succeeds (200)');

    const resReplayed = await fetch(`${baseUrl}/api/internal/v1/health`, {
      method: 'GET',
      headers: headersFirst,
    });
    assert(resReplayed.status === 401, 'Replayed nonce is rejected with 401');

    // 1.5 Browser JWT Bearer rejection on S2S routes
    const resBearer = await fetch(`${baseUrl}/api/internal/v1/health`, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.jwt',
        'X-Tenant-ID': tenantA,
      },
    });
    assert(resBearer.status === 401, 'Bearer JWT token is rejected on internal S2S routes');

    // -----------------------------------------------------------------
    // Section 2: Tenant Isolation & Safety Tests
    // -----------------------------------------------------------------
    console.log('\n--- Section 2: Tenant Isolation & Safety Tests ---');

    // 2.1 Missing Tenant ID Header
    const headersNoTenant = {
      'X-Internal-Timestamp': String(Date.now()),
      'X-Internal-Nonce': `nonce-notenant-${Date.now()}`,
      'X-Internal-Signature': 'some-sig',
    };
    const resNoTenant = await fetch(`${baseUrl}/api/internal/v1/trading/summary`, {
      method: 'GET',
      headers: headersNoTenant,
    });
    assert(resNoTenant.status === 401 || resNoTenant.status === 400, 'Missing X-Tenant-ID is rejected');

    // 2.2 Cross-Tenant Mismatch in Request Body
    const mismatchBody = {
      tenantId: tenantB, // Header is tenantA, body is tenantB!
      name: 'Illegal Cross Tenant',
    };
    const mismatchHeaders = generateInternalHeaders({
      secret,
      tenantId: tenantA,
      method: 'POST',
      path: '/api/internal/v1/tenant/sync',
      body: mismatchBody,
    });
    const resMismatch = await fetch(`${baseUrl}/api/internal/v1/tenant/sync`, {
      method: 'POST',
      headers: {
        ...mismatchHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mismatchBody),
    });
    assert(resMismatch.status === 403, 'Cross-tenant mismatch between Header and Body is rejected with 403');

    // -----------------------------------------------------------------
    // Section 3: Authoritative Backfill Endpoints Tests
    // -----------------------------------------------------------------
    console.log('\n--- Section 3: Backfill Endpoints Verification ---');

    // 3.1 GET /api/internal/v1/trading/clients without HMAC
    const resClientsNoHmac = await fetch(`${baseUrl}/api/internal/v1/trading/clients?page=1&limit=10`);
    assert(resClientsNoHmac.status === 401, 'Backfill /clients without HMAC is rejected (401)');

    // 3.2 GET /api/internal/v1/trading/clients with valid HMAC for Tenant A
    const clientsHeadersA = generateInternalHeaders({
      secret,
      tenantId: tenantA,
      method: 'GET',
      path: '/api/internal/v1/trading/clients',
    });
    const resClientsA = await fetch(`${baseUrl}/api/internal/v1/trading/clients?page=1&limit=10`, {
      headers: clientsHeadersA,
    });
    const dataClientsA = await resClientsA.json();
    assert(resClientsA.status === 200, 'Backfill /clients for Tenant A succeeds (200)');
    assert(dataClientsA.tenant_id === tenantA, 'Backfill /clients returns data scoped to Tenant A');
    assert(dataClientsA.clients.some((c: any) => c.userId === userA), 'Tenant A includes userA');
    assert(!dataClientsA.clients.some((c: any) => c.userId === userB), 'Tenant A strictly DOES NOT leak userB');
    assert(dataClientsA.clients[0]?.passwordHash === undefined, 'Backfill /clients strictly DOES NOT return passwordHash');

    // 3.3 GET /api/internal/v1/trading/ledger with valid HMAC for Tenant A
    const ledgerHeadersA = generateInternalHeaders({
      secret,
      tenantId: tenantA,
      method: 'GET',
      path: '/api/internal/v1/trading/ledger',
    });
    const resLedgerA = await fetch(`${baseUrl}/api/internal/v1/trading/ledger?page=1&limit=10`, {
      headers: ledgerHeadersA,
    });
    const dataLedgerA = await resLedgerA.json();
    assert(resLedgerA.status === 200, 'Backfill /ledger succeeds (200)');
    assert(dataLedgerA.tenant_id === tenantA, 'Backfill /ledger scoped to Tenant A');

    // 3.4 GET /api/internal/v1/trading/funds with valid HMAC for Tenant A
    const fundsHeadersA = generateInternalHeaders({
      secret,
      tenantId: tenantA,
      method: 'GET',
      path: '/api/internal/v1/trading/funds',
    });
    const resFundsA = await fetch(`${baseUrl}/api/internal/v1/trading/funds?page=1&limit=10`, {
      headers: fundsHeadersA,
    });
    const dataFundsA = await resFundsA.json();
    assert(resFundsA.status === 200, 'Backfill /funds succeeds (200)');
    assert(dataFundsA.tenant_id === tenantA, 'Backfill /funds scoped to Tenant A');

    // -----------------------------------------------------------------
    // Section 4: End-to-End Event Delivery & Outbox Persistence
    // -----------------------------------------------------------------
    console.log('\n--- Section 4: Outbox Persistence & Event Delivery ---');

    // 4.1 Mock Central Admin Receiver Server
    const receivedEvents: any[] = [];
    const mockAdminApp = express();
    mockAdminApp.use(express.json());
    mockAdminApp.post('/api/internal/v1/events/:eventType', (req, res) => {
      receivedEvents.push({
        eventType: req.params.eventType,
        headers: req.headers,
        body: req.body,
      });
      res.json({ success: true, processed: true, eventId: req.body?.eventId });
    });

    const mockAdminServer = http.createServer(mockAdminApp);
    await new Promise<void>((resolve) => mockAdminServer.listen(0, resolve));
    const mockAdminPort = (mockAdminServer.address() as any).port;
    const mockAdminUrl = `http://127.0.0.1:${mockAdminPort}`;

    const testClient = new CentralAdminEventClient({
      baseUrl: mockAdminUrl,
      secret,
      maxRetries: 2,
    });

    // 4.2 Execute real trade operation -> outbox persistence
    const tradeOrder = await tradingExecutionService.placeOrder({
      tenantId: tenantA,
      userId: userA,
      symbol: 'TCS',
      side: 'BUY',
      lots: 1,
      orderType: 'MARKET',
    });
    assert(tradeOrder.success === true, 'Real trading operation placeOrder succeeded');

    // Give async outbox promise microtasks time to persist to PGlite
    await new Promise((r) => setTimeout(r, 100));

    // Verify outbox persistence in PostgresOutboxRepository
    const outboxRes = await pgDb.query('SELECT * FROM trading_outbox WHERE tenant_id = $1', [tenantA]);
    const allOutbox = (outboxRes.rows || []).map((r) => ({
      ...r,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
    }));

    const tradeOutbox = allOutbox.find((o) => o.event_type === 'trade.executed');
    assert(Boolean(tradeOutbox), 'trade.executed event successfully persisted in PostgreSQL outbox table');
    assert(tradeOutbox?.payload?.symbol === 'TCS', 'Outbox trade payload has symbol TCS');
    assert(tradeOutbox?.payload?.side === 'BUY', 'Outbox trade payload has side BUY');
    assert(tradeOutbox?.payload?.clientCode !== undefined, 'Outbox trade payload has clientCode');

    // Verify position.updated and wallet.updated in outbox
    const posOutbox = allOutbox.find((o) => o.event_type === 'position.updated');
    const walOutbox = allOutbox.find((o) => o.event_type === 'wallet.updated');
    assert(Boolean(posOutbox), 'position.updated event persisted in PostgreSQL outbox table');
    assert(Boolean(walOutbox), 'wallet.updated event persisted in PostgreSQL outbox table');

    // 4.3 Outbox Worker Delivery -> Signed Admin Request
    if (tradeOutbox) {
      const delivered = await testClient.sendEvent({
        eventId: tradeOutbox.event_id,
        eventType: tradeOutbox.event_type as any,
        tenantId: tradeOutbox.tenant_id,
        timestamp: tradeOutbox.created_at,
        version: 1,
        payload: tradeOutbox.payload,
      });
      assert(delivered.success === true, 'Outbox event delivered to Central Admin with HMAC signature');
      assert(receivedEvents.length > 0, 'Central Admin received the signed event payload');
      const lastReceived = receivedEvents[receivedEvents.length - 1];
      assert(lastReceived.headers['x-internal-signature'] !== undefined, 'Request includes X-Internal-Signature');
      assert(lastReceived.headers['x-internal-nonce'] !== undefined, 'Request includes X-Internal-Nonce');
      assert(lastReceived.headers['x-tenant-id'] === tenantA, 'Request includes authoritative X-Tenant-ID');
      assert(lastReceived.body.payload.symbol === 'TCS', 'Central Admin received intact trade payload');
    }

    // 4.4 Deposit creation outbox delivery
    const fundTx = await authoritativeTradingDataService.createFundTransaction(
      tenantA,
      userA,
      'DEPOSIT',
      25000,
      'UPI',
      'REF-E2E-123'
    );
    assert(fundTx.status === 'PENDING', 'Deposit transaction created');

    await new Promise((r) => setTimeout(r, 100));

    const fundOutboxRes = await pgDb.query('SELECT * FROM trading_outbox WHERE tenant_id = $1 AND event_type = $2', [tenantA, 'deposit.created']);
    const fundOutbox = fundOutboxRes.rows?.[0];
    assert(Boolean(fundOutbox), 'deposit.created persisted in PostgreSQL outbox');

    // Close mock servers
    await new Promise((res) => mockAdminServer.close(res));
    await new Promise((res) => server.close(res));

    console.log('\n================================================================');
    console.log(`T2-FINAL TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err: any) {
    console.error('[FATAL TEST SUITE ERROR]', err);
    try {
      server.close();
    } catch {}
    process.exit(1);
  }
}

runTestSuite();
