import rateLimit from 'express-rate-limit';

// Standard rate limiter for registration attempts
export const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 registration attempts per IP per 15 min
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    message: 'Too many registration requests from this IP. Please try again in 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiter for login
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // max 15 attempts
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiter for OTP operations
export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // max 10 requests per 10 min
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    message: 'Too many OTP requests. Please wait a few minutes before trying again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Demo login limiter (prevents automated bot flooding of demo accounts)
export const demoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // max 15 attempts
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    message: 'Too many demo session requests. Please try again in 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Order placement & square-off rate limiter (120 orders/min per user/IP)
export const orderRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests/min
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const user = (req as any).user;
    return user?.userId || user?.id || req.ip || 'anonymous';
  },
  message: {
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Order rate limit reached (max 120 per minute). Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Funds deposit and withdrawal rate limiter (30 requests per 15 min per user/IP)
export const fundsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per 15 min
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const user = (req as any).user;
    return user?.userId || user?.id || req.ip || 'anonymous';
  },
  message: {
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Fund transaction limit reached. Please wait before submitting another request.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Internal Server-to-Server rate limiter (1200 requests/min per IP to protect from looping syncs)
export const s2sRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1200,
  validate: { xForwardedForHeader: false },
  message: {
    success: false,
    code: 'S2S_RATE_LIMIT_EXCEEDED',
    message: 'Server-to-Server request rate limit exceeded.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// General public API rate limiter (600 req/min per IP, excluding health checks)
export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 600,
  validate: { xForwardedForHeader: false },
  skip: (req) =>
    req.path === '/health' ||
    req.path === '/live' ||
    req.path === '/ready' ||
    req.path.startsWith('/api/health') ||
    req.path.startsWith('/api/internal/'),
  message: {
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many API requests. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
