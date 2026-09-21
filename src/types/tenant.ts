export type TenantStatus = 'active' | 'frozen' | 'maintenance' | 'suspended';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  customDomain?: string;
  domains: string[];
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TenantBranding {
  brandName: string;
  shortName: string;
  logoUrl?: string;
  faviconUrl?: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  loginBranding: {
    title: string;
    subtitle: string;
    badgeText: string;
    heroHighlight: string;
    coverImageUrl?: string;
  };
  headerBranding: {
    showTagline: boolean;
    badgeText: string;
  };
  sidebarBranding: {
    brandText: string;
  };
  supportEmail: string;
  supportPhone: string;
  termsUrl?: string;
  privacyUrl?: string;
  footerLinks: {
    termsUrl: string;
    privacyUrl: string;
    riskDisclosureUrl: string;
    helpCenterUrl: string;
  };
}

export interface TenantPlatformConfig {
  trading_enabled: boolean;
  registration_enabled: boolean;
  api_enabled: boolean;
  support_enabled: boolean;
  notifications_enabled: boolean;
  deposit_enabled: boolean;
  withdrawal_enabled: boolean;
  options_trading_enabled: boolean;
  max_leverage: number;
  maintenance_mode: boolean;
  maintenance_message: string;
}

export interface TenantSecurityStatus {
  tenant_frozen: boolean;
  trading_killswitch_active: boolean;
  registration_frozen: boolean;
  api_frozen: boolean;
  maintenance_active: boolean;
  reason?: string;
}

export interface TenantContextData {
  tenant: Tenant;
  branding: TenantBranding;
  config: TenantPlatformConfig;
  platformConfig: TenantPlatformConfig;
  status: TenantSecurityStatus;
  matchedBy: 'domain' | 'dev_fallback' | 'subdomain' | 'header' | 'override';
  domain: string;
}

export interface TenantApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
