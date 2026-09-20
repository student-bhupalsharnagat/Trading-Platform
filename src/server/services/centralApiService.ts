import {
  Tenant,
  TenantBranding,
  TenantPlatformConfig,
  TenantSecurityStatus,
} from '../../types/tenant.ts';
import { tenantRepository } from '../repositories/JsonTenantRepository.ts';

export interface TenantResolutionData {
  tenant: Tenant;
  branding: TenantBranding;
  config: TenantPlatformConfig;
  platformConfig: TenantPlatformConfig;
  status: TenantSecurityStatus;
  matchedBy: 'domain' | 'dev_fallback' | 'subdomain' | 'header' | 'override';
  domain: string;
}

/**
 * Interface representing the Central Admin Panel / Central API client
 */
export interface ICentralApiService {
  resolveTenant(domain: string, requestedTenantId?: string): Promise<TenantResolutionData>;
  getTenantBranding(tenantId: string): Promise<TenantBranding | null>;
  getTenantConfig(tenantId: string): Promise<{ tenant: Tenant; config: TenantPlatformConfig; status: TenantSecurityStatus } | null>;
  getTenantPlatformConfig(tenantId: string): Promise<TenantPlatformConfig | null>;
  getTenantStatus(tenantId: string): Promise<TenantSecurityStatus | null>;
  getAllTenants(): Promise<Tenant[]>;
  updatePlatformConfig(tenantId: string, updates: Partial<TenantPlatformConfig>): Promise<TenantPlatformConfig | null>;
  updateStatus(tenantId: string, updates: Partial<TenantSecurityStatus>): Promise<TenantSecurityStatus | null>;
}

/**
 * Development Mock Central API Provider (used when CENTRAL_API_URL is unset or offline)
 */
export class MockCentralApiProvider implements ICentralApiService {
  public async resolveTenant(domain: string, requestedTenantId?: string): Promise<TenantResolutionData> {
    const devFallbackId = process.env.DEV_TENANT_ID || 'vertex-default';
    const cleanDomain = (domain || '').toLowerCase().split(':')[0];

    let tenant: Tenant | null = null;
    let matchedBy: 'domain' | 'dev_fallback' | 'subdomain' | 'header' | 'override' = 'domain';

    // 1. If explicit dev override requested (safe testing in dev/preview)
    if (requestedTenantId) {
      tenant = await tenantRepository.findById(requestedTenantId);
      if (tenant) {
        matchedBy = 'override';
      }
    }

    // 2. Resolve by domain/hostname
    if (!tenant && cleanDomain) {
      tenant = await tenantRepository.findByDomain(cleanDomain);
      if (tenant) {
        matchedBy = 'domain';
      }
    }

    // 3. Fallback to DEV_TENANT_ID
    if (!tenant) {
      tenant = await tenantRepository.findById(devFallbackId);
      matchedBy = 'dev_fallback';
    }

    // 4. Absolute fallback to first tenant
    if (!tenant) {
      const all = await tenantRepository.findAll();
      tenant = all[0];
      matchedBy = 'dev_fallback';
    }

    const branding = (await tenantRepository.getBranding(tenant.id))!;
    const config = (await tenantRepository.getPlatformConfig(tenant.id))!;
    const status = (await tenantRepository.getStatus(tenant.id))!;

    return {
      tenant,
      branding,
      config,
      platformConfig: config,
      status,
      matchedBy,
      domain: cleanDomain,
    };
  }

  public async getTenantBranding(tenantId: string): Promise<TenantBranding | null> {
    return tenantRepository.getBranding(tenantId);
  }

  public async getTenantConfig(
    tenantId: string
  ): Promise<{ tenant: Tenant; config: TenantPlatformConfig; status: TenantSecurityStatus } | null> {
    const tenant = await tenantRepository.findById(tenantId);
    if (!tenant) return null;
    const config = (await tenantRepository.getPlatformConfig(tenantId))!;
    const status = (await tenantRepository.getStatus(tenantId))!;
    return { tenant, config, status };
  }

  public async getTenantPlatformConfig(tenantId: string): Promise<TenantPlatformConfig | null> {
    return tenantRepository.getPlatformConfig(tenantId);
  }

  public async getTenantStatus(tenantId: string): Promise<TenantSecurityStatus | null> {
    return tenantRepository.getStatus(tenantId);
  }

  public async getAllTenants(): Promise<Tenant[]> {
    return tenantRepository.findAll();
  }

  public async updatePlatformConfig(
    tenantId: string,
    updates: Partial<TenantPlatformConfig>
  ): Promise<TenantPlatformConfig | null> {
    return tenantRepository.updatePlatformConfig(tenantId, updates);
  }

