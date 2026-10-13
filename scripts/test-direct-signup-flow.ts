/**
 * Automated Test Suite for Direct Signup Flow (No Email/Phone OTP required)
 */

import { authService, sanitizeUser } from '../src/server/services/authService.ts';
import { db } from '../src/server/db/database.ts';
import { registerSchema } from '../src/server/schemas/authSchemas.ts';
import { runMigrations } from '../src/server/db/migrationRunner.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`\n❌ [FAIL] ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
  console.log(`  ✓ [PASS] ${message}`);
}

async function runDirectSignupTests() {
  console.log('================================================================');
  console.log('   RUNNING DIRECT SIGNUP FLOW TEST SUITE');
  console.log('================================================================\n');

  await runMigrations();

  const ts = Date.now();
  const testUserId = `direct_trader_${ts}`;
  const password = 'SecurePass@2026';

  // --- 1. Schema Validation (FullName, UserId, Password, ConfirmPassword, ReferralCode) ---
  console.log('--- 1. Schema Validation without Email/Phone ---');
  const validParsed = registerSchema.parse({
    fullName: 'Direct Signup Trader',
    userId: testUserId,
    password: password,
    confirmPassword: password,
    referralCode: 'ALPHA2026',
  });
  assert(validParsed.userId === testUserId, 'registerSchema accepts payload without email or mobile');

  // --- 2. Direct Account Creation & Activation ---
  console.log('\n--- 2. Direct Account Creation & Activation ---');
  const regResult = await authService.register(
    {
      fullName: 'Direct Signup Trader',
      userId: testUserId,
      password: password,
      confirmPassword: password,
      referralCode: 'ALPHA2026',
    },
    'vertex-default',
    '127.0.0.1'
  );

  assert(regResult.user.userId === testUserId, 'Account registered successfully without email or mobile');
  assert(Boolean(regResult.token), 'JWT session token issued directly upon signup');

  const createdUser = db.findUserByUserId(testUserId);
  assert(Boolean(createdUser), 'User record persisted in database');
  assert(createdUser?.status === 'ACTIVE', `Account status is directly ACTIVE: ${createdUser?.status}`);
  assert(createdUser?.is_verified === true, 'Account is_verified flag is true');
  assert(Boolean(createdUser?.email_verified_at), 'email_verified_at populated for active record');
  assert(Boolean(createdUser?.phone_verified_at), 'phone_verified_at populated for active record');

  // --- 3. Immediate Login with Newly Created Account ---
  console.log('\n--- 3. Immediate Login with Newly Created Account ---');
  const loginRes = await authService.login(testUserId, password, '127.0.0.1');
  assert(Boolean(loginRes.token), 'Newly registered account logs in successfully without OTP');
  assert(loginRes.user.status === 'ACTIVE', 'Authenticated user state is ACTIVE');

  // --- 4. Duplicate User ID Rejection ---
  console.log('\n--- 4. Duplicate User ID Rejection ---');
  let duplicateCaught = false;
  try {
    await authService.register(
      {
        fullName: 'Duplicate Trader',
        userId: testUserId,
        password: password,
        confirmPassword: password,
      },
      'vertex-default',
      '127.0.0.1'
    );
  } catch (err: any) {
    if (err.statusCode === 409) {
      duplicateCaught = true;
    }
  }
  assert(duplicateCaught, 'Duplicate User ID registration rejected with 409 Conflict');

  // --- 5. Admin Panel Integration Visibility ---
  console.log('\n--- 5. Admin Panel Integration Visibility ---');
  const tenantUsers = db.getUsersByTenant('vertex-default');
  const inAdminList = tenantUsers.some((u) => u.user_id === testUserId);
  assert(inAdminList, 'Newly created user appears in Admin Panel client data list');

  // --- 6. Multiple Account Registration & Login Verification ---
  console.log('\n--- 6. Multiple Account Registration & Login Verification ---');
  const user2Id = `direct_trader_2_${ts}`;
  await authService.register(
    {
      fullName: 'Second Trader',
      userId: user2Id,
      password: password,
      confirmPassword: password,
    },
    'vertex-default',
    '127.0.0.1'
  );

  const loginRes2 = await authService.login(user2Id, password, '127.0.0.1');
  assert(Boolean(loginRes2.token), 'Second newly registered user logs in successfully');
  assert(loginRes2.user.userId === user2Id, 'Authenticated user context matches Second Trader');

  console.log('\n================================================================');
  console.log('   ALL DIRECT SIGNUP FLOW TESTS PASSED!');
  console.log('================================================================');
}

runDirectSignupTests().catch((err) => {
  console.error('[FATAL TEST ERROR]', err);
  process.exit(1);
});
