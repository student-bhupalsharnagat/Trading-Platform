import { Router, Response } from 'express';
import { requireInternalAuth, InternalAuthorizedRequest } from '../../auth/internalAuth.ts';
import { tenantConfigSyncService } from '../../services/tenantConfigSyncService.ts';
import { tradingHaltService } from '../../services/tradingHaltService.ts';
import { orderCancellationService } from '../../services/orderCancellationService.ts';
import { positionSquareOffService } from '../../services/positionSquareOffService.ts';
import { emergencyControlService } from '../../services/emergencyControlService.ts';
import { eventIdempotencyStore } from '../../events/EventIdempotencyStore.ts';
import { internalEventDispatcher } from '../../events/InternalEventDispatcher.ts';
import { tenantConfigCache } from '../../cache/TenantConfigCache.ts';
import { emergencyStateCache } from '../../cache/EmergencyStateCache.ts';
import { auditService } from '../../services/auditService.ts';
import { redisService } from '../../redis/RedisService.ts';
import { transactionalOutboxService } from '../../services/TransactionalOutboxService.ts';
import { tradingWebSocketServer } from '../../websocket/WebSocketServer.ts';
import { pgDb } from '../../db/postgres.ts';
import { tenantRepository } from '../../repositories/JsonTenantRepository.ts';
import { db } from '../../db/database.ts';
import { postgresWalletRepository } from '../../repositories/trading/PostgresWalletRepository.ts';
import { executionGateway } from '../../gateways/ExecutionGateway.ts';
import { operationIdempotencyStore } from '../../events/OperationIdempotencyStore.ts';
import { postgresTenantConfigRepository } from '../../repositories/trading/PostgresTenantConfigRepository.ts';

const router = Router();

// Apply internal authentication (HMAC verification, replay check, tenant ID extraction) to all internal routes
router.use(requireInternalAuth);

/**
 * Helper to extract and validate the authoritative tenant ID from internalContext
 */
function getInternalTenantId(req: InternalAuthorizedRequest): string {
  const tenantId = req.internalContext?.tenantId;
  if (!tenantId || typeof tenantId !== 'string') {
    const err = new Error('Missing or invalid authoritative X-Tenant-ID context.');
    (err as any).statusCode = 400;
    throw err;
  }
  return tenantId;
}

/**
 * Helper to execute an operation idempotently when an idempotency key is present.
 */
async function handleIdempotentOperation(
  req: InternalAuthorizedRequest,
  res: Response,
  action: () => Promise<any>
): Promise<void> {
  const tenantId = getInternalTenantId(req);
  const idempotencyKey =
    (req.headers['x-idempotency-key'] as string) ||
    req.body?.idempotencyKey ||
    req.body?.idempotency_key;

  if (idempotencyKey) {
    const cached = await operationIdempotencyStore.get(idempotencyKey, tenantId);
    if (cached) {
      res.setHeader('X-Cache-Idempotent', 'HIT');
      res.status(cached.statusCode).json({
        ...cached.data,
        idempotencyKey,
        idempotent: true,
        alreadyProcessed: true,
      });
      return;
    }
    res.setHeader('X-Cache-Idempotent', 'MISS');
  }

  const result = await action();

  if (idempotencyKey) {
    const enrichedResult = { ...result, idempotencyKey };
    await operationIdempotencyStore.set(idempotencyKey, tenantId, enrichedResult, 200);
    res.json(enrichedResult);
    return;
  }

  res.json(result);
}

/**
 * GET /api/internal/v1/health & GET /api/internal/v1/system/health
 * Operational health, component connectivity, and observability probe for Central Admin.
 */
const healthHandler = async (req: InternalAuthorizedRequest, res: Response) => {
  const internalContext = req.internalContext;
  const tenantId = internalContext?.tenantId;

  const redisHealth = await redisService.healthCheck();
  const outboxHealth = await transactionalOutboxService.getHealth();
  const wsMetrics = tradingWebSocketServer.getMetrics();
  const dispatcherHealth = internalEventDispatcher.getHealth();
  const cacheHealth = tenantConfigCache.getHealth();
  const emergencyHealth = emergencyStateCache.get(tenantId || 'global');

  // Verify PostgreSQL connectivity
  let postgresConnected = true;
  try {
    await pgDb.query('SELECT 1');
  } catch {
    postgresConnected = false;
  }

  const isHealthy =
    postgresConnected && (redisHealth.connected || redisHealth.status === 'fallback');

  const correlationId = req.correlationId || req.internalContext?.correlationId;

  res.json({
    ok: isHealthy,
    service: 'trading-platform',
    tenantId,
    correlationId,
    timestamp: new Date().toISOString(),
    postgres: {
      connected: postgresConnected,
      isPgLite: (pgDb as any).isPgLite ?? true,
    },
    brokerGateway: {
      status: 'ONLINE',
      mode: 'SANDBOX_MOCK',
      realMoneyTradingAllowed: false,
    },
    redis: {
      status: redisHealth.status,
      mode: redisHealth.mode,
      connected: redisHealth.connected,
      latencyMs: redisHealth.latencyMs,
      error: redisHealth.error,
    },
    websocket: {
      activeConnections: wsMetrics.activeConnections,
      totalConnectionsOpened: wsMetrics.totalConnectionsOpened,
      totalMessagesSent: wsMetrics.totalMessagesSent,
      totalMessagesReceived: wsMetrics.totalMessagesReceived,
      redisPubSubActive: wsMetrics.redisPubSubActive,
    },
    outbox: {
      workerRunning: outboxHealth.workerRunning,
      pendingCount: outboxHealth.pendingCount,
      processingCount: outboxHealth.processingCount,
      completedCount: outboxHealth.completedCount,
      failedCount: outboxHealth.failedCount,
      deadLetterCount: outboxHealth.deadLetterCount,
      totalCount: outboxHealth.totalCount,
    },
    dispatcher: {
      queueSize: dispatcherHealth.queueSize,
      pendingEvents: dispatcherHealth.pendingEvents,
      failedEvents: dispatcherHealth.failedEvents,
      deadLetterEvents: dispatcherHealth.deadLetterEvents,
      circuitState: dispatcherHealth.circuitState,
      lastSuccessfulDelivery: dispatcherHealth.lastSuccessfulDelivery,
    },
    circuitBreaker: {
      state: dispatcherHealth.circuitState,
    },
    caches: {
      tenantConfig: cacheHealth,
      emergencyState: {
        version: emergencyHealth.version,
        tradingHalted: emergencyHealth.tradingHalted,
        tenantFrozen: emergencyHealth.tenantFrozen,
      },
    },
  });
};

