import { Router, Response } from 'express';
import { centralApiService } from '../services/centralApiService.ts';
import { TenantRequest } from '../middleware/tenantMiddleware.ts';
import { db } from '../db/database.ts';

const router = Router();

/**
 * GET /api/tenant/resolve
 * Resolves tenant based on domain or host
 */
router.get('/resolve', async (req: TenantRequest, res: Response) => {
  try {
    const domain =
      (req.query.domain as string) ||
      (req.headers['x-forwarded-host'] as string) ||
      req.hostname ||
      'localhost';

    const requestedTenantId = (req.query.tenant_id as string) || undefined;
    const data = await centralApiService.resolveTenant(domain, requestedTenantId);

    res.json({
      success: true,
      data,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Error resolving tenant',
    });
  }
});

/**
 * GET /api/tenant/branding
 * Returns tenant branding configuration
 */
router.get('/branding', async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = (req.query.tenant_id as string) || req.tenant?.tenant.id || 'vertex-default';
    const branding = await centralApiService.getTenantBranding(tenantId);

    if (!branding) {
      res.status(404).json({ success: false, message: 'Branding not found for tenant' });
      return;
    }

    res.json({
      success: true,
      data: branding,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Error fetching branding',
    });
  }
});

/**
 * GET /api/tenant/config
 * Returns full tenant configuration and status
 */
router.get('/config', async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = (req.query.tenant_id as string) || req.tenant?.tenant.id || 'vertex-default';
    const configData = await centralApiService.getTenantConfig(tenantId);

    if (!configData) {
      res.status(404).json({ success: false, message: 'Config not found for tenant' });
      return;
    }

    res.json({
      success: true,
      data: configData,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Error fetching tenant config',
    });
  }
});

/**
 * GET /api/tenant/platform-config
 * Returns tenant platform feature configuration
 */
router.get('/platform-config', async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = (req.query.tenant_id as string) || req.tenant?.tenant.id || 'vertex-default';
    const platformConfig = await centralApiService.getTenantPlatformConfig(tenantId);

    if (!platformConfig) {
      res.status(404).json({ success: false, message: 'Platform config not found for tenant' });
      return;
    }

    res.json({
      success: true,
      data: platformConfig,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Error fetching platform config',
    });
  }
});

/**
 * GET /api/tenant/status
 * Returns tenant security and emergency status
 */
router.get('/status', async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = (req.query.tenant_id as string) || req.tenant?.tenant.id || 'vertex-default';
    const status = await centralApiService.getTenantStatus(tenantId);

    if (!status) {
      res.status(404).json({ success: false, message: 'Status not found for tenant' });
      return;
    }

    res.json({
      success: true,
      data: status,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Error fetching tenant status',
    });
  }
});

/**
 * GET /api/tenant/current
 * Composite endpoint returning the complete context for the current request
 */
router.get('/current', async (req: TenantRequest, res: Response) => {
  try {
    if (req.tenant) {
      // Re-fetch latest live status and config to guarantee fresh data
      const liveStatus = (await centralApiService.getTenantStatus(req.tenant.tenant.id)) || req.tenant.status;
      const liveConfig = (await centralApiService.getTenantPlatformConfig(req.tenant.tenant.id)) || req.tenant.config;

      res.json({
        success: true,
        data: {
          ...req.tenant,
          status: liveStatus,
          config: liveConfig,
        },
      });
      return;
    }

    // If middleware didn't attach for some reason, resolve directly
    const domain = (req.headers['x-forwarded-host'] as string) || req.hostname || 'localhost';
    const data = await centralApiService.resolveTenant(domain);
    res.json({
      success: true,
      data,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Error resolving current tenant',
    });
  }
});

/**
 * GET /api/tenant/all
 * Lists all registered tenants (used by developer white-label switcher)
 */
router.get('/all', async (req: TenantRequest, res: Response) => {
  try {
    const tenants = await centralApiService.getAllTenants();
    const enriched = await Promise.all(
      tenants.map(async (t) => {
        const branding = await centralApiService.getTenantBranding(t.id);
        const config = await centralApiService.getTenantPlatformConfig(t.id);
        const status = await centralApiService.getTenantStatus(t.id);
        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          customDomain: t.customDomain,
          status: t.status,
          brandName: branding?.brandName || t.name,
          shortName: branding?.shortName || t.slug.toUpperCase(),
          primaryColor: branding?.primaryColor || '#F59E0B',
          tradingEnabled: Boolean(config?.trading_enabled && !status?.trading_killswitch_active && !status?.tenant_frozen),
          registrationEnabled: Boolean(config?.registration_enabled && !status?.registration_frozen && !status?.tenant_frozen),
          optionsTradingEnabled: Boolean(config?.options_trading_enabled),
        };
      })
    );

    res.json({
      success: true,
      data: enriched,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Error fetching tenants list',
    });
  }
});

/**
 * POST /api/tenant/dev/switch
 * Allows switching the tenant in development / preview mode
 */
router.post('/dev/switch', async (req: TenantRequest, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({
      success: false,
      code: 'DEV_FEATURE_DISABLED',
      message: 'Development tenant switching is strictly disabled in production mode.',
    });
    return;
  }

  try {
    const { tenantId } = req.body;
    if (!tenantId) {
      res.status(400).json({ success: false, message: 'tenantId is required' });
      return;
    }

    const tenant = await centralApiService.resolveTenant('localhost', tenantId);

    // Set cookie for subsequent requests
    res.cookie('vtx_dev_tenant', tenantId, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      message: `Switched active white-label tenant to ${tenant.branding.brandName}`,
      data: tenant,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to switch tenant',
    });
  }
});

/**
 * POST /api/tenant/dev/toggle-feature
 * Live testing endpoint to toggle backend emergency controls:
 * - trading_enabled
 * - registration_enabled
 * - trading_killswitch_active
 * - tenant_frozen
 * - user_frozen
 */
router.post('/dev/toggle-feature', async (req: TenantRequest, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({
      success: false,
      code: 'DEV_FEATURE_DISABLED',
      message: 'Development feature toggling is strictly disabled in production mode.',
    });
    return;
  }

  try {
    const tenantId = req.tenant?.tenant.id || 'vertex-default';
    const { feature, value, userId } = req.body;

    if (feature === 'trading_enabled' || feature === 'registration_enabled' || feature === 'api_enabled' || feature === 'maintenance_mode') {
      const updated = await centralApiService.updatePlatformConfig(tenantId, {
        [feature]: Boolean(value),
      });
      res.json({
        success: true,
        message: `Updated ${feature} to ${value} for tenant ${tenantId}`,
        data: updated,
      });
      return;
    }

    if (feature === 'trading_killswitch_active' || feature === 'tenant_frozen' || feature === 'registration_frozen' || feature === 'api_frozen') {
      const updated = await centralApiService.updateStatus(tenantId, {
        [feature]: Boolean(value),
        reason: value ? `Emergency control enforced: ${feature}` : undefined,
      });
      res.json({
        success: true,
        message: `Updated emergency status ${feature} to ${value} for tenant ${tenantId}`,
        data: updated,
      });
      return;
    }

    if (feature === 'user_freeze' && userId) {
      const updatedUser = db.setUserFrozen(userId, Boolean(value));
      res.json({
        success: true,
        message: `User ${userId} freeze state set to ${value}`,
        data: updatedUser,
      });
      return;
    }

    res.status(400).json({
      success: false,
      message: `Unknown feature toggle: ${feature}`,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Error updating feature toggle',
    });
  }
});

export default router;
