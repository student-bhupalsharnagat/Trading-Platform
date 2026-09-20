import React from 'react';
import {
  LayoutDashboard,
  Crown,
  Briefcase,
  GitBranch,
  Users,
  ShieldCheck,
  Wallet,
  BookOpen,
  LineChart,
  Percent,
  AlertTriangle,
  FileText,
  Bell,
  Headphones,
  CreditCard,
  Building,
  Settings,
  Shield,
  History,
  LogOut,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { HierarchyBadge } from './HierarchyBadge';
import { UserRole } from '../types/adminTypes';

interface AdminSidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  isOpen: boolean;
  onClose?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentPath,
  onNavigate,
  isOpen,
  onClose,
}) => {
  const { user, logout } = useAuth();
  const userRole = (user?.role || 'CLIENT') as UserRole;

  const navSections = [
    {
      title: 'MAIN',
      items: [
        { label: 'Dashboard', path: '/admin/dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
      ],
    },
    {
      title: 'HIERARCHY',
      items: [
        ...(userRole === 'SUPER_ADMIN'
          ? [{ label: 'Masters', path: '/admin/masters', icon: <Crown className="w-4 h-4 text-purple-400" /> }]
          : []),
        ...(['SUPER_ADMIN', 'MASTER'].includes(userRole)
          ? [{ label: 'Brokers', path: '/admin/brokers', icon: <Briefcase className="w-4 h-4 text-blue-400" /> }]
          : []),
        ...(['SUPER_ADMIN', 'MASTER', 'BROKER'].includes(userRole)
          ? [{ label: 'Sub-Brokers', path: '/admin/sub-brokers', icon: <GitBranch className="w-4 h-4 text-amber-400" /> }]
          : []),
        { label: 'Clients', path: '/admin/clients', icon: <Users className="w-4 h-4 text-emerald-400" /> },
      ],
    },
    {
      title: 'COMPLIANCE',
      items: [
        { label: 'KYC Verification', path: '/admin/kyc', icon: <ShieldCheck className="w-4 h-4" /> },
        { label: 'Funds Approval', path: '/admin/funds', icon: <Wallet className="w-4 h-4" /> },
        { label: 'Financial Ledger', path: '/admin/ledger', icon: <BookOpen className="w-4 h-4" /> },
      ],
    },
    {
      title: 'TRADING',
      items: [
        { label: 'Orders & Trades', path: '/admin/orders', icon: <LineChart className="w-4 h-4" /> },
        { label: 'Commission Matrix', path: '/admin/commission', icon: <Percent className="w-4 h-4" /> },
        { label: 'Risk & Limits', path: '/admin/risk', icon: <AlertTriangle className="w-4 h-4" /> },
      ],
    },
    {
      title: 'TOOLS',
      items: [
        { label: 'Reports & P&L', path: '/admin/reports', icon: <FileText className="w-4 h-4" /> },
        { label: 'Notifications', path: '/admin/notifications', icon: <Bell className="w-4 h-4" /> },
        { label: 'Support Desk', path: '/admin/support', icon: <Headphones className="w-4 h-4" /> },
      ],
    },
    {
      title: 'ADMIN',
      items: [
        { label: 'Subscriptions', path: '/admin/subscriptions', icon: <CreditCard className="w-4 h-4" /> },
        { label: 'White Label', path: '/admin/white-label', icon: <Building className="w-4 h-4" /> },
        { label: 'Settings', path: '/admin/settings', icon: <Settings className="w-4 h-4" /> },
        { label: 'Audit Logs', path: '/admin/audit-logs', icon: <History className="w-4 h-4" /> },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-xs"
          onClick={onClose}
        />
      )}

      <aside
        id="admin-sidebar"
        className={`fixed top-0 left-0 bottom-0 z-50 w-64 bg-[#090d16] border-r border-slate-800/80 flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 border-b border-slate-800/80 px-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20">
              V
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-100 tracking-tight">VERTEX</span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  ADMIN
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Commercial Trading Desk</p>
            </div>
          </div>
        </div>

        {/* Current Node Badge */}
        <div className="p-3.5 mx-3 my-2.5 rounded-lg bg-slate-900/90 border border-slate-800/80">
          <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 mb-1">
            Active Identity
          </div>
          <div className="flex items-center justify-between">
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-200 truncate">{user?.fullName || 'Admin'}</p>
              <p className="text-[10px] text-slate-400 truncate">ID: {user?.userId}</p>
            </div>
            <HierarchyBadge role={userRole} size="sm" />
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-5 scrollbar-thin">
          {navSections.map((section, idx) => (
            <div key={idx}>
              <div className="px-3 mb-1.5 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                {section.title}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = currentPath === item.path || currentPath.startsWith(`${item.path}/`);
                  return (
                    <button
                      key={item.path}
                      onClick={() => {
                        onNavigate(item.path);
                        if (onClose) onClose();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-blue-600/15 text-blue-400 font-semibold border border-blue-500/30'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={isActive ? 'text-blue-400' : 'text-slate-400'}>{item.icon}</span>
                        <span>{item.label}</span>
                      </div>
                      {isActive && <ChevronRight className="w-3.5 h-3.5 text-blue-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer with Return to Trading & Logout */}
        <div className="p-3 border-t border-slate-800/80 space-y-1 bg-[#070a12]">
          <button
            onClick={() => onNavigate('/dashboard')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 transition-colors border border-emerald-500/20"
          >
            <TrendingUp className="w-4 h-4" />
            <span>Open Trading Terminal</span>
          </button>

          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};
