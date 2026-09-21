import express from 'express';
import http from 'http';
import path from 'path';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

import authRoutes from './src/server/routes/authRoutes.ts';
import tradingRoutes from './src/server/routes/tradingRoutes.ts';
import adminRoutes from './src/server/routes/admin/index.ts';
import tenantRoutes from './src/server/routes/tenantRoutes.ts';
import internalRoutes from './src/server/routes/internal/index.ts';
import healthRoutes, { setServerShuttingDown } from './src/server/routes/healthRoutes.ts';
import { errorHandler } from './src/server/middleware/errorMiddleware.ts';
import { hierarchyService } from './src/server/services/hierarchyService.ts';
import { resolveTenantMiddleware } from './src/server/middleware/tenantMiddleware.ts';
import { getInternalAuthConfig } from './src/server/config/internalConfig.ts';
import { ProductionValidator } from './src/server/config/productionValidator.ts';
import {
  securityHeadersMiddleware,
  csrfProtectionMiddleware,
  sanitizeQueryParams,
} from './src/server/middleware/securityHeadersMiddleware.ts';
import { initializeCachesFromLocal } from './src/server/cache/initCache.ts';
import { runMigrations } from './src/server/db/migrationRunner.ts';
import { tradingWebSocketServer } from './src/server/websocket/WebSocketServer.ts';
import { redisService } from './src/server/redis/RedisService.ts';
import { transactionalOutboxService } from './src/server/services/TransactionalOutboxService.ts';
import { pgDb } from './src/server/db/postgres.ts';

dotenv.config();

const PORT = 3000;
const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  // Validate production configuration and required secrets
  const configValidation = ProductionValidator.validateEnv(isProd);
  if (!configValidation.valid) {
    console.warn('[CONFIG NOTICE] Environment configuration recommendations:');
    configValidation.errors.forEach((e) => console.warn(`  - ${e}`));
    if (process.env.STRICT_PRODUCTION_CONFIG === 'true') {
      console.error('[FATAL CONFIG ERROR] STRICT_PRODUCTION_CONFIG is enabled; halting.');
      process.exit(1);
    }
  }
  if (configValidation.warnings.length > 0) {
    configValidation.warnings.forEach((w) => console.warn(`[CONFIG WARNING] ${w}`));
  }

  // Validate internal S2S authentication configuration at startup
  try {
    getInternalAuthConfig();
  } catch (err: any) {
    console.error('[FATAL CONFIG ERROR]', err.message);
    process.exit(1);
  }

  // Initialize Redis distributed coordination layer
  try {
    await redisService.init();
  } catch (redisErr: any) {
    console.warn('[Redis] Initialization warning (degraded mode active):', redisErr.message);
  }

  // Safe non-blocking initialization of tenant config and emergency state caches
  await initializeCachesFromLocal();

  // Run PostgreSQL database migrations
  try {
    await runMigrations();
  } catch (migErr: any) {
    console.error('[DB] Migration error during startup:', migErr.message);
  }

  // Start Transactional Outbox background worker
  transactionalOutboxService.startWorker();

  const app = express();

  // Basic security & parsing middlewares with rawBody retention for HMAC verification
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Production Security Headers & Parameter Sanitization
  app.use(securityHeadersMiddleware);
  app.use(sanitizeQueryParams);

  // Health, Liveness, and Readiness Endpoints (accessible without tenant resolution or CSRF)
  app.use(healthRoutes);

  // CSRF Protection for state-changing browser API requests
  app.use(csrfProtectionMiddleware);

  // Multi-Tenant Resolution Middleware (Domain-based with dev fallback, never trusts client headers)
  app.use(resolveTenantMiddleware);

  // Internal Server-to-Server Routes (Central Admin -> Trading Platform)
  // Protected by HMAC-SHA256, Nonce, Timestamp, and Tenant ID validation
  app.use('/api/internal/v1', internalRoutes);

  // Browser & Client API Routes
  app.use('/api/tenant', tenantRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/trading', tradingRoutes);
  app.use('/api/admin', adminRoutes);

  // Central Error Handler for API routes
  app.use('/api/*', errorHandler);

  // Frontend Serving (Vite middleware in dev, static files in prod)
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global fallback error handler
  app.use(errorHandler);

  const httpServer = http.createServer(app);

  // Initialize Real-time WebSocket Server on /ws
  tradingWebSocketServer.initialize(httpServer);

  httpServer.listen(PORT, '0.0.0.0', async () => {
    try {
      await hierarchyService.ensureSuperAdmin();
    } catch (e) {
      console.warn('[ADMIN] Super admin hierarchy init notice:', e);
    }
    console.log(`[VERTEX] Server running on http://0.0.0.0:${PORT} (env: ${process.env.NODE_ENV || 'development'})`);
  });

  const gracefulShutdown = async (signal: string) => {
    console.log(`[VERTEX] Received ${signal}, initiating graceful shutdown...`);
    setServerShuttingDown(true);

    try {
      transactionalOutboxService.stopWorker();
      tradingWebSocketServer.close();
      await redisService.close();
      await pgDb.close();
    } catch (shutdownErr: any) {
      console.warn('[VERTEX] Warning during shutdown cleanup:', shutdownErr.message);
    }

    httpServer.close(() => {
      console.log('[VERTEX] HTTP server closed gracefully');
      process.exit(0);
    });

    // Hard fallback termination after 10s
    setTimeout(() => {
      console.error('[VERTEX] Graceful shutdown timed out, force exiting');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('[VERTEX] Failed to start server:', err);
  process.exit(1);
});
