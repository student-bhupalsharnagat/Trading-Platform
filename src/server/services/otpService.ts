import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db/database.ts';
import { emailService } from './emailService.ts';
import { smsService } from './smsService.ts';

// In-memory cooldown tracker for resend rate-limiting (60 seconds minimum)
const resendCooldowns = new Map<string, number>();

export class OtpService {
  /**
   * Generates a secure 6-digit numeric OTP
   */
  public generateNumericOtp(): string {
    const num = crypto.randomInt(100000, 1000000);
    return num.toString().padStart(6, '0');
  }

  /**
   * Generates, hashes, stores, and dispatches an OTP
   */
  public async createAndSendOtp(
    userId: string,
    destination: { countryCode?: string; mobile?: string; email?: string },
    purpose: 'registration' | 'login' | 'password_reset' = 'registration'
  ): Promise<{ success: boolean; expiresAt: Date; devOtp?: string }> {
    const normalizedUserId = userId.trim().toLowerCase();

    // Check resend cooldown (60 seconds)
    const lastSent = resendCooldowns.get(`${normalizedUserId}:${purpose}`);
    const now = Date.now();
    if (lastSent && now - lastSent < 60000) {
      const waitSeconds = Math.ceil((60000 - (now - lastSent)) / 1000);
      const err = new Error(`Please wait ${waitSeconds} seconds before requesting a new OTP.`);
      (err as any).statusCode = 429;
      (err as any).retryAfter = waitSeconds;
      throw err;
    }

    const otpRaw = this.generateNumericOtp();
    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otpRaw, salt);

    // 10 minutes expiry
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Store in DB
    db.createOtp({
      userId: normalizedUserId,
      otpHash,
      purpose,
      expiresAt,
      devOtpPreview: process.env.NODE_ENV !== 'production' ? otpRaw : undefined,
    });

    resendCooldowns.set(`${normalizedUserId}:${purpose}`, now);

    // Dispatch via Email & SMS
    if (destination.mobile) {
      await smsService.sendOtpSms(
        destination.countryCode || '+91',
        destination.mobile,
        otpRaw
      );
    }

    if (destination.email) {
      await emailService.sendOtpEmail(destination.email, otpRaw, purpose);
    }

    return {
      success: true,
      expiresAt,
      // Pass devOtp during development so user can test seamlessly
      devOtp: process.env.NODE_ENV !== 'production' ? otpRaw : undefined,
    };
  }

  /**
   * Verifies an incoming OTP against the database
   */
  public async verifyOtp(
    userId: string,
    rawOtp: string,
    purpose: 'registration' | 'login' | 'password_reset' = 'registration'
  ): Promise<{ valid: boolean; error?: string; statusCode?: number }> {
    const normalizedUserId = userId.trim().toLowerCase();
    const otpRecord = db.getLatestActiveOtp(normalizedUserId, purpose);

    if (!otpRecord) {
      return {
        valid: false,
        error: 'No active OTP found. Please request a new code.',
        statusCode: 404,
      };
    }

    // Check expiration
    const expiryTime = new Date(otpRecord.expires_at).getTime();
    if (Date.now() > expiryTime) {
      return {
        valid: false,
        error: 'OTP has expired. Please request a new verification code.',
        statusCode: 400,
      };
    }

    // Check attempt limits (max 5 attempts)
    if (otpRecord.attempts >= 5) {
      return {
        valid: false,
        error: 'Maximum verification attempts exceeded. Please request a new OTP.',
        statusCode: 429,
      };
    }

    // Verify bcrypt hash
    const isMatch = await bcrypt.compare(rawOtp.trim(), otpRecord.otp_hash);
    if (!isMatch) {
      const currentAttempts = db.incrementOtpAttempts(otpRecord.id);
      const remaining = Math.max(0, 5 - currentAttempts);
      return {
        valid: false,
        error: `Invalid OTP code. ${remaining} attempt(s) remaining.`,
        statusCode: 400,
      };
    }

    // Successful match
    db.markOtpVerified(otpRecord.id);
    return { valid: true };
  }
}

export const otpService = new OtpService();
