import {
  Tenant,
  TenantBranding,
  TenantPlatformConfig,
  TenantSecurityStatus,
} from '../../types/tenant.ts';
import { tenantRepository } from '../repositories/JsonTenantRepository.ts';
import { postgresTenantConfigRepository } from '../repositories/trading/PostgresTenantConfigRepository.ts';
import { resolveInternalRenderUrl } from '../config/internalConfig.ts';

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
 * Development & Local PostgreSQL Central API Provider
 */
export class MockCentralApiProvider implements ICentralApiService {
  public async resolveTenant(domain: string, requestedTenantId?: string): Promise<TenantResolutionData> {
    const devFallbackId = process.env.DEV_TENANT_ID || 'vertex-default';
    const cleanDomain = (domain || '').toLowerCase().split(':')[0];

    let tenant: Tenant | null = null;
    let matchedBy: 'domain' | 'dev_fallback' | 'subdomain' | 'header' | 'override' = 'domain';

    // 1. If explicit dev/requested override
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

    // Incorporate PostgreSQL authoritative overrides if available
    try {
      const pgConf = await postgresTenantConfigRepository.getConfig(tenant.id);
      if (pgConf) {
        if (pgConf.trading_enabled !== undefined) config.trading_enabled = pgConf.trading_enabled;
        if (pgConf.registration_enabled !== undefined) config.registration_enabled = pgConf.registration_enabled;
        if (pgConf.api_enabled !== undefined) config.api_enabled = pgConf.api_enabled;
        if (pgConf.support_enabled !== undefined) config.support_enabled = pgConf.support_enabled;
        if (pgConf.notifications_enabled !== undefined) config.notifications_enabled = pgConf.notifications_enabled;
        if (pgConf.max_leverage !== undefined) config.max_leverage = Number(pgConf.max_leverage);
      }
      const pgStat = await postgresTenantConfigRepository.getEmergencyStatus(tenant.id);
      if (pgStat) {
        if (pgStat.tenant_frozen !== undefined) status.tenant_frozen = pgStat.tenant_frozen;
        if (pgStat.trading_halted !== undefined) status.trading_killswitch_active = pgStat.trading_halted;
        if (pgStat.registration_frozen !== undefined) status.registration_frozen = pgStat.registration_frozen;
        if (pgStat.api_frozen !== undefined) status.api_frozen = pgStat.api_frozen;
        if (pgStat.reason) status.reason = pgStat.reason;
      }
    } catch {
      // Non-fatal if database is initializing
    }

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
    const config = (await tenantRepository.getPlatformConfig(tenant.id)) || (await tenantRepository.getPlatformConfig(tenantId))!;
    const status = (await tenantRepository.getStatus(tenant.id)) || (await tenantRepository.getStatus(tenantId))!;

    try {
      const pgConf = await postgresTenantConfigRepository.getConfig(tenant.id);
      if (pgConf) {
        if (pgConf.trading_enabled !== undefined) config.trading_enabled = pgConf.trading_enabled;
        if (pgConf.registration_enabled !== undefined) config.registration_enabled = pgConf.registration_enabled;
        if (pgConf.api_enabled !== undefined) config.api_enabled = pgConf.api_enabled;
        if (pgConf.support_enabled !== undefined) config.support_enabled = pgConf.support_enabled;
        if (pgConf.notifications_enabled !== undefined) config.notifications_enabled = pgConf.notifications_enabled;
        if (pgConf.max_leverage !== undefined) config.max_leverage = Number(pgConf.max_leverage);
      }
      const pgStat = await postgresTenantConfigRepository.getEmergencyStatus(tenant.id);
      if (pgStat) {
        if (pgStat.tenant_frozen !== undefined) status.tenant_frozen = pgStat.tenant_frozen;
        if (pgStat.trading_halted !== undefined) status.trading_killswitch_active = pgStat.trading_halted;
        if (pgStat.registration_frozen !== undefined) status.registration_frozen = pgStat.registration_frozen;
        if (pgStat.api_frozen !== undefined) status.api_frozen = pgStat.api_frozen;
        if (pgStat.reason) status.reason = pgStat.reason;
      }
    } catch {
      // Non-fatal
    }

    return { tenant, config, status };
  }