router.get('/health', healthHandler);
router.get('/system/health', healthHandler);

/**
 * POST /api/internal/v1/tenant/sync
 * Receives authoritative tenant configuration from Central Admin.
 */
router.post('/tenant/sync', async (req: InternalAuthorizedRequest, res: Response) => {
  try {
    const tenantId = getInternalTenantId(req);
    const source = (req.body?.source as string) || 'CENTRAL_ADMIN';

    // Verify cross-tenant isolation: body tenantId must match header if provided
    if (req.body?.tenantId && req.body.tenantId.trim() !== tenantId.trim()) {
      res.status(403).json({
        success: false,
        error: `Tenant mismatch: Body tenantId '${req.body.tenantId}' does not match authoritative X-Tenant-ID '${tenantId}'.`,
        code: 'TENANT_MISMATCH',
      });
      return;
    }

    const result = await tenantConfigSyncService.syncTenantConfig(tenantId, req.body, source);
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to synchronize tenant configuration.',
      code: err.code,
    });
  }
});

/**
 * POST /api/internal/v1/tenant/create
 * Creates a new tenant commanded by Central Admin.
 */
router.post('/tenant/create', async (req: InternalAuthorizedRequest, res: Response) => {
  try {
    const tenantId = getInternalTenantId(req);
    const { name, slug, customDomain, domains, branding, config, status } = req.body || {};

    if (!name || !slug) {
      res.status(400).json({
        success: false,
        error: 'Fields "name" and "slug" are required to create a tenant.',
      });
      return;
    }

    const created = await tenantRepository.createTenant({
      tenant: {
        id: tenantId,
        name,
        slug: slug.toLowerCase(),
        customDomain: customDomain || `${slug.toLowerCase()}.trading.vertex.com`,
        domains: domains || [customDomain || `${slug.toLowerCase()}.trading.vertex.com`],
        status: status?.status || 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      branding,
      config,
      status,
    });

    // Prime caches
    tenantConfigCache.invalidate(tenantId);
    emergencyStateCache.invalidate(tenantId);

    auditService.logEmergencyEvent({
      action: 'TENANT_CREATED_BY_CENTRAL_ADMIN',
      source: 'CENTRAL_ADMIN',
      tenantId,
      result: {
        tenantId,
        slug: created.slug,
        name: created.name,
      },
    });

    res.json({
      success: true,
      tenantId,
      tenant: created,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to create tenant.',
      code: err.code,
    });
  }
});

/**
 * POST /api/internal/v1/tenant/branding
 * White-label branding update from Central Admin.
 */
router.post('/tenant/branding', async (req: InternalAuthorizedRequest, res: Response) => {
  try {
    const tenantId = getInternalTenantId(req);
    const brandingUpdates = { ...(req.body?.branding || req.body || {}) };

    delete (brandingUpdates as any).tenantId;
    delete (brandingUpdates as any).tenant_id;
    delete (brandingUpdates as any).source;

    const updated = await tenantRepository.updateBranding(tenantId, brandingUpdates);
    if (!updated) {
      res.status(404).json({
        success: false,
        error: `Tenant '${tenantId}' not found.`,
      });
      return;
    }

    const currentCached = tenantConfigCache.get(tenantId);
    const nextVersion = (currentCached.brandingVersion || 0) + 1;
    tenantConfigCache.set(tenantId, {
      brandingVersion: nextVersion,
    });

    tradingWebSocketServer.broadcastToTenant(tenantId, 'branding.updated', {
      branding: updated,
      brandingVersion: nextVersion,
    });

    auditService.logEmergencyEvent({
      action: 'TENANT_BRANDING_UPDATED',
      source: 'CENTRAL_ADMIN',
      tenantId,
      result: {
        tenantId,
        brandingVersion: nextVersion,
      },
    });

    res.json({
      success: true,
      tenantId,
      brandingVersion: nextVersion,
      branding: updated,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to update tenant branding.',
      code: err.code,
    });
  }
});

/**
 * POST /api/internal/v1/platform/config (aliases: /platform-config/sync, /tenant/platform-config)
 * Platform configuration sync from Central Admin.
 */
router.post(
  ['/platform/config', '/platform-config/sync', '/tenant/platform-config'],
  async (req: InternalAuthorizedRequest, res: Response) => {
    try {
      const tenantId = getInternalTenantId(req);
      const configUpdates = { ...(req.body?.config || req.body || {}) };
      delete (configUpdates as any).tenantId;
      delete (configUpdates as any).tenant_id;
      delete (configUpdates as any).source;

      const updated = await tenantRepository.updatePlatformConfig(tenantId, configUpdates);
      if (!updated) {
        res.status(404).json({
          success: false,
          error: `Tenant '${tenantId}' not found.`,
        });
        return;
      }

      // Invalidate cache and broadcast
      tenantConfigCache.invalidate(tenantId);
      tradingWebSocketServer.broadcastToTenant(tenantId, 'config.updated', {
        config: updated,
      });

      auditService.logEmergencyEvent({
        action: 'PLATFORM_CONFIG_UPDATED',
        source: req.body?.source || 'CENTRAL_ADMIN',
        tenantId,
        result: { tenantId, config: updated },
      });

      res.json({
        success: true,
        tenantId,
        config: updated,
      });
    } catch (err: any) {
      const status = err.statusCode || 500;
      res.status(status).json({
        success: false,
        error: err.message || 'Failed to update platform configuration.',
        code: err.code,
      });
    }
  }
);

/**
 * POST /api/internal/v1/tenant/status (alias: /tenant/status-change)
 * Tenant status change from Central Admin (e.g., active, suspended, frozen, maintenance).
 */
router.post(
  ['/tenant/status', '/tenant/status-change'],
  async (req: InternalAuthorizedRequest, res: Response) => {
    try {
      const tenantId = getInternalTenantId(req);
      const statusUpdates = { ...(req.body?.status || req.body || {}) };
      delete (statusUpdates as any).tenantId;
      delete (statusUpdates as any).tenant_id;
      delete (statusUpdates as any).source;

      const updated = await tenantRepository.updateStatus(tenantId, statusUpdates);
      if (!updated) {
        res.status(404).json({
          success: false,
          error: `Tenant '${tenantId}' not found.`,
        });
        return;
      }

      // Invalidate cache and broadcast
      tenantConfigCache.invalidate(tenantId);
      emergencyStateCache.invalidate(tenantId);
      tradingWebSocketServer.broadcastToTenant(tenantId, 'tenant_status.updated', {
        status: updated,
      });

      auditService.logEmergencyEvent({
        action: 'TENANT_STATUS_UPDATED',
        source: req.body?.source || 'CENTRAL_ADMIN',
        tenantId,
        result: { tenantId, status: updated },
      });

      res.json({
        success: true,
        tenantId,
        status: updated,
      });
    } catch (err: any) {
      const status = err.statusCode || 500;
      res.status(status).json({
        success: false,
        error: err.message || 'Failed to update tenant status.',
        code: err.code,
      });
    }
  }
);

/**
 * POST /api/internal/v1/tenant/trading-toggle (aliases: /trading/toggle, /trading/enable, /trading/disable)
 * Trading enable/disable toggle for tenant from Central Admin.
 */
router.post(
  ['/tenant/trading-toggle', '/trading/toggle', '/trading/enable', '/trading/disable'],
  async (req: InternalAuthorizedRequest, res: Response) => {
    try {
      const tenantId = getInternalTenantId(req);
      const reqPath = req.originalUrl || req.url || '';
      let enabled = req.body?.enabled;
      if (reqPath.includes('/enable')) enabled = true;
      if (reqPath.includes('/disable')) enabled = false;

      if (enabled === undefined || typeof enabled !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'Field "enabled" must be a boolean.',
        });
        return;
      }

      const reason = req.body?.reason || (enabled ? 'Trading enabled by Central Admin' : 'Trading disabled by Central Admin');
      const source = req.body?.source || 'CENTRAL_ADMIN';

      // tradingHaltService: true means HALTED, false means RUNNING.
      // So if enabled is true -> halt is false. If enabled is false -> halt is true.
      await handleIdempotentOperation(req, res, async () => {
        const haltResult = await tradingHaltService.setTradingHalt(tenantId, !enabled, reason, source);
        await tenantRepository.updatePlatformConfig(tenantId, { trading_enabled: enabled });
        return {
          success: true,
          tenantId,
          tradingEnabled: enabled,
          reason: haltResult.reason,
          timestamp: haltResult.timestamp,
        };
      });
    } catch (err: any) {
      const status = err.statusCode || 500;
      res.status(status).json({
        success: false,
        error: err.message || 'Failed to toggle trading state.',
        code: err.code,
      });
    }
  }
);

