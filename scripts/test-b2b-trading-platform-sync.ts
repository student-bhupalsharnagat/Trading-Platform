import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

process.env.NODE_ENV = 'development';
process.env.DISABLE_OUTBOUND_S2S = 'true';

async function main() {
  console.log('=== STARTING TRADING PLATFORM B2B LIFECYCLE & SYNC TEST ===\n');

  const { hierarchyService } = await import('../src/server/services/hierarchyService.ts');
  const { authService } = await import('../src/server/services/authService.ts');
  const { centralApiService } = await import('../src/server/services/centralApiService.ts');
  const { db } = await import('../src/server/db/database.ts');
  const { pgDb } = await import('../src/server/db/postgres.ts');
  const { runMigrations } = await import('../src/server/db/migrationRunner.ts');

  // Step 1: Run Migrations & Initialize Super Admin
  console.log('--- Step 1: Ensure Migrations & Initial Hierarchy ---');
  await runMigrations().catch(() => {});
  await pgDb.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(64);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by VARCHAR(64);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS master_id VARCHAR(64);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS broker_id VARCHAR(64);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_broker_id VARCHAR(64);
  `).catch(() => {});
  await hierarchyService.ensureSuperAdmin();
  console.log('✓ Migrations and Super Admin ensured.');

  // Step 2: S2S Client UPSERT (Client created in Admin Panel)
  console.log('--- Step 2: S2S Client UPSERT from Admin Panel ---');
  const syncedClientId = `usr-s2s-client-${Date.now().toString().slice(-6)}`;
  const syncedEmail = `client_${Date.now().toString().slice(-6)}@tradematrix.io`;
  const plainPassword = 'ClientSecure@2026';
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  const syncResult = await hierarchyService.syncFromCentralAdmin({
    event: 'HIERARCHY_NODE_SYNC',
    action: 'UPSERT',
    type: 'client',
    role: 'CLIENT',
    id: syncedClientId,
    node: {
      id: syncedClientId,
      userId: syncedClientId,
      name: 'B2B Synced Client',
      email: syncedEmail,
      phone: '+919876540001',
      passwordHash,
      role: 'CLIENT',
      status: 'ACTIVE',
      referralCode: 'CLI-S2S-01',
      tenantId: 'TNT-001',
      masterId: 'master-node-0001',
      brokerId: 'broker-node-0001',
      subBrokerId: 'subbroker-node-0001',
      commissionShare: 15,
    },
  });

  assert.ok(syncResult.success, 'S2S sync must report success');
  console.log('✓ Client successfully synced via S2S UPSERT.');

  // Step 3: Immediate Login with Synced Email and Password
  console.log('--- Step 3: Immediate Login with Synced Credentials ---');
  const loginRes = await authService.login(syncedEmail, plainPassword);
  assert.ok(loginRes.token, 'Login must issue JWT token');
  assert.equal(loginRes.user.userId, syncedClientId);
  assert.equal(loginRes.user.status, 'ACTIVE');
  const initialToken = loginRes.token;

  // Verify token is valid
  const verifiedInitial = authService.verifyToken(initialToken);
  assert.ok(verifiedInitial, 'Session token must be valid initially');
  console.log('✓ Synced client logged in immediately with Admin-created Email and Password.');

  // Step 4: S2S STATUS_CHANGE to SUSPENDED
  console.log('--- Step 4: S2S STATUS_CHANGE to SUSPENDED ---');
  const suspendResult = await hierarchyService.syncFromCentralAdmin({
    event: 'HIERARCHY_NODE_SYNC',
    action: 'STATUS_CHANGE',
    type: 'client',
    node: {
      id: syncedClientId,
      userId: syncedClientId,
      status: 'SUSPENDED',
    },
  });
  assert.ok(suspendResult.success, 'Status change must report success');
  assert.equal(suspendResult.status, 'SUSPENDED');

  // Verify active session token is immediately invalidated
  const verifiedSuspended = authService.verifyToken(initialToken);
  assert.equal(verifiedSuspended, null, 'Active token must be invalidated when account is SUSPENDED');

  // Verify login is rejected with 403 ACCOUNT_SUSPENDED
  await assert.rejects(
    async () => {
      await authService.login(syncedEmail, plainPassword);
    },
    (err: any) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'ACCOUNT_SUSPENDED');
      return true;
    },
    'Suspended user login must be rejected with 403 ACCOUNT_SUSPENDED'
  );
  console.log('✓ Account suspension immediately blocked login and invalidated active session token.');

  // Step 5: S2S STATUS_CHANGE back to ACTIVE
  console.log('--- Step 5: S2S STATUS_CHANGE back to ACTIVE ---');
  await hierarchyService.syncFromCentralAdmin({
    event: 'HIERARCHY_NODE_SYNC',
    action: 'STATUS_CHANGE',
    type: 'client',
    node: {
      id: syncedClientId,
      userId: syncedClientId,
      status: 'ACTIVE',
    },
  });

  const reactivatedLogin = await authService.login(syncedEmail, plainPassword);
  assert.ok(reactivatedLogin.token, 'Reactivated user can log in');
  const activeToken = reactivatedLogin.token;
  console.log('✓ Account reactivation restored login capability.');

  // Step 6: S2S PASSWORD_RESET
  console.log('--- Step 6: S2S PASSWORD_RESET ---');
  const newAdminPassword = 'AdminResetPass@2026';
  const newHash = await bcrypt.hash(newAdminPassword, 10);

  const resetResult = await hierarchyService.syncFromCentralAdmin({
    event: 'HIERARCHY_NODE_SYNC',
    action: 'PASSWORD_RESET',
    type: 'client',
    node: {
      id: syncedClientId,
      userId: syncedClientId,
      passwordHash: newHash,
    },
  });
  assert.ok(resetResult.success, 'PASSWORD_RESET must report success');

  // Active token must now be invalidated
  const verifiedAfterReset = authService.verifyToken(activeToken);
  assert.equal(verifiedAfterReset, null, 'Session token must be revoked after password reset');

  // Old password must fail
  await assert.rejects(
    async () => {
      await authService.login(syncedEmail, plainPassword);
    },
    (err: any) => {
      assert.equal(err.statusCode, 401);
      return true;
    },
    'Old password must be rejected after reset'
  );

  // New password must succeed
  const newLogin = await authService.login(syncedEmail, newAdminPassword);
  assert.ok(newLogin.token, 'New password must allow login');
  console.log('✓ Password reset updated hash, invalidated old sessions, and enabled new password login.');

  // Step 7: Self-Service Password Change
  console.log('--- Step 7: Self-Service Password Change ---');
  const userChangedPass = 'SelfChangedPass@2026';
  const changeRes = await authService.changePassword(syncedClientId, newAdminPassword, userChangedPass);
  assert.ok(changeRes.success, 'Change password must succeed');

  const afterSelfChangeLogin = await authService.login(syncedEmail, userChangedPass);
  assert.ok(afterSelfChangeLogin.token, 'Self-service changed password must log in');
  console.log('✓ Self-service password change succeeded.');

  // Step 8: Partner Referral Code Auto-Assignment on Signup
  console.log('--- Step 8: Partner Referral Code Downline Assignment ---');
  const partnerCode = `BRK-AUTO-${Date.now().toString().slice(-4)}`;
  await hierarchyService.syncFromCentralAdmin({
    action: 'UPSERT',
    type: 'broker',
    role: 'BROKER',
    id: `brk-${partnerCode}`,
    node: {
      id: `brk-${partnerCode}`,
      userId: `brk_${partnerCode.toLowerCase().replace(/-/g, '_')}`,
      name: 'Auto Assigned Partner Broker',
      email: `${partnerCode.toLowerCase()}@partner.com`,
      referralCode: partnerCode,
      tenantId: 'TNT-001',
      masterId: 'master-node-0001',
    },
  });

  const referralSignupUser = `downline_${Date.now().toString().slice(-6)}`;
  const regRes = await authService.register({
    fullName: 'Referral Direct Client',
    userId: referralSignupUser,
    email: `${referralSignupUser}@direct.com`,
    password: 'Password@123',
    confirmPassword: 'Password@123',
    referralCode: partnerCode,
  });

  assert.ok(regRes.user, 'Registration with referral code must succeed');
  const dbUser = db.findUserByUserId(referralSignupUser);
  assert.ok(dbUser, 'User must exist in state');
  assert.equal(dbUser?.referred_by, partnerCode);
  assert.equal(dbUser?.tenant_id, 'TNT-001');
  assert.equal(dbUser?.broker_id, `brk-${partnerCode}`);
  assert.equal(dbUser?.master_id, 'master-node-0001');
  console.log('✓ Client registered with referralCode and auto-assigned downline hierarchy.');

  // Step 9: S2S DELETE
  console.log('--- Step 9: S2S DELETE ---');
  const deleteResult = await hierarchyService.syncFromCentralAdmin({
    event: 'HIERARCHY_NODE_SYNC',
    action: 'DELETE',
    type: 'client',
    node: {
      id: syncedClientId,
      userId: syncedClientId,
    },
  });
  assert.ok(deleteResult.success, 'DELETE must succeed');

  await assert.rejects(
    async () => {
      await authService.login(syncedEmail, userChangedPass);
    },
    (err: any) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, 'ACCOUNT_DELETED');
      return true;
    },
    'Deleted account login must be blocked with 403 ACCOUNT_DELETED'
  );
  console.log('✓ Account deletion marked status DELETED and blocked further logins.');

  // Step 10: Dynamic White-Label Resolution
  console.log('--- Step 10: Dynamic White-Label Config ---');
  const branding = await centralApiService.resolveTenant('localhost', 'vertex-default');
  assert.ok(branding.branding.brandName, 'Brand name must resolve');
  console.log(`✓ Resolved branding: ${branding.branding.brandName} (${branding.branding.supportEmail || 'default email'})`);

  console.log('\n======================================================');
  console.log('ALL 10 B2B TRADING PLATFORM SYNC TESTS PASSED (10/10)');
  console.log('======================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
