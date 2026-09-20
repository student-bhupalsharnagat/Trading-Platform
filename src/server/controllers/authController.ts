import { Request, Response, NextFunction } from 'express';
import {
  registerSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../schemas/authSchemas.ts';
import { authService } from '../services/authService.ts';
import { db } from '../db/database.ts';
import { AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import { TenantRequest } from '../middleware/tenantMiddleware.ts';

const COOKIE_NAME = 'vertex_auth_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

export class AuthController {
  public async register(req: TenantRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = registerSchema.parse(req.body);
      const tenantId = req.tenant?.tenant.id || 'vertex-default';
      const result = await authService.register(validatedData, tenantId);

      res.status(201).json({
        success: true,
        message: result.message,
        userId: result.user.userId,
        expiresAt: result.expiresAt,
        devOtp: result.devOtp,
        user: result.user,
      });
    } catch (err) {
      next(err);
    }
  }

  public async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = verifyOtpSchema.parse(req.body);
      const result = await authService.verifyRegistrationOtp(
        validatedData.userId,
        validatedData.otp
      );

      // Set secure HttpOnly cookie upon successful verification
      res.cookie(COOKIE_NAME, result.token, COOKIE_OPTIONS);

      res.status(200).json({
        success: true,
        message: 'Account verified successfully.',
        user: result.user,
        token: result.token,
      });
    } catch (err) {
      next(err);
    }
  }

  public async resendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = resendOtpSchema.parse(req.body);
      const result = await authService.resendOtp(validatedData.userId, validatedData.purpose);

      res.status(200).json({
        success: true,
        message: result.message,
        expiresAt: result.expiresAt,
        devOtp: result.devOtp,
      });
    } catch (err) {
      next(err);
    }
  }

  public async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = loginSchema.parse(req.body);
      const result = await authService.login(validatedData.userId, validatedData.password);

      // Set secure HttpOnly cookie
      res.cookie(COOKIE_NAME, result.token, COOKIE_OPTIONS);

      res.status(200).json({
        success: true,
        message: result.message,
        user: result.user,
        token: result.token,
      });
    } catch (err) {
      next(err);
    }
  }

  public async demoLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.getDemoSession();
      res.cookie(COOKIE_NAME, result.token, COOKIE_OPTIONS);

      res.status(200).json({
        success: true,
        message: result.message,
        user: result.user,
        token: result.token,
      });
    } catch (err) {
      next(err);
    }
  }

  public async logout(req: Request, res: Response): Promise<void> {
    const token = req.cookies?.[COOKIE_NAME] || req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      authService.revokeToken(token);
    }
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  }

  public async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      user: req.user,
    });
  }

  public async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = forgotPasswordSchema.parse(req.body);
      const result = await authService.forgotPassword(validatedData.identifier);

      res.status(200).json({
        success: true,
        message: result.message,
        userId: result.userId,
        maskedMobile: result.maskedMobile,
        devOtp: result.devOtp,
      });
    } catch (err) {
      next(err);
    }
  }

  public async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = resetPasswordSchema.parse(req.body);
      const result = await authService.resetPassword(validatedData);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (err) {
      next(err);
    }
  }

  // Developer helper endpoint to preview the latest generated OTP for immediate UI assistance
  public async getDevOtp(req: Request, res: Response): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    const userId = (req.params.userId || '').trim().toLowerCase();
    const purpose = (req.query.purpose as any) || 'registration';
    const otpRecord = db.getLatestActiveOtp(userId, purpose);

    if (otpRecord && otpRecord.dev_otp_preview) {
      res.json({
        success: true,
        otp: otpRecord.dev_otp_preview,
        expiresAt: otpRecord.expires_at,
      });
      return;
    }

    res.json({ success: false, message: 'No active OTP preview' });
  }
}

export const authController = new AuthController();
