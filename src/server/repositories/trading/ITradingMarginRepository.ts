import { DbClient } from '../../db/postgres.ts';

export interface TradingMarginSnapshot {
  id: string;
  tenant_id: string;
  user_id: string;
  equity: number;
  available_margin: number;
  used_margin: number;
  margin_level: number;
  unrealized_pnl: number;
  created_at: string;
}

export interface ITradingMarginRepository {
  recordSnapshot(snapshot: Omit<TradingMarginSnapshot, 'created_at'>, client?: DbClient): Promise<TradingMarginSnapshot>;
  getLatestSnapshot(tenantId: string, userId: string, client?: DbClient): Promise<TradingMarginSnapshot | null>;
  getSnapshots(tenantId: string, userId: string, limit?: number, client?: DbClient): Promise<TradingMarginSnapshot[]>;
}
