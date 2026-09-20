import { ITenantRepository } from './ITenantRepository.ts';
import {
  Tenant,
  TenantBranding,
  TenantPlatformConfig,
  TenantSecurityStatus,
} from '../../types/tenant.ts';

const SEED_TENANTS: Record<
  string,
  {
    tenant: Tenant;
    branding: TenantBranding;
    config: TenantPlatformConfig;
    status: TenantSecurityStatus;
  }
> = {
  'vertex-default': {
    tenant: {
      id: 'vertex-default',
      name: 'VERTEX Trading',
      slug: 'vertex',
      customDomain: 'localhost',
      domains: ['localhost', '127.0.0.1'],
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-09-14T00:00:00.000Z',
    },
    branding: {
      brandName: 'VERTEX Trading',
      shortName: 'VTX',
      logoUrl: '',
      faviconUrl: '/favicon.ico',
      tagline: 'Institutional Multi-Asset Platform',
      primaryColor: '#F59E0B', // Amber
      secondaryColor: '#10B981', // Emerald
      accentColor: '#3B82F6', // Blue
      backgroundColor: '#060B13',
      surfaceColor: '#0B111C',
      loginBranding: {
        title: 'Institutional Trading Desk',
        subtitle: 'Ultra-low latency execution across NSE, MCX, FOREX & Crypto with real-time risk controls.',
        badgeText: 'Direct Market Access',
        heroHighlight: 'Professional Multi-Tier Trading',
      },
      headerBranding: {
        showTagline: true,
        badgeText: 'Live Feed',
      },
      sidebarBranding: {
        brandText: 'Trading Platform',
      },
      supportEmail: 'support@vertex-trading.com',
      supportPhone: '+91 1800 234 5678',
      footerLinks: {
        termsUrl: '#terms',
        privacyUrl: '#privacy',
        riskDisclosureUrl: '#risk',
        helpCenterUrl: '#support',
      },
    },
    config: {
      trading_enabled: true,
      registration_enabled: true,
      api_enabled: true,
      support_enabled: true,
      notifications_enabled: true,
      deposit_enabled: true,
      withdrawal_enabled: true,
      options_trading_enabled: true,
      max_leverage: 50,
      maintenance_mode: false,
      maintenance_message: 'Scheduled platform maintenance. Trading engine is operational.',
    },
    status: {
      tenant_frozen: false,
      trading_killswitch_active: false,
      registration_frozen: false,
      api_frozen: false,
      maintenance_active: false,
    },
  },
  'apex-capital': {
    tenant: {
      id: 'apex-capital',
      name: 'Apex Capital Markets',
      slug: 'apex',
      customDomain: 'apex.local',
      domains: ['apex.local', 'apex-capital.markets'],
      status: 'active',
      createdAt: '2026-02-15T00:00:00.000Z',
      updatedAt: '2026-09-14T00:00:00.000Z',
    },
    branding: {
      brandName: 'Apex Capital',
      shortName: 'APEX',
      logoUrl: '',
      faviconUrl: '/favicon.ico',
      tagline: 'High-Frequency Derivatives & Equities',
      primaryColor: '#10B981', // Emerald
      secondaryColor: '#14B8A6', // Teal
      accentColor: '#F59E0B', // Amber
      backgroundColor: '#050E0C',
      surfaceColor: '#0B1A17',
      loginBranding: {
        title: 'Apex Capital Terminal',
        subtitle: 'Enterprise-grade algorithmic routing, deep order books, and institutional liquidity.',
        badgeText: 'Institutional Grade',
        heroHighlight: 'Precision Execution',
      },
      headerBranding: {
        showTagline: true,
        badgeText: 'Apex DMA Tier-1',
      },
      sidebarBranding: {
        brandText: 'Capital Markets',
      },
      supportEmail: 'desk@apex-capital.markets',
      supportPhone: '+91 1800 888 9090',
      footerLinks: {
        termsUrl: '#apex-terms',
        privacyUrl: '#apex-privacy',
        riskDisclosureUrl: '#apex-risk',
        helpCenterUrl: '#apex-help',
      },
    },
    config: {
      trading_enabled: true,
      registration_enabled: true,
      api_enabled: true,
      support_enabled: true,
      notifications_enabled: true,
      deposit_enabled: true,
      withdrawal_enabled: true,
      options_trading_enabled: true,
      max_leverage: 40,
      maintenance_mode: false,
      maintenance_message: 'Apex Capital systems operational.',
    },
    status: {
      tenant_frozen: false,
      trading_killswitch_active: false,
      registration_frozen: false,
      api_frozen: false,
      maintenance_active: false,
    },
  },
  'zenith-fx': {
    tenant: {
      id: 'zenith-fx',
      name: 'Zenith Global Markets',
      slug: 'zenith',
      customDomain: 'zenith.local',
      domains: ['zenith.local', 'zenith-fx.com'],
      status: 'active',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-09-14T00:00:00.000Z',
    },
    branding: {
      brandName: 'Zenith Global',
      shortName: 'ZEN',
      logoUrl: '',
      faviconUrl: '/favicon.ico',
      tagline: 'Global Bullion & Institutional Liquidity',
      primaryColor: '#3B82F6', // Blue
      secondaryColor: '#6366F1', // Indigo
      accentColor: '#06B6D4', // Cyan
      backgroundColor: '#060E1A',
      surfaceColor: '#0B182B',
      loginBranding: {
        title: 'Zenith Prime Desk',
        subtitle: 'Direct interbank spreads on Precious Metals, Energies, Indices & FX majors.',
        badgeText: 'Prime Brokerage',
        heroHighlight: 'Global Liquidity Network',
      },
      headerBranding: {
        showTagline: true,
        badgeText: 'Zenith Prime L2',
      },
      sidebarBranding: {
        brandText: 'Global Terminal',
      },
      supportEmail: 'prime@zenith-fx.global',
      supportPhone: '+44 20 7946 0912',
      footerLinks: {
        termsUrl: '#zenith-terms',
        privacyUrl: '#zenith-privacy',
        riskDisclosureUrl: '#zenith-risk',
        helpCenterUrl: '#zenith-help',
      },
    },
    config: {
      trading_enabled: true,
      registration_enabled: true,
      api_enabled: true,
      support_enabled: true,
      notifications_enabled: true,
      deposit_enabled: true,
      withdrawal_enabled: true,
      options_trading_enabled: true,
      max_leverage: 100,
      maintenance_mode: false,
      maintenance_message: 'Zenith Global liquidity gateway active.',
    },
    status: {
      tenant_frozen: false,
      trading_killswitch_active: false,
      registration_frozen: false,
      api_frozen: false,
      maintenance_active: false,
    },
  },
};

