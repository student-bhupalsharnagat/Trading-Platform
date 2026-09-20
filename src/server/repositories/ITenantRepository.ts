import {
  Tenant,
  TenantBranding,
  TenantPlatformConfig,
  TenantSecurityStatus,
} from '../../types/tenant.ts';

export interface ITenantRepository {
  findById(id: string): Promise<Tenant | null>;
  findBySlug(slug: string): Promise<Tenant | null>;
  findByDomain(domain: string): Promise<Tenant | null>;
  findAll(): Promise<Tenant[]>;
  getBranding(tenantId: string): Promise<TenantBranding | null>;
  getPlatformConfig(tenantId: string): Promise<TenantPlatformConfig | null>;
  getStatus(tenantId: string): Promise<TenantSecurityStatus | null>;
  updatePlatformConfig(tenantId: string, updates: Partial<TenantPlatformConfig>): Promise<TenantPlatformConfig | null>;
  updateStatus(tenantId: string, updates: Partial<TenantSecurityStatus>): Promise<TenantSecurityStatus | null>;
  updateBranding(tenantId: string, updates: Partial<TenantBranding>): Promise<TenantBranding | null>;
  createTenant(data: {
    tenant: Tenant;
    branding?: Partial<TenantBranding>;
    config?: Partial<TenantPlatformConfig>;
    status?: Partial<TenantSecurityStatus>;
  }): Promise<Tenant>;
  deleteTenant(id: string): Promise<boolean>;
}
