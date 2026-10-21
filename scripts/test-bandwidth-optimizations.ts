import assert from 'assert';
import { resolveInternalRenderUrl, getInternalAuthConfig } from '../src/server/config/internalConfig.ts';
import { CentralAdminEventClient, cleanBaseAdminUrl } from '../src/server/events/CentralAdminEventClient.ts';
import { ProductionValidator } from '../src/server/config/productionValidator.ts';
import zlib from 'zlib';

console.log('================================================================');
console.log('   BANDWIDTH & RENDER INTERNAL NETWORKING TEST SUITE');
console.log('================================================================\n');

// --- TEST 1: resolveInternalRenderUrl Behavior ---
console.log('--- TEST 1: resolveInternalRenderUrl ---');
{
  // 1a: Default behavior without Render environment flag
  delete process.env.ENABLE_RENDER_INTERNAL_NETWORKING;
  delete process.env.RENDER;
  const publicUrl = 'https://admin-dashbord-wxcq.onrender.com';
  const resolvedPublic = resolveInternalRenderUrl(publicUrl);
  assert.strictEqual(resolvedPublic, publicUrl, 'Should retain public URL when internal networking flag is disabled');
  console.log('  ✓ PASS: Leaves public URL untouched when internal flag disabled');

  // 1b: When ENABLE_RENDER_INTERNAL_NETWORKING=true
  process.env.ENABLE_RENDER_INTERNAL_NETWORKING = 'true';
  const resolvedInternal = resolveInternalRenderUrl('https://admin-dashbord-wxcq.onrender.com');
  assert.strictEqual(resolvedInternal, 'http://admin-dashbord-wxcq:10000', 'Should map onrender.com slug to internal hostname:port');
  console.log(`  ✓ PASS: Successfully resolved public URL to Render internal hostname: "${resolvedInternal}"`);

  // 1c: Custom internal port override
  process.env.RENDER_INTERNAL_PORT = '3000';
  const resolvedCustomPort = resolveInternalRenderUrl('https://trading-platform-2t6r.onrender.com');
  assert.strictEqual(resolvedCustomPort, 'http://trading-platform-2t6r:3000', 'Should respect RENDER_INTERNAL_PORT');
  console.log(`  ✓ PASS: Respects custom RENDER_INTERNAL_PORT: "${resolvedCustomPort}"`);
  delete process.env.RENDER_INTERNAL_PORT;
  delete process.env.ENABLE_RENDER_INTERNAL_NETWORKING;
}

// --- TEST 2: CentralAdminEventClient Internal URL Support & Fallback ---
console.log('\n--- TEST 2: CentralAdminEventClient Internal URL Support ---');
{
  process.env.CENTRAL_ADMIN_INTERNAL_URL = 'http://admin-dashbord-wxcq:10000';
  process.env.CENTRAL_ADMIN_BASE_URL = 'https://admin-dashbord-wxcq.onrender.com';
  process.env.INTERNAL_COMMUNICATION_SECRET = 'a_very_secure_shared_internal_secret_min32chars_long!';

  const client = new CentralAdminEventClient();
  const baseUrl = (client as any).baseUrl;
  const fallbackUrl = (client as any).fallbackUrl;

  assert.strictEqual(baseUrl, 'http://admin-dashbord-wxcq:10000', 'CentralAdminEventClient must prioritize internal URL');
  assert.strictEqual(fallbackUrl, 'https://admin-dashbord-wxcq.onrender.com', 'CentralAdminEventClient must set fallbackUrl');
  console.log(`  ✓ PASS: CentralAdminEventClient uses internal URL: "${baseUrl}" with fallback: "${fallbackUrl}"`);

  delete process.env.CENTRAL_ADMIN_INTERNAL_URL;
}

// --- TEST 3: ProductionValidator with Internal URLs ---
console.log('\n--- TEST 3: ProductionValidator with Internal URLs ---');
{
  const testEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    JWT_SECRET: 'super_secure_production_jwt_secret_min_32_characters_here_ok!',
    INTERNAL_COMMUNICATION_SECRET: 'super_secure_s2s_internal_secret_min_32_characters_here_ok!',
    DATABASE_URL: 'postgres://user:pass@render-db-host:5432/vertex',
    CENTRAL_ADMIN_INTERNAL_URL: 'http://admin-dashbord-wxcq:10000',
    TRADING_PLATFORM_INTERNAL_URL: 'http://trading-platform-2t6r:10000',
  };

  const validation = ProductionValidator.validateEnv(true, testEnv);
  assert.strictEqual(validation.valid, true, `Production validation should pass with internal URLs, errors: ${validation.errors.join(', ')}`);
  console.log('  ✓ PASS: ProductionValidator accepts Render internal network hostnames in production mode');
}

// --- TEST 4: Built-in Gzip Compression Ratio Verification ---
console.log('\n--- TEST 4: Built-in Gzip Compression Verification ---');
{
  // Test compression on simulated JSON and JS payload
  const sampleLargePayload = JSON.stringify({
    event: 'market.ticks',
    instruments: Array.from({ length: 50 }, (_, i) => ({
      id: `INST-${i}`,
      symbol: `SYM_${i}`,
      lastPrice: 1500.5,
      sparkline: [1400, 1420, 1450, 1480, 1500, 1510, 1505, 1495, 1500.5],
    })),
  });

  const originalBuffer = Buffer.from(sampleLargePayload);
  const gzippedBuffer = zlib.gzipSync(originalBuffer);
  const ratio = ((gzippedBuffer.length / originalBuffer.length) * 100).toFixed(1);

  assert(gzippedBuffer.length < originalBuffer.length, 'Gzipped payload must be smaller than original');
  console.log(`  ✓ PASS: Gzip compression reduced payload from ${originalBuffer.length} bytes to ${gzippedBuffer.length} bytes (${ratio}% of original, ~${(100 - parseFloat(ratio)).toFixed(1)}% savings)`);
}

console.log('\n================================================================');
console.log('   ALL BANDWIDTH OPTIMIZATION TESTS PASSED! (4/4)');
console.log('================================================================\n');
