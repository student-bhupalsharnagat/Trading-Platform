import React, { useState, InputHTMLAttributes } from 'react';
import { Eye, EyeOff, AlertCircle, Check, X } from 'lucide-react';

interface PasswordInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
  showStrengthMeter?: boolean;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  id,
  label,
  error,
  helperText,
  showStrengthMeter = false,
  value,
  onChange,
  className = '',
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const inputId = id || `input-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const passwordStr = String(value || '');

  // Calculate Password Strength
  const checks = {
    length: passwordStr.length >= 8,
    upper: /[A-Z]/.test(passwordStr),
    lower: /[a-z]/.test(passwordStr),
    number: /[0-9]/.test(passwordStr),
    special: /[^A-Za-z0-9]/.test(passwordStr),
  };

  const passedCount = Object.values(checks).filter(Boolean).length;
  let strengthLabel = 'Weak';
  let strengthColor = 'bg-rose-500';
  let strengthWidth = 'w-1/4';
  let strengthTextColor = 'text-rose-400';

  if (passedCount >= 5) {
    strengthLabel = 'Strong';
    strengthColor = 'bg-emerald-500';
    strengthWidth = 'w-full';
    strengthTextColor = 'text-emerald-400';
  } else if (passedCount >= 3) {
    strengthLabel = 'Medium';
    strengthColor = 'bg-amber-500';
    strengthWidth = 'w-2/3';
    strengthTextColor = 'text-amber-400';
  } else if (passedCount > 0) {
    strengthLabel = 'Weak';
    strengthColor = 'bg-rose-500';
    strengthWidth = 'w-1/3';
    strengthTextColor = 'text-rose-400';
  }

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
        <input
          id={inputId}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          className={`w-full bg-[#080E18] border ${
            error
              ? 'border-rose-500/70 focus:border-rose-500 focus:ring-rose-500/20'
              : 'border-[#1B273A] focus:border-orange-500 focus:ring-orange-500/20'
          } rounded-xl px-3.5 py-2.5 pr-10 text-sm text-slate-100 placeholder-slate-500/80 outline-none transition-all duration-150 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
          {...props}
        />

        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 text-slate-400 hover:text-slate-200 transition-colors p-1 cursor-pointer"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? (
            <EyeOff className="w-4 h-4 text-slate-400" />
          ) : (
            <Eye className="w-4 h-4 text-slate-400" />
          )}
        </button>
      </div>

      {showStrengthMeter && passwordStr.length > 0 && (
        <div className="mt-1 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Password Strength:</span>
            <span className={`font-semibold ${strengthTextColor}`}>{strengthLabel}</span>
          </div>
          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${strengthColor} ${strengthWidth} transition-all duration-300 rounded-full`}
            />
          </div>

          <div className="grid grid-cols-2 gap-1 pt-1 text-[10px] text-slate-400">
            <span className={`flex items-center gap-1 ${checks.length ? 'text-emerald-400' : ''}`}>
              {checks.length ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} 8+ Characters
            </span>
            <span className={`flex items-center gap-1 ${checks.upper ? 'text-emerald-400' : ''}`}>
              {checks.upper ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} Uppercase (A-Z)
            </span>
            <span className={`flex items-center gap-1 ${checks.lower ? 'text-emerald-400' : ''}`}>
              {checks.lower ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} Lowercase (a-z)
            </span>
            <span className={`flex items-center gap-1 ${checks.number && checks.special ? 'text-emerald-400' : ''}`}>
              {checks.number && checks.special ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} Number & Symbol
            </span>
          </div>
        </div>
      )}

      {helperText && !error && !showStrengthMeter && (
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
