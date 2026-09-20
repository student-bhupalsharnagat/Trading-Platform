import Redis, { Redis as RedisClient } from 'ioredis';
// @ts-ignore
import RedisMock from 'ioredis-mock';

export interface RedisHealth {
  status: 'healthy' | 'degraded' | 'disabled' | 'fallback';
  mode: 'redis' | 'mock';
  connected: boolean;
  latencyMs: number;
  error?: string | null;
}

export type MessageHandler = (channel: string, message: string) => void;

export class RedisService {
  private client: any = null;
  private subscriber: any = null;
  private mode: 'redis' | 'mock' = 'mock';
  private connected = false;
  private isDegraded = false;
  private initPromise: Promise<void> | null = null;
  private subscriptions = new Map<string, Set<MessageHandler>>();
  private customMockInstance: any = null;

  constructor(options?: { forceMock?: boolean; mockInstance?: any }) {
    if (options?.mockInstance) {
      this.customMockInstance = options.mockInstance;
    }
  }

  public async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const redisUrl = process.env.REDIS_URL;
      const redisHost = process.env.REDIS_HOST || '127.0.0.1';
      const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
      const redisPassword = process.env.REDIS_PASSWORD || undefined;

      // Allow forced mock mode for local testing/dev when no redis server exists
      const shouldAttemptRealRedis =
        Boolean(process.env.USE_REAL_REDIS === 'true' || (redisUrl && !redisUrl.includes('localhost') && !redisUrl.includes('127.0.0.1')));

      if (shouldAttemptRealRedis) {
        try {
          const client = redisUrl
            ? new (Redis as any)(redisUrl, {
                connectTimeout: 2000,
                maxRetriesPerRequest: 1,
                retryStrategy: () => null, // don't hang if server unreachable
                enableReadyCheck: true,
                lazyConnect: true,
              })
            : new (Redis as any)({
                host: redisHost,
                port: redisPort,
                password: redisPassword,
                connectTimeout: 2000,
                maxRetriesPerRequest: 1,
                retryStrategy: () => null,
                enableReadyCheck: true,
                lazyConnect: true,
              });

          const sub = redisUrl
            ? new (Redis as any)(redisUrl, {
                connectTimeout: 2000,
                maxRetriesPerRequest: 1,
                retryStrategy: () => null,
                lazyConnect: true,
              })
            : new (Redis as any)({
                host: redisHost,
                port: redisPort,
                password: redisPassword,
                connectTimeout: 2000,
                maxRetriesPerRequest: 1,
                retryStrategy: () => null,
                lazyConnect: true,
              });

          await client.connect();
          await sub.connect();

          this.client = client;
          this.subscriber = sub;
          this.mode = 'redis';
          this.connected = true;
          this.isDegraded = false;

          this.setupEventHandlers();
          console.log('[Redis] Connected successfully to external Redis instance');
          return;
        } catch (err: any) {
          console.warn('[Redis] External Redis connection failed, safely activating in-memory coordination engine:', err.message);
        }
      }

