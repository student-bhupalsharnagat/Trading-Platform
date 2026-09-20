import { DbClient } from '../../db/postgres.ts';

export interface TradingTrade {
  id: string;
  tenant_id: string;
  order_id: string;
  user_id: string;
  instrument_id: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  execution_price: number;
  execution_value: number;
  realized_pnl: number;
  executed_at: string;
  created_at: string;
}

export interface ITradingTradeRepository {
  create(trade: Omit<TradingTrade, 'created_at'>, client?: DbClient): Promise<TradingTrade>;
  findById(tenantId: string, id: string, client?: DbClient): Promise<TradingTrade | null>;
  getTrades(tenantId: string, userId?: string, client?: DbClient): Promise<TradingTrade[]>;
  getTradesByOrder(tenantId: string, orderId: string, client?: DbClient): Promise<TradingTrade[]>;
}