/**
 * POST /api/internal/v1/tenant/registration-toggle (aliases: /tenant/registration, /registration/toggle, /registration/enable, /registration/disable)
 * Registration enable/disable toggle for tenant from Central Admin.
 */
router.post(
  [
    '/tenant/registration-toggle',
    '/tenant/registration',
    '/registration/toggle',
    '/registration/enable',
    '/registration/disable',
  ],
  async (req: InternalAuthorizedRequest, res: Response) => {
    try {
      const tenantId = getInternalTenantId(req);
      const reqPath = req.originalUrl || req.url || '';
      let enabled = req.body?.enabled;
      if (reqPath.includes('/enable')) enabled = true;
      if (reqPath.includes('/disable')) enabled = false;

      if (enabled === undefined || typeof enabled !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'Field "enabled" must be a boolean.',
        });
        return;
      }

      await handleIdempotentOperation(req, res, async () => {
        await tenantRepository.updatePlatformConfig(tenantId, { registration_enabled: enabled });
        await tenantRepository.updateStatus(tenantId, { registration_frozen: !enabled });
        tenantConfigCache.invalidate(tenantId);

        tradingWebSocketServer.broadcastToTenant(tenantId, 'config.updated', {
          registrationEnabled: enabled,
        });

        auditService.logEmergencyEvent({
          action: enabled ? 'REGISTRATION_ENABLED' : 'REGISTRATION_DISABLED',
          source: req.body?.source || 'CENTRAL_ADMIN',
          tenantId,
          reason: req.body?.reason,
          result: { tenantId, registrationEnabled: enabled },
        });

        return {
          success: true,
          tenantId,
          registrationEnabled: enabled,
          timestamp: new Date().toISOString(),
        };
      });
    } catch (err: any) {
      const status = err.statusCode || 500;
      res.status(status).json({
        success: false,
        error: err.message || 'Failed to toggle registration state.',
        code: err.code,
      });
    }
  }
);

/**
 * POST /api/internal/v1/tenant/api-toggle (aliases: /tenant/api, /api/toggle, /api/enable, /api/disable)
 * API enable/disable toggle for tenant from Central Admin.
 */
router.post(
  ['/tenant/api-toggle', '/tenant/api', '/api/toggle', '/api/enable', '/api/disable'],
  async (req: InternalAuthorizedRequest, res: Response) => {
    try {
      const tenantId = getInternalTenantId(req);
      const reqPath = req.originalUrl || req.url || '';
      let enabled = req.body?.enabled;
      if (reqPath.includes('/enable')) enabled = true;
      if (reqPath.includes('/disable')) enabled = false;

      if (enabled === undefined || typeof enabled !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'Field "enabled" must be a boolean.',
        });
        return;
      }

      await handleIdempotentOperation(req, res, async () => {
        await tenantRepository.updatePlatformConfig(tenantId, { api_enabled: enabled });
        await tenantRepository.updateStatus(tenantId, { api_frozen: !enabled });
        tenantConfigCache.invalidate(tenantId);

        tradingWebSocketServer.broadcastToTenant(tenantId, 'config.updated', {
          apiEnabled: enabled,
        });

        auditService.logEmergencyEvent({
          action: enabled ? 'API_ACCESS_ENABLED' : 'API_ACCESS_DISABLED',
          source: req.body?.source || 'CENTRAL_ADMIN',
          tenantId,
          reason: req.body?.reason,
          result: { tenantId, apiEnabled: enabled },
        });

        return {
          success: true,
          tenantId,
          apiEnabled: enabled,
          timestamp: new Date().toISOString(),
        };
      });
    } catch (err: any) {
      const status = err.statusCode || 500;
      res.status(status).json({
        success: false,
        error: err.message || 'Failed to toggle API access state.',
        code: err.code,
      });
    }
  }
);