  public async getTenantPlatformConfig(tenantId: string): Promise<TenantPlatformConfig | null> {
    const config = await tenantRepository.getPlatformConfig(tenantId);
    if (!config) return null;
    try {
      const pgConf = await postgresTenantConfigRepository.getConfig(tenantId);
      if (pgConf) {
        if (pgConf.trading_enabled !== undefined) config.trading_enabled = pgConf.trading_enabled;
        if (pgConf.registration_enabled !== undefined) config.registration_enabled = pgConf.registration_enabled;
        if (pgConf.api_enabled !== undefined) config.api_enabled = pgConf.api_enabled;
        if (pgConf.support_enabled !== undefined) config.support_enabled = pgConf.support_enabled;
        if (pgConf.notifications_enabled !== undefined) config.notifications_enabled = pgConf.notifications_enabled;
        if (pgConf.max_leverage !== undefined) config.max_leverage = Number(pgConf.max_leverage);
      }
    } catch {
      // Non-fatal
    }
    return config;
  }

  public async getTenantStatus(tenantId: string): Promise<TenantSecurityStatus | null> {
    const status = await tenantRepository.getStatus(tenantId);
    if (!status) return null;
    try {
      const pgStat = await postgresTenantConfigRepository.getEmergencyStatus(tenantId);
      if (pgStat) {
        if (pgStat.tenant_frozen !== undefined) status.tenant_frozen = pgStat.tenant_frozen;
        if (pgStat.trading_halted !== undefined) status.trading_killswitch_active = pgStat.trading_halted;
        if (pgStat.registration_frozen !== undefined) status.registration_frozen = pgStat.registration_frozen;
        if (pgStat.api_frozen !== undefined) status.api_frozen = pgStat.api_frozen;
        if (pgStat.reason) status.reason = pgStat.reason;
      }
    } catch {
      // Non-fatal
    }
    return status;
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
 * with automatic fallback to Mock provider if CENTRAL_API_URL is unavailable or non-JSON.
 */
export class CentralApiService implements ICentralApiService {
  private mockProvider = new MockCentralApiProvider();
  private remoteTenantsCache: any[] | null = null;
  private lastRemoteFetchTime = 0;
  private lastWarningLogTime = 0;
  private readonly CACHE_TTL_MS = 60000; // 60s cache TTL to avoid outbound HTTP request on every internal API call

  private get baseUrl(): string | null {
    const raw =
      process.env.CENTRAL_ADMIN_INTERNAL_URL ||
      process.env.CENTRAL_API_URL ||
      process.env.CENTRAL_ADMIN_BASE_URL ||
      process.env.CENTRAL_ADMIN_URL ||
      'https://admin-dashbord-wxcq.onrender.com';
    if (!raw || raw.trim().length === 0) return null;
    let url = resolveInternalRenderUrl(raw.trim()).replace(/\/+$/, '');
    url = url.replace(/\/api$/i, '');
    return url.replace(/\/+$/, '');
  }

  /**
   * Safe fetch helper that ensures the response has Content-Type: application/json
   * and never throws SyntaxError when Admin Panel serves index.html (<!doctype html>)
   */
  private async fetchJson(url: string, timeoutMs = 3000): Promise<any | null> {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        return null;
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return null;
      }

      return await res.json();
    } catch {
      return null;
    }
  }

  private logFallbackNotice(reason: string): void {
    const now = Date.now();
    // Throttle warnings to at most once per 60 seconds to prevent log spamming on every request
    if (now - this.lastWarningLogTime > 60000) {
      this.lastWarningLogTime = now;
      console.warn(
        `[CENTRAL_API] Notice: Central Admin API unavailable or non-JSON (${reason}), cleanly using local/PostgreSQL provider.`
      );
    }
  }

  private async fetchRemoteTenants(): Promise<any[] | null> {
    const baseUrl = this.baseUrl;
    if (!baseUrl) return null;

    const now = Date.now();
    if (this.remoteTenantsCache && now - this.lastRemoteFetchTime < this.CACHE_TTL_MS) {
      return this.remoteTenantsCache;
    }

    const data = await this.fetchJson(`${baseUrl}/api/tenants`, 2500);
    if (Array.isArray(data) && data.length > 0) {
      this.remoteTenantsCache = data;
      this.lastRemoteFetchTime = now;
      return data;
    }

    this.logFallbackNotice('endpoint /api/tenants not returning valid JSON array');
    return null;
  }