  public async updateStatus(
    tenantId: string,
    updates: Partial<TenantSecurityStatus>
  ): Promise<TenantSecurityStatus | null> {
    return tenantRepository.updateStatus(tenantId, updates);
  }
}

/**
 * Production Central API Service implementation that proxies to CENTRAL_API_URL
 * with automatic fallback to Mock provider if CENTRAL_API_URL is unavailable.
 */
export class CentralApiService implements ICentralApiService {
  private mockProvider = new MockCentralApiProvider();

  private get baseUrl(): string | null {
    const url = process.env.CENTRAL_API_URL;
    return url && url.trim().length > 0 ? url.trim().replace(/\/$/, '') : null;
  }

  public async resolveTenant(domain: string, requestedTenantId?: string): Promise<TenantResolutionData> {
    const baseUrl = this.baseUrl;
    if (!baseUrl) {
      return this.mockProvider.resolveTenant(domain, requestedTenantId);
    }

    try {
      const query = new URLSearchParams({ domain });
      if (requestedTenantId) query.set('tenant_id', requestedTenantId);

      const res = await fetch(`${baseUrl}/api/tenant/resolve?${query.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000), // 3s timeout
      });

      if (!res.ok) {
        throw new Error(`Central API responded with ${res.status}`);
      }

      const json = await res.json();
      if (json.success && json.data) {
        return json.data;
      }
      return this.mockProvider.resolveTenant(domain, requestedTenantId);
    } catch (err) {
      console.warn('[CENTRAL_API] Warning: Failed to reach CENTRAL_API_URL, falling back to local provider:', (err as any).message);
      return this.mockProvider.resolveTenant(domain, requestedTenantId);
    }
  }

  public async getTenantBranding(tenantId: string): Promise<TenantBranding | null> {
    const baseUrl = this.baseUrl;
    if (!baseUrl) {
      return this.mockProvider.getTenantBranding(tenantId);
    }

    try {
      const res = await fetch(`${baseUrl}/api/tenant/branding?tenant_id=${encodeURIComponent(tenantId)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const json = await res.json();
        return json.data || json;
      }
    } catch {
      // fallback
    }
    return this.mockProvider.getTenantBranding(tenantId);
  }

  public async getTenantConfig(
    tenantId: string
  ): Promise<{ tenant: Tenant; config: TenantPlatformConfig; status: TenantSecurityStatus } | null> {
    const baseUrl = this.baseUrl;
    if (!baseUrl) {
      return this.mockProvider.getTenantConfig(tenantId);
    }

    try {
      const res = await fetch(`${baseUrl}/api/tenant/config?tenant_id=${encodeURIComponent(tenantId)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const json = await res.json();
        return json.data || json;
      }
    } catch {
      // fallback
    }
    return this.mockProvider.getTenantConfig(tenantId);
  }

  public async getTenantPlatformConfig(tenantId: string): Promise<TenantPlatformConfig | null> {
    const baseUrl = this.baseUrl;
    if (!baseUrl) {
      return this.mockProvider.getTenantPlatformConfig(tenantId);
    }

    try {
      const res = await fetch(`${baseUrl}/api/tenant/platform-config?tenant_id=${encodeURIComponent(tenantId)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const json = await res.json();
        return json.data || json;
      }
    } catch {
      // fallback
    }
    return this.mockProvider.getTenantPlatformConfig(tenantId);
  }

  public async getTenantStatus(tenantId: string): Promise<TenantSecurityStatus | null> {
    const baseUrl = this.baseUrl;
    if (!baseUrl) {
      return this.mockProvider.getTenantStatus(tenantId);
    }

    try {
      const res = await fetch(`${baseUrl}/api/tenant/status?tenant_id=${encodeURIComponent(tenantId)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const json = await res.json();
        return json.data || json;
      }
    } catch {
      // fallback
    }
    return this.mockProvider.getTenantStatus(tenantId);
  }

  public async getAllTenants(): Promise<Tenant[]> {
    return this.mockProvider.getAllTenants();
  }

  public async updatePlatformConfig(
    tenantId: string,
    updates: Partial<TenantPlatformConfig>
  ): Promise<TenantPlatformConfig | null> {
    return this.mockProvider.updatePlatformConfig(tenantId, updates);
  }

  public async updateStatus(
    tenantId: string,
    updates: Partial<TenantSecurityStatus>
  ): Promise<TenantSecurityStatus | null> {
    return this.mockProvider.updateStatus(tenantId, updates);
  }
}

export const centralApiService = new CentralApiService();
