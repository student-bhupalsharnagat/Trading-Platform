import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db, type UserRecord, type AccountStatus } from '../db/database.ts';
import { otpService } from './otpService.ts';
import { PasswordHashUtil } from '../utils/passwordHash.ts';
import { PhoneUtils } from '../utils/phoneUtils.ts';
import { auditService } from './auditService.ts';
import { transactionalOutboxService } from './TransactionalOutboxService.ts';
import { internalEventDispatcher } from '../events/InternalEventDispatcher.ts';
import type { ClientRegisteredPayload, ClientActivatedPayload } from '../events/types.ts';
import { postgresClientMappingRepository } from '../repositories/trading/PostgresClientMappingRepository.ts';
import type { RegisterInput, ResetPasswordInput } from '../schemas/authSchemas.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'vertex_jwt_secret_dev_key_2026_super_secure';
const JWT_EXPIRES_IN = '7d';

export interface SafeUser {
  id: string;
  fullName: string;
  userId: string;
  countryCode: string;
  mobile: string;
  phoneE164?: string;
  phoneVerifiedAt?: string;
  email?: string;
  role?: string;
  parentId?: string | null;
  hierarchyPath?: string;
  company?: string;
  isVerified: boolean;
  status: AccountStatus;
  isFrozen?: boolean;
  tenantId?: string;
  referralCode?: string;
  createdAt: string;
  lastLoginAt?: string;
  demoBalance?: number;
}

export function sanitizeUser(user: UserRecord): SafeUser {
  return {
    id: user.id,
    fullName: user.full_name,
    userId: user.user_id,
    countryCode: user.country_code,
    mobile: user.mobile,
    phoneE164: user.phone_e164,
    phoneVerifiedAt: user.phone_verified_at,
    email: user.email,
    role: user.role || 'CLIENT',
    parentId: user.parent_id || null,
    hierarchyPath: user.hierarchy_path || `root.${user.user_id}`,
    company: user.company,
    isVerified: user.is_verified,
    status: user.status,
    isFrozen: user.is_frozen ?? (user.status === 'suspended' || user.status === 'SUSPENDED'),
    tenantId: user.tenant_id || 'vertex-default',
    referralCode: user.referral_code,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    demoBalance: user.demo_balance,
  };
}

export class AuthService {
  private revokedTokens = new Set<string>();

