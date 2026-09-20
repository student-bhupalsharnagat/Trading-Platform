import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Tenant,
  TenantBranding,
  TenantPlatformConfig,
  TenantSecurityStatus,
  TenantContextData,
} from '../types/tenant.ts';

const DEFAULT_BRANDING: TenantBranding = {
  brandName: 'VERTEX',
  shortName: 'VX',
  tagline: 'Trade smarter. Move faster.',
  primaryColor: '#F59E0B',
  secondaryColor: '#3B82F6',
  accentColor: '#10B981',
  backgroundColor: '#060B13',
  surfaceColor: '#0B111C',
  loginBranding: {
    title: 'VERTEX Multi-Asset Engine',
    subtitle: 'High-frequency Execution. Professional Liquidity.',
    badgeText: 'Institutional Grade',
    heroHighlight: 'Fast. Scalable. Multi-Tenant.',
  },
  headerBranding: {
    showTagline: true,
    badgeText: 'LIVE',
  },
  sidebarBranding: {
    brandText: 'VERTEX',
  },
  supportEmail: 'support@vertex.trade',
  supportPhone: '+91 80 4718 1888',
  footerLinks: {
    termsUrl: '/terms',
    privacyUrl: '/privacy',
    riskDisclosureUrl: '/risk-disclosure',
    helpCenterUrl: '/support',
  },
};

const DEFAULT_CONFIG: TenantPlatformConfig = {
  trading_enabled: true,
  registration_enabled: true,
  api_enabled: true,
  support_enabled: true,
  notifications_enabled: true,
  deposit_enabled: true,
  withdrawal_enabled: true,
  options_trading_enabled: true,
  max_leverage: 200,
  maintenance_mode: false,
  maintenance_message: 'Platform undergoing scheduled maintenance. Trading will resume shortly.',
};

const DEFAULT_STATUS: TenantSecurityStatus = {
  tenant_frozen: false,
  trading_killswitch_active: false,
  registration_frozen: false,
  api_frozen: false,
  maintenance_active: false,
};

const DEFAULT_TENANT: Tenant = {
  id: 'vertex-default',
  name: 'VERTEX Prime Markets',
  slug: 'vertex',
  domains: ['localhost', 'vertex.trade'],
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  brandName: string;
  shortName: string;
  status: string;
  customDomain?: string;
  primaryColor: string;
  tradingEnabled: boolean;
  registrationEnabled: boolean;
  optionsTradingEnabled: boolean;
}