export class JsonTenantRepository implements ITenantRepository {
  private store: Record<
    string,
    {
      tenant: Tenant;
      branding: TenantBranding;
      config: TenantPlatformConfig;
      status: TenantSecurityStatus;
    }
  >;

  constructor() {
    // Deep clone initial seed data
    this.store = JSON.parse(JSON.stringify(SEED_TENANTS));
  }

  public async findById(id: string): Promise<Tenant | null> {
    const item = this.store[id];
    return item ? { ...item.tenant } : null;
  }

  public async findBySlug(slug: string): Promise<Tenant | null> {
    const item = Object.values(this.store).find((s) => s.tenant.slug.toLowerCase() === slug.toLowerCase());
    return item ? { ...item.tenant } : null;
  }

  public async findByDomain(domain: string): Promise<Tenant | null> {
    const cleanDomain = domain.toLowerCase().split(':')[0]; // strip port if present

    // Match custom domain or registered domains array
    const item = Object.values(this.store).find(
      (s) =>
        s.tenant.customDomain?.toLowerCase() === cleanDomain ||
        s.tenant.domains.some((d) => d.toLowerCase() === cleanDomain || cleanDomain.endsWith(`.${d.toLowerCase()}`))
    );

    return item ? { ...item.tenant } : null;
  }