/**
 * POST /api/internal/v1/emergency/killswitch
 * Global or tenant-level trading kill switch from Central Admin.
 */
router.post('/emergency/killswitch', async (req: InternalAuthorizedRequest, res: Response) => {
  try {
    const tenantId = getInternalTenantId(req);
    const { enabled, scope, reason, source } = req.body || {};

    if (enabled === undefined || typeof enabled !== 'boolean') {
      res.status(400).json({
        success: false,
        error: 'Field "enabled" must be a boolean.',
      });
      return;
    }

    const effectiveScope = (scope || 'TENANT').toUpperCase();
    if (effectiveScope !== 'TENANT' && effectiveScope !== 'GLOBAL') {
      res.status(400).json({
        success: false,
        error: 'Field "scope" must be either "TENANT" or "GLOBAL".',
      });
      return;
    }

    await handleIdempotentOperation(req, res, async () => {
      if (effectiveScope === 'GLOBAL') {
        const allTenants = await tenantRepository.findAll();
        for (const t of allTenants) {
          await tradingHaltService.setTradingHalt(
            t.id,
            enabled,
            reason || 'Global emergency kill switch activated',
            source || 'CENTRAL_ADMIN'
          );
        }
        return {
          success: true,
          scope: 'GLOBAL',
          enabled,
          affectedTenantsCount: allTenants.length,
          reason: reason || 'Global emergency kill switch',
          timestamp: new Date().toISOString(),
        };
      }

      const result = await tradingHaltService.setTradingHalt(
        tenantId,
        enabled,
        reason || 'Tenant trading kill switch activated',
        source || 'CENTRAL_ADMIN'
      );

      return {
        success: true,
        scope: 'TENANT',
        tenantId,
        enabled,
        reason: result.reason,
        timestamp: result.timestamp,
      };
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to toggle kill switch.',
      code: err.code,
    });
  }
});

/**
 * POST /api/internal/v1/hierarchy/create-user
 * Central Admin S2S provisioning for Master, Broker, Sub-Broker, and Client users.
 */
router.post(
  [
    '/hierarchy/create-user',
    '/hierarchy/provision-user',
    '/hierarchy/create-master',
    '/hierarchy/create-broker',
    '/hierarchy/create-sub-broker',
    '/hierarchy/create-client',
  ],
  async (req: InternalAuthorizedRequest, res: Response) => {
    try {
      const tenantId = getInternalTenantId(req);
      const reqPath = req.originalUrl || req.url || '';
      let role: any = req.body?.role?.toUpperCase();

      if (reqPath.includes('/create-master')) role = 'MASTER';
      else if (reqPath.includes('/create-broker')) role = 'BROKER';
      else if (reqPath.includes('/create-sub-broker')) role = 'SUB_BROKER';
      else if (reqPath.includes('/create-client')) role = 'CLIENT';

      if (!role || role === 'USER' || role === 'TRADER') {
        role = 'CLIENT';
      }

      const {
        userId,
        fullName,
        countryCode,
        password,
        email,
        parentId,
        company,
        address,
        commissionRate,
        demoBalance,
      } = req.body || {};
      const mobile = req.body?.mobile || '9999999999';

      if (!userId || !fullName) {
        res.status(400).json({
          success: false,
          error: 'Fields "userId" and "fullName" are required.',
        });
        return;
      }

      // If parentId provided, verify parent exists and belongs to the same tenant
      let hierarchyPath = `root.${userId.trim().toLowerCase()}`;
      if (parentId) {
        const parentUser = db.findUserById(parentId) || db.findUserByUserId(parentId);
        if (!parentUser) {
          res.status(404).json({
            success: false,
            error: `Parent user '${parentId}' not found.`,
          });
          return;
        }
        const parentTenant = parentUser.tenant_id || 'vertex-default';
        if (parentTenant !== tenantId) {
          res.status(403).json({
            success: false,
            error: `Tenant mismatch: Parent user belongs to tenant '${parentTenant}', not '${tenantId}'.`,
            code: 'TENANT_MISMATCH',
          });
          return;
        }
        hierarchyPath = `${parentUser.hierarchy_path || 'root'}.${userId.trim().toLowerCase()}`;
      } else if (role !== 'MASTER' && role !== 'SUPER_ADMIN') {
        hierarchyPath = `root.${tenantId}.${userId.trim().toLowerCase()}`;
      }

      const bcryptModule = await import('bcryptjs');
      const passwordHash = password
        ? (bcryptModule.default || bcryptModule).hashSync(password, 10)
        : '$2a$10$wT8BfZF/Y/wZ84aG9U0t6eYxUo9Jg7v1sYqQ4M4e4K0n0s9N7w5vC';

      const newUser = db.createUser({
        fullName,
        userId,
        countryCode: countryCode || '+91',
        mobile,
        passwordHash,
        email,
        role,
        parentId: parentId || null,
        hierarchyPath,
        company,
        address,
        commissionRate,
        demoBalance: demoBalance !== undefined ? demoBalance : 1000000.0,
        tenantId,
        isVerified: true,
        status: 'active',
      });

      // Ensure wallet exists in PostgreSQL
      try {
        await postgresWalletRepository.getOrCreateWallet(
          tenantId,
          newUser.user_id,
          newUser.demo_balance || 1000000.0
        );
      } catch {
        // Wallet may already exist or embedded pglite
      }

      auditService.logEmergencyEvent({
        action: 'HIERARCHY_USER_PROVISIONED',
        source: 'CENTRAL_ADMIN',
        tenantId,
        result: {
          userId: newUser.user_id,
          role: newUser.role,
          hierarchyPath: newUser.hierarchy_path,
        },
      });

      const sanitized = { ...newUser };
      delete (sanitized as any).password_hash;

      res.status(201).json({
        success: true,
        tenantId,
        user: sanitized,
      });
    } catch (err: any) {
      const status = err.statusCode || 500;
      res.status(status).json({
        success: false,
        error: err.message || 'Failed to provision hierarchy user.',
        code: err.code,
      });
    }
  }
);

