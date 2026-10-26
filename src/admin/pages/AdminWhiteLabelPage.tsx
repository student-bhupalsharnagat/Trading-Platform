import React, { useEffect, useState } from 'react';
import {
  Building,
  Palette,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Eye,
  Globe,
  Mail,
  Phone,
  Layout,
  ExternalLink,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { useTenant } from '../../context/TenantContext';

interface AdminWhiteLabelPageProps {
  onNavigate?: (path: string) => void;
}

const PRESET_PALETTES = [
  { name: 'Amber Gold (Default)', primary: '#F59E0B', secondary: '#3B82F6', accent: '#10B981' },
  { name: 'Emerald Institutional', primary: '#10B981', secondary: '#14B8A6', accent: '#F59E0B' },
  { name: 'Cyan Pro DMA', primary: '#06B6D4', secondary: '#3B82F6', accent: '#10B981' },
  { name: 'Sapphire Prime', primary: '#3B82F6', secondary: '#6366F1', accent: '#10B981' },
  { name: 'Violet Apex', primary: '#8B5CF6', secondary: '#EC4899', accent: '#F59E0B' },
];

export const AdminWhiteLabelPage: React.FC<AdminWhiteLabelPageProps> = () => {
  const { branding: activeTenantBranding, refreshTenant } = useTenant();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [brandName, setBrandName] = useState('VERTEX Trading');
  const [shortName, setShortName] = useState('VTX');
  const [tagline, setTagline] = useState('Institutional Multi-Asset Trading Platform');
  const [logoUrl, setLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('/favicon.ico');
  const [primaryColor, setPrimaryColor] = useState('#F59E0B');
  const [secondaryColor, setSecondaryColor] = useState('#3B82F6');
  const [accentColor, setAccentColor] = useState('#10B981');
  const [backgroundColor, setBackgroundColor] = useState('#060B13');
  const [surfaceColor, setSurfaceColor] = useState('#0B111C');
  const [supportEmail, setSupportEmail] = useState('support@vertex-trading.com');
  const [supportPhone, setSupportPhone] = useState('+91 1800 234 5678');
  const [badgeText, setBadgeText] = useState('LIVE FEED');
  const [loginTitle, setLoginTitle] = useState('Institutional Trading Desk');
  const [loginSubtitle, setLoginSubtitle] = useState('Ultra-low latency execution across NSE & MCX with real-time risk controls.');

  const fetchBranding = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await adminApi.getWhiteLabel();
      const b = res?.branding || res?.data?.branding || res;

      if (b) {
        if (b.brandName) setBrandName(b.brandName);
        if (b.shortName) setShortName(b.shortName);
        if (b.tagline) setTagline(b.tagline);
        if (b.logoUrl !== undefined) setLogoUrl(b.logoUrl || '');
        if (b.faviconUrl !== undefined) setFaviconUrl(b.faviconUrl || '');
        if (b.primaryColor) setPrimaryColor(b.primaryColor);
        if (b.secondaryColor) setSecondaryColor(b.secondaryColor);
        if (b.accentColor) setAccentColor(b.accentColor);
        if (b.backgroundColor) setBackgroundColor(b.backgroundColor);
        if (b.surfaceColor) setSurfaceColor(b.surfaceColor);
        if (b.supportEmail) setSupportEmail(b.supportEmail);
        if (b.supportPhone) setSupportPhone(b.supportPhone);
        if (b.headerBranding?.badgeText) setBadgeText(b.headerBranding.badgeText);
        if (b.loginBranding?.title) setLoginTitle(b.loginBranding.title);
        if (b.loginBranding?.subtitle) setLoginSubtitle(b.loginBranding.subtitle);
      }
    } catch (err: any) {
      console.warn('Failed to load branding:', err.message);
      // Fall back to active branding from TenantContext
      if (activeTenantBranding) {
        setBrandName(activeTenantBranding.brandName);
        setShortName(activeTenantBranding.shortName);
        setTagline(activeTenantBranding.tagline || '');
        setLogoUrl(activeTenantBranding.logoUrl || '');
        setPrimaryColor(activeTenantBranding.primaryColor);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranding();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const payload = {
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
        headerBranding: {
          showTagline: true,
          badgeText,
        },
        loginBranding: {
          title: loginTitle,
          subtitle: loginSubtitle,
          badgeText: 'Institutional Grade',
          heroHighlight: brandName,
        },
        sidebarBranding: {
          brandText: brandName,
        },
      };

      await adminApi.updateWhiteLabel(payload);
      setSuccessMsg('White label branding updated and applied live across all user platforms!');

      // Trigger hot-reload in document title & CSS custom properties
      if (refreshTenant) {
        await refreshTenant();
      }

      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save white-label branding');
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (preset: typeof PRESET_PALETTES[0]) => {
    setPrimaryColor(preset.primary);
    setSecondaryColor(preset.secondary);
    setAccentColor(preset.accent);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="w-6 h-6 text-amber-400 animate-spin mr-3" />
        <span className="text-slate-300 font-medium">Loading white label configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0f172a] border border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              MULTI-TENANT WHITE LABEL SUITE
            </span>
            <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/40">
              Live Configuration Active
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Building className="w-5 h-5 text-amber-400" />
            Platform White Label & Brand Configuration
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Customize trading platform branding, logo, colors, and legal identity visible to end-users and client terminals.
          </p>
        </div>

        <button
          onClick={fetchBranding}
          disabled={loading}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Reload</span>
        </button>
      </div>

      {/* Alert Messages */}
      {successMsg && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2.5 p-4 rounded-xl bg-rose-950/50 border border-rose-800/60 text-rose-300 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Settings (Left 2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Identity & Branding Card */}
          <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
              <Layout className="w-4 h-4 text-amber-400" />
              Platform Identity & Logos
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Brand Name <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="e.g. VERTEX Prime Markets"
                  required
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-hidden focus:border-amber-400/60"
                />
                <p className="text-[11px] text-slate-500 mt-1">Displayed in platform titles, headers, and tabs.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Short Symbol / Acronym <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value.toUpperCase())}
                  placeholder="e.g. VTX"
                  maxLength={6}
                  required
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm font-mono uppercase text-slate-100 focus:outline-hidden focus:border-amber-400/60"
                />
                <p className="text-[11px] text-slate-500 mt-1">Used on mobile headers and icon badges.</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Tagline</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Institutional Multi-Asset Trading Platform"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-hidden focus:border-amber-400/60"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Logo URL (Optional)</label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://domain.com/logo.png"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-hidden focus:border-amber-400/60"
                />
                <p className="text-[11px] text-slate-500 mt-1">SVG or transparent PNG recommended (height ~32px).</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Favicon URL</label>
                <input
                  type="text"
                  value={faviconUrl}
                  onChange={(e) => setFaviconUrl(e.target.value)}
                  placeholder="/favicon.ico"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-hidden focus:border-amber-400/60"
                />
                <p className="text-[11px] text-slate-500 mt-1">Browser tab favicon URL.</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Header Live Badge Text</label>
              <input
                type="text"
                value={badgeText}
                onChange={(e) => setBadgeText(e.target.value)}
                placeholder="LIVE FEED / DIRECT DMA"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-hidden focus:border-amber-400/60"
              />
            </div>
          </div>

          {/* Theme Colors Card */}
          <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Palette className="w-4 h-4 text-amber-400" />
                Color Theme & Styling Tokens
              </h3>
            </div>

            {/* Quick Palettes */}
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-2">Preset Palettes:</p>
              <div className="flex flex-wrap gap-2">
                {PRESET_PALETTES.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 transition-colors"
                  >
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.primary }} />
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Secondary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Accent (Positive)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-100"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Support & Legal Card */}
          <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
              <Mail className="w-4 h-4 text-amber-400" />
              Support & Contact Channels
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Support Email</label>
                <input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="desk@tradingplatform.com"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-hidden focus:border-amber-400/60"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Support Hotline</label>
                <input
                  type="text"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  placeholder="+91 1800 234 5678"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-100 focus:outline-hidden focus:border-amber-400/60"
                />
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
            >
              <Save className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
              <span>{saving ? 'Applying Live Branding...' : 'Save & Deploy White Label'}</span>
            </button>
          </div>
        </div>

        {/* Live Preview Panel (Right Col) */}
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-[#0f172a] border border-slate-800 space-y-4 sticky top-6">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
              <Eye className="w-4 h-4 text-emerald-400" />
              Live Platform Preview
            </h3>

            {/* Header Preview */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Trading Desk Header</p>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Brand Logo"
                      className="h-6 w-auto object-contain max-w-[120px]"
                      onError={(e) => ((e.target as any).style.display = 'none')}
                    />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs text-slate-950"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {shortName.slice(0, 2)}
                    </div>
                  )}
                  <div>
                    <span className="font-bold text-xs text-slate-100 tracking-wide">{brandName}</span>
                    <span
                      className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                      style={{
                        backgroundColor: `${primaryColor}22`,
                        color: primaryColor,
                        border: `1px solid ${primaryColor}44`,
                      }}
                    >
                      {badgeText || 'LIVE'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Login Preview */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Client Login Screen Card</p>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: primaryColor }} />
                  <span className="text-xs font-bold text-slate-200">{loginTitle}</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{loginSubtitle}</p>
                <div
                  className="w-full py-2 rounded-lg text-center font-bold text-xs text-slate-950"
                  style={{ backgroundColor: primaryColor }}
                >
                  Enter {brandName}
                </div>
              </div>
            </div>

            {/* Sidebar Preview */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Navigation Bar Badge</p>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2.5">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black text-slate-950"
                  style={{ backgroundColor: primaryColor }}
                >
                  {shortName.slice(0, 2)}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200">{brandName}</p>
                  <p className="text-[10px] text-slate-400">{tagline}</p>
                </div>
              </div>
            </div>

            {/* Support Info */}
            <div className="pt-3 border-t border-slate-800 space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <span className="truncate">{supportEmail}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <span>{supportPhone}</span>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
