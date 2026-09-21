import React, { ReactNode } from 'react';
import { useTenant } from '../context/TenantContext.tsx';

interface AuthCardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export const AuthCard: React.FC<AuthCardProps> = ({
  title,
  subtitle,
  children,
  footer,
}) => {
  const { branding } = useTenant();

  return (
    <div className="min-h-screen bg-[#060B13] flex flex-col items-center justify-center px-4 py-10 relative overflow-hidden">
      {/* Subtle background ambient glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-orange-600/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -top-10 right-10 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Main Form Container */}
      <div
        id="vertex-auth-card"
        className="w-full max-w-[440px] z-10 flex flex-col items-center"
      >
        {/* Brand Header with Dynamic Icon or Logo */}
        <div className="flex flex-col items-center mb-6 text-center">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={branding.brandName}
              className="h-12 w-auto object-contain mb-3.5"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="w-13 h-13 rounded-2xl bg-[#0F1726] border flex items-center justify-center shadow-lg mb-3.5 transition-transform hover:scale-105 duration-200"
              style={{
                borderColor: `${branding.primaryColor || '#F59E0B'}40`,
                boxShadow: `0 10px 25px -5px ${branding.primaryColor || '#F59E0B'}20`,
              }}
            >
              {/* Diamond Geometry Icon */}
              <div
                className="w-5 h-5 border-2 rotate-45 rounded-sm flex items-center justify-center"
                style={{ borderColor: branding.primaryColor || '#F59E0B' }}
              >
                <div
                  className="w-1.5 h-1.5 rounded-xs"
                  style={{ backgroundColor: branding.primaryColor || '#F59E0B' }}
                />
              </div>
            </div>
          )}

          <h1
            className="text-2xl font-extrabold tracking-[0.2em] font-mono"
            style={{ color: branding.primaryColor || '#FF7A00' }}
          >
            {branding.brandName || 'VERTEX'}
          </h1>
          <p className="text-xs text-[#8A99AD] italic mt-1 font-medium">
            {branding.tagline || 'Trade smarter. Move faster.'}
          </p>

          {title && (
            <h2 className="text-lg font-semibold text-slate-100 mt-4 tracking-tight">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {/* Card Body */}
        <div className="w-full bg-[#0B111C]/90 border border-[#1A2638] rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm">
          {children}
        </div>

        {/* Card Footer */}
        {footer && <div className="mt-6 text-center text-xs text-slate-400">{footer}</div>}
      </div>
    </div>
  );
};