  public async findAll(): Promise<Tenant[]> {
    return Object.values(this.store).map((s) => ({ ...s.tenant }));
  }

  public async getBranding(tenantId: string): Promise<TenantBranding | null> {
    const item = this.store[tenantId];
    return item ? { ...item.branding } : null;
  }

  public async getPlatformConfig(tenantId: string): Promise<TenantPlatformConfig | null> {
    const item = this.store[tenantId];
    return item ? { ...item.config } : null;
  }

  public async getStatus(tenantId: string): Promise<TenantSecurityStatus | null> {
    const item = this.store[tenantId];
    return item ? { ...item.status } : null;
  }

  public async updatePlatformConfig(
    tenantId: string,
    updates: Partial<TenantPlatformConfig>
  ): Promise<TenantPlatformConfig | null> {
    const item = this.store[tenantId];
    if (!item) return null;
    item.config = { ...item.config, ...updates };
    return { ...item.config };
  }

  public async updateStatus(
    tenantId: string,
    updates: Partial<TenantSecurityStatus>
  ): Promise<TenantSecurityStatus | null> {
    const item = this.store[tenantId];
    if (!item) return null;
    item.status = { ...item.status, ...updates };
    return { ...item.status };
  }

  public async updateBranding(
    tenantId: string,
    updates: Partial<TenantBranding>
  ): Promise<TenantBranding | null> {
    const item = this.store[tenantId];
    if (!item) return null;
    item.branding = { ...item.branding, ...updates };
    return { ...item.branding };
  }

  public async createTenant(data: {
    tenant: Tenant;
    branding?: Partial<TenantBranding>;
    config?: Partial<TenantPlatformConfig>;
    status?: Partial<TenantSecurityStatus>;
  }): Promise<Tenant> {
    const id = data.tenant.id;
    const defaultBranding: TenantBranding = {
      brandName: data.tenant.name,
      shortName: data.tenant.slug.toUpperCase(),
      logoUrl: '',
      faviconUrl: '/favicon.ico',
      tagline: 'Multi-Asset Institutional Trading Desk',
      primaryColor: '#F59E0B',
      secondaryColor: '#10B981',
      accentColor: '#3B82F6',
      backgroundColor: '#060B13',
      surfaceColor: '#0B111C',
      loginBranding: {
        title: `${data.tenant.name} Trading Desk`,
        subtitle: 'Multi-tier institutional trading infrastructure.',
        badgeText: 'Direct Market Access',
        heroHighlight: 'Real-time multi-asset execution',
      },
      headerBranding: {
        showTagline: true,
        badgeText: 'Live Feed',
      },
      sidebarBranding: {
        brandText: data.tenant.name,
      },
      supportEmail: `support@${data.tenant.slug}.com`,
      supportPhone: '+91 1800 123 4567',
      footerLinks: {
        termsUrl: '#terms',
        privacyUrl: '#privacy',
        riskDisclosureUrl: '#risk',
        helpCenterUrl: '#support',
      },
    };

    const defaultConfig: TenantPlatformConfig = {
      trading_enabled: true,
      registration_enabled: true,
      api_enabled: true,
      support_enabled: true,
      notifications_enabled: true,
      deposit_enabled: true,
      withdrawal_enabled: true,
      options_trading_enabled: true,
      max_leverage: 50,
      maintenance_mode: false,
      maintenance_message: 'Platform operational.',
    };

    const defaultStatus: TenantSecurityStatus = {
      tenant_frozen: false,
      trading_killswitch_active: false,
      registration_frozen: false,
      api_frozen: false,
      maintenance_active: false,
    };

    this.store[id] = {
      tenant: { ...data.tenant },
      branding: { ...defaultBranding, ...(data.branding || {}) },
      config: { ...defaultConfig, ...(data.config || {}) },
      status: { ...defaultStatus, ...(data.status || {}) },
    };

    return { ...this.store[id].tenant };
  }

  public async deleteTenant(id: string): Promise<boolean> {
    if (this.store[id]) {
      delete this.store[id];
      return true;
    }
    return false;
  }
}

export const tenantRepository = new JsonTenantRepository();
