import { Request, Response, NextFunction } from 'express';
import { redisService } from '../redis/RedisService.ts';

export interface RateLimitOptions {
  scope: 'login' | 'order' | 'internal_api' | 'ws_msg' | 'general';
  limit: number;
  windowSeconds: number;
  keyGenerator?: (req: Request) => string;
  errorMessage?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetInSeconds: number;
  current: number;
}

interface LocalBucket {
  count: number;
  resetAt: number;
}

export class DistributedRateLimiter {
  private localBuckets = new Map<string, LocalBucket>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Periodic sweep for expired local buckets
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.localBuckets.entries()) {
        if (v.resetAt <= now) {
          this.localBuckets.delete(k);
        }
      }
    }, 30000);
  }

  /**
   * Evaluates rate limit against Redis with atomic INCR + EXPIRE,
   * falling back transparently to in-memory sliding counters if Redis is offline.
   */
  public async checkLimit(params: {
    tenantId: string;
    scope: string;
    identifier: string;
    limit: number;
    windowSeconds: number;
  }): Promise<RateLimitResult> {
    const { tenantId, scope, identifier, limit, windowSeconds } = params;
    const redisKey = `rate:${tenantId}:${scope}:${identifier}`;

    // 1. Try Redis
    try {
      if (redisService.isConnected()) {
        const count = await redisService.incr(redisKey);
        if (count === 1) {
          await redisService.expire(redisKey, windowSeconds);
        }

        const remaining = Math.max(0, limit - count);
        return {
          allowed: count <= limit,
          limit,
          remaining,
          resetInSeconds: windowSeconds,
          current: count,
        };
      }
    } catch (err: any) {
      console.warn(`[DistributedRateLimiter] Redis check error for ${redisKey}, using local fallback:`, err.message);
    }

    // 2. Safe In-Memory Fallback
    const now = Date.now();
    let bucket = this.localBuckets.get(redisKey);

    if (!bucket || bucket.resetAt <= now) {
      bucket = {
        count: 1,
        resetAt: now + windowSeconds * 1000,
      };
      this.localBuckets.set(redisKey, bucket);
      return {
        allowed: true,
        limit,
        remaining: limit - 1,
        resetInSeconds: windowSeconds,
        current: 1,
      };
    }

    bucket.count++;
    const remaining = Math.max(0, limit - bucket.count);
    const resetInSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    return {
      allowed: bucket.count <= limit,
      limit,
      remaining,
      resetInSeconds,
      current: bucket.count,
    };
  }

  /**
   * Resets rate limit for a specific identifier
   */
  public async resetLimit(tenantId: string, scope: string, identifier: string): Promise<void> {
    const redisKey = `rate:${tenantId}:${scope}:${identifier}`;
    try {
      await redisService.del(redisKey);
    } catch {}
    this.localBuckets.delete(redisKey);
  }

  /**
   * Generates standard Express middleware for rate-limiting routes
   */
  public createMiddleware(options: RateLimitOptions) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const tenantId = (req as any).tenantId || (req as any).internalContext?.tenantId || 'global';
      const identifier = options.keyGenerator
        ? options.keyGenerator(req)
        : (req as any).user?.id || req.ip || 'anonymous';

      const result = await this.checkLimit({
        tenantId,
        scope: options.scope,
        identifier,
        limit: options.limit,
        windowSeconds: options.windowSeconds,
      });

      res.setHeader('X-RateLimit-Limit', result.limit.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', result.resetInSeconds.toString());

      if (!result.allowed) {
        res.status(429).json({
          success: false,
          error: options.errorMessage || `Rate limit exceeded for scope '${options.scope}'. Try again in ${result.resetInSeconds} seconds.`,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: result.resetInSeconds,
        });
        return;
      }

      next();
    };
  }

  public close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

export const distributedRateLimiter = new DistributedRateLimiter();