  public async resolveTenant(domain: string, requestedTenantId?: string): Promise<TenantResolutionData> {
    const baseUrl = this.baseUrl;
    if (!baseUrl) {
      return this.mockProvider.resolveTenant(domain, requestedTenantId);
    }

    try {
      // 1. Try explicit Central API resolve endpoint if available and returns JSON
      const query = new URLSearchParams({ domain });
      if (requestedTenantId) query.set('tenant_id', requestedTenantId);

      const resolveJson = await this.fetchJson(`${baseUrl}/api/tenant/resolve?${query.toString()}`, 1500);
      if (resolveJson && resolveJson.success && resolveJson.data) {
        return resolveJson.data;
      }

      // 2. Query Central Admin's valid JSON /api/tenants endpoint
      const remoteTenants = await this.fetchRemoteTenants();
      if (remoteTenants && remoteTenants.length > 0) {
        const cleanDomain = (domain || '').toLowerCase().split(':')[0];
        let matchedRemote: any = null;

        if (requestedTenantId) {
          matchedRemote = remoteTenants.find(
            (t: any) => t.id && t.id.toLowerCase() === requestedTenantId.toLowerCase()
          );
        }

        if (!matchedRemote && cleanDomain) {
          matchedRemote = remoteTenants.find(
            (t: any) => t.domain && t.domain.toLowerCase() === cleanDomain
          );
        }

        if (matchedRemote) {
          const localContext = await this.mockProvider.resolveTenant(domain, matchedRemote.id);
          return {
            ...localContext,
            tenant: {
              ...localContext.tenant,
              id: matchedRemote.id,
              name: matchedRemote.name || localContext.tenant.name,
              customDomain: matchedRemote.domain || localContext.tenant.customDomain,
            },
            matchedBy: requestedTenantId ? 'override' : 'domain',
            domain: cleanDomain,
          };
        }
      }
    } catch (err: any) {
      this.logFallbackNotice(err.message || 'connection failed');
    }

    // Clean fallback to local / PostgreSQL provider without log spam
    return this.mockProvider.resolveTenant(domain, requestedTenantId);
  }

  public async getTenantBranding(tenantId: string): Promise<TenantBranding | null> {
    const baseUrl = this.baseUrl;
    if (baseUrl) {
      const json = await this.fetchJson(`${baseUrl}/api/tenant/branding?tenant_id=${encodeURIComponent(tenantId)}`);
      if (json) {
        return json.data || json;
      }
    }
    return this.mockProvider.getTenantBranding(tenantId);
  }

  public async getTenantConfig(
    tenantId: string
  ): Promise<{ tenant: Tenant; config: TenantPlatformConfig; status: TenantSecurityStatus } | null> {
    const baseUrl = this.baseUrl;
    if (baseUrl) {
      const json = await this.fetchJson(`${baseUrl}/api/tenant/config?tenant_id=${encodeURIComponent(tenantId)}`);
      if (json && (json.tenant || json.data)) {
        return json.data || json;
      }
    }
    return this.mockProvider.getTenantConfig(tenantId);
  }

  public async getTenantPlatformConfig(tenantId: string): Promise<TenantPlatformConfig | null> {
    const baseUrl = this.baseUrl;
    if (baseUrl) {
      const json = await this.fetchJson(`${baseUrl}/api/tenant/platform-config?tenant_id=${encodeURIComponent(tenantId)}`);
      if (json) {
        return json.data || json;
      }
    }
    return this.mockProvider.getTenantPlatformConfig(tenantId);
  }

  public async getTenantStatus(tenantId: string): Promise<TenantSecurityStatus | null> {
    const baseUrl = this.baseUrl;
    if (baseUrl) {
      const json = await this.fetchJson(`${baseUrl}/api/tenant/status?tenant_id=${encodeURIComponent(tenantId)}`);
      if (json) {
        return json.data || json;
      }
    }
    return this.mockProvider.getTenantStatus(tenantId);
  }

  public async getAllTenants(): Promise<Tenant[]> {
    const remoteTenants = await this.fetchRemoteTenants();
    if (remoteTenants && remoteTenants.length > 0) {
      const local = await this.mockProvider.getAllTenants();
      const map = new Map<string, Tenant>();
      for (const t of local) map.set(t.id.toLowerCase(), t);
      for (const r of remoteTenants) {
        if (!map.has(r.id.toLowerCase())) {
          map.set(r.id.toLowerCase(), {
            id: r.id,
            name: r.name,
            slug: (r.code || r.name).toLowerCase(),
            customDomain: r.domain,
            domains: [r.domain].filter(Boolean),
            status: (r.status || 'active').toLowerCase(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }
      return Array.from(map.values());
    }
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

