import React, { useState } from 'react';
import { useTenant } from '../context/TenantContext.tsx';
import {
  ShieldAlert,
  AlertTriangle,
  Building2,
  ChevronDown,
  Power,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  ExternalLink,
  Shield,
  Layers,
  Wrench,
  Check,
} from 'lucide-react';

export const TenantStatusBar: React.FC = () => {
  const {
    tenant,
    branding,
    config,
    status,
    allTenants,
    isTradingEnabled,
    isRegistrationEnabled,
    isMaintenanceActive,
    isOptionsEnabled,
    switchTenant,
    toggleDevFeature,
  } = useTenant();

  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const handleSelectTenant = async (tenantId: string) => {
    if (tenantId === tenant.id) {
      setIsSwitcherOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await switchTenant(tenantId);
    } catch (e) {
      console.error('Failed to switch tenant', e);
    } finally {
      setSwitching(false);
      setIsSwitcherOpen(false);
    }
  };

  return (
    <div id="tenant-status-container" className="w-full relative z-40">
      {/* 1. Emergency Banner (if Tenant Frozen, Kill-Switch, or Maintenance is Active) */}
      {isMaintenanceActive && (
        <div
          id="tenant-maintenance-banner"
          className="bg-amber-500/90 text-slate-950 px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-md"
        >
          <div className="flex items-center gap-2 max-w-5xl mx-auto w-full">
            <Wrench className="w-4 h-4 shrink-0 animate-pulse text-slate-950" />
            <span>
              <strong>MAINTENANCE ACTIVE:</strong> {config.maintenance_message || 'Trading platform undergoing scheduled maintenance.'}
            </span>
          </div>
        </div>
      )}

      {status.tenant_frozen && (
        <div
          id="tenant-frozen-banner"
          className="bg-red-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-md"
        >
          <div className="flex items-center gap-2 max-w-5xl mx-auto w-full">
            <ShieldAlert className="w-4 h-4 shrink-0 animate-bounce" />
            <span>
              <strong>TENANT SUSPENDED:</strong> Central Risk has placed a security freeze on {branding.brandName}. Trading and fund execution are blocked.
            </span>
          </div>
        </div>
      )}

      {!status.tenant_frozen && status.trading_killswitch_active && (
        <div
          id="tenant-killswitch-banner"
          className="bg-rose-950 border-b border-rose-800 text-rose-200 px-4 py-1.5 text-xs font-medium flex items-center justify-between"
        >
          <div className="flex items-center gap-2 max-w-5xl mx-auto w-full">
            <Power className="w-4 h-4 shrink-0 text-rose-400" />
            <span>
              <strong>EMERGENCY KILL-SWITCH ON:</strong> New order submissions are halted by central risk control. Existing positions remain intact.
            </span>
          </div>
        </div>
      )}

      {/* 2. Sleek White-Label Indicator & Switcher Strip */}
      <div className="bg-[#050912]/95 border-b border-[#141F30] px-3 sm:px-6 py-1 text-[11px] text-slate-400 backdrop-blur-md flex flex-wrap items-center justify-between gap-2">
        {/* Left: Tenant identity badge */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-slate-300 font-medium">
            <span
              className="inline-block w-2 h-2 rounded-full ring-2 ring-emerald-500/20"
              style={{ backgroundColor: branding.primaryColor || '#10B981' }}
            />
            <span className="text-slate-400 hidden sm:inline">Tenant:</span>
            <span className="font-bold text-white tracking-wide">{branding.brandName}</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700/60">
              {branding.shortName || tenant.slug.toUpperCase()}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 text-slate-400 pl-2 border-l border-slate-800">
            <span className="text-[10px]">Tagline:</span>
            <span className="text-slate-300 italic truncate max-w-xs">{branding.tagline}</span>
          </div>
        </div>

        {/* Right: Tenant Quick Switcher + Feature Badges */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Status indicators */}
          <div className="hidden lg:flex items-center gap-1.5 mr-1">
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                isTradingEnabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
              }`}
            >
              Trade: {isTradingEnabled ? 'ENABLED' : 'HALTED'}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                isOptionsEnabled ? 'bg-blue-500/15 text-blue-400' : 'bg-slate-800 text-slate-400'
              }`}
            >
              Options: {isOptionsEnabled ? 'ON' : 'OFF'}
            </span>
          </div>

          {/* Quick Switch Dropdown */}
          <div className="relative">
            <button
              type="button"
              id="tenant-switcher-btn"
              onClick={() => {
                setIsSwitcherOpen(!isSwitcherOpen);
                setIsControlsOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/70 text-slate-200 text-xs font-semibold cursor-pointer transition-colors shadow-xs active:scale-95"
            >
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Switch Tenant</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isSwitcherOpen ? 'rotate-180' : ''}`} />
            </button>

            {isSwitcherOpen && (
              <div
                id="tenant-switcher-dropdown"
                className="absolute right-0 mt-1.5 w-64 bg-[#0B121E] border border-slate-700/80 rounded-xl shadow-2xl py-2 z-50 backdrop-blur-xl animate-in fade-in slide-in-from-top-1"
              >
                <div className="px-3 py-1.5 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Available Tenants</span>
                  <span className="text-[10px] text-amber-400 font-mono">Central API</span>
                </div>

                <div className="max-h-60 overflow-y-auto py-1">
                  {allTenants.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectTenant(t.id)}
                      disabled={switching}
                      className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-slate-800/80 transition-colors cursor-pointer ${
                        t.id === tenant.id ? 'bg-amber-500/10 border-l-2 border-amber-500' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: t.primaryColor || '#F59E0B' }}
                        />
                        <div className="truncate">
                          <div className="text-xs font-bold text-slate-200 truncate">{t.brandName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{t.customDomain || t.slug}</div>
                        </div>
                      </div>
                      {t.id === tenant.id && <Check className="w-4 h-4 text-amber-400 shrink-0 ml-2" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Emergency & Feature Controls Drawer Toggle */}
          <div className="relative">
            <button
              type="button"
              id="tenant-controls-btn"
              onClick={() => {
                setIsControlsOpen(!isControlsOpen);
                setIsSwitcherOpen(false);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-semibold cursor-pointer transition-colors active:scale-95"
              title="Test Emergency & White-Label Security Controls"
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Central Controls</span>
            </button>

            {isControlsOpen && (
              <div
                id="tenant-controls-dropdown"
                className="absolute right-0 mt-1.5 w-72 sm:w-80 bg-[#0B121E] border border-amber-500/30 rounded-xl shadow-2xl p-3 z-50 backdrop-blur-xl animate-in fade-in slide-in-from-top-1"
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-slate-200">Central Policy Enforcement</span>
                  </div>
                  <span className="text-[9px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                    {tenant.id}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  {/* Trading Killswitch */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                    <div>
                      <div className="font-semibold text-slate-200">Trading Kill-Switch</div>
                      <div className="text-[10px] text-slate-400">Halt all trade orders centrally</div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        toggleDevFeature('trading_killswitch_active', !status.trading_killswitch_active)
                      }
                      className={`px-2 py-1 rounded font-mono text-[11px] font-bold cursor-pointer transition-colors ${
                        status.trading_killswitch_active
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {status.trading_killswitch_active ? 'ACTIVE' : 'OFF'}
                    </button>
                  </div>

                  {/* Maintenance Mode */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                    <div>
                      <div className="font-semibold text-slate-200">Maintenance Mode</div>
                      <div className="text-[10px] text-slate-400">Put tenant into maintenance</div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        toggleDevFeature('maintenance_mode', !config.maintenance_mode)
                      }
                      className={`px-2 py-1 rounded font-mono text-[11px] font-bold cursor-pointer transition-colors ${
                        config.maintenance_mode
                          ? 'bg-amber-600 text-slate-950'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {config.maintenance_mode ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>

                  {/* Options Trading Toggle */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                    <div>
                      <div className="font-semibold text-slate-200">Options Trading</div>
                      <div className="text-[10px] text-slate-400">Tenant feature flag control</div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        toggleDevFeature('options_trading_enabled', !config.options_trading_enabled)
                      }
                      className={`px-2 py-1 rounded font-mono text-[11px] font-bold cursor-pointer transition-colors ${
                        config.options_trading_enabled
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {config.options_trading_enabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>

                  {/* Tenant Freeze */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                    <div>
                      <div className="font-semibold text-slate-200">Tenant Freeze</div>
                      <div className="text-[10px] text-slate-400">Suspend entire tenant desk</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleDevFeature('tenant_frozen', !status.tenant_frozen)}
                      className={`px-2 py-1 rounded font-mono text-[11px] font-bold cursor-pointer transition-colors ${
                        status.tenant_frozen
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {status.tenant_frozen ? 'FROZEN' : 'ACTIVE'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