/**
 * POST /api/internal/v1/emergency/trading-halt
 * Emergency Trading Halt / Resume commanded by Central Admin.
 */
router.post('/emergency/trading-halt', async (req: InternalAuthorizedRequest, res: Response) => {
  try {
    const tenantId = getInternalTenantId(req);
    const { enabled, reason, source } = req.body || {};

    if (enabled === undefined || typeof enabled !== 'boolean') {
      res.status(400).json({
        success: false,
        error: 'Field "enabled" must be a boolean (true to halt, false to resume).',
      });
      return;
    }

    // Cross-tenant verification if body tenantId is sent
    if (req.body?.tenantId && req.body.tenantId.trim() !== tenantId.trim()) {
      res.status(403).json({
        success: false,
        error: `Tenant mismatch: Body tenantId '${req.body.tenantId}' does not match authoritative X-Tenant-ID '${tenantId}'.`,
        code: 'TENANT_MISMATCH',
      });
      return;
    }

    await handleIdempotentOperation(req, res, async () => {
      return tradingHaltService.setTradingHalt(
        tenantId,
        enabled,
        reason,
        source || 'CENTRAL_ADMIN'
      );
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to execute trading halt.',
      code: err.code,
    });
  }
});

/**
 * POST /api/internal/v1/emergency/cancel-all-orders (alias: /emergency/cancel-orders)
 * Cancels pending/open orders for a tenant or specific user without touching executed trades.
 */
router.post(['/emergency/cancel-all-orders', '/emergency/cancel-orders'], async (req: InternalAuthorizedRequest, res: Response) => {
  try {
    const tenantId = getInternalTenantId(req);
    const { scope, userId, reason, source } = req.body || {};

    if (!scope || (scope !== 'TENANT' && scope !== 'USER')) {
      res.status(400).json({
        success: false,
        error: 'Scope must be either "TENANT" or "USER".',
      });
      return;
    }

    // Cross-tenant verification if body tenantId is sent
    if (req.body?.tenantId && req.body.tenantId.trim() !== tenantId.trim()) {
      res.status(403).json({
        success: false,
        error: `Tenant mismatch: Body tenantId '${req.body.tenantId}' does not match authoritative X-Tenant-ID '${tenantId}'.`,
        code: 'TENANT_MISMATCH',
      });
      return;
    }

    await handleIdempotentOperation(req, res, async () => {
      return orderCancellationService.cancelOrders(
        tenantId,
        scope,
        userId,
        reason,
        source || 'CENTRAL_ADMIN'
      );
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to cancel orders.',
      code: err.code,
    });
  }
});

/**
 * POST /api/internal/v1/emergency/square-off-all (alias: /emergency/square-off)
 * Squares off open positions for a tenant or specific user, crediting/debiting realized PnL.
 */
router.post(['/emergency/square-off-all', '/emergency/square-off'], async (req: InternalAuthorizedRequest, res: Response) => {
  try {
    const tenantId = getInternalTenantId(req);
    const { scope, userId, reason, source } = req.body || {};

    if (!scope || (scope !== 'TENANT' && scope !== 'USER')) {
      res.status(400).json({
        success: false,
        error: 'Scope must be either "TENANT" or "USER".',
      });
      return;
    }

    // Cross-tenant verification if body tenantId is sent
    if (req.body?.tenantId && req.body.tenantId.trim() !== tenantId.trim()) {
      res.status(403).json({
        success: false,
        error: `Tenant mismatch: Body tenantId '${req.body.tenantId}' does not match authoritative X-Tenant-ID '${tenantId}'.`,
        code: 'TENANT_MISMATCH',
      });
      return;
    }

    await handleIdempotentOperation(req, res, async () => {
      return positionSquareOffService.squareOffPositions(
        tenantId,
        scope,
        userId,
        reason,
        source || 'CENTRAL_ADMIN'
      );
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to square off positions.',
      code: err.code,
    });
  }
});

/**
 * POST /api/internal/v1/emergency/freeze-user
 * Freezes or unfreezes a user within the authoritative tenant, cascading down the hierarchy.
 */
router.post('/emergency/freeze-user', async (req: InternalAuthorizedRequest, res: Response) => {
  try {
    const tenantId = getInternalTenantId(req);
    const { userId, reason, source } = req.body || {};
    const freezeVal = req.body?.freeze !== undefined ? req.body.freeze : req.body?.frozen;

    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      res.status(400).json({
        success: false,
        error: 'Field "userId" is required.',
      });
      return;
    }

    if (freezeVal === undefined || typeof freezeVal !== 'boolean') {
      res.status(400).json({
        success: false,
        error: 'Field "freeze" (or "frozen") must be a boolean.',
      });
      return;
    }

    // Cross-tenant verification if body tenantId is sent
    if (req.body?.tenantId && req.body.tenantId.trim() !== tenantId.trim()) {
      res.status(403).json({
        success: false,
        error: `Tenant mismatch: Body tenantId '${req.body.tenantId}' does not match authoritative X-Tenant-ID '${tenantId}'.`,
        code: 'TENANT_MISMATCH',
      });
      return;
    }

    await handleIdempotentOperation(req, res, async () => {
      return emergencyControlService.freezeUser(
        tenantId,
        userId,
        freezeVal,
        reason,
        source || 'CENTRAL_ADMIN'
      );
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to update user freeze status.',
      code: err.code,
    });
  }
});

