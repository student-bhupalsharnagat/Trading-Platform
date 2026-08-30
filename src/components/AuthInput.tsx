import React, { InputHTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';

interface AuthInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
  isMobileField?: boolean;
  countryCode?: string;
  onCountryCodeChange?: (code: string) => void;
}

export const AuthInput: React.FC<AuthInputProps> = ({
  id,
  label,
  error,
  helperText,
  isMobileField,
  countryCode = '+91',
  onCountryCodeChange,
  className = '',
  ...props
}) => {
  const inputId = id || `input-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className="w-full flex flex-col space-y-1.5 mb-4">
      <div className="flex justify-between items-center">
        <label
          htmlFor={inputId}
          className="text-xs font-semibold text-slate-300 tracking-wide"
        >
          {label}
        </label>
      </div>

      <div className="relative flex items-center">
        {isMobileField && (
          <div className="flex items-center pl-3 pr-2 py-2.5 bg-[#080E18] border border-r-0 border-[#1B273A] rounded-l-xl text-xs font-medium text-slate-300 select-none">
            <span>{countryCode}</span>
          </div>
        )}

        <input
          id={inputId}
          className={`w-full bg-[#080E18] border ${
            error
              ? 'border-rose-500/70 focus:border-rose-500 focus:ring-rose-500/20'
              : 'border-[#1B273A] focus:border-orange-500 focus:ring-orange-500/20'
          } ${
            isMobileField ? 'rounded-r-xl' : 'rounded-xl'
          } px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500/80 outline-none transition-all duration-150 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
          {...props}
        />
      </div>

      {helperText && !error && (
        <p className="text-[11px] text-slate-400 pl-0.5 leading-tight">{helperText}</p>
      )}

      {error && (
        <div className="flex items-center gap-1 text-rose-400 text-xs pl-0.5 mt-0.5 animate-fadeIn">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
