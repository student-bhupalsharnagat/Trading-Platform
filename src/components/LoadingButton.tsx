import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  children: ReactNode;
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  loading = false,
  loadingText,
  variant = 'primary',
  disabled,
  children,
  className = '',
  ...props
}) => {
  const baseClasses =
    'relative w-full py-3 px-6 rounded-xl font-semibold text-sm tracking-wide transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed select-none';

  let variantClasses = '';
  switch (variant) {
    case 'primary':
      variantClasses =
        'bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 hover:from-amber-400 hover:via-orange-500 hover:to-orange-500 text-white shadow-lg shadow-orange-600/25 hover:shadow-orange-500/40 active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 disabled:shadow-none';
      break;
    case 'secondary':
      variantClasses =
        'bg-[#080E18] hover:bg-[#0E1626] border border-[#1E293B] hover:border-slate-700 text-slate-200 active:scale-[0.99] disabled:opacity-50';
      break;
    case 'ghost':
      variantClasses =
        'bg-transparent hover:bg-slate-800/50 text-slate-300 hover:text-white disabled:opacity-50';
      break;
    case 'danger':
      variantClasses =
        'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 active:scale-[0.99] disabled:opacity-50';
      break;
  }

  return (
    <button
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin shrink-0 text-white" />
          <span>{loadingText || 'Please wait...'}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};
