export type UserRole = 'SUPER_ADMIN' | 'MASTER' | 'BROKER' | 'SUB_BROKER' | 'CLIENT';

export type EntityStatus = 'active' | 'suspended' | 'deactivated' | 'demo';

export interface HierarchyNode {
  id: string;
  userId: string;
  fullName: string;
  email?: string;
  mobile: string;
  countryCode: string;
  role: UserRole;
  parentId?: string | null;
  parentName?: string;
  hierarchyPath: string; // e.g. "root.master1.broker2"
  status: EntityStatus;
  company?: string;
  address?: string;
  commissionRate?: number;
  balance?: number;
  brokersCount?: number;
  subBrokersCount?: number;
  clientsCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDashboardKPIs {
  totalMasters: number;
  totalBrokers: number;
  totalSubBrokers: number;
  totalClients: number;
  activeClients: number;
  commissionEarned: number;
  todayTurnover: number;
  totalPnL: number;
  pendingKyc: number;
  openTickets: number;
  tradingVolume: number;
}

export interface ChartDataPoint {
  date: string;
  volume: number;
  commission: number;
  clients: number;
  pnl: number;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  module: string;
  targetId: string;
  targetName?: string;
  targetRole?: UserRole;
  oldValue?: string | Record<string, unknown>;
  newValue?: string | Record<string, unknown>;
  ipAddress?: string;
  timestamp: string;
}

export interface CreateEntityPayload {
  fullName: string;
  username?: string;
  email?: string;
  mobile: string;
  countryCode?: string;
  password?: string;
  company?: string;
  address?: string;
  parentId?: string;
  commissionRate?: number;
  status?: EntityStatus;
}
