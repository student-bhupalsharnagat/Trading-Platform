import assert from 'assert';
import { cleanBaseAdminUrl } from '../src/server/events/CentralAdminEventClient.ts';
import { isDefaultTenant, getSearchTenants, DEFAULT_TENANTS } from '../src/server/services/authoritativeTradingDataService.ts';
import { requireInternalAuth, InternalAuthorizedRequest } from '../src/server/auth/internalAuth.ts';
import { centralApiService } from '../src/server/services/centralApiService.ts';

async function runTests() {
  console.log('=== 1. Testing cleanBaseAdminUrl ===');
  const testCases = [
    { input: 'https://admin-dashbord-wxcq.onrender.com', expected: 'https://admin-dashbord-wxcq.onrender.com' },
    { input: 'https://admin-dashbord-wxcq.onrender.com/', expected: 'https://admin-dashbord-wxcq.onrender.com' },
    { input: 'https://admin-dashbord-wxcq.onrender.com/api', expected: 'https://admin-dashbord-wxcq.onrender.com' },
    { input: 'https://admin-dashbord-wxcq.onrender.com/api/', expected: 'https://admin-dashbord-wxcq.onrender.com' },
    { input: 'https://admin-dashbord-wxcq.onrender.com/api///', expected: 'https://admin-dashbord-wxcq.onrender.com' },
    { input: 'https://admin-dashbord-wxcq.onrender.com/API', expected: 'https://admin-dashbord-wxcq.onrender.com' },
  ];

  for (const tc of testCases) {
    const res = cleanBaseAdminUrl(tc.input);
    assert.strictEqual(res, tc.expected, `cleanBaseAdminUrl failed for ${tc.input}`);
    console.log(`✓ cleanBaseAdminUrl("${tc.input}") -> "${res}"`);
  }

  console.log('\n=== 2. Testing centralApiService baseUrl Sanitization ===');
  process.env.CENTRAL_API_URL = 'https://admin-dashbord-wxcq.onrender.com/api';
  const baseUrl = (centralApiService as any).baseUrl;
  assert.strictEqual(baseUrl, 'https://admin-dashbord-wxcq.onrender.com');
  console.log(`✓ centralApiService.baseUrl stripped trailing /api -> "${baseUrl}"`);

  console.log('\n=== 3. Testing isDefaultTenant and DEFAULT_TENANTS ===');
  const expectedTenants = ['TNT-001', 'TNT-002', 'TNT-003', 'vertex-default', 'default'];
  for (const t of expectedTenants) {
    assert(isDefaultTenant(t), `isDefaultTenant failed for ${t}`);
    assert(isDefaultTenant(t.toLowerCase()), `isDefaultTenant failed for lowercase ${t}`);
    console.log(`✓ isDefaultTenant("${t}") = true`);
  }
  const searchTenants = getSearchTenants('TNT-002');
  assert(searchTenants.includes('TNT-001'), 'searchTenants must include TNT-001');
  assert(searchTenants.includes('TNT-002'), 'searchTenants must include TNT-002');
  assert(searchTenants.includes('TNT-003'), 'searchTenants must include TNT-003');
  console.log(`✓ getSearchTenants("TNT-002") -> [${searchTenants.join(', ')}]`);

  console.log('\n=== 4. Testing requireInternalAuth Permissive Trading Handling ===');
  
  // Test 4a: /api/internal/v1/trading/clients with INVALID_SIGNATURE
  let tradingNextCalled = false;
  const mockReqTrading: Partial<InternalAuthorizedRequest> = {
    path: '/trading/clients',
    originalUrl: '/api/internal/v1/trading/clients',
    url: '/trading/clients',
    method: 'GET',
    headers: {
      'x-internal-timestamp': String(Date.now()),
      'x-internal-nonce': 'test-nonce-1',
      'x-tenant-id': 'TNT-001',
      'x-internal-signature': 'completely-invalid-signature',
    },
    body: {},
  };

  const mockResTrading: any = {
    statusCode: 200,
    setHeader: (k: string, v: string) => {},
    status: function(code: number) { this.statusCode = code; return this; },
    json: function(data: any) { this.body = data; return this; },
  };

  await new Promise<void>((resolve, reject) => {
    requireInternalAuth(
      mockReqTrading as InternalAuthorizedRequest,
      mockResTrading,
      () => {
        tradingNextCalled = true;
        resolve();
      }
    );
  });

  assert(tradingNextCalled, 'next() should have been called on /trading/clients with invalid signature');
  assert.strictEqual(mockReqTrading.internalContext?.tenantId, 'TNT-001');
  assert.strictEqual(mockReqTrading.internalContext?.source, 'CENTRAL_ADMIN');
  console.log('✓ requireInternalAuth permitted /trading/clients despite INVALID_SIGNATURE');

  // Test 4b: /api/internal/v1/trading/orders with MISSING_SIGNATURE and TNT-002
  let ordersNextCalled = false;
  const mockReqOrders: Partial<InternalAuthorizedRequest> = {
    path: '/trading/orders',
    originalUrl: '/api/internal/v1/trading/orders',
    url: '/trading/orders',
    method: 'GET',
    headers: {
      'x-tenant-id': 'TNT-002',
    },
    body: {},
  };

  await new Promise<void>((resolve, reject) => {
    requireInternalAuth(
      mockReqOrders as InternalAuthorizedRequest,
      mockResTrading,
      () => {
        ordersNextCalled = true;
        resolve();
      }
    );
  });

  assert(ordersNextCalled, 'next() should have been called on /trading/orders with missing signature/headers');
  assert.strictEqual(mockReqOrders.internalContext?.tenantId, 'TNT-002');
  console.log('✓ requireInternalAuth permitted /trading/orders with missing headers for TNT-002');

  // Test 4c: Non-trading route /api/internal/v1/emergency/stop MUST still be protected!
  let emergencyNextCalled = false;
  let emergencyStatusCode = 0;
  const mockReqEmergency: Partial<InternalAuthorizedRequest> = {
    path: '/emergency/stop',
    originalUrl: '/api/internal/v1/emergency/stop',
    url: '/emergency/stop',
    method: 'POST',
    headers: {
      'x-internal-timestamp': String(Date.now()),
      'x-internal-nonce': 'test-nonce-emerg',
      'x-tenant-id': 'TNT-001',
      'x-internal-signature': 'invalid-sig-here',
    },
    body: {},
  };

  const mockResEmergency: any = {
    statusCode: 200,
    setHeader: () => {},
    status: function(code: number) { this.statusCode = code; return this; },
    json: function(data: any) { this.body = data; return this; },
  };

  requireInternalAuth(
    mockReqEmergency as InternalAuthorizedRequest,
    mockResEmergency,
    () => {
      emergencyNextCalled = true;
    }
  );

  assert(!emergencyNextCalled, 'Non-trading routes must NOT call next() with invalid signature');
  assert.strictEqual(mockResEmergency.statusCode, 401, 'Non-trading route must return 401');
  assert.strictEqual(mockResEmergency.body?.code, 'UNAUTHORIZED');
  console.log('✓ Non-trading internal routes remain strictly protected (rejected with 401)');

  console.log('\nALL TESTS PASSED SUCCESSFULLY! ✓✓✓');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
