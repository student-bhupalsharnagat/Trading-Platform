import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, UserRecord } from '../db/database.ts';
import { otpService } from './otpService.ts';
import { RegisterInput, ResetPasswordInput } from '../schemas/authSchemas.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'vertex_jwt_secret_dev_key_2026_super_secure';
const JWT_EXPIRES_IN = '7d';

export interface SafeUser {
  id: string;
  fullName: string;
  userId: string;
  countryCode: string;
  mobile: string;
  isVerified: boolean;
  status: 'active' | 'suspended' | 'demo';
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
    isVerified: user.is_verified,
    status: user.status,
    referralCode: user.referral_code,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    demoBalance: user.demo_balance,
  };
}

export class AuthService {
  /**
   * Register a new user and generate initial OTP
   */
  public async register(input: RegisterInput): Promise<{
    user: SafeUser;
    devOtp?: string;
    expiresAt: Date;
    message: string;
  }> {
    const normalizedUserId = input.userId.trim().toLowerCase();
    const cleanMobile = input.mobile.replace(/\D/g, '');

    // Check duplicate User ID
    if (db.findUserByUserId(normalizedUserId)) {
      const err = new Error('User ID is already taken.');
      (err as any).statusCode = 409;
      (err as any).field = 'userId';
      throw err;
    }

    // Check duplicate Mobile
    if (db.findUserByMobile(cleanMobile)) {
      const err = new Error('Mobile number is already registered with another account.');
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

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(input.password, salt);

    // Save user to database
    const user = db.createUser({
      fullName: input.fullName,
      userId: normalizedUserId,
      countryCode: input.countryCode || '+91',
      mobile: cleanMobile,
      passwordHash,
      referralCode: `VTX${Math.floor(1000 + Math.random() * 9000)}`,
      referredBy,
      isVerified: false,
      status: 'active',
    });

    // Generate & send OTP
    const otpResult = await otpService.createAndSendOtp(
      user.user_id,
      { countryCode: user.country_code, mobile: user.mobile },
      'registration'
    );

    return {
      user: sanitizeUser(user),
      devOtp: otpResult.devOtp,
      expiresAt: otpResult.expiresAt,
      message: 'Account created. Please verify your mobile number with the OTP code.',
    };
  }

  /**
   * Verify registration OTP
   */
  public async verifyRegistrationOtp(userId: string, otp: string): Promise<{
    success: boolean;
    user: SafeUser;
    token: string;
  }> {
    const normalizedUserId = userId.trim().toLowerCase();
    const user = db.findUserByUserId(normalizedUserId);

    if (!user) {
      const err = new Error('User not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    const verification = await otpService.verifyOtp(normalizedUserId, otp, 'registration');
    if (!verification.valid) {
      const err = new Error(verification.error || 'Verification failed.');
      (err as any).statusCode = verification.statusCode || 400;
      throw err;
    }

    // Mark user verified
    db.markUserVerified(normalizedUserId);
    const updatedUser = db.findUserByUserId(normalizedUserId)!;
    db.updateLastLogin(updatedUser.id);

    // Create session token
    const token = this.generateToken(updatedUser);

    return {
      success: true,
      user: sanitizeUser(updatedUser),
      token,
    };
  }

  /**
   * Resend OTP for registration or password reset
   */
  public async resendOtp(
    userId: string,
    purpose: 'registration' | 'login' | 'password_reset' = 'registration'
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
      { countryCode: user.country_code, mobile: user.mobile },
      purpose
    );

    return {
      success: true,
      devOtp: otpResult.devOtp,
      expiresAt: otpResult.expiresAt,
      message: 'A new verification code has been dispatched.',
    };
  }

  /**
   * Login with User ID / Mobile and Password
   */
  public async login(
    identifier: string,
    password: string
  ): Promise<{
    user: SafeUser;
    token: string;
    message: string;
  }> {
    const trimmed = identifier.trim();
    const user = db.findUserByUserIdOrMobile(trimmed);

    // Constant-time like comparison to avoid enumeration
    if (!user) {
      const err = new Error('Invalid User ID or password.');
      (err as any).statusCode = 401;
      throw err;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const err = new Error('Invalid User ID or password.');
      (err as any).statusCode = 401;
      throw err;
    }

    if (!user.is_verified) {
      const err = new Error('Account mobile number is not verified. Please verify your OTP.');
      (err as any).statusCode = 403;
      (err as any).requiresVerification = true;
      (err as any).userId = user.user_id;
      throw err;
    }

    if (user.status === 'suspended') {
      const err = new Error('Your account is currently suspended. Please contact VERTEX support.');
      (err as any).statusCode = 403;
      throw err;
    }

    db.updateLastLogin(user.id);
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
  public async getDemoSession(): Promise<{
    user: SafeUser;
    token: string;
    message: string;
  }> {
    const demoUser = db.getOrCreateDemoUser();
    db.updateLastLogin(demoUser.id);
    const token = this.generateToken(demoUser);

    return {
      user: sanitizeUser(demoUser),
      token,
      message: 'Demo account activated with ₹10,00,000 virtual balance.',
    };
  }

  /**
   * Initiate Forgot Password flow
   */
  public async forgotPassword(identifier: string): Promise<{
    success: boolean;
    userId: string;
    maskedMobile: string;
    devOtp?: string;
    message: string;
  }> {
    const user = db.findUserByUserIdOrMobile(identifier.trim());

    // Security practice: do not leak account non-existence explicitly if desired,
    // but for trading platforms we return masked feedback
    if (!user) {
      const err = new Error('No account found with this User ID or Mobile number.');
      (err as any).statusCode = 404;
      throw err;
    }

    const otpResult = await otpService.createAndSendOtp(
      user.user_id,
      { countryCode: user.country_code, mobile: user.mobile },
      'password_reset'
    );

    const mobile = user.mobile;
    const maskedMobile = `${user.country_code} XXXXXXX${mobile.slice(-4)}`;

    return {
      success: true,
      userId: user.user_id,
      maskedMobile,
      devOtp: otpResult.devOtp,
      message: `Password reset code sent to ${maskedMobile}`,
    };
  }

  /**
   * Reset Password with OTP
   */
  public async resetPassword(input: ResetPasswordInput): Promise<{
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

    const verification = await otpService.verifyOtp(normalizedUserId, input.otp, 'password_reset');
    if (!verification.valid) {
      const err = new Error(verification.error || 'Invalid or expired OTP.');
      (err as any).statusCode = verification.statusCode || 400;
      throw err;
    }

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(input.newPassword, salt);

    db.updateUserPassword(normalizedUserId, newPasswordHash);

    return {
      success: true,
      message: 'Password updated successfully. Please login with your new credentials.',
    };
  }

  /**
   * Generates JWT token for user
   */
  public generateToken(user: UserRecord): string {
    return jwt.sign(
      {
        id: user.id,
        userId: user.user_id,
        fullName: user.full_name,
        status: user.status,
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
      return jwt.verify(token, JWT_SECRET);
    } catch {
      return null;
    }
  }
}

export const authService = new AuthService();
