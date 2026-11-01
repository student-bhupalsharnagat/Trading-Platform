/**
 * Integration Test Suite for Manual Deposit & Admin Approval Feature
 * Bank Transfer / QR Code with UTR/TxnID Verification
 */

import http from 'http';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { pgDb } from '../src/server/db/postgres.ts';
import { runTradingMigrations } from '../src/server/db/migrationRunner.ts';
import { manualDepositService } from '../src/server/services/ManualDepositService.ts';
import { postgresManualDepositRepository } from '../src/server/repositories/trading/PostgresManualDepositRepository.ts';
import { postgresWalletRepository } from '../src/server/repositories/trading/PostgresWalletRepository.ts';
import depositRoutes from '../src/server/routes/depositRoutes.ts';
import adminRoutes from '../src/server/routes/admin/index.ts';
import { authService } from '../src/server/services/authService.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'vertex_jwt_secret_dev_2026';
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
): Promise<{ status: number; data: any }> {
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
        let parsed: any;
        try {
          parsed = JSON.parse(resData);
        } catch {
          parsed = resData;
        }
        resolve({
          status: res.statusCode || 500,
          data: parsed,
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('  TEST SUITE: Manual Deposit / Admin Approval (Bank & QR / UTR)  ');
  console.log('================================================================\n');

  // 1. Database & Migrations Initialization
  console.log('[Step 1] Initializing Postgres & Migrations...');
  await pgDb.init();
  await runTradingMigrations();
  assert(true, 'Postgres database initialized and migrations applied');

  // 2. Setup Test User & Admin in Postgres
  const testTenantId = 'vertex-default';
  const testUserId = `usr_test_${Date.now()}`;
  const testUserMobile = '9876543210';
  const testUserName = 'Trader Arjun';

  // Ensure user and admin exist in Postgres
  await pgDb.query(
    `INSERT INTO users (id, tenant_id, full_name, user_id, mobile, role, demo_balance, is_verified, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'CLIENT', 50000, true, 'active', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [testUserId, testTenantId, testUserName, testUserId, testUserMobile]
  );
  await pgDb.query(
    `INSERT INTO users (id, tenant_id, full_name, user_id, mobile, role, demo_balance, is_verified, status, created_at, updated_at)
     VALUES ('admin_1', $1, 'Super Administrator', 'admin_1', '9999999999', 'SUPER_ADMIN', 0, true, 'active', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [testTenantId]
  );
  await pgDb.query(
    `INSERT INTO trading_wallets (id, user_id, tenant_id, available_balance, blocked_balance, updated_at)
     VALUES ($1, $2, $3, 50000, 0, NOW())
     ON CONFLICT (tenant_id, user_id) DO NOTHING`,
    [`wal_${testUserId}`, testUserId, testTenantId]
  );

  const initialWallet = await postgresWalletRepository.getWallet(testTenantId, testUserId);
  const startingBalance = initialWallet ? Number(initialWallet.available_balance) : 50000;
  console.log(`  Initial wallet balance for ${testUserId}: ₹${startingBalance}`);

  // 3. Test Service Layer: Payment Settings
  console.log('\n[Step 2] Testing Payment Settings Service...');
  const settings = await manualDepositService.getPaymentDetails(testTenantId);
  assert(!!settings, 'Payment settings retrieved successfully');
  assert(typeof settings.bank_name === 'string' && settings.bank_name.length > 0, 'Bank name is configured');
  assert(typeof settings.account_number === 'string', 'Account number is configured');
  assert(typeof settings.ifsc_code === 'string', 'IFSC code is configured');
  assert(typeof settings.qr_code_url === 'string', 'QR Code URL is configured');

  // 4. Test Service Layer: Validation on Create Deposit Request
  console.log('\n[Step 3] Testing Deposit Request Validation & Idempotency...');
  
  // Test: Zero/negative amount rejected
  let zeroAmtErr: any = null;
  try {
    await manualDepositService.submitManualRequest(testTenantId, { userId: testUserId }, {
      amount: 0,
      utr_number: 'UTR0000000000',
      payment_method: 'BANK_TRANSFER',
    });
  } catch (err) {
    zeroAmtErr = err;
  }
  assert(!!zeroAmtErr, 'Zero/negative amount is rejected');

  // Test: Short/empty UTR rejected
  let invalidUtrErr: any = null;
  try {
    await manualDepositService.submitManualRequest(testTenantId, { userId: testUserId }, {
      amount: 5000,
      utr_number: '123',
      payment_method: 'BANK_TRANSFER',
    });
  } catch (err) {
    invalidUtrErr = err;
  }
  assert(!!invalidUtrErr, 'Short UTR (< 6 chars) is rejected');

  // Test: Valid submission
  const validUtr1 = `UTR${Date.now()}A`;
  const req1 = await manualDepositService.submitManualRequest(
    testTenantId,
    { userId: testUserId, fullName: testUserName, mobile: testUserMobile },
    {
      amount: 25000,
      utr_number: validUtr1,
      payment_method: 'BANK_TRANSFER',
    }
  );
  assert(req1.status === 'PENDING', 'Deposit request created with status PENDING');
  assert(Number(req1.amount) === 25000, 'Deposit request amount stored correctly');
  assert(req1.utr_number === validUtr1, 'Deposit request UTR stored correctly');

  // Test: Idempotency (Duplicate UTR rejected)
  let dupUtrErr: any = null;
  try {
    await manualDepositService.submitManualRequest(
      testTenantId,
      { userId: testUserId, fullName: testUserName, mobile: testUserMobile },
      {
        amount: 25000,
        utr_number: validUtr1,
        payment_method: 'BANK_TRANSFER',
      }
    );
  } catch (err) {
    dupUtrErr = err;
  }
  assert(!!dupUtrErr, 'Duplicate UTR submission is blocked (Idempotency enforced)');

  // 5. Test Service Layer: User Request Listing
  console.log('\n[Step 4] Testing User & Admin Request Listing...');
  const userRequests = await manualDepositService.getUserRequests(testTenantId, testUserId);
  assert(userRequests.length >= 1, 'User can retrieve their own deposit requests');
  assert(userRequests.some((r) => r.utr_number === validUtr1), 'Submitted request appears in user list');

  const adminList = await manualDepositService.getAdminRequests(testTenantId, { status: 'PENDING' });
  assert(adminList.pendingCount >= 1, 'Admin pending count reflects pending request');
  assert(adminList.requests.some((r) => r.id === req1.id), 'Admin list contains the new pending request');

  // 6. Test Service Layer: Atomic Approval & Balance Crediting
  console.log('\n[Step 5] Testing Atomic Approval & Balance Credit...');
  const adminActor = { userId: 'admin_super', fullName: 'Super Administrator', role: 'SUPER_ADMIN' };
  const approvedReq = await manualDepositService.approveRequest(
    testTenantId,
    req1.id,
    adminActor
  );
  assert(approvedReq.status === 'APPROVED', 'Request status updated to APPROVED');
  assert(approvedReq.approved_by === 'admin_super', 'approved_by recorded correctly');

  // Verify wallet balance is atomically credited
  const updatedWallet = await postgresWalletRepository.getWallet(testTenantId, testUserId);
  const newBalance = Number(updatedWallet?.available_balance);
  assert(newBalance === startingBalance + 25000, `Wallet credited by ₹25,000 (Was: ₹${startingBalance}, Now: ₹${newBalance})`);

  // Verify double-approval is blocked
  let doubleApproveErr: any = null;
  try {
    await manualDepositService.approveRequest(
      testTenantId,
      req1.id,
      adminActor
    );
  } catch (err) {
    doubleApproveErr = err;
  }
  assert(!!doubleApproveErr, 'Double-approval of already approved request is blocked');

  // 7. Test Service Layer: Rejection (No Balance Change)
  console.log('\n[Step 6] Testing Rejection Workflow...');
  const validUtr2 = `UTR${Date.now()}B`;
  const req2 = await manualDepositService.submitManualRequest(
    testTenantId,
    { userId: testUserId, fullName: testUserName, mobile: testUserMobile },
    {
      amount: 10000,
      utr_number: validUtr2,
      payment_method: 'QR_CODE',
    }
  );
  assert(req2.status === 'PENDING', 'Second deposit request created');

  const rejectedReq = await manualDepositService.rejectRequest(
    testTenantId,
    req2.id,
    adminActor,
    'UTR not found in bank statement'
  );
  assert(rejectedReq.status === 'REJECTED', 'Request status updated to REJECTED');
  assert(rejectedReq.rejection_reason === 'UTR not found in bank statement', 'Rejection reason saved');

  // Verify wallet balance is NOT modified on rejection
  const walletAfterReject = await postgresWalletRepository.getWallet(testTenantId, testUserId);
  assert(Number(walletAfterReject?.available_balance) === newBalance, 'Wallet balance remains unchanged on rejection');

  // Verify double-rejection or approval of rejected request is blocked
  let doubleRejectErr: any = null;
  try {
    await manualDepositService.rejectRequest(
      testTenantId,
      req2.id,
      adminActor,
      'Again'
    );
  } catch (err) {
    doubleRejectErr = err;
  }
  assert(!!doubleRejectErr, 'Re-rejecting a finalized request is blocked');

  // 8. Test Express HTTP Endpoints End-to-End
  console.log('\n[Step 7] Testing HTTP Endpoints End-to-End...');
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // Mount deposit user routes & admin routes
  app.use('/api/deposit', depositRoutes);
  app.use('/api/admin', adminRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`  Test HTTP server running at ${baseUrl}`);

  // Generate valid tokens using authService
  const userToken = authService.generateToken({
    id: testUserId,
    user_id: testUserId,
    full_name: testUserName,
    role: 'CLIENT',
    tenant_id: testTenantId,
    is_verified: true,
    status: 'active',
  });
  const adminToken = authService.generateToken({
    id: 'admin_1',
    user_id: 'admin_1',
    full_name: 'SuperAdmin',
    role: 'SUPER_ADMIN',
    tenant_id: testTenantId,
    is_verified: true,
    status: 'active',
  });

  // Test 8A: GET /api/deposit/payment-details (Public / User)
  const detailsRes = await makeRequest(baseUrl, 'GET', '/api/deposit/payment-details', {
    Authorization: `Bearer ${userToken}`,
  });
  assert(detailsRes.status === 200 && detailsRes.data.success, 'HTTP GET /api/deposit/payment-details returns 200');
  assert(!!detailsRes.data.data.account_number, 'HTTP payment-details payload has bank account');

  // Test 8B: POST /api/deposit/manual-request (User)
  const httpUtr = `UTR${Date.now()}HTTP`;
  const submitRes = await makeRequest(
    baseUrl,
    'POST',
    '/api/deposit/manual-request',
    { Authorization: `Bearer ${userToken}` },
    {
      amount: 50000,
      utr_number: httpUtr,
      payment_method: 'BANK_TRANSFER',
    }
  );
  assert(submitRes.status === 201 && submitRes.data.success, 'HTTP POST /api/deposit/manual-request creates request (201)');
  const httpReqId = submitRes.data.data.id;

  // Test 8C: Duplicate submission over HTTP returns 409 Conflict
  const dupSubmitRes = await makeRequest(
    baseUrl,
    'POST',
    '/api/deposit/manual-request',
    { Authorization: `Bearer ${userToken}` },
    {
      amount: 50000,
      utr_number: httpUtr,
      payment_method: 'BANK_TRANSFER',
    }
  );
  assert(dupSubmitRes.status === 409, 'HTTP duplicate UTR returns 409 Conflict');

  // Test 8D: GET /api/deposit/my-requests (User)
  const myReqsRes = await makeRequest(baseUrl, 'GET', '/api/deposit/my-requests', {
    Authorization: `Bearer ${userToken}`,
  });
  assert(myReqsRes.status === 200 && Array.isArray(myReqsRes.data.data), 'HTTP GET /api/deposit/my-requests returns 200');
  assert(myReqsRes.data.data.some((r: any) => r.utr_number === httpUtr), 'User requests list includes newly submitted UTR');

  // Test 8E: Non-admin trying to approve gets 403
  const unauthorizedApprove = await makeRequest(
    baseUrl,
    'POST',
    `/api/admin/deposit-requests/${httpReqId}/approve`,
    { Authorization: `Bearer ${userToken}` }
  );
  assert(unauthorizedApprove.status === 403, 'Non-admin user blocked from approving (403 Forbidden)');

  // Test 8F: Admin GET /api/admin/deposit-requests
  const adminReqsRes = await makeRequest(baseUrl, 'GET', '/api/admin/deposit-requests?status=PENDING', {
    Authorization: `Bearer ${adminToken}`,
  });
  assert(adminReqsRes.status === 200 && adminReqsRes.data.success, 'HTTP GET /api/admin/deposit-requests returns 200');
  assert(adminReqsRes.data.pendingCount >= 1, 'Admin pendingCount is accurate');

  // Test 8G: Admin POST /api/admin/deposit-requests/:id/approve
  const approveHttpRes = await makeRequest(
    baseUrl,
    'POST',
    `/api/admin/deposit-requests/${httpReqId}/approve`,
    { Authorization: `Bearer ${adminToken}` }
  );
  assert(approveHttpRes.status === 200 && approveHttpRes.data.success, 'HTTP POST approve returns 200');
  assert(approveHttpRes.data.data.status === 'APPROVED', 'Request status is APPROVED');

  // Test 8H: Admin PUT /api/admin/payment-settings
  const updateSettingsRes = await makeRequest(
    baseUrl,
    'PUT',
    '/api/admin/payment-settings',
    { Authorization: `Bearer ${adminToken}` },
    {
      bank_name: 'HDFC Bank Corp',
      account_name: 'Vertex Clearing Ltd',
      account_number: '50200099887766',
      ifsc_code: 'HDFC0004321',
      upi_id: 'vertex.clearing@hdfcbank',
      qr_code_url: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi-test',
    }
  );
  assert(updateSettingsRes.status === 200 && updateSettingsRes.data.success, 'HTTP PUT /api/admin/payment-settings updates settings');
  assert(updateSettingsRes.data.data.account_number === '50200099887766', 'Updated bank account persists');

  // Clean up server
  server.close();

  console.log('\n================================================================');
  console.log(`  TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED  `);
  console.log('================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error during test execution:', err);
  process.exit(1);
});
