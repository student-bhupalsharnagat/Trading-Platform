import rateLimit, { Store, Options, ClientRateLimitInfo } from 'express-rate-limit';
import { redisService } from '../redis/RedisService.ts';

/**
 * Shared Redis-backed sliding-window rate limit store with resilient in-memory fallback
 */
export class RedisRateLimitStore implements Store {
  private prefix: string;
  private windowMs: number = 60000;
  private localFallback = new Map<string, { hits: number; resetTime: number }>();

  constructor(prefix: string) {
    this.prefix = `rl:${prefix}:`;
  }

  init(options: Options): void {
    if (options && options.windowMs) {
      this.windowMs = options.windowMs;
    }
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const fullKey = `${this.prefix}${key}`;
    const now = Date.now();
    try {
      if (redisService.isConnected()) {
        const hits = await redisService.incr(fullKey);
        if (hits === 1) {
          await redisService.expire(fullKey, Math.ceil(this.windowMs / 1000));
        }
        return {
          totalHits: hits,
          resetTime: new Date(now + this.windowMs),
        };
      }
    } catch {
      // Redis unavailable; fall through to local fallback
    }

    const entry = this.localFallback.get(fullKey);
    if (!entry || now > entry.resetTime) {
      const newEntry = { hits: 1, resetTime: now + this.windowMs };
      this.localFallback.set(fullKey, newEntry);
      return { totalHits: 1, resetTime: new Date(newEntry.resetTime) };
    }
    entry.hits += 1;
    return { totalHits: entry.hits, resetTime: new Date(entry.resetTime) };
  }

  async decrement(key: string): Promise<void> {
    const fullKey = `${this.prefix}${key}`;
    try {
      if (redisService.isConnected()) {
        const val = await redisService.get(fullKey);
        if (val && Number(val) > 0) {
          await redisService.set(fullKey, String(Number(val) - 1));
        }
      }
    } catch {}
    const entry = this.localFallback.get(fullKey);
    if (entry && entry.hits > 0) {
      entry.hits -= 1;
    }
  }

  async resetKey(key: string): Promise<void> {
    const fullKey = `${this.prefix}${key}`;
    try {
      if (redisService.isConnected()) {
        await redisService.del(fullKey);
      }
    } catch {}
    this.localFallback.delete(fullKey);
  }
}

// Standard rate limiter for registration attempts
export const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 registration attempts per IP per 15 min
  validate: { xForwardedForHeader: false },
  store: new RedisRateLimitStore('register'),
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
  store: new RedisRateLimitStore('login'),
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
  store: new RedisRateLimitStore('otp'),
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
  store: new RedisRateLimitStore('demo'),
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
  store: new RedisRateLimitStore('orders'),
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
  store: new RedisRateLimitStore('funds'),
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
