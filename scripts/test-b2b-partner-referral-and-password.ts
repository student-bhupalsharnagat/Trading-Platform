import assert from 'node:assert/strict';

process.env.NODE_ENV = 'development';
process.env.DISABLE_OUTBOUND_S2S = 'true';

async function main() {
  const { hierarchyService } = await import('../src/server/services/hierarchyService.ts');
  const { authService } = await import('../src/server/services/authService.ts');
  const { centralApiService } = await import('../src/server/services/centralApiService.ts');
  const { db } = await import('../src/server/db/database.ts');

  console.log('--- Step 1: Ensure Super Admin & Initial Hierarchy ---');
  await hierarchyService.ensureSuperAdmin();

  // Test syncFromCentralAdmin to simulate an incoming Broker from Admin Panel with a unique referralCode
  const brokerCode = 'BRK-METRO-01';
  await hierarchyService.syncFromCentralAdmin({
    action: 'created',
    type: 'broker',
    role: 'BROKER',
    id: 'broker-test-node-01',
    user_id: 'broker_test_01',
    name: 'Metro Wealth Broker',
    email: 'metro.test@goldfut.com',
    referralCode: brokerCode,
    tenantId: 'TNT-001',
    masterId: 'master-node-0001',
  });

  console.log('--- Step 2: Test findPartnerByReferralCode ---');
  const partnerMatch = await hierarchyService.findPartnerByReferralCode(brokerCode);
  assert.ok(partnerMatch, 'Partner must be found by referral code');
  assert.equal(partnerMatch?.role, 'BROKER');
  assert.equal(partnerMatch?.tenantId, 'TNT-001');
  assert.equal(partnerMatch?.brokerId, 'broker-test-node-01');
  assert.equal(partnerMatch?.masterId, 'master-node-0001');
  console.log('✓ findPartnerByReferralCode successfully matched Broker downline.');

  console.log('--- Step 3: Test Client Registration with Referral Code Auto-Assignment ---');
  const clientUserId = `cli_test_${Date.now().toString().slice(-6)}`;
  const regResult = await authService.register({
    fullName: 'Test Client Downline',
    userId: clientUserId,
    email: `${clientUserId}@example.com`,
    password: 'Password@123',
    confirmPassword: 'Password@123',
    referralCode: brokerCode,
  });

  assert.ok(regResult.user, 'Registered user must exist');
  assert.equal(regResult.user.userId, clientUserId);

  const registeredRecord = db.findUserByUserId(clientUserId);
  assert.ok(registeredRecord, 'User record must exist in DB');
  assert.equal(registeredRecord?.tenant_id, 'TNT-001');
  assert.equal(registeredRecord?.broker_id, 'broker-test-node-01');
  assert.equal(registeredRecord?.master_id, 'master-node-0001');
  assert.equal(registeredRecord?.referred_by, brokerCode);
  console.log('✓ Client registered and auto-assigned to Broker & Master hierarchy.');

  console.log('--- Step 4: Test Self-Service Password Change ---');
  // Attempt with incorrect current password
  await assert.rejects(
    async () => {
      await authService.changePassword(clientUserId, 'WrongPassword@123', 'NewValidPass@2026');
    },
    (err: any) => {
      assert.match(err.message, /Current password is incorrect/i);
      return true;
    },
    'Should reject wrong current password'
  );

  // Successfully change password
  const changeRes = await authService.changePassword(clientUserId, 'Password@123', 'NewValidPass@2026');
  assert.equal(changeRes.success, true);
  assert.match(changeRes.message, /Password updated successfully/i);

  // Verify new credentials can log in
  const loginRes = await authService.login(clientUserId, 'NewValidPass@2026');
  assert.ok(loginRes.token, 'Must return session token with new password');
  assert.equal(loginRes.user.userId, clientUserId);
  console.log('✓ Self-service password changed and verified via login.');

  console.log('--- Step 5: Test Dynamic White-Label Resolution ---');
  const defaultRes = await centralApiService.resolveTenant('localhost', 'vertex-default');
  assert.ok(defaultRes.branding.brandName, 'Must resolve brandName');
  assert.ok(defaultRes.branding.supportEmail, 'Must resolve supportEmail');
  console.log(`✓ Resolved default branding: "${defaultRes.branding.brandName}" (${defaultRes.branding.supportEmail})`);

  console.log('\nALL TRADING PLATFORM B2B FEATURES VERIFIED SUCCESSFULLY.');
  process.exit(0);
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