/**
 * POST /api/internal/v1/hierarchy/freeze-broker (alias: /broker/freeze)
 * Freezes or unfreezes a broker or sub-broker and their descendants.
 */
router.post(
  ['/hierarchy/freeze-broker', '/broker/freeze'],
  async (req: InternalAuthorizedRequest, res: Response) => {
    try {
      const tenantId = getInternalTenantId(req);
      const brokerId = req.body?.brokerId || req.body?.userId;
      const { reason, source } = req.body || {};
      const freezeVal = req.body?.freeze !== undefined ? req.body.freeze : req.body?.frozen;

      if (!brokerId || typeof brokerId !== 'string' || !brokerId.trim()) {
        res.status(400).json({
          success: false,
          error: 'Field "brokerId" (or "userId") is required.',
        });
        return;
      }

      if (freezeVal === undefined || typeof freezeVal !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'Field "freeze" (or "frozen") must be a boolean.',
        });
        return;
      }

      // Cross-tenant verification
      if (req.body?.tenantId && req.body.tenantId.trim() !== tenantId.trim()) {
        res.status(403).json({
          success: false,
          error: `Tenant mismatch: Body tenantId '${req.body.tenantId}' does not match authoritative X-Tenant-ID '${tenantId}'.`,
          code: 'TENANT_MISMATCH',
        });
        return;
      }

      await handleIdempotentOperation(req, res, async () => {
        return emergencyControlService.freezeBroker(
          tenantId,
          brokerId,
          freezeVal,
          reason,
          source || 'CENTRAL_ADMIN'
        );
      });
    } catch (err: any) {
      const status = err.statusCode || 500;
      res.status(status).json({
        success: false,
        error: err.message || 'Failed to update broker freeze status.',
        code: err.code,
      });
    }
  }
);

/**
 * POST /api/internal/v1/hierarchy/freeze-master (alias: /master/freeze)
 * Freezes or unfreezes a master or super-admin and their descendants.
 */
router.post(
  ['/hierarchy/freeze-master', '/master/freeze'],
  async (req: InternalAuthorizedRequest, res: Response) => {
    try {
      const tenantId = getInternalTenantId(req);
      const masterId = req.body?.masterId || req.body?.userId;
      const { reason, source } = req.body || {};
      const freezeVal = req.body?.freeze !== undefined ? req.body.freeze : req.body?.frozen;

      if (!masterId || typeof masterId !== 'string' || !masterId.trim()) {
        res.status(400).json({
          success: false,
          error: 'Field "masterId" (or "userId") is required.',
        });
        return;
      }

      if (freezeVal === undefined || typeof freezeVal !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'Field "freeze" (or "frozen") must be a boolean.',
        });
        return;
      }

      // Cross-tenant verification
      if (req.body?.tenantId && req.body.tenantId.trim() !== tenantId.trim()) {
        res.status(403).json({
          success: false,
          error: `Tenant mismatch: Body tenantId '${req.body.tenantId}' does not match authoritative X-Tenant-ID '${tenantId}'.`,
          code: 'TENANT_MISMATCH',
        });
        return;
      }

      await handleIdempotentOperation(req, res, async () => {
        return emergencyControlService.freezeMaster(
          tenantId,
          masterId,
          freezeVal,
          reason,
          source || 'CENTRAL_ADMIN'
        );
      });
    } catch (err: any) {
      const status = err.statusCode || 500;
      res.status(status).json({
        success: false,
        error: err.message || 'Failed to update master freeze status.',
        code: err.code,
      });
    }
  }
);

/**
 * GET /api/internal/v1/risk/summary
 * Returns tenant-scoped risk metrics, total open positions, exposure, and margin.
 */
router.get('/risk/summary', async (req: InternalAuthorizedRequest, res: Response) => {
  try {
    const tenantId = getInternalTenantId(req);

    // Cross-tenant check on query parameter if provided
    const queryTenant = req.query.tenantId as string;
    if (queryTenant && queryTenant.trim() !== tenantId.trim()) {
      res.status(403).json({
        success: false,
        error: `Tenant mismatch: Query tenantId '${queryTenant}' does not match authoritative X-Tenant-ID '${tenantId}'.`,
        code: 'TENANT_MISMATCH',
      });
      return;
    }

    const summary = await emergencyControlService.getRiskSummary(tenantId);
    res.json({
      success: true,
      ...summary,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to retrieve risk summary.',
      code: err.code,
    });
  }
});

/**
 * POST /api/internal/v1/events/trade-executed
 * Central Admin receiver endpoint for trade.executed events.
 * Idempotent: acknowledges duplicate deliveries safely without duplicate processing.
 */
router.post('/events/trade-executed', async (req: InternalAuthorizedRequest, res: Response) => {
  try {
    const tenantId = getInternalTenantId(req);
    const { eventId, eventType, payload } = req.body || {};

    // Cross-tenant verification
    if (req.body?.tenantId && req.body.tenantId.trim() !== tenantId.trim()) {
      res.status(403).json({
        success: false,
        error: `Tenant mismatch: Body tenantId '${req.body.tenantId}' does not match authoritative X-Tenant-ID '${tenantId}'.`,
        code: 'TENANT_MISMATCH',
      });
      return;
    }

    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      res.status(400).json({
        success: false,
        error: 'Field "eventId" is required and must be a non-empty string.',
        code: 'MISSING_EVENT_ID',
      });
      return;
    }

    if (eventType !== 'trade.executed') {
      res.status(400).json({
        success: false,
        error: `Invalid eventType '${eventType}'. Expected 'trade.executed'.`,
        code: 'INVALID_EVENT_TYPE',
      });
      return;
    }

    if (!payload || typeof payload !== 'object') {
      res.status(400).json({
        success: false,
        error: 'Field "payload" must be a valid object.',
        code: 'INVALID_PAYLOAD',
      });
      return;
    }

    const { orderId, userId, symbol, side, quantity, executionPrice } = payload;
    if (!orderId || !userId || !symbol || !side || quantity === undefined || executionPrice === undefined) {
      res.status(400).json({
        success: false,
        error: 'Missing required trade details in payload (orderId, userId, symbol, side, quantity, executionPrice).',
        code: 'INCOMPLETE_PAYLOAD',
      });
      return;
    }

    // Idempotency check: duplicate deliveries acknowledge without re-processing
    if (eventIdempotencyStore.has(eventId)) {
      res.status(200).json({
        success: true,
        processed: false,
        alreadyProcessed: true,
        eventId,
        message: 'Event already processed (idempotent acknowledgment)',
      });
      return;
    }

    // Record as processed
    eventIdempotencyStore.record(eventId, eventType, tenantId);

    auditService.logEmergencyEvent({
      action: 'CENTRAL_ADMIN_EVENT_RECEIVED',
      source: 'CENTRAL_ADMIN_RECEIVER',
      tenantId,
      reason: `Received trade.executed event for order ${orderId}`,
      result: {
        eventId,
        eventType,
        orderId,
        userId,
        symbol,
        side,
        quantity,
        executionPrice,
      },
    });

    res.status(200).json({
      success: true,
      processed: true,
      alreadyProcessed: false,
      eventId,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to process trade.executed event.',
      code: err.code || 'EVENT_PROCESSING_ERROR',
    });
  }
});

