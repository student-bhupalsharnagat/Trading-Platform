import { DbClient } from '../../db/postgres.ts';

export interface TradingWallet {
  id: string;
  tenant_id: string;
  user_id: string;
  available_balance: number;
  blocked_balance: number;
  used_margin: number;
  realized_pnl: number;
  updated_at: string;
}

export interface ITradingWalletRepository {
  getWallet(tenantId: string, userId: string, client?: DbClient): Promise<TradingWallet | null>;
  getOrCreateWallet(tenantId: string, userId: string, initialBalance?: number, client?: DbClient): Promise<TradingWallet>;
  lockWalletForUpdate(tenantId: string, userId: string, client: DbClient): Promise<TradingWallet>;
  updateWallet(tenantId: string, userId: string, updates: Partial<TradingWallet>, client?: DbClient): Promise<TradingWallet>;
}
