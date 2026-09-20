import React from 'react';
import { Menu, Bell, Search, ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { HierarchyBadge } from './HierarchyBadge';
import { UserRole } from '../types/adminTypes';

interface AdminHeaderProps {
  onToggleSidebar: () => void;
  title: string;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({ onToggleSidebar, title }) => {
  const { user } = useAuth();
  const userRole = (user?.role || 'CLIENT') as UserRole;

  return (
    <header className="h-16 bg-[#090d16] border-b border-slate-800/80 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-slate-100 tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {/* Quick Search */}
        <div className="relative hidden md:block w-64">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search hierarchy, accounts..."
            className="w-full pl-9 pr-3 py-1.5 bg-[#0f172a] border border-slate-700/70 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Hierarchy Badge */}
        <div className="hidden sm:block">
          <HierarchyBadge role={userRole} />
        </div>

        {/* Notifications */}
        <button className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 relative">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500" />
        </button>

        {/* User Mini Card */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-slate-800">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-xs">
            {user?.fullName?.charAt(0) || 'A'}
          </div>
          <div className="hidden md:block text-left">
            <p className="text-xs font-semibold text-slate-200 leading-tight">{user?.fullName}</p>
            <p className="text-[10px] text-slate-400">{user?.userId}</p>
          </div>
        </div>
      </div>
    </header>
  );
};
