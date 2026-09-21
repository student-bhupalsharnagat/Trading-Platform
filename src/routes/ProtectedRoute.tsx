import React, { ReactNode, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.ts';

interface ProtectedRouteProps {
  children: ReactNode;
  onRedirectToLogin: () => void;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  onRedirectToLogin,
}) => {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      onRedirectToLogin();
    }
  }, [loading, user, onRedirectToLogin]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060B13] flex flex-col items-center justify-center text-slate-100">
        <div className="w-12 h-12 rounded-2xl bg-[#0F1726] border border-orange-500/40 flex items-center justify-center shadow-lg shadow-orange-950/30 animate-pulse mb-3">
          <div className="w-4 h-4 border-2 border-orange-400 rotate-45 rounded-xs" />
        </div>
        <span className="text-xs text-orange-400 font-mono tracking-widest font-bold">
          VERTEX SECURE
        </span>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
};