  /**
   * Register a new user and generate initial OTP
   */
  public async register(
    input: RegisterInput,
    tenantId?: string,
    ipAddress?: string
  ): Promise<{
    user: SafeUser;
    devOtp?: string;
    expiresAt: Date;
    message: string;
  }> {
    const normalizedUserId = input.userId.trim().toLowerCase();

    // Normalize phone number to E.164
    const rawPhone = input.phone || input.mobile || '';
    const normalizedPhone = PhoneUtils.normalize(rawPhone, input.countryCode || '+91');

    if (!normalizedPhone) {
      const err = new Error('Invalid international phone number.');
      (err as any).statusCode = 400;
      (err as any).field = 'mobile';
      throw err;
    }

    // Normalize email
    const normalizedEmail = (input.email && input.email.trim().length > 0)
      ? input.email.trim().toLowerCase()
      : `${normalizedUserId}@vertex-trading.com`;

    // Check duplicate User ID (scoped per tenant)
    if (db.findUserByUserId(normalizedUserId)) {
      const err = new Error('User ID is already taken.');
      (err as any).statusCode = 409;
      (err as any).field = 'userId';
      throw err;
    }

    // Check duplicate Email
    if (db.findUserByEmail(normalizedEmail)) {
      const err = new Error('Email address is already registered.');
      (err as any).statusCode = 409;
      (err as any).field = 'email';
      throw err;
    }

    // Check duplicate Mobile / E.164 Phone
    if (db.findUserByPhoneE164(normalizedPhone.e164)) {
      const err = new Error('Phone number is already registered with another account.');
      (err as any).statusCode = 409;
      (err as any).field = 'mobile';
      throw err;
    }

    // Validate referral code if provided
    let referredBy: string | undefined = undefined;
    if (input.referralCode && input.referralCode.trim().length > 0) {
      const isValidReferral = db.validateReferralCode(input.referralCode);
      if (!isValidReferral) {
        const err = new Error('Invalid or expired referral code.');
        (err as any).statusCode = 400;
        (err as any).field = 'referralCode';
        throw err;
      }
      referredBy = input.referralCode.trim().toUpperCase();
    }

    // Hash password with Argon2id (never store plaintext)
    const passwordHash = await PasswordHashUtil.hashPassword(input.password);

    // Save pending user to database (status: PENDING_EMAIL_VERIFICATION)
    const user = db.createUser({
      fullName: input.fullName,
      userId: normalizedUserId,
      email: normalizedEmail,
      countryCode: normalizedPhone.countryCode,
      mobile: normalizedPhone.nationalNumber,
      phoneE164: normalizedPhone.e164,
      passwordHash,
      referralCode: `VTX${Math.floor(1000 + Math.random() * 9000)}`,
      referredBy,
      isVerified: false,
      status: 'PENDING_EMAIL_VERIFICATION',
      tenantId: tenantId || 'vertex-default',
    });

    // Generate & dispatch secure OTP (dispatched via EmailOtpProvider abstraction)
    const otpResult = await otpService.createAndSendOtp(
      user.user_id,
      {
        email: user.email,
        countryCode: user.country_code,
        mobile: user.mobile,
        phoneE164: user.phone_e164,
      },
      'registration',
      ipAddress
    );

    // Audit Log signup & OTP send events
    auditService.log({
      actorId: user.user_id,
      actorName: user.full_name,
      actorRole: 'CLIENT',
      action: 'USER_SIGNUP',
      module: 'AUTH',
      targetId: user.user_id,
      targetName: user.full_name,
      ipAddress,
      newValue: {
        userId: user.user_id,
        email: user.email,
        status: 'PENDING_EMAIL_VERIFICATION',
        tenantId: user.tenant_id,
      },
    });

    auditService.log({
      actorId: user.user_id,
      actorName: user.full_name,
      actorRole: 'CLIENT',
      action: 'EMAIL_OTP_SENT',
      module: 'AUTH',
      targetId: user.user_id,
      ipAddress,
      newValue: {
        purpose: 'registration',
        email: user.email,
        expiresAt: otpResult.expiresAt.toISOString(),
      },
    });

    // Publish idempotent Central Admin client.registered event (zero credentials/secrets exposed)
    const clientRegPayload: ClientRegisteredPayload = {
      tenantId: user.tenant_id || 'vertex-default',
      tradingUserId: user.user_id,
      userId: user.user_id,
      clientCode: user.user_id.toUpperCase(),
      name: user.full_name,
      email: user.email,
      phone: user.phone_e164 || user.mobile,
      status: user.status,
      createdAt: user.created_at,
    };

    transactionalOutboxService.enqueue({
      eventId: `evt-reg-${user.user_id}-${Date.now()}`,
      eventType: 'client.registered',
      tenantId: user.tenant_id || 'vertex-default',
      payload: clientRegPayload,
    }).catch((e) => console.warn('[Outbox] Client registration event enqueue warning:', e));

    internalEventDispatcher.dispatchClientRegistered(clientRegPayload).catch((e) =>
      console.warn('[Event] Client registration event dispatch warning:', e)
    );

    return {
      user: sanitizeUser(user),
      devOtp: otpResult.devOtp,
      expiresAt: otpResult.expiresAt,
      message: 'Account created. Please verify your phone number with the OTP code sent to your mobile.',
    };
  }

