import { jsonUserRepository } from '../repositories/JsonUserRepository.ts';
import { jsonHierarchyRepository } from '../repositories/JsonHierarchyRepository.ts';
import { postgresTradeRepository } from '../repositories/trading/PostgresTradeRepository.ts';
import { postgresPositionRepository } from '../repositories/trading/PostgresPositionRepository.ts';
import type { UserRecord } from '../db/database.ts';
import type { AdminDashboardKPIs } from '../../admin/types/adminTypes.ts';

export class AdminDashboardService {
  public async getKPIs(caller: UserRecord): Promise<AdminDashboardKPIs> {
    const callerPath = caller.hierarchy_path || 'root';
    const tenantId = caller.tenant_id || 'vertex-default';
    const descendants = await jsonHierarchyRepository.getDescendants(callerPath);

    const totalMasters = descendants.filter((d) => d.role === 'MASTER').length;
    const totalBrokers = descendants.filter((d) => d.role === 'BROKER').length;
    const totalSubBrokers = descendants.filter((d) => d.role === 'SUB_BROKER').length;
    const clients = descendants.filter((d) => d.role === 'CLIENT');
    const totalClients = clients.length;
    const activeClients = clients.filter((c) => c.status === 'active' || c.status === 'ACTIVE').length;

    // Derived from actual database trade and position records
    const pgTrades = await postgresTradeRepository.getTrades(tenantId);
    const pgPositions = await postgresPositionRepository.getPositions(tenantId);

    const todayStr = new Date().toISOString().split('T')[0];
    const todayTrades = pgTrades.filter((t) => (t.executed_at || '').startsWith(todayStr));
    const todayTurnover = todayTrades.reduce((sum, t) => sum + Number(t.execution_value || 0), 0);
    const tradingVolume = pgTrades.reduce((sum, t) => sum + Number(t.execution_value || 0), 0);
    const totalPnL = pgPositions.reduce((sum, p) => sum + Number(p.realized_pnl || 0) + Number(p.unrealized_pnl || 0), 0);
    const commissionEarned = pgTrades.reduce((sum, t) => sum + Number((t as any).fees || (t as any).commission || 0), 0);

    const pendingKyc = clients.filter((c) => !c.is_verified || c.status === 'PENDING_EMAIL_VERIFICATION' || c.status === 'PENDING_PHONE_VERIFICATION').length;
    const openTickets = 0;

    return {
      totalMasters,
      totalBrokers,
      totalSubBrokers,
      totalClients,
      activeClients,
      commissionEarned,
      todayTurnover,
      totalPnL,
      pendingKyc,
      openTickets,
      tradingVolume,
    };
  }

  public getChartData() {
    return [];
  }
}

export const adminDashboardService = new AdminDashboardService();
