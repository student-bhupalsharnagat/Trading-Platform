import React from 'react';
import { CheckCircle2, AlertCircle, Info, KeyRound, X, Copy, Check } from 'lucide-react';
import { ToastMessage } from '../types.ts';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
  onApplyOtp?: (otp: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onDismiss,
  onApplyOtp,
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (toasts.length === 0) return null;

  return (
    <div
      id="vertex-toast-container"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] flex flex-col space-y-2 max-w-md w-[92vw] sm:w-full pointer-events-none items-center"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          id={`toast-${toast.id}`}
          className={`pointer-events-auto w-full rounded-2xl p-4 border shadow-2xl backdrop-blur-xl transition-all duration-300 transform translate-y-0 animate-slideDown ${
            toast.type === 'otp'
              ? 'bg-[#0B1320]/95 border-orange-500/60 text-slate-100 shadow-orange-950/40 ring-1 ring-orange-500/30'
              : toast.type === 'error'
              ? 'bg-[#180B0F]/95 border-rose-500/60 text-rose-100 shadow-rose-950/40 ring-1 ring-rose-500/30'
              : toast.type === 'success'
              ? 'bg-[#061810]/95 border-emerald-500/60 text-emerald-100 shadow-emerald-950/50 ring-1 ring-emerald-500/40'
              : 'bg-[#0E1626]/95 border-slate-700/60 text-slate-100 shadow-black/50 ring-1 ring-slate-700/30'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 shrink-0">
                {toast.type === 'otp' && <KeyRound className="w-5 h-5 text-orange-400 animate-pulse" />}
                {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400" />}
                {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                {toast.type === 'info' && <Info className="w-5 h-5 text-sky-400" />}
              </div>

              <div>
                <h4 className="text-sm font-semibold tracking-tight text-white">{toast.title}</h4>
                {toast.description && (
                  <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{toast.description}</p>
                )}

                {/* Dev OTP Quick Action Banner */}
                {toast.otpCode && (
                  <div className="mt-2.5 p-2 bg-[#060B13] border border-orange-500/30 rounded-lg flex items-center justify-between gap-2">
                    <span className="font-mono text-sm tracking-widest font-bold text-orange-400">
                      {toast.otpCode}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleCopy(toast.id, toast.otpCode!)}
                        className="px-2 py-1 text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        {copiedId === toast.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-slate-400" /> Copy
                          </>
                        )}
                      </button>

                      {onApplyOtp && (
                        <button
                          type="button"
                          onClick={() => onApplyOtp(toast.otpCode!)}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white rounded shadow transition-all cursor-pointer"
                        >
                          Auto Fill
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-slate-200 transition-colors p-0.5 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
