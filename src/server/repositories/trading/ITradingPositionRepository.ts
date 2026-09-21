import { DbClient } from '../../db/postgres.ts';

export interface TradingPosition {
  id: string;
  tenant_id: string;
  user_id: string;
  instrument_id: string;
  quantity: number;
  average_price: number;
  realized_pnl: number;
  unrealized_pnl: number;
  margin_used: number;
  updated_at: string;
}

export interface ITradingPositionRepository {
  getPositions(tenantId: string, userId?: string, client?: DbClient): Promise<TradingPosition[]>;
  findPosition(tenantId: string, userId: string, instrumentId: string, client?: DbClient): Promise<TradingPosition | null>;
  lockPositionForUpdate(tenantId: string, userId: string, instrumentId: string, client: DbClient): Promise<TradingPosition | null>;
  upsertPosition(position: Omit<TradingPosition, 'updated_at'>, client?: DbClient): Promise<TradingPosition>;
  deletePosition(tenantId: string, id: string, client?: DbClient): Promise<boolean>;
}
