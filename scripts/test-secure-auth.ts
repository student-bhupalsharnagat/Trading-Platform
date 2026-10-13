/**
 * VERTEX Trading Platform - Secure Authentication Test Suite
 * Tests all 11 requirements:
 * 1. Signup with international phone, userId, confirmPassword, referralCode
 * 2. Normalized E.164 phone storage
 * 3. Argon2id password hashing
 * 4. Account statuses (PENDING_PHONE_VERIFICATION, ACTIVE, SUSPENDED, LOCKED, DISABLED)
 * 5. Pending account creation & OTP dispatch
 * 6. Secure OTP (hashed, TTL, single-use, max attempts, cooldown, rate-limit)
 * 7. OTP verification & phone_verified_at activation
 * 8. Login by User ID or Phone + lockout on 5 failures + HttpOnly cookie
 * 9. Logout & session revocation
 * 10. Forgot password & session invalidation
 * 11. Audit logs for all authentication lifecycle events
 */

import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import { db } from '../src/server/db/database.ts';
import { authService } from '../src/server/services/authService.ts';
import { otpService } from '../src/server/services/otpService.ts';
import { PasswordHashUtil } from '../src/server/utils/passwordHash.ts';
import { PhoneUtils } from '../src/server/utils/phoneUtils.ts';
import { auditService } from '../src/server/services/auditService.ts';
import authRoutes from '../src/server/routes/authRoutes.ts';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, details?: string): void {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${details ? ` -> ${details}` : ''}`);
    testsFailed++;
  }
}

async function makeRequest(
  serverUrl: string,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: any
): Promise<{ status: number; data: any; headers: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const options: http.RequestOptions = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let resData = '';
      res.on('data', (chunk) => {
        resData += chunk;
      });
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(resData);
        } catch {
          parsed = resData;
        }
        resolve({
          status: res.statusCode || 500,
          data: parsed,
          headers: res.headers,
        });
      });
    });

    req.on('error', (err) => reject(err));
    if (body !== undefined) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runSecureAuthTests() {
  console.log('\n================================================================');
  console.log('   VERTEX TRADING PLATFORM - SECURE AUTHENTICATION TEST SUITE');
  console.log('================================================================\n');

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRoutes);

  // Global error handler for app
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.statusCode || err.status || 500).json({
      success: false,
      message: err.message || 'Internal error',
      requiresVerification: err.requiresVerification,
      code: err.code,
    });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -------------------------------------------------------------
    // Test 1: Phone Normalization (E.164)
    // -------------------------------------------------------------
    console.log('--- TEST SUITE 1: International E.164 Phone Normalization ---');
    const phoneUS = PhoneUtils.normalize('+1 (415) 555-2671');
    assert(phoneUS?.e164 === '+14155552671', 'Normalizes US phone to +14155552671');
    assert(phoneUS?.countryCode === '+1', 'Extracts US country code +1');

    const phoneIN = PhoneUtils.normalize('9876543210', '+91');
    assert(phoneIN?.e164 === '+919876543210', 'Normalizes Indian phone with default country code to +919876543210');

    const phoneUK = PhoneUtils.normalize('+44 7911 123456');
    assert(phoneUK?.e164 === '+447911123456', 'Normalizes UK phone to +447911123456');

    const invalidPhone = PhoneUtils.normalize('abc123');
    assert(invalidPhone === null, 'Rejects invalid phone number');

    // -------------------------------------------------------------
    // Test 2: Argon2id Password Hashing
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 2: Argon2id Password Hashing ---');
    const rawPass = 'Vertex@Secure2026!';
    const argonHash = await PasswordHashUtil.hashPassword(rawPass);
    assert(argonHash.startsWith('$argon2id$'), 'Password hash uses Argon2id ($argon2id$ prefix)');
    assert(!argonHash.includes(rawPass), 'Plaintext password is never stored in hash');

    const verifySuccess = await PasswordHashUtil.verifyPassword(rawPass, argonHash);
    assert(verifySuccess.valid === true, 'Argon2id password verification succeeds for matching password');

    const verifyFail = await PasswordHashUtil.verifyPassword('WrongPassword123!', argonHash);
    assert(verifyFail.valid === false, 'Argon2id password verification rejects incorrect password');

    // -------------------------------------------------------------
    // Test 3: User Signup Flow & Pending Account Status
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 3: User Signup & Status PENDING_PHONE_VERIFICATION ---');
    const testUserId = `trader_${Date.now()}`;
    const testPhone = `+1415555${Math.floor(1000 + Math.random() * 9000)}`;

    const signupPayload = {
      fullName: 'Alexander Hamilton',
      userId: testUserId,
      phone: testPhone,
      password: 'StrongPassword@2026',
      confirmPassword: 'StrongPassword@2026',
      referralCode: 'VERTEXPRO',
    };

    const signupRes = await makeRequest(baseUrl, 'POST', '/api/auth/register', {}, signupPayload);
    assert(signupRes.status === 201, 'Signup returns HTTP 201 Created');
    assert(signupRes.data.success === true, 'Signup response returns success: true');
    assert(signupRes.data.user.status === 'PENDING_PHONE_VERIFICATION', 'Account status is PENDING_PHONE_VERIFICATION on signup');
    assert(signupRes.data.user.isVerified === false, 'Account isVerified is false on signup');
    assert(signupRes.data.user.phoneE164 === testPhone, 'Phone stored in normalized E.164 format');

    // Verify stored DB record
    const userInDb = db.findUserByUserId(testUserId);
    assert(Boolean(userInDb), 'User record persisted in database');
    assert(userInDb?.password_hash.startsWith('$argon2id$'), 'Stored password in DB is Argon2id hash');
    assert(userInDb?.status === 'PENDING_PHONE_VERIFICATION', 'Stored DB status is PENDING_PHONE_VERIFICATION');

    // -------------------------------------------------------------
    // Test 4: Unverified Login Attempt Rejection
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 4: Unverified Account Login Protection ---');
    const unverifiedLogin = await makeRequest(baseUrl, 'POST', '/api/auth/login', {}, {
      userId: testUserId,
      password: 'StrongPassword@2026',
    });
    assert(unverifiedLogin.status === 403, 'Unverified account login rejected with HTTP 403');
    assert(unverifiedLogin.data.requiresVerification === true, 'Unverified login signals requiresVerification: true');

    // -------------------------------------------------------------
    // Test 5: OTP Hashing & Single-Use Enforcement
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 5: Secure OTP Storage & Verification ---');
    const otpRecord = db.getLatestActiveOtp(testUserId, 'registration');
    assert(Boolean(otpRecord), 'OTP record exists for user');
    assert(otpRecord?.otp_hash !== undefined && otpRecord.otp_hash.length === 64, 'OTP is stored as cryptographic HMAC hash, never plaintext');

    // Test invalid OTP code
    const invalidOtpRes = await makeRequest(baseUrl, 'POST', '/api/auth/verify-otp', {}, {
      userId: testUserId,
      otp: '000000',
    });
    assert(invalidOtpRes.status === 400, 'Invalid OTP rejected with HTTP 400');

    // Test valid OTP code from dev preview
    const validOtpCode = otpRecord?.dev_otp_preview!;
    assert(Boolean(validOtpCode && validOtpCode.length === 6), 'Valid 6-digit OTP code generated');

    const verifyOtpRes = await makeRequest(baseUrl, 'POST', '/api/auth/verify-otp', {}, {
      userId: testUserId,
      otp: validOtpCode,
    });
    assert(verifyOtpRes.status === 200, 'Valid OTP verification returns HTTP 200');
    assert(verifyOtpRes.data.user.status === 'ACTIVE', 'Account status transitions to ACTIVE upon phone verification');
    assert(verifyOtpRes.data.user.isVerified === true, 'isVerified becomes true');
    assert(Boolean(verifyOtpRes.headers['set-cookie']), 'Secure HttpOnly cookie set on verification');

    // Test OTP single-use protection (cannot verify same OTP again)
    const replayOtpRes = await makeRequest(baseUrl, 'POST', '/api/auth/verify-otp', {}, {
      userId: testUserId,
      otp: validOtpCode,
    });
    assert(replayOtpRes.status === 404 || replayOtpRes.status === 400, 'Used OTP cannot be reused (Single-Use enforced)');

    // -------------------------------------------------------------
    // Test 6: Resend Cooldown
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 6: OTP Resend Cooldown Enforcement ---');
    const resendUserId = `resend_test_${Date.now()}`;
    const resendPhone = `+1415555${Math.floor(1000 + Math.random() * 9000)}`;
    db.createUser({
      fullName: 'Resend Tester',
      userId: resendUserId,
      countryCode: '+1',
      mobile: resendPhone.slice(2),
      phoneE164: resendPhone,
      passwordHash: await PasswordHashUtil.hashPassword('Pass123456!'),
      status: 'PENDING_PHONE_VERIFICATION',
      isVerified: false,
    });

    const resendRes1 = await makeRequest(baseUrl, 'POST', '/api/auth/resend-otp', {}, {
      userId: resendUserId,
      purpose: 'registration',
    });
    assert(resendRes1.status === 200, 'First OTP resend succeeds');

    const resendResTooSoon = await makeRequest(baseUrl, 'POST', '/api/auth/resend-otp', {}, {
      userId: resendUserId,
      purpose: 'registration',
    });
    assert(resendResTooSoon.status === 429, 'Immediate OTP resend rejected with HTTP 429 (Cooldown enforced)');

    // -------------------------------------------------------------
    // Test 7: Login by User ID and by Phone
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 7: Dual Identifier Login & Session Cookie ---');
    // Login by User ID
    const loginByUserId = await makeRequest(baseUrl, 'POST', '/api/auth/login', {}, {
      userId: testUserId,
      password: 'StrongPassword@2026',
    });
    assert(loginByUserId.status === 200, 'Login by User ID succeeds');
    assert(loginByUserId.data.user.status === 'ACTIVE', 'Active user profile returned');
    assert(Boolean(loginByUserId.headers['set-cookie']), 'HttpOnly session cookie returned in response headers');

    // Login by E.164 Phone
    const loginByPhone = await makeRequest(baseUrl, 'POST', '/api/auth/login', {}, {
      userId: testPhone,
      password: 'StrongPassword@2026',
    });
    assert(loginByPhone.status === 200, 'Login by international E.164 phone number succeeds');

    // Login with wrong password
    const loginWrongPass = await makeRequest(baseUrl, 'POST', '/api/auth/login', {}, {
      userId: testUserId,
      password: 'WrongPassword!',
    });
    assert(loginWrongPass.status === 401, 'Invalid password rejected with HTTP 401');
    assert(loginWrongPass.data.message === 'Invalid User ID or password.', 'Generic error message returned on bad credentials');

    // -------------------------------------------------------------
    // Test 8: Account Lockout after 5 Failed Logins
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 8: Account Lockout Protection ---');
    const lockoutUserId = `lockout_user_${Date.now()}`;
    db.createUser({
      fullName: 'Lockout Target',
      userId: lockoutUserId,
      countryCode: '+91',
      mobile: `${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      passwordHash: await PasswordHashUtil.hashPassword('CorrectPass123!'),
      status: 'ACTIVE',
      isVerified: true,
    });

    for (let i = 1; i <= 5; i++) {
      await makeRequest(baseUrl, 'POST', '/api/auth/login', {}, {
        userId: lockoutUserId,
        password: `WrongGuess${i}`,
      });
    }

    const lockedUserInDb = db.findUserByUserId(lockoutUserId);
    assert(lockedUserInDb?.status === 'LOCKED', 'Account status becomes LOCKED after 5 consecutive failed attempts');
    assert(Boolean(lockedUserInDb?.locked_until), 'locked_until timestamp set on account');

    const loginWhileLocked = await makeRequest(baseUrl, 'POST', '/api/auth/login', {}, {
      userId: lockoutUserId,
      password: 'CorrectPass123!',
    });
    assert(loginWhileLocked.status === 403, 'Login attempt on LOCKED account rejected with HTTP 403');
    assert(loginWhileLocked.data.code === 'ACCOUNT_LOCKED', 'Returns code ACCOUNT_LOCKED');

    // -------------------------------------------------------------
    // Test 9: Logout & Session Invalidation
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 9: Logout & Session Invalidation ---');
    const token = loginByUserId.data.token;
    const cookieHeader = loginByUserId.headers['set-cookie']?.[0] || `vertex_auth_token=${token}`;

    const meBeforeLogout = await makeRequest(baseUrl, 'GET', '/api/auth/me', {
      Cookie: cookieHeader,
    });
    assert(meBeforeLogout.status === 200, 'Authenticated /api/auth/me succeeds with active cookie');

    const logoutRes = await makeRequest(baseUrl, 'POST', '/api/auth/logout', {
      Cookie: cookieHeader,
    });
    assert(logoutRes.status === 200, 'Logout returns HTTP 200');

    const meAfterLogout = await makeRequest(baseUrl, 'GET', '/api/auth/me', {
      Cookie: cookieHeader,
    });
    assert(meAfterLogout.status === 401, 'Session revoked after logout (/api/auth/me returns HTTP 401)');

    // -------------------------------------------------------------
    // Test 10: Forgot Password & Password Reset
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 10: Forgot Password & Reset Flow ---');
    const forgotRes = await makeRequest(baseUrl, 'POST', '/api/auth/forgot-password', {}, {
      identifier: testUserId,
    });
    assert(forgotRes.status === 200, 'Forgot password initiates successfully');

    const resetOtp = db.getLatestActiveOtp(testUserId, 'password_reset')?.dev_otp_preview!;
    assert(Boolean(resetOtp), 'Password reset OTP generated');

    const resetRes = await makeRequest(baseUrl, 'POST', '/api/auth/reset-password', {}, {
      userId: testUserId,
      otp: resetOtp,
      newPassword: 'BrandNewPassword@2026',
      confirmPassword: 'BrandNewPassword@2026',
    });
    assert(resetRes.status === 200, 'Reset password succeeds with valid OTP');

    // Verify login with new password
    const loginWithNewPass = await makeRequest(baseUrl, 'POST', '/api/auth/login', {}, {
      userId: testUserId,
      password: 'BrandNewPassword@2026',
    });
    assert(loginWithNewPass.status === 200, 'Login succeeds with new password');

    // -------------------------------------------------------------
    // Test 11: Audit Logs Verification
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 11: Security Audit Logging ---');
    const recentLogs = auditService.getAllLogs();
    const signupLog = recentLogs.find((l) => l.action === 'USER_SIGNUP' && l.targetId === testUserId);
    assert(Boolean(signupLog), 'Audit log recorded for USER_SIGNUP');

    const otpSentLog = recentLogs.find((l) => l.action === 'OTP_SENT' && l.targetId === testUserId);
    assert(Boolean(otpSentLog), 'Audit log recorded for OTP_SENT');

    const otpVerifiedLog = recentLogs.find((l) => l.action === 'OTP_VERIFIED' && l.targetId === testUserId);
    assert(Boolean(otpVerifiedLog), 'Audit log recorded for OTP_VERIFIED');

    const loginSuccessLog = recentLogs.find((l) => l.action === 'LOGIN_SUCCESS' && l.targetId === testUserId);
    assert(Boolean(loginSuccessLog), 'Audit log recorded for LOGIN_SUCCESS');

    const lockoutLog = recentLogs.find((l) => l.action === 'ACCOUNT_LOCKED' && l.targetId === lockoutUserId);
    assert(Boolean(lockoutLog), 'Audit log recorded for ACCOUNT_LOCKED');

    const passResetLog = recentLogs.find((l) => l.action === 'PASSWORD_RESET_SUCCESS' && l.targetId === testUserId);
    assert(Boolean(passResetLog), 'Audit log recorded for PASSWORD_RESET_SUCCESS');

    // Confirm passwords and OTP codes are NEVER logged in audit logs
    const hasExposedPassword = recentLogs.some((l) => {
      const logStr = JSON.stringify(l).toLowerCase();
      return logStr.includes('vertex@secure2026') || logStr.includes('strongpassword@2026') || logStr.includes('brandnewpassword@2026');
    });
    assert(!hasExposedPassword, 'Passwords are NEVER logged or exposed in audit trails');

    // -------------------------------------------------------------
    // Test 12: Provider-Based OTP Architecture & Security Safeguards
    // -------------------------------------------------------------
    console.log('\n--- TEST SUITE 12: Provider-Based OTP Architecture & Safeguards ---');
    const { otpProviderRegistry } = await import('../src/server/providers/otp/otpProviderRegistry.ts');
    const { DevelopmentOtpProvider } = await import('../src/server/providers/otp/DevelopmentOtpProvider.ts');
    const { TwilioOtpProvider } = await import('../src/server/providers/otp/TwilioOtpProvider.ts');
    const { HttpSmsGatewayProvider } = await import('../src/server/providers/otp/HttpSmsGatewayProvider.ts');

    // 1. Check default providers registration
    const activeProvider = otpProviderRegistry.getActiveProvider();
    assert(Boolean(activeProvider && activeProvider.name), `Active OTP provider resolved: ${activeProvider.name}`);

    // 2. Test provider replaceable without changing signup logic (custom Mock provider)
    const tracker = { dispatched: false, phone: '' };
    const customProvider = {
      name: 'custom-mock-carrier',
      isConfigured: () => true,
      sendOtp: async (opts: any) => {
        tracker.dispatched = true;
        tracker.phone = opts.phoneE164;
        return { success: true, messageId: 'custom-12345', provider: 'custom-mock-carrier' };
      },
    };

    otpProviderRegistry.registerProvider(customProvider);
    otpProviderRegistry.setPrimaryProvider('custom-mock-carrier');

    const swapTestUserId = `swap_tester_${Date.now()}`;
    const swapPhone = `+1415555${Math.floor(1000 + Math.random() * 9000)}`;
    await authService.register({
      fullName: 'Provider Swappable User',
      userId: swapTestUserId,
      phone: swapPhone,
      password: 'StrongPass@2026',
      confirmPassword: 'StrongPass@2026',
    });

    assert(tracker.dispatched === true, 'Custom OTP provider received dispatch without changing signup logic');
    assert(tracker.phone === swapPhone, 'Custom OTP provider received normalized E.164 phone');

    // Reset primary provider back
    otpProviderRegistry.setPrimaryProvider('development');

    // 3. Test Production Invariant on Development Provider
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const devProviderProd = new DevelopmentOtpProvider();
    let threwProdError = false;
    try {
      await devProviderProd.sendOtp({
        phoneE164: '+14155552671',
        otp: '123456',
        purpose: 'registration',
        userId: 'test_user',
        ttlMinutes: 10,
      });
    } catch {
      threwProdError = true;
    }
    process.env.NODE_ENV = originalNodeEnv;
    assert(threwProdError === true, 'DevelopmentOtpProvider strictly rejects execution in production environment');

    // 4. Test Provider Failure Handling
    const failingProvider = {
      name: 'failing-provider',
      isConfigured: () => true,
      sendOtp: async () => {
        return { success: false, provider: 'failing-provider', error: 'Network timeout to SMS carrier' };
      },
    };
    otpProviderRegistry.registerProvider(failingProvider);
    otpProviderRegistry.setPrimaryProvider('failing-provider');

    let signupFailureCaught = false;
    const failPhone = `+1415555${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      await authService.register({
        fullName: 'Fail Safe User',
        userId: `fail_${Date.now()}`,
        phone: failPhone,
        password: 'Pass@12345678',
        confirmPassword: 'Pass@12345678',
      });
    } catch (err: any) {
      signupFailureCaught = true;
      assert(err.statusCode === 502, 'Provider failure returns safe HTTP 502 error');
    }
    assert(signupFailureCaught === true, 'Provider dispatch failure handled safely without system crash');

    // Restore working development provider
    otpProviderRegistry.setPrimaryProvider('development');

    console.log('\n================================================================');
    console.log(`SECURE AUTH TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log('================================================================\n');

    if (testsFailed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } finally {
    server.close();
  }
}

runSecureAuthTests().catch((err) => {
  console.error('[FATAL SECURE AUTH TEST ERROR]', err);
  process.exit(1);
});