  /**
   * Verify registration OTP and activate account
   */
  public async verifyRegistrationOtp(
    userId: string,
    otp: string,
    ipAddress?: string
  ): Promise<{
    success: boolean;
    user: SafeUser;
    token: string;
  }> {
    const normalizedUserId = userId.trim().toLowerCase();
    const user = db.findUserByUserId(normalizedUserId);

    if (!user) {
      const err = new Error('Account not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    const verification = await otpService.verifyOtp(normalizedUserId, otp, 'registration', ipAddress);
    if (!verification.valid) {
      const err = new Error(verification.error || 'Verification failed.');
      (err as any).statusCode = verification.statusCode || 400;
      throw err;
    }

    // Mark user verified and activate account
    db.markUserVerified(normalizedUserId);
    const updatedUser = db.findUserByUserId(normalizedUserId)!;
    db.recordLoginSuccess(updatedUser.user_id, ipAddress);

    // Create session token
    const token = this.generateToken(updatedUser);

    // Audit Log activation
    auditService.log({
      actorId: updatedUser.user_id,
      actorName: updatedUser.full_name,
      actorRole: updatedUser.role || 'CLIENT',
      action: 'USER_ACTIVATED',
      module: 'AUTH',
      targetId: updatedUser.user_id,
      ipAddress,
      newValue: {
        phoneVerifiedAt: updatedUser.phone_verified_at,
        status: updatedUser.status,
      },
    });

    // Resolve external clientId if mapping exists
    let clientId = updatedUser.id || updatedUser.user_id;
    try {
      const mapping = await postgresClientMappingRepository.findByTradingUserId(
        updatedUser.tenant_id || 'vertex-default',
        updatedUser.user_id
      );
      if (mapping?.external_client_id) {
        clientId = mapping.external_client_id;
      }
    } catch {
      // Fallback to updatedUser.id
    }

    // Publish Central Admin client.activated event (zero secrets/credentials)
    const clientActPayload: ClientActivatedPayload = {
      tenantId: updatedUser.tenant_id || 'vertex-default',
      tradingUserId: updatedUser.user_id,
      userId: updatedUser.user_id,
      clientId,
      clientCode: updatedUser.user_id.toUpperCase(),
      name: updatedUser.full_name,
      email: updatedUser.email || '',
      phone: updatedUser.phone_e164 || updatedUser.mobile,
      status: updatedUser.status,
      createdAt: updatedUser.created_at,
    };

    const eventId = `evt-act-${updatedUser.user_id}-${Date.now()}`;

    transactionalOutboxService.enqueue({
      eventId,
      eventType: 'client.activated',
      tenantId: updatedUser.tenant_id || 'vertex-default',
      payload: clientActPayload,
    }).catch((e) => console.warn('[Outbox] Client activation event enqueue warning:', e));

    internalEventDispatcher.dispatchClientActivated(clientActPayload, eventId).catch((e) =>
      console.warn('[Event] Client activation dispatch warning:', e)
    );

    return {
      success: true,
      user: sanitizeUser(updatedUser),
      token,
    };
  }

  /**
   * Resend OTP for registration, login, or password reset
   */
  public async resendOtp(
    userId: string,
    purpose: 'registration' | 'login' | 'password_reset' = 'registration',
    ipAddress?: string
  ): Promise<{
    success: boolean;
    devOtp?: string;
    expiresAt: Date;
    message: string;
  }> {
    const normalizedUserId = userId.trim().toLowerCase();
    const user = db.findUserByUserIdOrMobile(normalizedUserId);

    if (!user) {
      const err = new Error('Account not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    const otpResult = await otpService.createAndSendOtp(
      user.user_id,
      {
        email: user.email,
        countryCode: user.country_code,
        mobile: user.mobile,
        phoneE164: user.phone_e164,
      },
      purpose,
      ipAddress
    );

    auditService.log({
      actorId: user.user_id,
      actorName: user.full_name,
      actorRole: user.role || 'CLIENT',
      action: 'EMAIL_OTP_RESENT',
      module: 'AUTH',
      targetId: user.user_id,
      ipAddress,
      newValue: { purpose, email: user.email },
    });

    return {
      success: true,
      devOtp: otpResult.devOtp,
      expiresAt: otpResult.expiresAt,
      message: 'A new verification code has been dispatched.',
    };
  }

  /**
   * Login with User ID / Phone and Password
   */
  public async login(
    identifier: string,
    password: string,
    ipAddress?: string
  ): Promise<{
    user: SafeUser;
    token: string;
    message: string;
  }> {
    const trimmed = identifier.trim();
    const user = db.findUserByUserIdOrMobile(trimmed);

    // Constant-time mitigation against user enumeration
    if (!user) {
      auditService.log({
        actorId: 'anonymous',
        actorName: 'Unregistered User',
        actorRole: 'CLIENT',
        action: 'LOGIN_FAILURE',
        module: 'AUTH',
        targetId: trimmed,
        ipAddress,
        newValue: { reason: 'ACCOUNT_NOT_FOUND' },
      });

      const err = new Error('Invalid User ID or password.');
      (err as any).statusCode = 401;
      throw err;
    }

    // 1. Check Account Lockout status
    if (user.status === 'LOCKED' || (user.locked_until && new Date(user.locked_until).getTime() > Date.now())) {
      const minutesRemaining = user.locked_until
        ? Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000)
        : 15;

      auditService.log({
        actorId: user.user_id,
        actorName: user.full_name,
        actorRole: user.role || 'CLIENT',
        action: 'LOGIN_BLOCKED_LOCKED',
        module: 'AUTH',
        targetId: user.user_id,
        ipAddress,
        newValue: { lockedUntil: user.locked_until },
      });

      const err = new Error(
        `Account is temporarily locked due to multiple failed login attempts. Please try again in ${minutesRemaining} minutes or reset your password.`
      );
      (err as any).statusCode = 403;
      (err as any).code = 'ACCOUNT_LOCKED';
      throw err;
    }

    // 2. Verify Password with Argon2id
    const { valid: isMatch, needsRehash } = await PasswordHashUtil.verifyPassword(password, user.password_hash);

    if (!isMatch) {
      const lockResult = db.recordLoginFailure(user.user_id);

      if (lockResult.isLocked) {
        auditService.log({
          actorId: user.user_id,
          actorName: user.full_name,
          actorRole: user.role || 'CLIENT',
          action: 'ACCOUNT_LOCKED',
          module: 'AUTH',
          targetId: user.user_id,
          ipAddress,
          newValue: {
            failedAttempts: lockResult.attempts,
            lockedUntil: lockResult.lockedUntil,
          },
        });
      } else {
        auditService.log({
          actorId: user.user_id,
          actorName: user.full_name,
          actorRole: user.role || 'CLIENT',
          action: 'LOGIN_FAILURE',
          module: 'AUTH',
          targetId: user.user_id,
          ipAddress,
          newValue: { failedAttempts: lockResult.attempts },
        });
      }

      const err = new Error('Invalid User ID or password.');
      (err as any).statusCode = 401;
      throw err;
    }

    // Upgrade hash to Argon2id transparently if needed
    if (needsRehash) {
      const newHash = await PasswordHashUtil.hashPassword(password);
      db.updateUserPassword(user.user_id, newHash);
    }

    // 3. Check Account Statuses
    if (
      user.status === 'PENDING_EMAIL_VERIFICATION' ||
      user.status === 'PENDING_PHONE_VERIFICATION' ||
      !user.is_verified ||
      (!user.email_verified_at && user.user_id !== 'vtx123')
    ) {
      auditService.log({
        actorId: user.user_id,
        actorName: user.full_name,
        actorRole: user.role || 'CLIENT',
        action: 'LOGIN_REJECTED_UNVERIFIED',
        module: 'AUTH',
        targetId: user.user_id,
        ipAddress,
      });

      const err = new Error('Account email verification is pending. Please verify your OTP code to activate.');
      (err as any).statusCode = 403;
      (err as any).requiresVerification = true;
      (err as any).userId = user.user_id;
      throw err;
    }

    if (user.status === 'SUSPENDED' || user.status === 'suspended' || user.is_frozen) {
      auditService.log({
        actorId: user.user_id,
        actorName: user.full_name,
        actorRole: user.role || 'CLIENT',
        action: 'LOGIN_REJECTED_SUSPENDED',
        module: 'AUTH',
        targetId: user.user_id,
        ipAddress,
      });

      const err = new Error('Your account is currently suspended. Please contact VERTEX customer support.');
      (err as any).statusCode = 403;
      (err as any).code = 'ACCOUNT_SUSPENDED';
      throw err;
    }

    if (user.status === 'DISABLED' || user.status === 'deactivated') {
      auditService.log({
        actorId: user.user_id,
        actorName: user.full_name,
        actorRole: user.role || 'CLIENT',
        action: 'LOGIN_REJECTED_DISABLED',
        module: 'AUTH',
        targetId: user.user_id,
        ipAddress,
      });

      const err = new Error('Account has been disabled. Please contact customer support.');
      (err as any).statusCode = 403;
      (err as any).code = 'ACCOUNT_DISABLED';
      throw err;
    }

    // Record login success and reset failure counters
    db.recordLoginSuccess(user.user_id, ipAddress);

    auditService.log({
      actorId: user.user_id,
      actorName: user.full_name,
      actorRole: user.role || 'CLIENT',
      action: 'LOGIN_SUCCESS',
      module: 'AUTH',
      targetId: user.user_id,
      ipAddress,
      newValue: {
        lastLoginAt: new Date().toISOString(),
        tenantId: user.tenant_id,
      },
    });

    const token = this.generateToken(user);

    return {
      user: sanitizeUser(user),
      token,
      message: 'Login successful.',
    };
  }

  /**
   * Quick Demo Account Access
   */
  public async getDemoSession(ipAddress?: string): Promise<{
    user: SafeUser;
    token: string;
    message: string;
  }> {
    const demoUser = db.getOrCreateDemoUser();
    db.recordLoginSuccess(demoUser.user_id, ipAddress);
    const token = this.generateToken(demoUser);

    auditService.log({
      actorId: demoUser.user_id,
      actorName: demoUser.full_name,
      actorRole: 'CLIENT',
      action: 'DEMO_LOGIN',
      module: 'AUTH',
      targetId: demoUser.user_id,
      ipAddress,
    });

    return {
      user: sanitizeUser(demoUser),
      token,
      message: 'Demo account activated with ₹10,00,000 virtual balance.',
    };
  }

  /**
   * Initiate Forgot Password flow
   */
  public async forgotPassword(
    identifier: string,
    ipAddress?: string
  ): Promise<{
    success: boolean;
    userId: string;
    maskedMobile: string;
    devOtp?: string;
    message: string;
  }> {
    const user = db.findUserByUserIdOrMobile(identifier.trim());

    if (!user) {
      auditService.log({
        actorId: 'anonymous',
        actorName: 'Unknown Identifier',
        actorRole: 'CLIENT',
        action: 'PASSWORD_RESET_ATTEMPT_NOT_FOUND',
        module: 'AUTH',
        targetId: identifier.trim(),
        ipAddress,
      });

      const err = new Error('No account found with this User ID or Phone number.');
      (err as any).statusCode = 404;
      throw err;
    }

    const otpResult = await otpService.createAndSendOtp(
      user.user_id,
      {
        email: user.email,
        countryCode: user.country_code,
        mobile: user.mobile,
        phoneE164: user.phone_e164,
      },
      'password_reset',
      ipAddress
    );

    const maskedPhone = user.phone_e164
      ? PhoneUtils.normalize(user.phone_e164)?.masked || user.phone_e164
      : `${user.country_code} ••••• •${user.mobile.slice(-4)}`;

    auditService.log({
      actorId: user.user_id,
      actorName: user.full_name,
      actorRole: user.role || 'CLIENT',
      action: 'PASSWORD_RESET_REQUESTED',
      module: 'AUTH',
      targetId: user.user_id,
      ipAddress,
      newValue: { maskedPhone },
    });

    return {
      success: true,
      userId: user.user_id,
      maskedMobile: maskedPhone,
      devOtp: otpResult.devOtp,
      message: `Password reset code sent to ${maskedPhone}`,
    };
  }

  /**
   * Reset Password with OTP verification
   */
  public async resetPassword(
    input: ResetPasswordInput,
    ipAddress?: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const normalizedUserId = input.userId.trim().toLowerCase();
    const user = db.findUserByUserId(normalizedUserId);

    if (!user) {
      const err = new Error('Account not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    const verification = await otpService.verifyOtp(normalizedUserId, input.otp, 'password_reset', ipAddress);
    if (!verification.valid) {
      const err = new Error(verification.error || 'Invalid or expired verification code.');
      (err as any).statusCode = verification.statusCode || 400;
      throw err;
    }

    // Hash new password with Argon2id
    const newPasswordHash = await PasswordHashUtil.hashPassword(input.newPassword);
    db.updateUserPassword(normalizedUserId, newPasswordHash);

    // Invalidate all old sessions for this user
    this.invalidateAllSessionsForUser(normalizedUserId);

    auditService.log({
      actorId: user.user_id,
      actorName: user.full_name,
      actorRole: user.role || 'CLIENT',
      action: 'PASSWORD_RESET_SUCCESS',
      module: 'AUTH',
      targetId: user.user_id,
      ipAddress,
      newValue: {
        resetAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      message: 'Password updated successfully. All existing sessions have been terminated. Please login with your new credentials.',
    };
  }

  /**
   * Revoke a specific token (or JTI)
   */
  public revokeToken(token: string, userId?: string, ipAddress?: string): boolean {
    if (!token) return false;
    this.revokedTokens.add(token);
    try {
      const decoded = jwt.decode(token) as any;
      if (decoded?.jti) {
        this.revokedTokens.add(decoded.jti);
      }
      const targetId = userId || decoded?.userId || 'unknown';
      auditService.log({
        actorId: targetId,
        actorName: targetId,
        actorRole: decoded?.role || 'CLIENT',
        action: 'LOGOUT',
        module: 'AUTH',
        targetId,
        ipAddress,
      });
    } catch {
      // ignore decode error
    }
    return true;
  }

  /**
   * Invalidate all sessions for a user
   */
  public invalidateAllSessionsForUser(userId: string): void {
    db.invalidateUserSessions(userId);
  }

  /**
   * Check if token has been revoked
   */
  public isTokenRevoked(token: string): boolean {
    if (!token) return true;
    if (this.revokedTokens.has(token)) return true;
    try {
      const decoded = jwt.decode(token) as any;
      if (decoded?.jti && this.revokedTokens.has(decoded.jti)) {
        return true;
      }
    } catch {
      return true;
    }
    return false;
  }

  /**
   * Constant-time string comparison to mitigate timing attacks on secrets
   */
  public timingSafeCompare(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Generates JWT token for user with unique jti and issue timestamp
   */
  public generateToken(user: any): string {
    const jti = crypto.randomUUID();
    const userId = user.user_id || user.userId;
    return jwt.sign(
      {
        id: user.id,
        userId,
        fullName: user.full_name || user.fullName || 'User',
        role: user.role || 'CLIENT',
        hierarchyPath: user.hierarchy_path || user.hierarchyPath || `root.${userId}`,
        status: user.status || 'ACTIVE',
        tenantId: user.tenant_id || user.tenantId || 'vertex-default',
        isFrozen: user.is_frozen ?? user.isFrozen ?? (user.status === 'suspended' || user.status === 'SUSPENDED'),
        jti,
        iat: Math.floor(Date.now() / 1000),
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  /**
   * Verifies JWT token
   */
  public verifyToken(token: string): any {
    try {
      if (this.isTokenRevoked(token)) return null;
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (!decoded) return null;

      // Check if user account was updated/invalidated after token issue
      const user = db.findUserByUserId(decoded.userId);
      if (!user) return null;

      if (user.status === 'LOCKED' || user.status === 'DISABLED' || user.status === 'SUSPENDED' || user.is_frozen) {
        return null;
      }

      return decoded;
    } catch {
      return null;
    }
  }
}

export const authService = new AuthService();
