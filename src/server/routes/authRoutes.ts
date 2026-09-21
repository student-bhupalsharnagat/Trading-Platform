import { Router } from 'express';
import { authController } from '../controllers/authController.ts';
import { requireAuth } from '../middleware/authMiddleware.ts';
import { requireRegistrationEnabled } from '../middleware/tenantMiddleware.ts';
import {
  registerLimiter,
  loginLimiter,
  otpLimiter,
} from '../middleware/rateLimitMiddleware.ts';

const router = Router();

// Registration (enforces tenant registration feature & freeze control server-side)
router.post('/register', registerLimiter, requireRegistrationEnabled, authController.register);

// OTP Verification & Resend
router.post('/verify-otp', otpLimiter, authController.verifyOtp);
router.post('/resend-otp', otpLimiter, authController.resendOtp);

// Login & Demo
router.post('/login', loginLimiter, authController.login);
router.post('/demo', authController.demoLogin);

// Forgot & Reset Password
router.post('/forgot-password', otpLimiter, authController.forgotPassword);
router.post('/reset-password', otpLimiter, authController.resetPassword);

// Session & User Info
router.get('/me', requireAuth, authController.getMe);
router.post('/logout', authController.logout);

// Development OTP retrieval helper (safe preview for local dev)
router.get('/dev-otp/:userId', authController.getDevOtp);

export default router;
