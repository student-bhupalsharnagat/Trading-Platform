// scripts/test-security-remediation.cjs
// Rigorous verification of security domains: IDOR, RBAC, JWT algorithms, rate limiting, and safe errors
const http = require('http');

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (_) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body, json });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runSecurityTests() {
  console.log('=== Starting Security Remediation Validation Suite ===');
  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}: ${details}`);
      failed++;
    }
  }

  try {
    const ts = Date.now();
    const clientUser = `sec_client_${ts}`;
    const password = 'Password@123';

    // Register test client
    await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      userId: clientUser,
      password,
      confirmPassword: password,
      fullName: 'Security QA Client',
      email: `${clientUser}@test.sec`,
      mobile: `91${String(ts).slice(-8)}`,
      countryCode: '+91'
    });

    // Login test client
    const clientLogin = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { userId: clientUser, password });

    const clientToken = clientLogin.json?.token;
    assert(Boolean(clientToken), 'Client account authenticated and token issued');

    // Login super admin
    const adminLogin = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { userId: 'superadmin', password: 'Admin@12345' });

    const adminToken = adminLogin.json?.token;
    assert(Boolean(adminToken), 'Super Admin authenticated and token issued');

    // TEST 1: Privilege Escalation check on /api/trading/gateways/config
    console.log('\n--- 1. Testing RBAC & Gateway Protection ---');
    const gwClientRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/trading/gateways/config',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${clientToken}` }
    });
    assert(gwClientRes.statusCode === 403, 'Normal client is blocked (403) from accessing gateway configuration', `Status: ${gwClientRes.statusCode}`);

    const gwAdminRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/trading/gateways/config',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(gwAdminRes.statusCode === 200, 'Super Admin can access gateway configuration', `Status: ${gwAdminRes.statusCode}`);

    // TEST 2: IDOR Prevention on /api/trading/order/cancel
    console.log('\n--- 2. Testing IDOR Prevention on Order Cancellation ---');
    const victimOrderRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/trading/order/cancel',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${clientToken}`,
        'Content-Type': 'application/json'
      }
    }, { orderId: 'non-existent-or-other-user-order-999' });
    assert(victimOrderRes.statusCode >= 400 && victimOrderRes.statusCode !== 200, 'Unauthorized or non-owned order cancellation fails safely', `Status: ${victimOrderRes.statusCode}`);

    // TEST 3: JWT Algorithm Confusion Prevention
    console.log('\n--- 3. Testing JWT Algorithm Verification ---');
    const forgedHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const forgedPayload = Buffer.from(JSON.stringify({ userId: 'hacker-001', role: 'SUPER_ADMIN', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const noneAlgToken = `${forgedHeader}.${forgedPayload}.`;

    const forgedRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/trading/gateways/config',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${noneAlgToken}` }
    });
    assert(forgedRes.statusCode === 401, 'None-algorithm JWT token rejected with 401', `Status: ${forgedRes.statusCode}`);

    // TEST 4: Deposit Rate Limiter on /api/deposit/manual-request
    console.log('\n--- 4. Testing Deposit Rate Limiting ---');
    const depositReq = (index) => request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/deposit/manual-request',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${clientToken}`,
        'Content-Type': 'application/json'
      }
    }, {
      amount: 1000,
      utr_number: `UTR${ts}${index}${Math.random().toString(36).slice(2, 6)}`,
      payment_method: 'UPI'
    });

    let depositStatusCodes = [];
    for (let i = 0; i < 33; i++) {
      const res = await depositReq(i);
      depositStatusCodes.push(res.statusCode);
      if (res.statusCode === 429) {
        break;
      }
    }
    const hasThrottled = depositStatusCodes.includes(429);
    assert(hasThrottled, `Deposit requests are rate-limited after exceeding threshold (429 received, hit after ${depositStatusCodes.length} reqs)`, `Codes: ${depositStatusCodes.slice(-5).join(', ')}`);

    // TEST 5: Error Middleware Stack Trace Sanitization
    console.log('\n--- 5. Testing Error Sanitization ---');
    const errRes = await request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/trading/invalid-endpoint-triggering-error',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${clientToken}` }
    });
    assert(!errRes.body.includes('at Module._compile') && !errRes.body.includes('node_modules'), 'Error responses do not leak stack traces or internal server paths');

    console.log(`\n=== Security Test Summary: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runSecurityTests();
