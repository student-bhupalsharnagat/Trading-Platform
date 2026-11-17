import React, { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { UserRole } from '../types/adminTypes.ts';
import { ShieldAlert } from 'lucide-react';

interface AdminProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  onBackToTrading: () => void;
}

export const AdminProtectedRoute: React.FC<AdminProtectedRouteProps> = ({
  children,
  allowedRoles = ['SUPER_ADMIN', 'MASTER', 'BROKER', 'SUB_BROKER'],
  onBackToTrading,
}) => {
  const { user, loading, logout, showToast } = useAuth();
  const isAuth = Boolean(user);
  const userRole = (user?.role || 'CLIENT') as UserRole;
  const isUnauthorizedRole = isAuth && !allowedRoles.includes(userRole);

  useEffect(() => {
    if (!loading) {
      if (!isAuth) {
        onBackToTrading();
      } else if (isUnauthorizedRole) {
        showToast?.({
          type: 'error',
          title: 'Access Denied',
          description: 'Access Denied: Trader Clients cannot access the Admin Portal. Please login via the Trading Platform.',
        });
        logout().finally(() => {
          onBackToTrading();
        });
      }
    }
  }, [loading, isAuth, isUnauthorizedRole, logout, onBackToTrading, showToast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070a12] flex items-center justify-center text-slate-400 text-xs">
        Verifying administration privileges...
      </div>
    );
  }

  if (!isAuth || isUnauthorizedRole) {
    return (
      <div className="min-h-screen bg-[#070a12] flex items-center justify-center p-4">
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 max-w-md w-full text-center">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-100 mb-1">Administrative Sign-In Required</h2>
          <p className="text-xs text-slate-400 mb-5">
            Access Denied: Trader Clients cannot access the Admin Portal. Please login via the Trading Platform.
          </p>
          <button
            onClick={() => {
              logout().finally(() => {
                onBackToTrading();
              });
            }}
            className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
