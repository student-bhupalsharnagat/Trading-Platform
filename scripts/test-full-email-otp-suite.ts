/**
 * Rigorous Automated Test Suite for Email OTP & Security Verification
 * Validates all 22 test requirements.
 */

import { authService, sanitizeUser } from '../src/server/services/authService.ts';
import { otpService } from '../src/server/services/otpService.ts';
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

async function runFullSuite() {
  console.log('================================================================');
  console.log('   FULL EMAIL OTP & SECURITY COMPREHENSIVE TEST SUITE (22 TESTS)');
  console.log('================================================================\n');

  await runMigrations();

  const ts = Date.now();
  const validEmail = `alpha_trader_${ts}@example.com`;
  const validUserId = `vtx_user_${ts}`;
  const validPassword = 'SecurePass@2026';
  const validMobile = '9' + Math.floor(100000000 + Math.random() * 900000000).toString();

  // --- 1. Valid Signup ---
  console.log('--- 1. Valid Signup ---');
  const signupResult = await authService.register(
    {
      fullName: 'Alpha Trader',
      userId: validUserId,
      email: validEmail,
      countryCode: '+91',
      mobile: validMobile,
      password: validPassword,
      confirmPassword: validPassword,
    },
    'tenant-a',
    '127.0.0.1'
  );
  assert(signupResult.user.userId === validUserId, 'User registered successfully with valid payload');
  const createdRecord = db.findUserByUserId(validUserId);
  assert(createdRecord?.status === 'PENDING_EMAIL_VERIFICATION', 'Account status set to PENDING_EMAIL_VERIFICATION');

  // --- 2. Invalid Email Validation ---
  console.log('\n--- 2. Invalid Email Validation ---');
  let invalidEmailCaught = false;
  try {
    registerSchema.parse({
      fullName: 'Test User',
      userId: `vtx_inv_${ts}`,
      email: 'not-an-email',
      countryCode: '+91',
      mobile: '9876543210',
      password: validPassword,
      confirmPassword: validPassword,
    });
  } catch (err: any) {
    const msg = err.message || JSON.stringify(err);
    if (msg.includes('valid email')) {
      invalidEmailCaught = true;
    }
  }
  assert(invalidEmailCaught, 'Invalid email schema validation enforced');

  // --- 3. Duplicate Email ---
  console.log('\n--- 3. Duplicate Email Rejection ---');
  let duplicateEmailCaught = false;
  try {
    await authService.register(
      {
        fullName: 'Duplicate Trader',
        userId: `vtx_dup_user_${ts}`,
        email: validEmail.toUpperCase(), // Test case insensitivity
        countryCode: '+91',
        mobile: '9' + Math.floor(100000000 + Math.random() * 900000000).toString(),
        password: validPassword,
        confirmPassword: validPassword,
      },
      'tenant-a',
      '127.0.0.1'
    );
  } catch (err: any) {
    if (err.statusCode === 409 && err.message.includes('Email address is already registered')) {
      duplicateEmailCaught = true;
    }
  }
  assert(duplicateEmailCaught, 'Duplicate email registration rejected with HTTP 409 Conflict');

  // --- 4. Duplicate User ID ---
  console.log('\n--- 4. Duplicate User ID Rejection ---');
  let duplicateUserCaught = false;
  try {
    await authService.register(
      {
        fullName: 'Duplicate UserId Trader',
        userId: validUserId.toUpperCase(),
        email: `new_email_${ts}@example.com`,
        countryCode: '+91',
        mobile: '9' + Math.floor(100000000 + Math.random() * 900000000).toString(),
        password: validPassword,
        confirmPassword: validPassword,
      },
      'tenant-a',
      '127.0.0.1'
    );
  } catch (err: any) {
    if (err.statusCode === 409 && err.message.includes('User ID is already taken')) {
      duplicateUserCaught = true;
    }
  }
  assert(duplicateUserCaught, 'Duplicate User ID registration rejected with HTTP 409 Conflict');

  // --- 5. Weak Password Rejection ---
  console.log('\n--- 5. Weak Password Validation ---');
  let weakPasswordCaught = false;
  try {
    registerSchema.parse({
      fullName: 'Weak Pass Trader',
      userId: `vtx_weak_${ts}`,
      email: `weak_${ts}@example.com`,
      countryCode: '+91',
      mobile: '9876543210',
      password: '123',
      confirmPassword: '123',
    });
  } catch {
    weakPasswordCaught = true;
  }
  assert(weakPasswordCaught, 'Weak password rejected by password strength criteria');

  // --- 6. Password Mismatch ---
  console.log('\n--- 6. Password Mismatch Validation ---');
  let passwordMismatchCaught = false;
  try {
    registerSchema.parse({
      fullName: 'Mismatch Trader',
      userId: `vtx_mismatch_${ts}`,
      email: `mismatch_${ts}@example.com`,
      countryCode: '+91',
      mobile: '9876543210',
      password: validPassword,
      confirmPassword: 'DifferentPassword@2026',
    });
  } catch (err: any) {
    const msg = err.message || JSON.stringify(err);
    if (msg.includes('match') || msg.includes('Match')) {
      passwordMismatchCaught = true;
    }
  }
  assert(passwordMismatchCaught, 'Password mismatch correctly caught in frontend/schema validation');

  // --- 14. Login Before Email Verification (Pre-Verification Check) ---
  console.log('\n--- 14. Login Blocked Before Email Verification ---');
  let preVerifyLoginBlocked = false;
  try {
    await authService.login(validUserId, validPassword, '127.0.0.1');
  } catch (err: any) {
    if (err.statusCode === 403 && err.requiresVerification) {
      preVerifyLoginBlocked = true;
    }
  }
  assert(preVerifyLoginBlocked, 'Account login strictly blocked with 403 prior to email OTP verification');

  // --- 8. Wrong OTP ---
  console.log('\n--- 8. Wrong OTP Handling ---');
  const wrongOtpResult = await otpService.verifyOtp(validUserId, '999999', 'registration', '127.0.0.1');
  assert(wrongOtpResult.valid === false, 'Wrong OTP code safely rejected');
  assert(Boolean(wrongOtpResult.error?.includes('remaining')), 'Error response indicates remaining attempts');

  // --- 12. Resend Before Cooldown ---
  console.log('\n--- 12. Resend Before 60-Second Cooldown ---');
  let resendBlocked = false;
  try {
    await authService.resendOtp(validUserId, 'registration', '127.0.0.1');
  } catch (err: any) {
    if (err.statusCode === 429 && err.message.includes('seconds')) {
      resendBlocked = true;
    }
  }
  assert(resendBlocked, 'Resend request within 60s cooldown blocked with HTTP 429 Too Many Requests');

  // --- 7. OTP Success & Account Activation ---
  console.log('\n--- 7. OTP Success & Activation ---');
  const activeOtpRecord = db.getLatestActiveOtp(validUserId, 'registration');
  const rawOtp = signupResult.devOtp || activeOtpRecord?.dev_otp_preview!;
  const verifyRes = await authService.verifyRegistrationOtp(validUserId, rawOtp, '127.0.0.1');
  assert(verifyRes.success === true, 'Registration OTP verified successfully');
  const activatedRecord = db.findUserByUserId(validUserId);
  assert(activatedRecord?.status === 'ACTIVE', 'Account status transitioned to ACTIVE');
  assert(activatedRecord?.is_verified === true, 'is_verified updated to true');
  assert(Boolean(activatedRecord?.email_verified_at), `email_verified_at set to ${activatedRecord?.email_verified_at}`);

  // --- 10. OTP Reuse Prevention ---
  console.log('\n--- 10. OTP Reuse Prevention ---');
  const reuseRes = await otpService.verifyOtp(validUserId, rawOtp, 'registration', '127.0.0.1');
  assert(reuseRes.valid === false, 'Previously verified OTP cannot be reused (Single-use enforcement)');

  // --- 11. More Than 5 OTP Attempts ---
  console.log('\n--- 11. Max 5 OTP Attempts Invalidation ---');
  const multiUserId = `vtx_max_att_${ts}`;
  await authService.register(
    {
      fullName: 'Max Attempt Trader',
      userId: multiUserId,
      email: `max_att_${ts}@example.com`,
      countryCode: '+91',
      mobile: '9' + Math.floor(100000000 + Math.random() * 900000000).toString(),
      password: validPassword,
      confirmPassword: validPassword,
    },
    'tenant-a',
    '127.0.0.2'
  );
  let maxAttemptsExceeded = false;
  for (let i = 1; i <= 6; i++) {
    const attemptRes = await otpService.verifyOtp(multiUserId, '111111', 'registration', '127.0.0.2');
    if (!attemptRes.valid && attemptRes.statusCode === 429) {
      maxAttemptsExceeded = true;
    }
  }
  assert(maxAttemptsExceeded, 'Exceeding 5 verification attempts invalidates OTP record');

  // --- 9. Expired OTP ---
  console.log('\n--- 9. Expired OTP Rejection ---');
  const expUserId = `vtx_expired_${ts}`;
  await authService.register(
    {
      fullName: 'Expired OTP Trader',
      userId: expUserId,
      email: `exp_${ts}@example.com`,
      countryCode: '+91',
      mobile: '9' + Math.floor(100000000 + Math.random() * 900000000).toString(),
      password: validPassword,
      confirmPassword: validPassword,
    },
    'tenant-a',
    '127.0.0.3'
  );
  const expOtpRecord = db.getLatestActiveOtp(expUserId, 'registration');
  if (expOtpRecord) {
    // Simulate past expiry timestamp
    expOtpRecord.expires_at = new Date(Date.now() - 10000).toISOString();
  }
  const expRes = await otpService.verifyOtp(expUserId, '123456', 'registration', '127.0.0.3');
  assert(expRes.valid === false && expRes.error?.includes('expired') === true, 'Expired OTP code correctly rejected');

  // --- 13. OTP Spam / Rate Limiting ---
  console.log('\n--- 13. OTP Spam & Rate Limiting ---');
  const spamUserId = `vtx_spam_${ts}`;
  await authService.register(
    {
      fullName: 'Spam Trader',
      userId: spamUserId,
      email: `spam_${ts}@example.com`,
      countryCode: '+91',
      mobile: '9' + Math.floor(100000000 + Math.random() * 900000000).toString(),
      password: validPassword,
      confirmPassword: validPassword,
    },
    'tenant-a',
    '10.0.0.99'
  );
  let rateLimitHit = false;
  for (let i = 0; i < 7; i++) {
    try {
      await otpService.createAndSendOtp(
        spamUserId,
        { email: `spam_${ts}@example.com` },
        'registration',
        '10.0.0.99'
      );
    } catch (err: any) {
      if (err.statusCode === 429) {
        rateLimitHit = true;
      }
    }
  }
  assert(rateLimitHit, 'Sliding window rate limiter blocks OTP spam attempts (HTTP 429)');

  // --- 15. Login After Verification ---
  console.log('\n--- 15. Login After Verification ---');
  const loginResult = await authService.login(validUserId, validPassword, '127.0.0.1');
  assert(Boolean(loginResult.token), 'Login succeeds after email verification');
  assert(loginResult.user.status === 'ACTIVE', 'Authenticated user state is ACTIVE');

  // --- 16. Wrong Password Handling ---
  console.log('\n--- 16. Wrong Password Rejection ---');
  let wrongPassCaught = false;
  try {
    await authService.login(validUserId, 'WrongPassword@999', '127.0.0.1');
  } catch (err: any) {
    if (err.statusCode === 401 && err.message.includes('Invalid User ID or password')) {
      wrongPassCaught = true;
    }
  }
  assert(wrongPassCaught, 'Wrong password rejected with generic 401 error message');

  // --- 18. Locked Account Handling ---
  console.log('\n--- 18. Account Lockout After Failed Attempts ---');
  const lockUserId = `vtx_lock_${ts}`;
  const lockReg = await authService.register(
    {
      fullName: 'Lockout Trader',
      userId: lockUserId,
      email: `lock_${ts}@example.com`,
      countryCode: '+91',
      mobile: '9' + Math.floor(100000000 + Math.random() * 900000000).toString(),
      password: validPassword,
      confirmPassword: validPassword,
    },
    'tenant-a',
    '127.0.0.1'
  );
  await authService.verifyRegistrationOtp(lockUserId, lockReg.devOtp!, '127.0.0.1');
  for (let i = 0; i < 5; i++) {
    try {
      await authService.login(lockUserId, 'BadPass@123', '127.0.0.1');
    } catch {}
  }
  let accountLocked = false;
  try {
    await authService.login(lockUserId, validPassword, '127.0.0.1');
  } catch (err: any) {
    if (err.statusCode === 403 && err.code === 'ACCOUNT_LOCKED') {
      accountLocked = true;
    }
  }
  assert(accountLocked, 'Account locked for 15 minutes after 5 consecutive failed logins');

  // --- 17. Suspended Account Handling ---
  console.log('\n--- 17. Suspended Account Handling ---');
  const suspUserId = `vtx_susp_${ts}`;
  const suspReg = await authService.register(
    {
      fullName: 'Suspended Trader',
      userId: suspUserId,
      email: `susp_${ts}@example.com`,
      countryCode: '+91',
      mobile: '9' + Math.floor(100000000 + Math.random() * 900000000).toString(),
      password: validPassword,
      confirmPassword: validPassword,
    },
    'tenant-a',
    '127.0.0.1'
  );
  await authService.verifyRegistrationOtp(suspUserId, suspReg.devOtp!, '127.0.0.1');
  db.setUserFrozen(suspUserId, true);
  let loginSuspended = false;
  try {
    await authService.login(suspUserId, validPassword, '127.0.0.1');
  } catch (err: any) {
    if (err.statusCode === 403 && err.code === 'ACCOUNT_SUSPENDED') {
      loginSuspended = true;
    }
  }
  assert(loginSuspended, 'Suspended/frozen user login rejected with HTTP 403 ACCOUNT_SUSPENDED');

  // --- 19. Session Revocation / Logout ---
  console.log('\n--- 19. Logout / Session Revocation ---');
  authService.revokeToken(loginResult.token, validUserId, '127.0.0.1');
  const isRevoked = authService.isTokenRevoked(loginResult.token);
  assert(isRevoked === true, 'Session token revoked and added to blacklist upon logout');

  // --- 20. Forgot Password Flow ---
  console.log('\n--- 20. Forgot Password Flow ---');
  const forgotRes = await authService.forgotPassword(validUserId, '127.0.0.1');
  assert(forgotRes.success === true, 'Forgot password request initiated successfully');
  const forgotDevOtp = forgotRes.devOtp;
  assert(Boolean(forgotDevOtp), 'Password reset OTP code generated');
  const resetRes = await authService.resetPassword(
    {
      userId: validUserId,
      otp: forgotDevOtp!,
      newPassword: 'NewSecurePassword@2026',
      confirmPassword: 'NewSecurePassword@2026',
    },
    '127.0.0.1'
  );
  assert(resetRes.success === true, 'Password reset succeeded with valid OTP');
  const newLoginRes = await authService.login(validUserId, 'NewSecurePassword@2026', '127.0.0.1');
  assert(Boolean(newLoginRes.token), 'Login successful with new password');

  // --- 21. No Secret/OTP/Credential Leaks in Output Objects ---
  console.log('\n--- 21. Secret & OTP Leak Inspection ---');
  const sanitizedUser = sanitizeUser(db.findUserByUserId(validUserId)!);
  const jsonUser = JSON.stringify(sanitizedUser);
  assert(!jsonUser.includes('password_hash'), 'Sanitized user object NEVER contains password_hash');
  assert(!jsonUser.includes('RESEND_API_KEY'), 'Sanitized user object NEVER contains API keys');
  const rawDbRecord = JSON.stringify(db.findUserByUserId(validUserId)!);
  assert(!rawDbRecord.includes('"otp":'), 'Database user record NEVER stores plaintext OTP');

  // --- 22. Tenant Isolation Verification ---
  console.log('\n--- 22. Tenant Isolation Verification ---');
  const tenantAUsers = db.getUsersByTenant('tenant-a');
  const tenantBUsers = db.getUsersByTenant('tenant-b');
  assert(tenantAUsers.some((u) => u.user_id === validUserId), 'User belongs to Tenant A');
  assert(!tenantBUsers.some((u) => u.user_id === validUserId), 'User strictly ISOLATED from Tenant B');

  console.log('\n================================================================');
  console.log('   ALL 22 COMPREHENSIVE EMAIL OTP & SECURITY TESTS PASSED!');
  console.log('================================================================');
}

runFullSuite().catch((err) => {
  console.error('[FATAL SUITE ERROR]', err);
  process.exit(1);
});
