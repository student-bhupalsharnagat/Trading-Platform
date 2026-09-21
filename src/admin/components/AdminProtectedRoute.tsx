import React from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { UserRole } from '../types/adminTypes.ts';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

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
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070a12] flex items-center justify-center text-slate-400 text-xs">
        Verifying administration privileges...
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-[#070a12] flex items-center justify-center p-4">
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 max-w-md w-full text-center">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-100 mb-1">Administrative Sign-In Required</h2>
          <p className="text-xs text-slate-400 mb-5">
            You must be logged into an authorized franchise or administrative account to view the commercial administration desk.
          </p>
          <button
            onClick={onBackToTrading}
            className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
          >
            Go to Trading Login
          </button>
        </div>
      </div>
    );
  }

  const userRole = (user.role || 'CLIENT') as UserRole;

  if (!allowedRoles.includes(userRole)) {
    return (
      <div className="min-h-screen bg-[#070a12] flex items-center justify-center p-4">
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 max-w-md w-full text-center">
          <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-100 mb-1">Restricted Access</h2>
          <p className="text-xs text-slate-400 mb-2">
            Your current account role (<span className="text-amber-400 font-semibold">{userRole}</span>) does not have clearance to view this administrative desk.
          </p>
          <p className="text-xs text-slate-500 mb-5">
            Trader accounts access live markets and client features directly via the trading dashboard.
          </p>
          <button
            onClick={onBackToTrading}
            className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Trading Terminal</span>
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