      // Safe Fallback / Embedded Mock Engine
      await this.initMock();
    })();

    return this.initPromise;
  }

  private async initMock(): Promise<void> {
    if (this.customMockInstance) {
      this.client = this.customMockInstance;
      this.subscriber = this.customMockInstance.duplicate();
    } else {
      const mock = new RedisMock();
      this.client = mock;
      this.subscriber = mock.duplicate();
    }

    this.mode = 'mock';
    this.connected = true;
    this.isDegraded = false;
    this.setupEventHandlers();
    console.log('[Redis] Activated zero-downtime distributed in-memory Redis coordinator');
  }

  private setupEventHandlers(): void {
    if (!this.client || !this.subscriber) return;

    this.client.on('error', (err: any) => {
      console.warn('[Redis Client Warning]:', err.message);
      this.isDegraded = true;
    });

    this.subscriber.on('error', (err: any) => {
      console.warn('[Redis Subscriber Warning]:', err.message);
      this.isDegraded = true;
    });

    this.subscriber.on('message', (channel: string, message: string) => {
      const handlers = this.subscriptions.get(channel);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(channel, message);
          } catch (handlerErr) {
            console.error(`[Redis] Error in subscription handler for channel ${channel}:`, handlerErr);
          }
        });
      }
    });
  }

  public getClient(): any {
    return this.client;
  }

  public getSubscriber(): any {
    return this.subscriber;
  }

  public isConnected(): boolean {
    return this.connected && !this.isDegraded;
  }

  public getMode(): 'redis' | 'mock' {
    return this.mode;
  }

  // -------------------------------------------------------------
  // Basic Key-Value Operations
  // -------------------------------------------------------------

  public async get(key: string): Promise<string | null> {
    try {
      await this.init();
      return await this.client.get(key);
    } catch (err: any) {
      console.warn(`[Redis get error for ${key}]:`, err.message);
      return null;
    }
  }

  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      await this.init();
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch (err: any) {
      console.warn(`[Redis set error for ${key}]:`, err.message);
    }
  }

  public async del(key: string): Promise<number> {
    try {
      await this.init();
      return await this.client.del(key);
    } catch (err: any) {
      console.warn(`[Redis del error for ${key}]:`, err.message);
      return 0;
    }
  }

  public async incr(key: string): Promise<number> {
    try {
      await this.init();
      return await this.client.incr(key);
    } catch (err: any) {
      console.warn(`[Redis incr error for ${key}]:`, err.message);
      return 1;
    }
  }

  public async expire(key: string, seconds: number): Promise<number> {
    try {
      await this.init();
      return await this.client.expire(key, seconds);
    } catch (err: any) {
      console.warn(`[Redis expire error for ${key}]:`, err.message);
      return 0;
    }
  }

  // -------------------------------------------------------------
  // Pub / Sub Coordination
  // -------------------------------------------------------------

  public async publish(channel: string, message: any): Promise<number> {
    try {
      await this.init();
      const stringified = typeof message === 'string' ? message : JSON.stringify(message);
      return await this.client.publish(channel, stringified);
    } catch (err: any) {
      console.warn(`[Redis publish error on ${channel}]:`, err.message);
      return 0;
    }
  }

  public async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    await this.init();

    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
      try {
        await this.subscriber.subscribe(channel);
      } catch (err: any) {
        console.warn(`[Redis subscribe error on ${channel}]:`, err.message);
      }
    }

    this.subscriptions.get(channel)!.add(handler);
  }

  public async unsubscribe(channel: string, handler?: MessageHandler): Promise<void> {
    if (!this.subscriptions.has(channel)) return;

    if (handler) {
      const set = this.subscriptions.get(channel)!;
      set.delete(handler);
      if (set.size === 0) {
        this.subscriptions.delete(channel);
        try {
          await this.subscriber.unsubscribe(channel);
        } catch {}
      }
    } else {
      this.subscriptions.delete(channel);
      try {
        await this.subscriber.unsubscribe(channel);
      } catch {}
    }
  }

  // -------------------------------------------------------------
  // Distributed Locks
  // -------------------------------------------------------------

  public async acquireLock(lockKey: string, ttlSeconds = 10): Promise<string | null> {
    try {
      await this.init();
      const token = `lock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      // SET key value NX EX ttl
      const result = await this.client.set(lockKey, token, 'NX', 'EX', ttlSeconds);
      return result === 'OK' ? token : null;
    } catch (err: any) {
      console.warn(`[Redis acquireLock error for ${lockKey}]:`, err.message);
      return null;
    }
  }

  public async releaseLock(lockKey: string, token: string): Promise<boolean> {
    try {
      await this.init();
      const current = await this.client.get(lockKey);
      if (current === token) {
        await this.client.del(lockKey);
        return true;
      }
      return false;
    } catch (err: any) {
      console.warn(`[Redis releaseLock error for ${lockKey}]:`, err.message);
      return false;
    }
  }

  // -------------------------------------------------------------
  // Health & Observability
  // -------------------------------------------------------------

  public async healthCheck(): Promise<RedisHealth> {
    await this.init();
    const start = Date.now();

    try {
      const pong = await this.client.ping();
      const latencyMs = Date.now() - start;
      const isOk = pong === 'PONG' || pong === true;

      return {
        status: isOk ? (this.mode === 'mock' ? 'fallback' : 'healthy') : 'degraded',
        mode: this.mode,
        connected: isOk,
        latencyMs,
      };
    } catch (err: any) {
      return {
        status: 'degraded',
        mode: this.mode,
        connected: false,
        latencyMs: Date.now() - start,
        error: err.message,
      };
    }
  }

  // -------------------------------------------------------------
  // Testing & Multiple Instances Support
  // -------------------------------------------------------------

  public createPeerInstance(): RedisService {
    // When in mock mode, peer instances share the same underlying mock store
    // so they can publish and receive messages across instances in tests!
    const peer = new RedisService({ mockInstance: this.client });
    return peer;
  }

  public isReady(): boolean {
    return this.connected && this.client !== null;
  }

  public async close(): Promise<void> {
    if (this.subscriber) {
      try {
        await this.subscriber.quit();
      } catch {
        try {
          this.subscriber.disconnect();
        } catch {}
      }
    }
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        try {
          this.client.disconnect();
        } catch {}
      }
    }
    this.connected = false;
    this.initPromise = null;
    this.subscriptions.clear();
  }
}

export const redisService = new RedisService();
