const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'context', 'TenantContext.tsx');
let content = fs.readFileSync(filePath, 'utf8');
const normalize = (s) => s.replace(/\r\n/g, '\n');

// 1. Initial tenant and branding state persistence
const target1 = `  const [tenant, setTenant] = useState<Tenant>(() => {
    const saved = localStorage.getItem('vtx_active_tenant_id');
    const matched = DEFAULT_TENANT_SUMMARIES.find((t) => t.id === saved);
    if (matched) {
      return { ...DEFAULT_TENANT, id: matched.id, name: matched.name, slug: matched.slug };
    }
    return DEFAULT_TENANT;
  });
  const [branding, setBranding] = useState<TenantBranding>(() => {
    const saved = localStorage.getItem('vtx_active_tenant_id');
    const matched = DEFAULT_TENANT_SUMMARIES.find((t) => t.id === saved);
    if (matched) {
      return {
        ...DEFAULT_BRANDING,
        brandName: matched.brandName,
        shortName: matched.shortName,
        primaryColor: matched.primaryColor,
      };
    }
    return DEFAULT_BRANDING;
  });`;

const replacement1 = `  const [tenant, setTenant] = useState<Tenant>(() => {
    try {
      const savedData = localStorage.getItem('vtx_active_tenant_data');
      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (parsed?.tenant?.id) return parsed.tenant;
      }
    } catch {}
    const saved = localStorage.getItem('vtx_active_tenant_id');
    const matched = DEFAULT_TENANT_SUMMARIES.find((t) => t.id === saved);
    if (matched) {
      return { ...DEFAULT_TENANT, id: matched.id, name: matched.name, slug: matched.slug };
    }
    if (saved) {
      return { ...DEFAULT_TENANT, id: saved, name: saved === 'TNT-001' ? 'Apex Capital Markets' : saved };
    }
    return DEFAULT_TENANT;
  });
  const [branding, setBranding] = useState<TenantBranding>(() => {
    try {
      const savedData = localStorage.getItem('vtx_active_tenant_data');
      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (parsed?.branding?.brandName) return parsed.branding;
      }
    } catch {}
    const saved = localStorage.getItem('vtx_active_tenant_id');
    const matched = DEFAULT_TENANT_SUMMARIES.find((t) => t.id === saved);
    if (matched) {
      return {
        ...DEFAULT_BRANDING,
        brandName: matched.brandName,
        shortName: matched.shortName,
        primaryColor: matched.primaryColor,
      };
    }
    return DEFAULT_BRANDING;
  });`;

if (normalize(content).includes(normalize(target1))) {
  content = normalize(content).replace(normalize(target1), normalize(replacement1));
  console.log('Successfully patched initial tenant persistence');
} else {
  console.error('Target 1 not found in TenantContext.tsx');
}

// 2. Persist active tenant data in fetchTenant
const target2 = `        if (d.tenant) setTenant(d.tenant);
        if (d.branding) {
          setBranding(d.branding);
          applyBrandingToDocument(d.branding);
        }`;

const replacement2 = `        if (d.tenant) setTenant(d.tenant);
        if (d.branding) {
          setBranding(d.branding);
          applyBrandingToDocument(d.branding);
        }
        if (d.tenant && d.branding) {
          try {
            localStorage.setItem('vtx_active_tenant_data', JSON.stringify({ tenant: d.tenant, branding: d.branding }));
          } catch {}
        }`;

if (normalize(content).includes(normalize(target2))) {
  content = normalize(content).replace(normalize(target2), normalize(replacement2));
  console.log('Successfully patched fetchTenant persistence');
} else {
  console.error('Target 2 not found in TenantContext.tsx');
}

// 3. Persist in switchTenant
const target3 = `      if (matched) {
        setTenant((prev) => ({
          ...prev,
          id: matched.id,
          name: matched.name,
          slug: matched.slug,
        }));
        setBranding((prev) => {
          const next: TenantBranding = {
            ...prev,
            brandName: matched.brandName || matched.name,
            shortName: matched.shortName || matched.slug.toUpperCase(),
            primaryColor: matched.primaryColor || '#F59E0B',
            loginBranding: {
              ...prev.loginBranding,
              title: \`\${matched.brandName} Multi-Asset Engine\`,
              subtitle: 'High-frequency Execution. Professional Liquidity.',
            },
          };
          applyBrandingToDocument(next);
          return next;
        });
      }`;

const replacement3 = `      if (matched) {
        const nextTenant = {
          ...DEFAULT_TENANT,
          id: matched.id,
          name: matched.name,
          slug: matched.slug,
        };
        const nextBranding: TenantBranding = {
          ...DEFAULT_BRANDING,
          brandName: matched.brandName || matched.name,
          shortName: matched.shortName || matched.slug.toUpperCase(),
          primaryColor: matched.primaryColor || '#F59E0B',
          loginBranding: {
            ...DEFAULT_BRANDING.loginBranding,
            title: \`\${matched.brandName} Multi-Asset Engine\`,
            subtitle: 'High-frequency Execution. Professional Liquidity.',
          },
        };
        setTenant(nextTenant);
        setBranding(nextBranding);
        applyBrandingToDocument(nextBranding);
        try {
          localStorage.setItem('vtx_active_tenant_data', JSON.stringify({ tenant: nextTenant, branding: nextBranding }));
        } catch {}
      }`;

if (normalize(content).includes(normalize(target3))) {
  content = normalize(content).replace(normalize(target3), normalize(replacement3));
  console.log('Successfully patched switchTenant persistence');
} else {
  console.error('Target 3 not found in TenantContext.tsx');
}

// 4. Bug #05: Optimistic toggle in toggleDevFeature
const target4 = `  const toggleDevFeature = async (feature: string, value: boolean, userId?: string) => {
    try {
      const res = await fetch('/api/tenant/dev/toggle-feature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature, value, userId }),
      });`;

const replacement4 = `  const toggleDevFeature = async (feature: string, value: boolean, userId?: string) => {
    // Bug #05: Optimistic state update for instant toggle responsiveness
    if (feature in status) {
      setStatus((prev) => ({ ...prev, [feature]: value }));
    }
    if (feature in config) {
      setConfig((prev) => ({ ...prev, [feature]: value }));
    }
    try {
      const res = await fetch('/api/tenant/dev/toggle-feature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature, value, userId }),
      });`;

if (normalize(content).includes(normalize(target4))) {
  content = normalize(content).replace(normalize(target4), normalize(replacement4));
  console.log('Successfully patched toggleDevFeature optimistic update');
} else {
  console.error('Target 4 not found in TenantContext.tsx');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Finished updating TenantContext.tsx');
