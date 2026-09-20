import React from 'react';
import { UserRole } from '../types/adminTypes';

interface HierarchyBadgeProps {
  role: UserRole;
  size?: 'sm' | 'md';
}

export const HierarchyBadge: React.FC<HierarchyBadgeProps> = ({ role, size = 'md' }) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  switch (role) {
    case 'SUPER_ADMIN':
      return (
        <span className={`inline-flex items-center font-semibold rounded-full bg-purple-900/60 text-purple-200 border border-purple-700/60 ${sizeClasses}`}>
          SUPER ADMIN
        </span>
      );
    case 'MASTER':
      return (
        <span className={`inline-flex items-center font-semibold rounded-full bg-blue-900/60 text-blue-200 border border-blue-700/60 ${sizeClasses}`}>
          MASTER
        </span>
      );
    case 'BROKER':
      return (
        <span className={`inline-flex items-center font-semibold rounded-full bg-cyan-900/60 text-cyan-200 border border-cyan-700/60 ${sizeClasses}`}>
          BROKER
        </span>
      );
    case 'SUB_BROKER':
      return (
        <span className={`inline-flex items-center font-semibold rounded-full bg-amber-900/60 text-amber-200 border border-amber-700/60 ${sizeClasses}`}>
          SUB-BROKER
        </span>
      );
    case 'CLIENT':
    default:
      return (
        <span className={`inline-flex items-center font-semibold rounded-full bg-slate-800 text-slate-300 border border-slate-700 ${sizeClasses}`}>
          CLIENT
        </span>
      );
  }
};
