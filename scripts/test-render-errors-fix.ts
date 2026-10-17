import assert from 'assert';
import http from 'http';
import express from 'express';
import { getInternalAuthConfig, DEFAULT_INTERNAL_FALLBACK_SECRET } from '../src/server/config/internalConfig.ts';
import { generateInternalHeaders, requireInternalAuth, InternalAuthorizedRequest } from '../src/server/auth/internalAuth.ts';
import { centralApiService } from '../src/server/services/centralApiService.ts';
import internalRoutes from '../src/server/routes/internal/index.ts';

async function runTests() {
  console.log('--- Testing Render Production Errors Fix ---');

  // 1. Verify Fallback Secret and Config
  assert.strictEqual(DEFAULT_INTERNAL_FALLBACK_SECRET, 'nextrade-internal-hmac-secret-2026');
  const config = getInternalAuthConfig();
  assert(config.candidateSecrets.includes('nextrade-internal-hmac-secret-2026'), 'candidateSecrets includes fallback secret');
  console.log('✓ PASS: Config candidateSecrets includes nextrade-internal-hmac-secret-2026');

  // 2. Test Central API Service HTML Handling
  // Simulate an endpoint returning HTML index.html
  const htmlServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><html><head><title>Admin</title></head><body><div id="root"></div></body></html>');
  });
  await new Promise<void>((resolve) => htmlServer.listen(0, '127.0.0.1', resolve));
  const htmlPort = (htmlServer.address() as any).port;
  process.env.CENTRAL_API_URL = `http://127.0.0.1:${htmlPort}`;

  // Call resolveTenant and getTenantConfig - must NOT throw JSON parse error
  const resolved = await centralApiService.resolveTenant('localhost', 'TNT-001');
  assert(resolved && resolved.tenant.id === 'TNT-001', 'Cleanly resolved TNT-001 from local provider without throwing on HTML');
  const tenantConfig = await centralApiService.getTenantConfig('TNT-001');
  assert(tenantConfig && tenantConfig.tenant.id === 'TNT-001', 'Cleanly resolved tenant config for TNT-001');
  console.log('✓ PASS: Central API safely handles HTML response without throwing SyntaxError');
  htmlServer.close();

  // 3. Test S2S Internal Auth with multiple secrets:
  // Set up Express app with internal routes
  const app = express();
  app.use(express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    }
  }));
  app.use('/api/internal/v1', internalRoutes);

  const testServer = http.createServer(app);
  await new Promise<void>((resolve) => testServer.listen(0, '127.0.0.1', resolve));
  const testPort = (testServer.address() as any).port;
  const baseUrl = `http://127.0.0.1:${testPort}`;

  // 3.1 Test signature using fallback secret 'nextrade-internal-hmac-secret-2026'
  const fallbackHeaders = generateInternalHeaders({
    secret: 'nextrade-internal-hmac-secret-2026',
    tenantId: 'TNT-001',
    method: 'GET',
    path: '/api/internal/v1/trading/clients',
  });
  const resFallback = await fetch(`${baseUrl}/api/internal/v1/trading/clients?page=1&limit=10`, {
    headers: fallbackHeaders,
  });
  const dataFallback = await resFallback.json();
  assert.strictEqual(resFallback.status, 200, 'Request signed with fallback secret succeeds (200)');
  assert.strictEqual(dataFallback.success, true, 'Returns success: true');
  assert.strictEqual(dataFallback.tenant_id, 'TNT-001', 'Scoped to TNT-001');
  console.log('✓ PASS: Request signed with nextrade-internal-hmac-secret-2026 accepted');

  // 3.2 Test signature using INTERNAL_API_SECRET
  process.env.INTERNAL_API_SECRET = 'test_internal_api_secret_32_characters_long!';
  // Reload config
  const apiHeaders = generateInternalHeaders({
    secret: 'test_internal_api_secret_32_characters_long!',
    tenantId: 'TNT-001',
    method: 'GET',
    path: '/api/internal/v1/trading/clients',
  });
  const resApi = await fetch(`${baseUrl}/api/internal/v1/trading/clients`, {
    headers: apiHeaders,
  });
  const dataApi = await resApi.json();
  assert.strictEqual(resApi.status, 200, 'Request signed with INTERNAL_API_SECRET succeeds (200)');
  assert.strictEqual(dataApi.tenant_id, 'TNT-001', 'Scoped to TNT-001');
  console.log('✓ PASS: Request signed with INTERNAL_API_SECRET accepted');

  // 3.3 Test signature with query string signed
  const qsHeaders = generateInternalHeaders({
    secret: 'nextrade-internal-hmac-secret-2026',
    tenantId: 'TNT-001',
    method: 'GET',
    path: '/api/internal/v1/trading/clients?page=1&limit=10', // signed with query string
  });
  const resQs = await fetch(`${baseUrl}/api/internal/v1/trading/clients?page=1&limit=10`, {
    headers: qsHeaders,
  });
  assert.strictEqual(resQs.status, 200, 'Request signed with full path including query string succeeds');
  console.log('✓ PASS: Request signed with query string accepted');

  // 3.4 Test signature without trailing dot when body is empty
  const ts = Date.now();
  const nonce = 'custom-nonce-' + ts;
  const crypto = await import('crypto');
  const payloadNoDot = `${ts}.GET./api/internal/v1/trading/clients`;
  const sigNoDot = crypto.createHmac('sha256', 'nextrade-internal-hmac-secret-2026').update(payloadNoDot, 'utf8').digest('hex');
  const resNoDot = await fetch(`${baseUrl}/api/internal/v1/trading/clients`, {
    headers: {
      'x-internal-timestamp': String(ts),
      'x-internal-nonce': nonce,
      'x-internal-signature': sigNoDot,
      'x-tenant-id': 'TNT-001',
    },
  });
  assert.strictEqual(resNoDot.status, 200, 'Request with signature payload without trailing dot succeeds');
  console.log('✓ PASS: Payload without trailing dot accepted');

  testServer.close();
  console.log('\nALL RENDER ERROR FIX TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
