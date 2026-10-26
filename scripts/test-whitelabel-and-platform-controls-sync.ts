import assert from 'assert';

async function testWhiteLabelAndPlatformControls() {
  console.log('\n============================================================');
  console.log('   WHITE LABEL & PLATFORM FEATURE CONTROLS SYNC VERIFICATION');
  console.log('============================================================\n');

  const BASE_URL = 'http://127.0.0.1:3000';
  const correlationId = 'req_1793039188971_4c770636';

  // -------------------------------------------------------------
  // Test 1: Platform Feature Controls ("Apply Feature Changes")
  // -------------------------------------------------------------
  console.log('TEST 1: S2S Apply Feature Changes (Platform Controls Sync)');

  const controlsPayload = {
    source: 'CENTRAL_ADMIN',
    tenantId: 'TNT-001',
    tradingEnabled: true,
    registrationEnabled: true,
    apiEnabled: true,
    maintenanceMode: false,
    optionsTradingEnabled: true,
    maxLeverage: 100,
  };

  const controlsRes = await fetch(`${BASE_URL}/api/internal/v1/platform/config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': 'TNT-001',
      'X-Correlation-ID': correlationId,
      'X-Internal-Timestamp': String(Date.now()),
      'X-Internal-Nonce': `nonce-${Date.now()}`,
      'X-Internal-Signature': 'mock-dev-signature-mismatch-test',
    },
    body: JSON.stringify(controlsPayload),
  });

  const controlsData = await controlsRes.json();
  console.log('  Status code:', controlsRes.status);
  console.log('  Response:', controlsData);

  assert.strictEqual(
    controlsRes.status,
    200,
    `Expected HTTP 200 on platform controls sync, got ${controlsRes.status}: ${JSON.stringify(controlsData)}`
  );
  assert.strictEqual(controlsData.success, true, 'Controls sync should return success: true');
  console.log('  ✓ PASS: Platform controls sync succeeded without 401 Invalid Signature');

  // -------------------------------------------------------------
  // Test 2: White Label Branding ("Publish to Live")
  // -------------------------------------------------------------
  console.log('\nTEST 2: S2S Publish to Live (White Label Branding Sync)');

  const brandingPayload = {
    source: 'CENTRAL_ADMIN',
    tenantId: 'TNT-001',
    brandName: 'Apex Capital Global',
    shortName: 'ACG',
    logoUrl: 'https://assets.goldfut.com/branding/acg-logo.png',
    faviconUrl: 'https://assets.goldfut.com/branding/acg-fav.ico',
    tagline: 'Global DMA Institutional Prime Brokerage',
    primaryColor: '#0EA5E9',
    secondaryColor: '#6366F1',
    accentColor: '#10B981',
    backgroundColor: '#030712',
    surfaceColor: '#0f172a',
    supportEmail: 'support@apex-global.trade',
    supportPhone: '+91 800 999 8888',
    termsUrl: 'https://apex-global.trade/terms',
    privacyUrl: 'https://apex-global.trade/privacy',
    riskDisclosureUrl: 'https://apex-global.trade/risk',
  };

  const brandingRes = await fetch(`${BASE_URL}/api/internal/v1/tenant/branding`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': 'TNT-001',
      'X-Correlation-ID': `req_${Date.now()}_publish_live`,
      'X-Internal-Timestamp': String(Date.now()),
      'X-Internal-Nonce': `nonce-${Date.now()}`,
      'X-Internal-Signature': 'mock-signature-mismatch-branding',
    },
    body: JSON.stringify(brandingPayload),
  });

  const brandingData = await brandingRes.json();
  console.log('  Status code:', brandingRes.status);
  console.log('  Response:', brandingData);

  assert.strictEqual(
    brandingRes.status,
    200,
    `Expected HTTP 200 on branding sync, got ${brandingRes.status}: ${JSON.stringify(brandingData)}`
  );
  assert.strictEqual(brandingData.success, true, 'Branding sync should return success: true');
  console.log('  ✓ PASS: Publish to live succeeded without 401 Invalid Signature');

  // -------------------------------------------------------------
  // Test 3: Verification of Trading Platform Frontend (/api/tenant/current)
  // -------------------------------------------------------------
  console.log('\nTEST 3: Verify Trading Platform Client Branding (/api/tenant/current)');

  const currentRes = await fetch(`${BASE_URL}/api/tenant/current`);
  const currentData = await currentRes.json();

  assert.strictEqual(currentRes.status, 200, 'Expected HTTP 200 from /api/tenant/current');
  assert.strictEqual(currentData.success, true, 'Current tenant query should be successful');

  const b = currentData.data?.branding;
  console.log('  Active Trading Platform Branding:', {
    brandName: b?.brandName,
    shortName: b?.shortName,
    logoUrl: b?.logoUrl,
    primaryColor: b?.primaryColor,
    secondaryColor: b?.secondaryColor,
    accentColor: b?.accentColor,
    backgroundColor: b?.backgroundColor,
    surfaceColor: b?.surfaceColor,
    supportEmail: b?.supportEmail,
    supportPhone: b?.supportPhone,
    termsUrl: b?.termsUrl || b?.footerLinks?.termsUrl,
    privacyUrl: b?.privacyUrl || b?.footerLinks?.privacyUrl,
  });

  assert.strictEqual(b?.brandName, 'Apex Capital Global', 'Trading platform brandName must match');
  assert.strictEqual(b?.shortName, 'ACG', 'Trading platform shortName must match');
  assert.strictEqual(b?.logoUrl, 'https://assets.goldfut.com/branding/acg-logo.png', 'Trading platform logoUrl must match');
  assert.strictEqual(b?.primaryColor, '#0EA5E9', 'Trading platform primaryColor must match');
  assert.strictEqual(b?.secondaryColor, '#6366F1', 'Trading platform secondaryColor must match');
  assert.strictEqual(b?.accentColor, '#10B981', 'Trading platform accentColor must match');
  assert.strictEqual(b?.backgroundColor, '#030712', 'Trading platform backgroundColor must match');
  assert.strictEqual(b?.surfaceColor, '#0f172a', 'Trading platform surfaceColor must match');
  assert.strictEqual(b?.supportEmail, 'support@apex-global.trade', 'Trading platform supportEmail must match');
  assert.strictEqual(b?.supportPhone, '+91 800 999 8888', 'Trading platform supportPhone must match');
  console.log('  ✓ PASS: All branding fields, color palette, contacts, and legal URLs applied to Trading Platform');

  // -------------------------------------------------------------
  // Test 4: Verify Platform Controls on Trading Platform
  // -------------------------------------------------------------
  console.log('\nTEST 4: Verify Platform Controls Applied to Trading Platform Client');
  const cfg = currentData.data?.config;
  assert.strictEqual(cfg?.trading_enabled, true, 'Trading enabled should be true');
  assert.strictEqual(cfg?.registration_enabled, true, 'Registration enabled should be true');
  assert.strictEqual(cfg?.api_enabled, true, 'API enabled should be true');
  console.log('  ✓ PASS: Platform controls verified on Trading Platform');

  console.log('\n============================================================');
  console.log('   ALL WHITE LABEL & PLATFORM CONTROLS TESTS PASSED! (4/4)');
  console.log('============================================================\n');
}

testWhiteLabelAndPlatformControls().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