/**
 * POST /api/internal/v1/events/margin-breach
 * Central Admin receiver endpoint for risk.margin_breach events.
 * Idempotent: acknowledges duplicate deliveries safely without duplicate processing.
 */
router.post('/events/margin-breach', async (req: InternalAuthorizedRequest, res: Response) => {
  try {
    const tenantId = getInternalTenantId(req);
    const { eventId, eventType, payload } = req.body || {};

    // Cross-tenant verification
    if (req.body?.tenantId && req.body.tenantId.trim() !== tenantId.trim()) {
      res.status(403).json({
        success: false,
        error: `Tenant mismatch: Body tenantId '${req.body.tenantId}' does not match authoritative X-Tenant-ID '${tenantId}'.`,
        code: 'TENANT_MISMATCH',
      });
      return;
    }

    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      res.status(400).json({
        success: false,
        error: 'Field "eventId" is required and must be a non-empty string.',
        code: 'MISSING_EVENT_ID',
      });
      return;
    }

    if (eventType !== 'risk.margin_breach') {
      res.status(400).json({
        success: false,
        error: `Invalid eventType '${eventType}'. Expected 'risk.margin_breach'.`,
        code: 'INVALID_EVENT_TYPE',
      });
      return;
    }

    if (!payload || typeof payload !== 'object') {
      res.status(400).json({
        success: false,
        error: 'Field "payload" must be a valid object.',
        code: 'INVALID_PAYLOAD',
      });
      return;
    }

    const { userId, usedMargin, availableMargin, exposure } = payload;
    if (!userId || usedMargin === undefined || availableMargin === undefined || exposure === undefined) {
      res.status(400).json({
        success: false,
        error: 'Missing required risk details in payload (userId, usedMargin, availableMargin, exposure).',
        code: 'INCOMPLETE_PAYLOAD',
      });
      return;
    }

    // Idempotency check
    if (eventIdempotencyStore.has(eventId)) {
      res.status(200).json({
        success: true,
        processed: false,
        alreadyProcessed: true,
        eventId,
        message: 'Event already processed (idempotent acknowledgment)',
      });
      return;
    }

    // Record as processed
    eventIdempotencyStore.record(eventId, eventType, tenantId);

    auditService.logEmergencyEvent({
      action: 'CENTRAL_ADMIN_EVENT_RECEIVED',
      source: 'CENTRAL_ADMIN_RECEIVER',
      tenantId,
      reason: `Received risk.margin_breach event for user ${userId}`,
      result: {
        eventId,
        eventType,
        userId,
        usedMargin,
        availableMargin,
        exposure,
      },
    });

    res.status(200).json({
      success: true,
      processed: true,
      alreadyProcessed: false,
      eventId,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to process risk.margin_breach event.',
      code: err.code || 'EVENT_PROCESSING_ERROR',
    });
  }
});

/**
 * POST /api/internal/v1/events/execution-failure
 * Central Admin receiver endpoint for execution.failure events.
 */
router.post('/events/execution-failure', async (req: InternalAuthorizedRequest, res: Response) => {
  try {
    const tenantId = getInternalTenantId(req);
    const { eventId, eventType, payload } = req.body || {};

    if (req.body?.tenantId && req.body.tenantId.trim() !== tenantId.trim()) {
      res.status(403).json({
        success: false,
        error: `Tenant mismatch: Body tenantId '${req.body.tenantId}' does not match authoritative X-Tenant-ID '${tenantId}'.`,
        code: 'TENANT_MISMATCH',
      });
      return;
    }

    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      res.status(400).json({
        success: false,
        error: 'Field "eventId" is required.',
        code: 'MISSING_EVENT_ID',
      });
      return;
    }

    if (eventIdempotencyStore.has(eventId)) {
      res.status(200).json({
        success: true,
        processed: false,
        alreadyProcessed: true,
        eventId,
        message: 'Event already processed (idempotent acknowledgment)',
      });
      return;
    }

    eventIdempotencyStore.record(eventId, eventType || 'execution.failure', tenantId);

    auditService.logEmergencyEvent({
      action: 'CENTRAL_ADMIN_EVENT_RECEIVED',
      source: 'CENTRAL_ADMIN_RECEIVER',
      tenantId,
      reason: `Received execution.failure event for order ${payload?.orderId}`,
      result: { eventId, eventType, payload },
    });

    res.status(200).json({
      success: true,
      processed: true,
      alreadyProcessed: false,
      eventId,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to process execution.failure event.',
      code: err.code || 'EVENT_PROCESSING_ERROR',
    });
  }
});

/**
 * POST /api/internal/v1/events/emergency-control
 * Central Admin receiver endpoint for emergency.control_activated events.
 */
