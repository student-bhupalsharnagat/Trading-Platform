/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5I
 * Production Health, Liveness, and Readiness Endpoints
 */

import { Router, Request, Response } from 'express';
import { pgDb } from '../db/postgres.ts';
import { redisService } from '../redis/RedisService.ts';
import { transactionalOutboxService } from '../services/TransactionalOutboxService.ts';
import { tradingWebSocketServer } from '../websocket/WebSocketServer.ts';
import { backupRestoreService } from '../db/backupRestoreService.ts';

const router = Router();
let isShuttingDown = false;

export function setServerShuttingDown(val: boolean): void {
  isShuttingDown = val;
}

export function isServerShuttingDown(): boolean {
  return isShuttingDown;
}

/**
 * GET /live
 * Lightweight liveness probe to verify Node process event loop responsiveness.
 */
router.get('/live', (_req: Request, res: Response) => {
  if (isShuttingDown) {
    res.status(503).json({ status: 'terminating', timestamp: new Date().toISOString() });
    return;
  }
  res.status(200).json({
    status: 'alive',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /ready
 * Readiness probe to ensure database connectivity and migration safety before routing traffic.
 */
router.get('/ready', async (_req: Request, res: Response) => {
  if (isShuttingDown) {
    res.status(503).json({
      status: 'not_ready',
      reason: 'Server is terminating / shutting down',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    // Check PostgreSQL connection
    const dbRes = await pgDb.query('SELECT 1 as alive');
    if (!dbRes || !dbRes.rows || dbRes.rows.length === 0) {
      throw new Error('PostgreSQL database query returned empty response');
    }

    res.status(200).json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'not_ready',
      database: 'disconnected',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /health (and GET /api/health)
 * Deep operational health probe reporting on all sub-systems, dependencies, and memory.
 */
router.get('/health', async (_req: Request, res: Response) => {
  const startTime = Date.now();

  // 1. PostgreSQL check
  let dbStatus = 'healthy';
  let dbLatencyMs = 0;
  try {
    const t0 = Date.now();
    await pgDb.query('SELECT 1');
    dbLatencyMs = Date.now() - t0;
  } catch (err: any) {
    dbStatus = 'unhealthy';
  }

  // 2. Redis coordination layer check
  const redisHealth = await redisService.healthCheck();

  // 3. Outbox backlog & dead-letter status
  const outboxHealth = await transactionalOutboxService.getHealth();

  // 4. WebSocket stats
  const wsMetrics = tradingWebSocketServer.getMetrics();

  // 5. Memory usage
  const memUsage = process.memoryUsage();

  const isHealthy = dbStatus === 'healthy' && !isShuttingDown;
  const statusCode = isHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: isHealthy ? 'healthy' : 'degraded',
    service: 'VERTEX Multi-Tenant Trading Platform Engine',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.floor(process.uptime()),
    latencyMs: Date.now() - startTime,
    dependencies: {
      postgresql: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        authoritativeSourceOfTruth: true,
      },
      redis: {
        status: redisHealth.status,
        connected: redisHealth.connected,
        latencyMs: redisHealth.latencyMs,
        authoritativeSourceOfTruth: false,
      },
      outboxWorker: {
        status: outboxHealth.status,
        running: outboxHealth.workerRunning,
        pendingBacklog: outboxHealth.pendingCount,
        deadLetterCount: outboxHealth.deadLetterCount,
      },
      webSocket: {
        activeClients: wsMetrics.activeConnections,
        messagesProcessed: wsMetrics.totalMessagesReceived,
      },
    },
    system: {
      heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
      rssMb: Math.round(memUsage.rss / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
