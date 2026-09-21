import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authMiddleware.ts';
import { TenantContextData } from '../../types/tenant.ts';
import { centralApiService } from '../services/centralApiService.ts';
import { db } from '../db/database.ts';
import { emergencyStateCache } from '../cache/EmergencyStateCache.ts';
import { tenantConfigCache } from '../cache/TenantConfigCache.ts';

export interface TenantRequest extends AuthenticatedRequest {
  tenant?: TenantContextData;
}

/**
 * Resolves tenant from domain/hostname with DEV_TENANT_ID fallback.
 * Never trusts tenant_id supplied in standard client request bodies.
 */
export async function resolveTenantMiddleware(
  req: TenantRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawHost =
      (req.headers['x-forwarded-host'] as string) ||
      req.hostname ||
      (req.headers.host as string) ||
      'localhost';

    const cleanHost = rawHost.split(':')[0].toLowerCase();

    // Production Security & Internal Route Isolation:
    // Development tenant overrides (cookie or header) are strictly disabled in production (NODE_ENV=production)
    // and are NEVER applied to internal server-to-server routes (/api/internal/*).
    const isProduction = process.env.NODE_ENV === 'production';
    const isInternalRoute = req.path ? req.path.startsWith('/api/internal/') : false;

    const devTenantOverride =
      !isProduction && !isInternalRoute
        ? req.cookies?.vtx_dev_tenant || (req.headers['x-dev-tenant-id'] as string) || undefined
        : undefined;

    const resolutionData = await centralApiService.resolveTenant(cleanHost, devTenantOverride);

    req.tenant = resolutionData;
    res.setHeader('X-Tenant-ID', resolutionData.tenant.id);
    res.setHeader('X-Tenant-Brand', resolutionData.branding.brandName);

    next();
  } catch (err) {
    console.error('[TENANT] Error resolving tenant:', err);
    // Graceful fallback to default tenant
    try {
      req.tenant = await centralApiService.resolveTenant('localhost', 'vertex-default');
      next();
    } catch (fallbackErr) {
      res.status(500).json({
        success: false,
        message: 'Tenant resolution error.',
      });
    }
  }
}

/**
 * Security Control: Enforces that trading is globally and tenant-level enabled.
 * Rejects order execution server-side.
 */
export function requireTradingEnabled(
  req: TenantRequest,
  res: Response,
  next: NextFunction
): void {
  const tenant = req.tenant;
  if (!tenant) {
    next();
    return;
  }

  const tenantId = tenant.tenant.id;
  const emergencyState = emergencyStateCache.get(tenantId);
  const cachedConfig = tenantConfigCache.get(tenantId);

  // 1. Tenant Level Freeze
  if (
    emergencyState.tenantFrozen ||
    tenant.status.tenant_frozen ||
    tenant.tenant.status === 'frozen' ||
    cachedConfig?.tenantStatus === 'frozen'
  ) {
    res.status(403).json({
      success: false,
      code: 'TENANT_FROZEN',
      message:
        emergencyState.reason ||
        tenant.status.reason ||
        'All platform trading operations are currently frozen by administration.',
    });
    return;
  }

  // 2. Global / Tenant Trading Killswitch
  if (
    emergencyState.tradingHalted ||
    tenant.status.trading_killswitch_active ||
    cachedConfig?.tradingEnabled === false ||
    !tenant.config.trading_enabled
  ) {
    res.status(403).json({
      success: false,
      code: 'TRADING_DISABLED',
      message:
        emergencyState.reason ||
        tenant.status.reason ||
        'Trading is currently suspended for this platform. New orders cannot be placed.',
    });
    return;
  }

  // 3. Maintenance Mode
  if (
    emergencyState.maintenanceActive ||
    cachedConfig?.maintenanceMode === true ||
    tenant.config.maintenance_mode ||
    tenant.status.maintenance_active
  ) {
    res.status(503).json({
      success: false,
      code: 'MAINTENANCE_MODE',
      message:
        tenant.config.maintenance_message ||
        'Platform maintenance in progress. Orders are temporarily suspended.',
    });
    return;
  }

  next();
}

/**
 * Security Control: Enforces registration policy.
 * Rejects new user registration server-side.
 */
export function requireRegistrationEnabled(
  req: TenantRequest,
  res: Response,
  next: NextFunction
): void {
  const tenant = req.tenant;
  if (!tenant) {
    next();
    return;
  }

  const tenantId = tenant.tenant.id;
  const emergencyState = emergencyStateCache.get(tenantId);
  const cachedConfig = tenantConfigCache.get(tenantId);

  if (
    emergencyState.registrationFrozen ||
    cachedConfig?.registrationEnabled === false ||
    !tenant.config.registration_enabled ||
    tenant.status.registration_frozen
  ) {
    res.status(403).json({
      success: false,
      code: 'REGISTRATION_DISABLED',
      message: 'New user registration is currently disabled for this platform.',
    });
    return;
  }

  next();
}

/**
 * Security Control: Enforces tenant API access.
 * Rejects external API calls server-side.
 */
export function requireTenantApiEnabled(
  req: TenantRequest,
  res: Response,
  next: NextFunction
): void {
  const tenant = req.tenant;
  if (!tenant) {
    next();
    return;
  }

  const tenantId = tenant.tenant.id;
  const emergencyState = emergencyStateCache.get(tenantId);
  const cachedConfig = tenantConfigCache.get(tenantId);

  if (
    emergencyState.apiFrozen ||
    cachedConfig?.apiEnabled === false ||
    !tenant.config.api_enabled ||
    tenant.status.api_frozen
  ) {
    res.status(403).json({
      success: false,
      code: 'API_DISABLED',
      message: 'API access is currently disabled for this tenant.',
    });
    return;
  }

  next();
}

/**
 * Security Control: Enforces individual user freeze, Master freeze, and Broker freeze.
 * Revalidates against database state for every sensitive operation (orders, withdrawals, transfers).
 */
export function requireActiveTrader(
  req: TenantRequest,
  res: Response,
  next: NextFunction
): void {
  // If user is authenticated, inspect latest database record
  if (req.user?.id) {
    const userRecord = db.findUserById(req.user.id);
    if (!userRecord) {
      res.status(401).json({
        success: false,
        message: 'User account not found.',
      });
      return;
    }

    const freezeCheck = db.isUserOrHierarchyFrozen(userRecord);
    if (freezeCheck.frozen) {
      res.status(403).json({
        success: false,
        code: 'USER_FROZEN',
        message:
          freezeCheck.reason ||
          'Your account is currently frozen. Please contact customer support.',
      });
      return;
    }
  }

  next();
}
