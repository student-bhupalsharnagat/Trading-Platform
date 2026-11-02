export const DEFAULT_TENANTS = ['TNT-001', 'TNT-002', 'TNT-003', 'vertex-default', 'default'];

export function sanitizeTenant(raw?: string | string[] | null | unknown): string {
  if (!raw) return '';
  const str = Array.isArray(raw) ? raw[0] : String(raw);
  return str.split(',')[0].trim();
}

export function isDefaultTenant(tenantId?: string | null): boolean {
  if (!tenantId) return true;
  const t = sanitizeTenant(tenantId).toLowerCase();
  return (
    t === 'tnt-001' ||
    t === 'tnt-002' ||
    t === 'tnt-003' ||
    t === 'vertex-default' ||
    t === 'default' ||
    t === ''
  );
}

export function getSearchTenants(tenantId?: string | null): string[] {
  const norm = sanitizeTenant(tenantId);
  const list = [norm, ...DEFAULT_TENANTS].filter(Boolean);
  return Array.from(new Set(list));
}
