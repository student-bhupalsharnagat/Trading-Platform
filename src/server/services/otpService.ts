import crypto from 'crypto';
import { db } from '../db/database.ts';
import { emailService } from './emailService.ts';
import { auditService } from './auditService.ts';
import { otpProviderRegistry } from '../providers/otp/otpProviderRegistry.ts';
import { emailOtpProviderRegistry } from '../providers/otp/emailOtpProviderRegistry.ts';
import { PhoneUtils } from '../utils/phoneUtils.ts';

// In-memory cooldown & rate-limiting tracker
const resendCooldowns = new Map<string, number>();
const requestRateLimits = new Map<string, { count: number; windowStart: number }>();

const OTP_SECRET = process.env.OTP_SECRET || process.env.JWT_SECRET || 'vertex_otp_hmac_secret_key_2026';
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL as required
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown
const MAX_OTP_ATTEMPTS = 5; // Max 5 verification attempts
const MAX_REQUESTS_PER_WINDOW = 5; // Max 5 requests per 15 minutes window
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export class OtpService {
  /**
   * Generates a cryptographically secure 6-digit numeric OTP code
   */
  public generateNumericOtp(): string {
    const num = crypto.randomInt(100000, 1000000);
    return num.toString().padStart(6, '0');
  }

  /**
   * Generates HMAC-SHA256 hash of OTP for secure storage
   */
  public hashOtp(rawOtp: string, userId: string): string {
    return crypto
      .createHmac('sha256', OTP_SECRET)
      .update(`${userId.toLowerCase()}:${rawOtp.trim()}`)
      .digest('hex');
  }

  /**
   * Constant-time comparison of OTP hashes
   */
  public verifyOtpHash(rawOtp: string, userId: string, storedHash: string): boolean {
    const computedHash = this.hashOtp(rawOtp, userId);
    try {
      const bufA = Buffer.from(computedHash, 'hex');
      const bufB = Buffer.from(storedHash, 'hex');
      if (bufA.length !== bufB.length) return false;
      return crypto.timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }

  /**
   * Checks and enforces rate limits by identifier / IP / phone
   */
  private checkRateLimit(key: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const entry = requestRateLimits.get(key);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      requestRateLimits.set(key, { count: 1, windowStart: now });
      return { allowed: true };
    }

    if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
      const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - entry.windowStart)) / 1000);
      return { allowed: false, retryAfter };
    }

    entry.count += 1;
    return { allowed: true };
  }

  /**
   * Generates, securely hashes, stores, and dispatches an OTP via configured provider
   */
  public async createAndSendOtp(
    userId: string,
    destination: { countryCode?: string; mobile?: string; phoneE164?: string; email?: string },
    purpose: 'registration' | 'login' | 'password_reset' = 'registration',
    ipAddress?: string
  ): Promise<{ success: boolean; expiresAt: Date; devOtp?: string }> {
    const normalizedUserId = userId.trim().toLowerCase();

    // 1. Resolve normalized E.164 phone number
    let targetPhoneE164 = destination.phoneE164;
    if (!targetPhoneE164 && destination.mobile) {
      const normalized = PhoneUtils.normalize(destination.mobile, destination.countryCode || '+91');
      targetPhoneE164 = normalized?.e164;
    }

    const normalizedEmail = destination.email?.trim().toLowerCase();
    const phoneKey = targetPhoneE164 || destination.mobile || normalizedUserId;
    const now = Date.now();

    // 2. Enforce Resend Cooldown (60 seconds)
    const lastSent = resendCooldowns.get(`${normalizedUserId}:${purpose}`);
    if (lastSent && now - lastSent < RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - (now - lastSent)) / 1000);
      const err = new Error(`Please wait ${waitSeconds} seconds before requesting another verification code.`);
      (err as any).statusCode = 429;
      (err as any).retryAfter = waitSeconds;
      throw err;
    }

    // 3. Enforce Sliding Window Rate Limits (by user, email, phone, and IP)
    const userRate = this.checkRateLimit(`user:${normalizedUserId}`);
    if (!userRate.allowed) {
      const err = new Error(`Too many verification requests for this account. Try again in ${userRate.retryAfter} seconds.`);
      (err as any).statusCode = 429;
      (err as any).retryAfter = userRate.retryAfter;
      throw err;
    }

    if (normalizedEmail) {
      const emailRate = this.checkRateLimit(`email:${normalizedEmail}`);
      if (!emailRate.allowed) {
        const err = new Error(`Too many verification requests for this email address. Try again in ${emailRate.retryAfter} seconds.`);
        (err as any).statusCode = 429;
        (err as any).retryAfter = emailRate.retryAfter;
        throw err;
      }
    }

    if (phoneKey) {
      const phoneRate = this.checkRateLimit(`phone:${phoneKey}`);
      if (!phoneRate.allowed) {
        const err = new Error(`Too many verification requests for this phone number. Try again in ${phoneRate.retryAfter} seconds.`);
        (err as any).statusCode = 429;
        (err as any).retryAfter = phoneRate.retryAfter;
        throw err;
      }
    }

    if (ipAddress) {
      const ipRate = this.checkRateLimit(`ip:${ipAddress}`);
      if (!ipRate.allowed) {
        const err = new Error(`Too many requests from this IP address. Please wait before retrying.`);
        (err as any).statusCode = 429;
        (err as any).retryAfter = ipRate.retryAfter;
        throw err;
      }
    }

    // 4. Generate Cryptographically Secure OTP
    const otpRaw = this.generateNumericOtp();
    const otpHash = this.hashOtp(otpRaw, normalizedUserId);
    const expiresAt = new Date(now + OTP_TTL_MS);

    const channelResults: boolean[] = [];

    // 5. Email Dispatch via EmailOtpProviderRegistry
    if (normalizedEmail) {
      const emailResult = await emailOtpProviderRegistry.dispatchEmailOtp({
        email: normalizedEmail,
        otp: otpRaw,
        purpose,
        userId: normalizedUserId,
        ttlMinutes: 5,
      });

      channelResults.push(emailResult.success);

      if (!emailResult.success && process.env.NODE_ENV === 'production' && !targetPhoneE164) {
        auditService.log({
          actorId: normalizedUserId,
          actorName: normalizedUserId,
          actorRole: 'CLIENT',
          action: 'EMAIL_OTP_PROVIDER_FAILURE',
          module: 'AUTH',
          targetId: normalizedUserId,
          ipAddress,
          newValue: {
            provider: emailResult.provider,
            error: emailResult.error,
          },
        });

        const err = new Error('Failed to send verification email. Please check server configurations.');
        (err as any).statusCode = 502;
        throw err;
      }
    }

    // Optional SMS dispatch
    if (targetPhoneE164) {
      const smsResult = await otpProviderRegistry.dispatchOtp({
        phoneE164: targetPhoneE164,
        otp: otpRaw,
        purpose,
        userId: normalizedUserId,
        ttlMinutes: 5,
      });
      channelResults.push(Boolean(smsResult.success));
    }

    if (channelResults.length > 0 && channelResults.every((ok) => !ok)) {
      const err = new Error('Failed to send verification code. Please check server configurations.');
      (err as any).statusCode = 502;
      throw err;
    }

    // 6. Store in Database with TTL and Attempt Limits (plain OTP is NEVER stored)
    db.createOtp({
      userId: normalizedUserId,
      phoneE164: targetPhoneE164,
      otpHash,
      purpose,
      expiresAt,
      maxAttempts: MAX_OTP_ATTEMPTS,
      ipAddress,
      // Provide devOtp preview only in non-production development mode
      devOtpPreview: process.env.NODE_ENV !== 'production' ? otpRaw : undefined,
    });

    resendCooldowns.set(`${normalizedUserId}:${purpose}`, now);

    // 7. Audit Log (Never log the raw OTP or secret)
    auditService.log({
      actorId: normalizedUserId,
      actorName: normalizedUserId,
      actorRole: 'CLIENT',
      action: 'OTP_SENT',
      module: 'AUTH',
      targetId: normalizedUserId,
      targetName: targetPhoneE164 || 'User Phone',
      ipAddress,
      newValue: {
        purpose,
        destination: targetPhoneE164 ? `${targetPhoneE164.slice(0, 4)}••••${targetPhoneE164.slice(-4)}` : undefined,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      success: true,
      expiresAt,
      devOtp: process.env.NODE_ENV !== 'production' ? otpRaw : undefined,
    };
  }

  /**
   * Verifies an incoming OTP against the database record
   */
  public async verifyOtp(
    userId: string,
    rawOtp: string,
    purpose: 'registration' | 'login' | 'password_reset' = 'registration',
    ipAddress?: string
  ): Promise<{ valid: boolean; error?: string; statusCode?: number }> {
    const normalizedUserId = userId.trim().toLowerCase();
    const otpRecord = db.getLatestActiveOtp(normalizedUserId, purpose);

    if (!otpRecord) {
      return {
        valid: false,
        error: 'No active verification code found. Please request a new code.',
        statusCode: 404,
      };
    }

    // 1. Check expiration
    const expiryTime = new Date(otpRecord.expires_at).getTime();
    if (Date.now() > expiryTime) {
      return {
        valid: false,
        error: 'Verification code has expired. Please request a new code.',
        statusCode: 400,
      };
    }

    // 2. Check attempt limits (max attempts allowed)
    if (otpRecord.attempts >= (otpRecord.max_attempts || MAX_OTP_ATTEMPTS)) {
      return {
        valid: false,
        error: 'Maximum verification attempts exceeded. Code has been invalidated. Please request a new OTP.',
        statusCode: 429,
      };
    }

    // 3. Constant-time Hash Verification
    const isMatch = this.verifyOtpHash(rawOtp, normalizedUserId, otpRecord.otp_hash);

    if (!isMatch) {
      const currentAttempts = db.incrementOtpAttempts(otpRecord.id);
      const maxAttempts = otpRecord.max_attempts || MAX_OTP_ATTEMPTS;
      const remaining = Math.max(0, maxAttempts - currentAttempts);

      auditService.log({
        actorId: normalizedUserId,
        actorName: normalizedUserId,
        actorRole: 'CLIENT',
        action: 'OTP_VERIFY_FAILURE',
        module: 'AUTH',
        targetId: normalizedUserId,
        ipAddress,
        newValue: {
          purpose,
          attempts: currentAttempts,
          remainingAttempts: remaining,
        },
      });

      if (remaining <= 0) {
        db.invalidateExistingOtps(normalizedUserId, purpose);
        return {
          valid: false,
          error: 'Maximum verification attempts exceeded. Code has been invalidated. Please request a new code.',
          statusCode: 429,
        };
      }

      return {
        valid: false,
        error: `Invalid verification code. ${remaining} attempt(s) remaining.`,
        statusCode: 400,
      };
    }

    // 4. Mark single-use OTP as verified
    db.markOtpVerified(otpRecord.id);

    // 5. Audit Log
    auditService.log({
      actorId: normalizedUserId,
      actorName: normalizedUserId,
      actorRole: 'CLIENT',
      action: 'OTP_VERIFIED',
      module: 'AUTH',
      targetId: normalizedUserId,
      ipAddress,
      newValue: {
        purpose,
        verifiedAt: new Date().toISOString(),
      },
    });

    return { valid: true };
  }
}

export const otpService = new OtpService();
