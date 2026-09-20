/**
-- VERTEX Multi-Tenant Trading Platform - Phase 5J-A
-- Operation Idempotency Store for Emergency & Destructive Operations
-- Prevents duplicate cancel-all, square-off, freeze, and state transitions
*/

import { redisService } from '../redis/RedisService.ts';

export interface CachedOperationResult {
  statusCode: number;
  data: any;
  timestamp: string;
}

export class OperationIdempotencyStore {
  private memoryMap = new Map<string, { result: CachedOperationResult; expiresAt: number }>();
  private readonly defaultTtlMs = 86400000; // 24 hours

  public async get(key: string, tenantId: string): Promise<CachedOperationResult | null> {
    const compositeKey = `idempotency:${tenantId}:${key}`;

    // 1. Check local memory
    const local = this.memoryMap.get(compositeKey);
    if (local) {
      if (Date.now() < local.expiresAt) {
        return local.result;
      }
      this.memoryMap.delete(compositeKey);
    }

    // 2. Check Redis if available
    try {
      if (redisService.isReady()) {
        const client = redisService.getClient();
        if (client && typeof client.get === 'function') {
          const raw = await client.get(compositeKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            this.memoryMap.set(compositeKey, {
              result: parsed,
              expiresAt: Date.now() + 300000,
            });
            return parsed;
          }
        }
      }
    } catch {
      // Redis is non-authoritative
    }

    return null;
  }

  public async set(
    key: string,
    tenantId: string,
    data: any,
    statusCode = 200,
    ttlMs = this.defaultTtlMs
  ): Promise<void> {
    const compositeKey = `idempotency:${tenantId}:${key}`;
    const result: CachedOperationResult = {
      statusCode,
      data,
      timestamp: new Date().toISOString(),
    };

    // Store in memory
    this.memoryMap.set(compositeKey, {
      result,
      expiresAt: Date.now() + ttlMs,
    });

    // Clean old entries if memory grows too large
    if (this.memoryMap.size > 5000) {
      const now = Date.now();
      for (const [k, v] of this.memoryMap.entries()) {
        if (now >= v.expiresAt) {
          this.memoryMap.delete(k);
        }
      }
    }

    // Store in Redis non-authoritatively
    try {
      if (redisService.isReady()) {
        const client = redisService.getClient();
        if (client && typeof client.set === 'function') {
          await client.set(compositeKey, JSON.stringify(result), 'PX', ttlMs);
        }
      }
    } catch {
      // Non-authoritative
    }
  }

  public clear(): void {
    this.memoryMap.clear();
  }
}

export const operationIdempotencyStore = new OperationIdempotencyStore();
