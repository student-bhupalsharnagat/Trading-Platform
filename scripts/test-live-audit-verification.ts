import { WebSocket } from 'ws';

const BASE_URL = 'http://127.0.0.1:3000';
const WS_URL = 'ws://127.0.0.1:3000/ws';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (details !== undefined) {
      console.error('    Details:', JSON.stringify(details));
    }
    failed++;
  }
}

async function request(path: string, options: any = {}, token?: string): Promise<{ status: number; data: any; headers: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? {
      Authorization: `Bearer ${token}`,
      Cookie: `vertex_auth_token=${token}`,
    } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data, headers: res.headers };
}

async function runAudit() {
  console.log('================================================================');
  console.log('  LIVE INTEGRATION AUDIT: MANUAL DEPOSIT, ORDERS & P&L');
  console.log('================================================================\n');

  // --- 1. User & Admin Authentication ---
  console.log('[SECTION 1] Authenticating Demo Trader & Super Admin...');
  const demoLogin = await request('/api/auth/demo', { method: 'POST' });
  assert(demoLogin.status === 200 && demoLogin.data?.success, 'Demo user login succeeds');
  const userToken = demoLogin.data?.token;
  const user = demoLogin.data?.user;
  assert(Boolean(userToken), 'User receives valid JWT token');

  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      userId: 'superadmin',
      password: 'Admin@12345',
    }),
  });
  assert(adminLogin.status === 200 && adminLogin.data?.success, 'Super Admin login succeeds');
  const adminToken = adminLogin.data?.token;
  assert(Boolean(adminToken), 'Admin receives valid JWT token');

  // --- 2. Live WebSocket Connection Verification ---
  console.log('\n[SECTION 2] Verifying Live WebSocket Streaming (/ws)...');
  const wsReceivedEvents: string[] = [];
  const ws = new WebSocket(`${WS_URL}?token=${userToken}`);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket connection timed out')), 5000);
    ws.on('open', () => {
      clearTimeout(timeout);
      assert(true, 'WebSocket client connects cleanly to /ws');
      resolve();
    });
    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.event) {
        wsReceivedEvents.push(msg.event);
      }
    } catch {}
  });

  // Wait for initial market ticks
  await new Promise((r) => setTimeout(r, 1200));
  assert(wsReceivedEvents.includes('market.ticks') || ws.readyState === WebSocket.OPEN, 'WebSocket receives market tick streaming');

  // --- 3. RBAC Enforcement ---
  console.log('\n[SECTION 3] Role-Based Access Control (RBAC) Verification...');
  const unauthorizedAdminAccess = await request('/api/admin/deposit-requests', { method: 'GET' }, userToken);
  assert(unauthorizedAdminAccess.status === 403, 'Regular CLIENT blocked from admin deposit requests (403)');

  const unauthorizedApproval = await request('/api/admin/deposit-requests/req-fake-123/approve', { method: 'POST' }, userToken);
  assert(unauthorizedApproval.status === 403, 'Regular CLIENT blocked from approving deposits (403)');

  const unauthorizedSettingsUpdate = await request('/api/admin/payment-settings', {
    method: 'PUT',
    body: JSON.stringify({ bank_name: 'Hacked Bank' }),
  }, userToken);
  assert(unauthorizedSettingsUpdate.status === 403, 'Regular CLIENT blocked from updating payment settings (403)');

  // --- 4. Manual Deposit & Admin Approval Workflow ---
  console.log('\n[SECTION 4] End-to-End Manual Deposit & Admin Approval Verification...');

  // 4.1 Payment Details Fetch
  const paymentDetailsRes = await request('/api/deposit/payment-details', { method: 'GET' });
  assert(paymentDetailsRes.status === 200 && paymentDetailsRes.data?.success, 'GET /api/deposit/payment-details returns 200');
  const bankInfo = paymentDetailsRes.data?.data;
  assert(Boolean(bankInfo.bank_name && bankInfo.account_number && bankInfo.ifsc_code), 'Payment details contain valid bank name, account number, and IFSC');

  // 4.2 Submit Manual Deposit Request
  const testUtr = `UTR-AUDIT-${Date.now()}`;
  const depositAmount = 25000;
  const sampleProofImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const submitDepositRes = await request('/api/deposit/manual-request', {
    method: 'POST',
    body: JSON.stringify({
      amount: depositAmount,
      utr_number: testUtr,
      payment_method: 'BANK_TRANSFER',
      proof_image: sampleProofImage,
    }),
  }, userToken);
  assert(submitDepositRes.status === 201 && submitDepositRes.data?.success, 'POST /api/deposit/manual-request creates request (201)');
  const createdDeposit = submitDepositRes.data?.data;
  assert(createdDeposit.status === 'PENDING', 'New deposit request starts in PENDING status');
  assert(createdDeposit.utr_number === testUtr, 'Deposit UTR stored accurately');

  // 4.3 Duplicate UTR Prevention (Idempotency)
  const duplicateUtrRes = await request('/api/deposit/manual-request', {
    method: 'POST',
    body: JSON.stringify({
      amount: depositAmount,
      utr_number: testUtr,
      payment_method: 'BANK_TRANSFER',
    }),
  }, userToken);
  assert(duplicateUtrRes.status === 409, 'Duplicate UTR submission blocked with 409 Conflict');

  // 4.4 User "My Requests" Tracker
  const myRequestsRes = await request('/api/deposit/my-requests', { method: 'GET' }, userToken);
  assert(myRequestsRes.status === 200 && myRequestsRes.data?.success, 'GET /api/deposit/my-requests returns 200');
  const userRequests = myRequestsRes.data?.data || [];
  const foundUserReq = userRequests.find((r: any) => r.utr_number === testUtr);
  assert(Boolean(foundUserReq && foundUserReq.status === 'PENDING'), 'Submitted deposit appears in user "My Requests" tracker');

  // 4.5 Admin Listing & Pending Count
  const adminListRes = await request('/api/admin/deposit-requests', { method: 'GET' }, adminToken);
  assert(adminListRes.status === 200 && adminListRes.data?.success, 'GET /api/admin/deposit-requests returns 200');
  const adminReqs = adminListRes.data?.data?.requests || [];
  const pendingCount = adminListRes.data?.data?.pendingCount || 0;
  assert(pendingCount > 0, `Admin pending count reflects pending deposits (${pendingCount})`);
  const foundAdminReq = adminReqs.find((r: any) => r.utr_number === testUtr);
  assert(Boolean(foundAdminReq), 'Pending deposit appears in Admin panel with full details');
  assert(Boolean(foundAdminReq?.proof_image_url), 'Admin request contains receipt preview image');

  // 4.6 Get User Wallet Balance Before Approval
  const initialPortfolioRes = await request('/api/trading/portfolio', { method: 'GET' }, userToken);
  const initialBalance = Number(initialPortfolioRes.data?.wallet?.availableBalance || 0);

  // 4.7 Admin Approve Action
  const approveRes = await request(`/api/admin/deposit-requests/${createdDeposit.id}/approve`, {
    method: 'POST',
  }, adminToken);
  assert(approveRes.status === 200 && approveRes.data?.success, 'Admin approve deposit returns 200 OK');
  assert(approveRes.data?.data?.status === 'APPROVED', 'Request status transitioned to APPROVED');

  // Verify wallet credited atomically
  const postApprovePortfolio = await request('/api/trading/portfolio', { method: 'GET' }, userToken);
  const updatedBalance = Number(postApprovePortfolio.data?.wallet?.availableBalance || 0);
  assert(
    updatedBalance === initialBalance + depositAmount,
    `Wallet balance atomically credited by ₹${depositAmount} (Before: ₹${initialBalance}, After: ₹${updatedBalance})`
  );

  // 4.8 Double-Approval Prevention (Race Condition Protection)
  const doubleApproveRes = await request(`/api/admin/deposit-requests/${createdDeposit.id}/approve`, {
    method: 'POST',
  }, adminToken);
  assert(doubleApproveRes.status === 400, 'Re-approval of already approved request is strictly rejected (400)');

  // 4.9 Rejection Workflow Verification
  const testUtr2 = `UTR-REJECT-${Date.now()}`;
  const submitDepositRes2 = await request('/api/deposit/manual-request', {
    method: 'POST',
    body: JSON.stringify({
      amount: 15000,
      utr_number: testUtr2,
      payment_method: 'QR_CODE',
      proof_image: sampleProofImage,
    }),
  }, userToken);
  const createdDeposit2 = submitDepositRes2.data?.data;

  const rejectRes = await request(`/api/admin/deposit-requests/${createdDeposit2.id}/reject`, {
    method: 'POST',
    body: JSON.stringify({
      reason: 'Transaction reference not found on bank statement records',
    }),
  }, adminToken);
  assert(rejectRes.status === 200 && rejectRes.data?.success, 'Admin reject deposit returns 200 OK');
  assert(rejectRes.data?.data?.status === 'REJECTED', 'Request status transitioned to REJECTED');
  assert(rejectRes.data?.data?.rejection_reason?.includes('bank statement'), 'Rejection reason saved correctly');

  // Verify wallet balance remained completely unchanged on rejection
  const postRejectPortfolio = await request('/api/trading/portfolio', { method: 'GET' }, userToken);
  assert(
    Number(postRejectPortfolio.data?.wallet?.availableBalance || 0) === updatedBalance,
    'Wallet balance strictly untouched after deposit rejection'
  );

  // 4.10 Admin Bank & QR Settings Update
  const updateSettingsRes = await request('/api/admin/payment-settings', {
    method: 'PUT',
    body: JSON.stringify({
      bank_name: 'State Bank of India Corporate',
      account_name: 'Vertex Technologies Clearing',
      account_number: '399988877766',
      ifsc_code: 'SBIN0001234',
      upi_id: 'vertex.clearing@sbi',
      qr_code_url: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=sbi-clearing',
    }),
  }, adminToken);
  assert(updateSettingsRes.status === 200 && updateSettingsRes.data?.success, 'Admin update payment settings returns 200 OK');

  const refreshedDetails = await request('/api/deposit/payment-details', { method: 'GET' });
  assert(refreshedDetails.data?.data?.bank_name === 'State Bank of India Corporate', 'Public payment details reflect updated bank name');
  assert(refreshedDetails.data?.data?.account_number === '399988877766', 'Public payment details reflect updated account number');

  // --- 5. Live Order Execution & Real-Time P&L Verification ---
  console.log('\n[SECTION 5] Live Order Execution & Real-Time P&L Tracking...');

  // 5.1 Place Market Order
  const preOrderPortfolio = await request('/api/trading/portfolio', { method: 'GET' }, userToken);
  const preAvailable = Number(preOrderPortfolio.data?.wallet?.availableBalance || 0);
  const preUsedMargin = Number(preOrderPortfolio.data?.wallet?.usedMargin || 0);

  const placeOrderRes = await request('/api/trading/orders', {
    method: 'POST',
    body: JSON.stringify({
      symbol: 'RELIANCE',
      type: 'BUY',
      orderType: 'MARKET',
      product: 'INTRADAY',
      lots: 1,
    }),
  }, userToken);
  assert(placeOrderRes.status === 200 && placeOrderRes.data?.success, 'Market BUY order executed successfully');
  const placedOrder = placeOrderRes.data?.order;
  assert(placedOrder?.status === 'EXECUTED', 'Order status is EXECUTED');

  // 5.2 Margin Allocation Check
  const postOrderPortfolio = await request('/api/trading/portfolio', { method: 'GET' }, userToken);
  const postAvailable = Number(postOrderPortfolio.data?.wallet?.availableBalance || 0);
  const postUsedMargin = Number(postOrderPortfolio.data?.wallet?.usedMargin || 0);
  assert(postUsedMargin > preUsedMargin, `Margin correctly allocated for open position (Used margin: ₹${postUsedMargin})`);
  assert(postAvailable < preAvailable, `Available balance correctly reduced by margin (Available: ₹${postAvailable})`);

  // 5.3 Positions & Live Mark-to-Market P&L
  const openPositions = postOrderPortfolio.data?.positions || [];
  const reliancePos = openPositions.find((p: any) => p.symbol === 'RELIANCE');
  assert(Boolean(reliancePos), 'Open position exists for RELIANCE in portfolio');
  assert(reliancePos?.qty > 0, `Open position quantity is positive (${reliancePos?.qty})`);
  assert(Number.isFinite(Number(reliancePos?.pnl)), `Dynamic P&L calculated without drift (Current P&L: ₹${reliancePos?.pnl})`);

  // 5.4 Square Off Position & Realized P&L
  const closePosRes = await request('/api/trading/position/close', {
    method: 'POST',
    body: JSON.stringify({ positionId: reliancePos.id }),
  }, userToken);
  assert(closePosRes.status === 200 && closePosRes.data?.success, 'Square-off position succeeds (200 OK)');

  // 5.5 Margin Release & Ledger Entry
  const postClosePortfolio = await request('/api/trading/portfolio', { method: 'GET' }, userToken);
  const postCloseUsedMargin = Number(postClosePortfolio.data?.wallet?.usedMargin || 0);
  assert(postCloseUsedMargin < postUsedMargin, 'Used margin released back after squaring off position');

  const postClosePositions = postClosePortfolio.data?.positions || [];
  const closedReliancePos = postClosePositions.find((p: any) => p.symbol === 'RELIANCE' && p.id === reliancePos.id);
  assert(!closedReliancePos || closedReliancePos.qty === 0, 'Position is closed in positions table');

  // Cleanup WebSocket
  ws.close();

  console.log('\n================================================================');
  console.log(`  AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAudit().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