interface TenantContextType {
  tenant: Tenant;
  branding: TenantBranding;
  config: TenantPlatformConfig;
  status: TenantSecurityStatus;
  allTenants: TenantSummary[];
  loading: boolean;
  error: string | null;
  isTradingEnabled: boolean;
  isRegistrationEnabled: boolean;
  isMaintenanceActive: boolean;
  isOptionsEnabled: boolean;
  matchedBy: string;
  switchTenant: (tenantId: string) => Promise<void>;
  toggleDevFeature: (feature: string, value: boolean, userId?: string) => Promise<void>;
  refreshTenant: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenant, setTenant] = useState<Tenant>(DEFAULT_TENANT);
  const [branding, setBranding] = useState<TenantBranding>(DEFAULT_BRANDING);
  const [config, setConfig] = useState<TenantPlatformConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<TenantSecurityStatus>(DEFAULT_STATUS);
  const [matchedBy, setMatchedBy] = useState<string>('default');
  const [allTenants, setAllTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const applyBrandingToDocument = (b: TenantBranding) => {
    try {
      // 1. Update Document Title
      document.title = `${b.brandName} - ${b.tagline || 'Trading Platform'}`;

      // 2. Update Favicon if provided
      if (b.faviconUrl) {
        let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.getElementsByTagName('head')[0].appendChild(link);
        }
        link.href = b.faviconUrl;
      }

      // 3. Inject CSS custom properties for dynamic white-label theme colors
      const root = document.documentElement;
      if (b.primaryColor) {
        root.style.setProperty('--tenant-primary', b.primaryColor);
      }
      if (b.secondaryColor) {
        root.style.setProperty('--tenant-secondary', b.secondaryColor);
      }
      if (b.accentColor) {
        root.style.setProperty('--tenant-accent', b.accentColor);
      }
      if (b.backgroundColor) {
        root.style.setProperty('--tenant-bg', b.backgroundColor);
      }
      if (b.surfaceColor) {
        root.style.setProperty('--tenant-surface', b.surfaceColor);
      }
    } catch {
      // ignore in non-browser environments
    }
  };

  const fetchTenant = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/tenant/current');
      if (!res.ok) {
        throw new Error(`Failed to resolve tenant: HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data;
        if (d.tenant) setTenant(d.tenant);
        if (d.branding) {
          setBranding(d.branding);
          applyBrandingToDocument(d.branding);
        }
        if (d.config) setConfig(d.config);
        if (d.status) setStatus(d.status);
        if (d.matchedBy) setMatchedBy(d.matchedBy);
      }
    } catch (err: any) {
      console.warn('[TenantContext] Tenant resolution warning, using fallback:', err.message);
      setError(err.message);
      applyBrandingToDocument(DEFAULT_BRANDING);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAllTenants = useCallback(async () => {
    try {
      const res = await fetch('/api/tenant/all');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setAllTenants(json.data);
        }
      }
    } catch {
      // non-fatal in dev mode
    }
  }, []);

  useEffect(() => {
    fetchTenant();
    fetchAllTenants();
  }, [fetchTenant, fetchAllTenants]);

  const switchTenant = async (tenantId: string) => {
    try {
      setLoading(true);
      const res = await fetch('/api/tenant/dev/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });

      if (!res.ok) {
        throw new Error('Failed to switch tenant.');
      }

      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data;
        if (d.tenant) setTenant(d.tenant);
        if (d.branding) {
          setBranding(d.branding);
          applyBrandingToDocument(d.branding);
        }
        if (d.platformConfig) setConfig(d.platformConfig);
        if (d.status) setStatus(d.status);
        if (d.matchedBy) setMatchedBy(d.matchedBy);
      }

      // Re-fetch all to synchronize
      await fetchAllTenants();
    } catch (err: any) {
      console.error('[TenantContext] Switch error:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const toggleDevFeature = async (feature: string, value: boolean, userId?: string) => {
    try {
      const res = await fetch('/api/tenant/dev/toggle-feature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature, value, userId }),
      });

      if (!res.ok) {
        throw new Error(`Failed to toggle feature: HTTP ${res.status}`);
      }

      // Refresh state
      await fetchTenant();
      await fetchAllTenants();
    } catch (err: any) {
      console.error('[TenantContext] Feature toggle error:', err);
      throw err;
    }
  };

  // Effective security & operational states:
  // Killswitch or Tenant Freeze disables trading completely.
  const isMaintenanceActive = Boolean(config.maintenance_mode || status.maintenance_active);
  const isTradingEnabled = Boolean(
    config.trading_enabled &&
      !status.trading_killswitch_active &&
      !status.tenant_frozen &&
      !isMaintenanceActive &&
      tenant.status !== 'frozen' &&
      tenant.status !== 'maintenance'
  );
  const isRegistrationEnabled = Boolean(
    config.registration_enabled &&
      !status.registration_frozen &&
      !status.tenant_frozen &&
      !isMaintenanceActive &&
      tenant.status !== 'frozen'
  );
  const isOptionsEnabled = Boolean(config.options_trading_enabled && isTradingEnabled);

  const value = useMemo(
    () => ({
      tenant,
      branding,
      config,
      status,
      allTenants,
      loading,
      error,
      isTradingEnabled,
      isRegistrationEnabled,
      isMaintenanceActive,
      isOptionsEnabled,
      matchedBy,
      switchTenant,
      toggleDevFeature,
      refreshTenant: fetchTenant,
    }),
    [
      tenant,
      branding,
      config,
      status,
      allTenants,
      loading,
      error,
      isTradingEnabled,
      isRegistrationEnabled,
      isMaintenanceActive,
      isOptionsEnabled,
      matchedBy,
      fetchTenant,
    ]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};

export const useTenant = (): TenantContextType => {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return ctx;
};
