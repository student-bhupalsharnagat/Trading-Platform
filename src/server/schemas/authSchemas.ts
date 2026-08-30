import { z } from 'zod';

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, { message: 'Full name must be at least 2 characters.' })
      .max(100, { message: 'Full name cannot exceed 100 characters.' })
      .regex(/^[a-zA-Z\s.'-]+$/, { message: 'Full name can only contain letters and spaces.' }),
    userId: z
      .string()
      .trim()
      .min(4, { message: 'User ID must be between 4 and 20 characters.' })
      .max(20, { message: 'User ID must be between 4 and 20 characters.' })
      .regex(/^[a-zA-Z0-9_]+$/, {
        message: 'User ID can only contain letters, numbers, and underscores (no spaces).',
      }),
    countryCode: z.string().default('+91'),
    mobile: z
      .string()
      .trim()
      .transform((val) => val.replace(/\D/g, ''))
      .refine((val) => val.length === 10 && /^[6-9]\d{9}$/.test(val), {
        message: 'Please enter a valid 10-digit Indian mobile number.',
      }),
    password: z
      .string()
      .min(8, { message: 'Password must contain at least 8 characters.' })
      .max(72, { message: 'Password cannot exceed 72 characters.' })
      .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter.' })
      .regex(/[a-z]/, { message: 'Password must contain at least one lowercase letter.' })
      .regex(/[0-9]/, { message: 'Password must contain at least one number.' })
      .regex(/[^A-Za-z0-9]/, { message: 'Password must contain at least one special character.' }),
    confirmPassword: z.string().min(1, { message: 'Please confirm your password.' }),
    referralCode: z
      .string()
      .trim()
      .max(30, { message: 'Referral code is too long.' })
      .optional()
      .or(z.literal('')),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const verifyOtpSchema = z.object({
  userId: z.string().trim().min(1, { message: 'User ID is required.' }),
  otp: z
    .string()
    .trim()
    .length(6, { message: 'OTP must be exactly 6 digits.' })
    .regex(/^\d{6}$/, { message: 'OTP must contain only numbers.' }),
  purpose: z.enum(['registration', 'login', 'password_reset']).default('registration'),
});

export const resendOtpSchema = z.object({
  userId: z.string().trim().min(1, { message: 'User ID is required.' }),
  purpose: z.enum(['registration', 'login', 'password_reset']).default('registration'),
});

export const loginSchema = z.object({
  userId: z
    .string()
    .trim()
    .min(1, { message: 'Please enter your User ID or Mobile No.' }),
  password: z
    .string()
    .min(1, { message: 'Please enter your password.' }),
});

export const forgotPasswordSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, { message: 'Please enter a valid User ID or registered mobile number.' }),
});

export const resetPasswordSchema = z
  .object({
    userId: z.string().trim().min(1, { message: 'User ID is required.' }),
    otp: z
      .string()
      .trim()
      .length(6, { message: 'OTP must be 6 digits.' })
      .regex(/^\d{6}$/, { message: 'OTP must contain only digits.' }),
    newPassword: z
      .string()
      .min(8, { message: 'Password must contain at least 8 characters.' })
      .max(72, { message: 'Password cannot exceed 72 characters.' })
      .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter.' })
      .regex(/[a-z]/, { message: 'Password must contain at least one lowercase letter.' })
      .regex(/[0-9]/, { message: 'Password must contain at least one number.' })
      .regex(/[^A-Za-z0-9]/, { message: 'Password must contain at least one special character.' }),
    confirmPassword: z.string().min(1, { message: 'Please confirm your new password.' }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
