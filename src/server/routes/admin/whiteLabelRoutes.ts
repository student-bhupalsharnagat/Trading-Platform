import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/authMiddleware.ts';
import { requireAdmin } from '../../middleware/requireRole.ts';
import { tenantRepository } from '../../repositories/JsonTenantRepository.ts';
import { tenantConfigCache } from '../../cache/TenantConfigCache.ts';
import { tradingWebSocketServer } from '../../websocket/WebSocketServer.ts';
import { centralApiService } from '../../services/centralApiService.ts';

const router = Router();

/**
 * GET /api/admin/white-label
 * Retrieves the current white-label branding and platform tenant configuration
 */
router.get('/', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || 'vertex-default';
    const tenant = (await tenantRepository.findById(tenantId)) || (await tenantRepository.findById('vertex-default'));
    const branding = (await tenantRepository.getBranding(tenantId)) || (await tenantRepository.getBranding('vertex-default'));

    if (!branding) {
      res.status(404).json({ success: false, message: 'Branding not found for tenant' });
      return;
    }

    res.json({
      success: true,
      data: {
        tenantId: tenant?.id || tenantId,
        tenantName: tenant?.name || branding.brandName,
        tenantSlug: tenant?.slug || 'vertex',
        branding,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch white-label settings' });
  }
});

/**
 * POST /api/admin/white-label & PATCH /api/admin/white-label
 * Updates the platform branding (name, logo, colors, support info, etc.)
 */
const handleUpdateBranding = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || 'vertex-default';
    const existing = (await tenantRepository.getBranding(tenantId)) || (await tenantRepository.getBranding('vertex-default'));

    if (!existing) {
      res.status(404).json({ success: false, message: 'Branding not found for tenant' });
      return;
    }

    const {
      brandName,
      shortName,
      tagline,
      logoUrl,
      faviconUrl,
      primaryColor,
      secondaryColor,
      accentColor,
      backgroundColor,
      surfaceColor,
      supportEmail,
      supportPhone,
      companyName,
      headerBranding,
      loginBranding,
      sidebarBranding,
      footerLinks,
    } = req.body;

    const updates: Record<string, any> = {};
    if (brandName !== undefined) updates.brandName = String(brandName).trim();
    if (shortName !== undefined) updates.shortName = String(shortName).trim().toUpperCase();
    if (tagline !== undefined) updates.tagline = String(tagline).trim();
    if (logoUrl !== undefined) updates.logoUrl = String(logoUrl).trim();
    if (faviconUrl !== undefined) updates.faviconUrl = String(faviconUrl).trim();
    if (primaryColor !== undefined) updates.primaryColor = String(primaryColor).trim();
    if (secondaryColor !== undefined) updates.secondaryColor = String(secondaryColor).trim();
    if (accentColor !== undefined) updates.accentColor = String(accentColor).trim();
    if (backgroundColor !== undefined) updates.backgroundColor = String(backgroundColor).trim();
    if (surfaceColor !== undefined) updates.surfaceColor = String(surfaceColor).trim();
    if (supportEmail !== undefined) updates.supportEmail = String(supportEmail).trim();
    if (supportPhone !== undefined) updates.supportPhone = String(supportPhone).trim();

    if (headerBranding !== undefined) {
      updates.headerBranding = {
        ...existing.headerBranding,
        ...headerBranding,
      };
    }

    if (loginBranding !== undefined) {
      updates.loginBranding = {
        ...existing.loginBranding,
        ...loginBranding,
      };
    }

    if (sidebarBranding !== undefined) {
      updates.sidebarBranding = {
        ...existing.sidebarBranding,
        ...sidebarBranding,
      };
    }

    if (footerLinks !== undefined) {
      updates.footerLinks = {
        ...existing.footerLinks,
        ...footerLinks,
      };
    }

    // Apply updates to the tenant repository
    const updated = await tenantRepository.updateBranding(tenantId, updates);
    if (tenantId !== 'vertex-default') {
      await tenantRepository.updateBranding('vertex-default', updates);
    }

    // Invalidate local and Redis cache
    try {
      tenantConfigCache.invalidate(tenantId);
      tenantConfigCache.invalidate('vertex-default');
      centralApiService.invalidateTenantCache(tenantId);
      if (tenantId !== 'vertex-default') {
        centralApiService.invalidateTenantCache('vertex-default');
      }
    } catch {
      // Non-fatal
    }

    // Broadcast live branding update event over WebSocket
    try {
      tradingWebSocketServer.broadcastToTenant(tenantId, 'tenant.branding_updated', updated);
      if (tenantId !== 'vertex-default') {
        tradingWebSocketServer.broadcastToTenant('vertex-default', 'tenant.branding_updated', updated);
      }
    } catch {
      // Non-fatal
    }

    res.json({
      success: true,
      message: 'Platform branding updated successfully',
      data: updated,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update platform branding' });
  }
};

router.post('/', requireAuth, requireAdmin, handleUpdateBranding);
router.patch('/', requireAuth, requireAdmin, handleUpdateBranding);

export default router;