router.post('/events/emergency-control', async (req: InternalAuthorizedRequest, res: Response) => {
  try {
    const tenantId = getInternalTenantId(req);
    const { eventId, eventType, payload } = req.body || {};

    if (req.body?.tenantId && req.body.tenantId.trim() !== tenantId.trim()) {
      res.status(403).json({
        success: false,
        error: `Tenant mismatch: Body tenantId '${req.body.tenantId}' does not match authoritative X-Tenant-ID '${tenantId}'.`,
        code: 'TENANT_MISMATCH',
      });
      return;
    }

    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      res.status(400).json({
        success: false,
        error: 'Field "eventId" is required.',
        code: 'MISSING_EVENT_ID',
      });
      return;
    }

    if (eventIdempotencyStore.has(eventId)) {
      res.status(200).json({
        success: true,
        processed: false,
        alreadyProcessed: true,
        eventId,
        message: 'Event already processed (idempotent acknowledgment)',
      });
      return;
    }

    eventIdempotencyStore.record(eventId, eventType || 'emergency.control_activated', tenantId);

    auditService.logEmergencyEvent({
      action: 'CENTRAL_ADMIN_EVENT_RECEIVED',
      source: 'CENTRAL_ADMIN_RECEIVER',
      tenantId,
      reason: `Received emergency control event: ${payload?.action}`,
      result: { eventId, eventType, payload },
    });

    res.status(200).json({
      success: true,
      processed: true,
      alreadyProcessed: false,
      eventId,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to process emergency.control_activated event.',
      code: err.code || 'EVENT_PROCESSING_ERROR',
    });
  }
});

/**
 * POST /api/internal/v1/events/reconciliation-mismatch
 * Central Admin receiver endpoint for reconciliation.mismatch events.
 */
router.post('/events/reconciliation-mismatch', async (req: InternalAuthorizedRequest, res: Response) => {
  try {
    const tenantId = getInternalTenantId(req);
    const { eventId, eventType, payload } = req.body || {};

    if (req.body?.tenantId && req.body.tenantId.trim() !== tenantId.trim()) {
      res.status(403).json({
        success: false,
        error: `Tenant mismatch: Body tenantId '${req.body.tenantId}' does not match authoritative X-Tenant-ID '${tenantId}'.`,
        code: 'TENANT_MISMATCH',
      });
      return;
    }

    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      res.status(400).json({
        success: false,
        error: 'Field "eventId" is required.',
        code: 'MISSING_EVENT_ID',
      });
      return;
    }

    if (eventIdempotencyStore.has(eventId)) {
      res.status(200).json({
        success: true,
        processed: false,
        alreadyProcessed: true,
        eventId,
        message: 'Event already processed (idempotent acknowledgment)',
      });
      return;
    }

    eventIdempotencyStore.record(eventId, eventType || 'reconciliation.mismatch', tenantId);

    auditService.logEmergencyEvent({
      action: 'CENTRAL_ADMIN_EVENT_RECEIVED',
      source: 'CENTRAL_ADMIN_RECEIVER',
      tenantId,
      reason: `Received reconciliation mismatch: ${payload?.mismatchType}`,
      result: { eventId, eventType, payload },
    });

    res.status(200).json({
      success: true,
      processed: true,
      alreadyProcessed: false,
      eventId,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to process reconciliation.mismatch event.',
      code: err.code || 'EVENT_PROCESSING_ERROR',
    });
  }
});

/**
 * POST /api/internal/v1/events/:eventType
 * Generic fallback receiver for any internal event published by Central Admin or Platform.
 */
router.post('/events/:eventType', async (req: InternalAuthorizedRequest, res: Response) => {
  try {
    const tenantId = getInternalTenantId(req);
    const eventType = req.params.eventType;
    const { eventId, payload } = req.body || {};

    if (req.body?.tenantId && req.body.tenantId.trim() !== tenantId.trim()) {
      res.status(403).json({
        success: false,
        error: `Tenant mismatch: Body tenantId '${req.body.tenantId}' does not match authoritative X-Tenant-ID '${tenantId}'.`,
        code: 'TENANT_MISMATCH',
      });
      return;
    }

    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      res.status(400).json({
        success: false,
        error: 'Field "eventId" is required.',
        code: 'MISSING_EVENT_ID',
      });
      return;
    }

    if (eventIdempotencyStore.has(eventId)) {
      res.status(200).json({
        success: true,
        processed: false,
        alreadyProcessed: true,
        eventId,
        message: 'Event already processed (idempotent acknowledgment)',
      });
      return;
    }

    eventIdempotencyStore.record(eventId, eventType, tenantId);

    auditService.logEmergencyEvent({
      action: 'CENTRAL_ADMIN_GENERIC_EVENT_RECEIVED',
      source: 'CENTRAL_ADMIN_RECEIVER',
      tenantId,
      reason: `Received generic event ${eventType}`,
      result: { eventId, eventType, payload },
    });

    res.status(200).json({
      success: true,
      processed: true,
      alreadyProcessed: false,
      eventId,
      eventType,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to process internal event.',
      code: err.code || 'EVENT_PROCESSING_ERROR',
    });
  }
});

/**
 * GET /api/internal/v1/events/health
 * Internal health & observability endpoint for the Event Dispatcher and Queue.
 */
router.get('/events/health', (req: InternalAuthorizedRequest, res: Response) => {
  try {
    const tenantId = getInternalTenantId(req);

    const queryTenant = req.query.tenantId as string;
    if (queryTenant && queryTenant.trim() !== tenantId.trim()) {
      res.status(403).json({
        success: false,
        error: `Tenant mismatch: Query tenantId '${queryTenant}' does not match authoritative X-Tenant-ID '${tenantId}'.`,
        code: 'TENANT_MISMATCH',
      });
      return;
    }

    const health = internalEventDispatcher.getHealth();
    const cacheHealth = tenantConfigCache.getHealth();

    res.json({
      success: true,
      service: 'trading-platform-event-dispatcher',
      tenantId,
      queueSize: health.queueSize,
      pendingEvents: health.pendingEvents,
      failedEvents: health.failedEvents,
      deadLetterEvents: health.deadLetterEvents,
      circuitState: health.circuitState,
      lastSuccessfulDelivery: health.lastSuccessfulDelivery,
      cacheStatus: cacheHealth.status,
      timestamp: health.timestamp,
    });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.message || 'Failed to retrieve event dispatcher health.',
      code: err.code,
    });
  }
});

export default router;
