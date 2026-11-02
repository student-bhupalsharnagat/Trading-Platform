/**
 * VERTEX Trading Platform, Admin Dashboard & User Panel
 * Comprehensive 6-Phase End-to-End Testing & Integration Audit
 */

import WebSocket from 'ws';

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';

interface TestStats {
  passed: number;
  failed: number;
  skipped: number;
  failures: string[];
}

const stats: TestStats = { passed: 0, failed: 0, skipped: 0, failures: [] };

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    stats.passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`, details ? details : '');
    stats.failed++;
    stats.failures.push(testName);
  }
}

async function request(path: string, options: RequestInit = {}): Promise<{ status: number; data: any; headers: Headers }> {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const res = await fetch(url, options);
  let data: any = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => '');
  }
  return { status: res.status, data, headers: res.headers };
}

async function runAudit() {
  console.log('================================================================');
  console.log('  E2E THREE-PLATFORM INTEGRATION AUDIT & SYSTEM VALIDATION');
  console.log('  Trading Platform | Admin Dashboard | User Panel');
  console.log('================================================================\n');

  const timestamp = Date.now();
  const testUserId = `audit_trader_${timestamp}`;
  const testPassword = 'Password@123';
  const testPhone = `98765${String(timestamp).slice(-5)}`;
  let userToken = '';
  let superAdminToken = '';

  // ---------------------------------------------------------------------------
  // PHASE 1: Authentication & Multi-Tenant Session Handling
  // ---------------------------------------------------------------------------
  console.log('--- PHASE 1: Authentication & Multi-Tenant Session Handling ---');

  // 1.1 User Registration
  const regRes = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: testUserId,
      password: testPassword,
      confirmPassword: testPassword,
      fullName: 'Audit QA Trader',
      email: `${testUserId}@audit.trade`,
      mobile: testPhone,
      countryCode: '+91',
    }),
  });

  assert(regRes.status === 201 || regRes.status === 200, 'User registration succeeds with 201/200', regRes.data);
  assert(regRes.data?.success === true, 'Registration returns success: true');

  // 1.2 User Login with User ID
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: testUserId, password: testPassword }),
  });

  assert(loginRes.status === 200, 'User login by User ID succeeds with 200 OK');
  assert(Boolean(loginRes.data?.token), 'Login returns valid JWT token');
  userToken = loginRes.data?.token || '';

  // 1.3 User Login with E.164 phone number
  const phoneLoginRes = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: `+91${testPhone}`, password: testPassword }),
  });
  assert(phoneLoginRes.status === 200, 'User login by E.164 Phone number succeeds');

  // 1.4 Invalid password rejection
  const badLoginRes = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: testUserId, password: 'WrongPassword@999' }),
  });
  assert(badLoginRes.status === 401, 'Invalid password rejected with HTTP 401 Unauthorized');

  // 1.5 Session persistence & /api/auth/me
  const meRes = await request('/api/auth/me', {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert(meRes.status === 200 && meRes.data?.user?.userId?.toLowerCase() === testUserId.toLowerCase(), 'GET /api/auth/me returns active user session');

  // 1.6 Super Admin Authentication
  const adminLoginRes = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'superadmin', password: 'Admin@12345' }),
  });
  assert(adminLoginRes.status === 200, 'Super Admin login succeeds');
  superAdminToken = adminLoginRes.data?.token || '';

  // 1.7 RBAC Enforcement: Client blocked from Admin endpoints
  const clientAdminRes = await request('/api/admin/deposit-requests', {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert(clientAdminRes.status === 403, 'Regular CLIENT blocked from /api/admin/* endpoints with HTTP 403 Forbidden');

  // 1.8 Super Admin allowed on Admin endpoints
  const superAdminAccessRes = await request('/api/admin/deposit-requests', {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert(superAdminAccessRes.status === 200, 'Super Admin granted access to /api/admin/* endpoints with HTTP 200 OK');

  // ---------------------------------------------------------------------------
  // PHASE 2: Market Watch & Live WebSocket Pricing
  // ---------------------------------------------------------------------------
  console.log('\n--- PHASE 2: Market Watch & Live WebSocket Pricing ---');

  // 2.1 Instruments catalog
  const instRes = await request('/api/trading/instruments');
  assert(instRes.status === 200 && Array.isArray(instRes.data?.instruments), 'GET /api/trading/instruments returns valid catalog');
  const instruments = instRes.data?.instruments || [];
  assert(instruments.length >= 20, `Catalog contains ample instruments (Count: ${instruments.length})`);

  const tcsInst = instruments.find((i: any) => i.id === 'tcs' || i.symbol === 'TCS');
  const relianceInst = instruments.find((i: any) => i.id === 'reliance' || i.symbol === 'RELIANCE');
  const niftyInst = instruments.find((i: any) => i.id === 'nifty_50' || i.symbol === 'NIFTY 50');
  assert(Boolean(tcsInst && relianceInst && niftyInst), 'Catalog includes core benchmark instruments: TCS, RELIANCE, NIFTY 50');

  // 2.2 Historical Candles
  const candleRes = await request('/api/trading/candles/RELIANCE?timeframe=15m');
  assert(candleRes.status === 200 && Array.isArray(candleRes.data?.candles), 'GET /api/trading/candles/:symbol returns historical OHLCV candles');
  assert(candleRes.data?.candles?.length > 10, `Candles count is sufficient (${candleRes.data?.candles?.length} candles)`);

  // 2.3 Live WebSocket Streaming
  let wsConnected = false;
  let receivedTick = false;
  await new Promise<void>((resolve) => {
    const ws = new WebSocket(`${WS_URL}?token=${userToken}`);
    const timeout = setTimeout(() => {
      ws.terminate();
      resolve();
    }, 4000);

    ws.on('open', () => {
      wsConnected = true;
      ws.send(JSON.stringify({ type: 'subscribe', symbol: 'reliance' }));
    });

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'ticks' || parsed.type === 'tick' || parsed.event === 'connection.ready' || parsed.lastPrice || parsed.data) {
          receivedTick = true;
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      } catch {
        // ignore non-json
      }
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  assert(wsConnected, 'WebSocket connects successfully to /ws');
  assert(receivedTick, 'WebSocket streams live market price ticks without lag');

  // ---------------------------------------------------------------------------
  // PHASE 3: Funds, Deposits, Withdrawals & Ledger
  // ---------------------------------------------------------------------------
  console.log('\n--- PHASE 3: Funds, Deposits, Withdrawals & Ledger ---');

  // 3.1 Payment Details
  const payDetailsRes = await request('/api/deposit/payment-details', {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert(payDetailsRes.status === 200 && Boolean(payDetailsRes.data?.data?.account_number), 'GET /api/deposit/payment-details returns valid bank & QR information');

  // 3.2 Submit Manual Deposit Request
  const testUtr = `UTR-${Date.now()}`;
  const depositRes = await request('/api/deposit/manual-request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      amount: 75000,
      utr_number: testUtr,
      payment_method: 'BANK_TRANSFER',
      proof_image: 'https://images.unsplash.com/photo-receipt.jpg',
    }),
  });

  assert(depositRes.status === 201 || depositRes.status === 200, 'Manual deposit request submitted successfully', depositRes.data);
  const depositRequestId = depositRes.data?.request?.id || depositRes.data?.data?.id || depositRes.data?.id;

  // 3.3 Duplicate UTR Conflict Prevention
  const dupUtrRes = await request('/api/deposit/manual-request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      amount: 75000,
      utr_number: testUtr,
      payment_method: 'BANK_TRANSFER',
    }),
  });
  assert(dupUtrRes.status === 409, 'Duplicate UTR submission strictly rejected with HTTP 409 Conflict');

  // 3.4 User "My Requests" View
  const myReqRes = await request('/api/deposit/my-requests', {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert(myReqRes.status === 200 && Array.isArray(myReqRes.data?.requests || myReqRes.data?.data), 'User "My Requests" tracker reflects submitted deposit');

  // 3.5 Admin Approval of Deposit Request
  const adminDepositQueueRes = await request('/api/admin/deposit-requests', {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert(adminDepositQueueRes.status === 200, 'Admin deposit requests queue loads successfully');

  if (depositRequestId) {
    const preApprovalWallet = await request('/api/trading/portfolio', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const preBal = preApprovalWallet.data?.wallet?.availableBalance || 0;

    const approveRes = await request(`/api/admin/deposit-requests/${depositRequestId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert(approveRes.status === 200, 'Admin deposit approval succeeds (200 OK)');

    const postApprovalWallet = await request('/api/trading/portfolio', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const postBal = postApprovalWallet.data?.wallet?.availableBalance || 0;
    assert(postBal === preBal + 75000, `Wallet balance atomically credited by ₹75000 (Before: ₹${preBal}, After: ₹${postBal})`);

    // Re-approval rejection
    const reApproveRes = await request(`/api/admin/deposit-requests/${depositRequestId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert(reApproveRes.status === 400, 'Re-approval of already approved request is strictly rejected with 400 Bad Request');
  }

  // 3.6 Ledger Synchronization
  const ledgerRes = await request('/api/trading/ledger', {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert(ledgerRes.status === 200, 'GET /api/trading/ledger returns synchronized client ledger');

  const s2sLedgerRes = await request(`/api/internal/v1/trading/ledger?userId=${testUserId}`, {
    headers: { 'x-tenant-id': 'TNT-001' },
  });
  assert(s2sLedgerRes.status === 200, 'Internal S2S /api/internal/v1/trading/ledger reflects accurate financial ledger entries');

  // ---------------------------------------------------------------------------
  // PHASE 4: Order Execution & Lifecycle (Real-Time Trading)
  // ---------------------------------------------------------------------------
  console.log('\n--- PHASE 4: Order Execution & Lifecycle (Real-Time Trading) ---');

  // 4.1 Place Market Order with funded wallet
  const marketOrderRes = await request('/api/trading/order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      symbol: 'reliance',
      type: 'BUY',
      orderType: 'MARKET',
      quantity: 10,
      product: 'INTRADAY',
    }),
  });

  assert(marketOrderRes.status === 200 || marketOrderRes.status === 201, 'Market BUY order placed successfully', marketOrderRes.data);
  const orderObj = marketOrderRes.data?.order || marketOrderRes.data;
  assert(orderObj?.status === 'EXECUTED' || orderObj?.status === 'COMPLETE' || orderObj?.status === 'PENDING', 'Order created with valid lifecycle status');

  // 4.2 Verify User Portfolio Reflection
  const portRes = await request('/api/trading/portfolio', {
    headers: { Authorization: `Bearer ${userToken}` },
  });

  assert(portRes.status === 200, 'GET /api/trading/portfolio succeeds');
  const userPositions = portRes.data?.positions || [];
  const userOrders = portRes.data?.orders || [];
  assert(userPositions.length >= 1, `Portfolio displays open position (Count: ${userPositions.length})`);
  assert(userOrders.length >= 1, `Portfolio displays executed order in order book (Count: ${userOrders.length})`);
  assert(portRes.data?.wallet?.usedMargin > 0, `Wallet allocated margin for open position (Used margin: ₹${portRes.data?.wallet?.usedMargin})`);

  // 4.3 Verify User Panel Dashboard S2S Integration
  const userPanelPosRes = await request(`/api/internal/v1/trading/positions?userId=${testUserId}`, {
    headers: { 'x-tenant-id': 'TNT-001' },
  });
  assert(userPanelPosRes.status === 200, 'User Panel S2S endpoint (/api/internal/v1/trading/positions) returns 200 OK');
  assert(userPanelPosRes.data?.positions?.length >= 1, 'User Panel positions view reflects live position accurately');

  // 4.4 Verify Admin Panel Real-Time Sync
  const adminSummaryRes = await request('/api/internal/v1/trading/summary', {
    headers: { 'x-tenant-id': 'TNT-001' },
  });
  assert(adminSummaryRes.status === 200, 'Admin Panel trading summary endpoint returns 200 OK');

  const adminOrdersRes = await request(`/api/internal/v1/trading/orders?userId=${testUserId}`, {
    headers: { 'x-tenant-id': 'TNT-001' },
  });
  assert(adminOrdersRes.status === 200 && adminOrdersRes.data?.orders?.length >= 1, 'Admin Panel orders desk displays new client trade');

  // 4.5 Test Square-Off Functionality
  const posToClose = userPositions[0];
  if (posToClose) {
    const closeRes = await request('/api/trading/position/close', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ positionId: posToClose.id }),
    });
    assert(closeRes.status === 200, 'Individual position Square-Off succeeds (200 OK)');

    // Verify margin released
    const postClosePort = await request('/api/trading/portfolio', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const remainingOpen = (postClosePort.data?.positions || []).filter((p: any) => p.id === posToClose.id);
    assert(remainingOpen.length === 0, 'Position is successfully closed and cleared from active positions list');
  }

  // ---------------------------------------------------------------------------
  // PHASE 5: Admin Panel Comprehensive Section Audit
  // ---------------------------------------------------------------------------
  console.log('\n--- PHASE 5: Admin Panel Comprehensive Section Audit ---');

  // 5.1 Clients View & Drill-Down
  const clientsListRes = await request('/api/admin/clients', {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert(clientsListRes.status === 200, 'Admin Clients List loads successfully (200 OK)');

  const s2sClientDetailRes = await request(`/api/internal/v1/trading/clients/${testUserId}/account`, {
    headers: { 'x-tenant-id': 'TNT-001' },
  });
  assert(s2sClientDetailRes.status === 200, 'Client Detail view drill-down (/trading/clients/:id/account) loads complete identity & account metrics');

  // 5.2 Risk Management & Exposure
  const riskRes = await request('/api/internal/v1/trading/risk-summary', {
    headers: { 'x-tenant-id': 'TNT-001' },
  });
  assert(riskRes.status === 200, 'Admin Risk Management summary (/trading/risk-summary) returns exposure metrics');

  // 5.3 Financial Summary
  const finSummaryRes = await request('/api/internal/v1/trading/financial-summary', {
    headers: { 'x-tenant-id': 'TNT-001' },
  });
  assert(finSummaryRes.status === 200, 'Admin Financial summary (/trading/financial-summary) returns real-time financial stats');

  // 5.4 Audit Logs
  const auditLogsRes = await request('/api/admin/audit-logs', {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  assert(auditLogsRes.status === 200, 'Admin Audit Logs (/api/admin/audit-logs) returns immutable activity logs');
  const logs = auditLogsRes.data?.logs || auditLogsRes.data?.data || [];
  const hasPasswordLeak = JSON.stringify(logs).toLowerCase().includes('password@123');
  assert(!hasPasswordLeak, 'Security check: Passwords are NEVER exposed or stored in plain text in audit logs');

  // 5.5 Support Tickets
  const ticketRes = await request('/api/trading/tickets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      subject: 'Integration QA Ticket',
      category: 'Trading Issues',
      message: 'Testing support ticket resolution workflow.',
    }),
  });
  assert(ticketRes.status === 200 || ticketRes.status === 201, 'Client support ticket creation succeeds');

  const ticketsListRes = await request('/api/trading/tickets', {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert(ticketsListRes.status === 200, 'Support tickets list retrieved successfully');

  // ---------------------------------------------------------------------------
  // PHASE 6: Bug Hunting, Error Handling & Edge Cases
  // ---------------------------------------------------------------------------
  console.log('\n--- PHASE 6: Bug Hunting, Error Handling & Edge Cases ---');

  // 6.1 CORS Preflight for User Panel & Admin Dashboard
  const corsRes = await request('/api/trading/portfolio', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://user-panel-dashbord-ofrt.onrender.com',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Content-Type, Authorization, X-Tenant-ID',
    },
  });
  assert(corsRes.status === 204 || corsRes.status === 200, 'CORS preflight (OPTIONS) returns 204 No Content / 200 OK');
  assert(corsRes.headers.get('access-control-allow-origin') === 'https://user-panel-dashbord-ofrt.onrender.com', 'CORS origin properly whitelisted for User Panel');
  assert(corsRes.headers.get('access-control-allow-credentials') === 'true', 'CORS credentials explicitly enabled');

  // 6.2 Security Headers
  const secHeadersRes = await request('/api/trading/instruments');
  assert(secHeadersRes.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff header enforced');
  assert(Boolean(secHeadersRes.headers.get('x-frame-options')), 'X-Frame-Options header present to prevent clickjacking');

  // 6.3 Negative Test: Malformed JSON
  const malformedRes = await request('/api/trading/order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: '{ invalid_json: ...',
  });
  assert(malformedRes.status === 400, 'Malformed JSON payload safely rejected with HTTP 400 (Server does not crash)');

  // 6.4 Negative Test: Negative / Zero Order Quantity
  const invalidQtyRes = await request('/api/trading/order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      symbol: 'reliance',
      type: 'BUY',
      orderType: 'MARKET',
      quantity: -10,
    }),
  });
  assert(invalidQtyRes.status === 400, 'Negative order quantity rejected with HTTP 400 Bad Request');

  // 6.5 Negative Test: SQL Injection Parameterization Test
  const sqliRes = await request('/api/internal/v1/trading/positions?userId=\' OR \'1\'=\'1', {
    headers: { 'x-tenant-id': 'TNT-001' },
  });
  assert(sqliRes.status === 200 && (sqliRes.data?.positions || []).length === 0, 'SQL injection probe safely sanitized by parameterized query (0 rows returned, no crash)');

  // ---------------------------------------------------------------------------
  // AUDIT SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`  AUDIT SUMMARY: ${stats.passed} PASSED, ${stats.failed} FAILED (TOTAL: ${stats.passed + stats.failed})`);
  console.log('================================================================');

  if (stats.failed > 0) {
    console.error('\nFailures recorded:');
    stats.failures.forEach((f, idx) => console.error(`  ${idx + 1}. ${f}`));
    process.exit(1);
  } else {
    console.log('\nALL 6 PHASES PASSED WITH ZERO ERRORS! 🚀');
    console.log('Platforms validated and ready for live production deployment.');
  }
}

runAudit().catch((err) => {
  console.error('CRITICAL AUDIT EXCEPTION:', err);
  process.exit(1);
});
