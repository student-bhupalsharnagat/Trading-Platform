import { DbClient } from '../../db/postgres.ts';

export interface TradingOrder {
  id: string;
  tenant_id: string;
  user_id: string;
  client_order_id?: string | null;
  instrument_id: string;
  side: 'BUY' | 'SELL';
  order_type: string;
  quantity: number;
  price: number;
  trigger_price?: number | null;
  status: 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'REJECTED';
  broker_order_id?: string | null;
  normalized_status?: string | null;
  filled_quantity: number;
  remaining_quantity: number;
  average_fill_price: number;
  time_in_force: string;
  created_at: string;
  updated_at: string;
  cancelled_at?: string | null;
}

export interface ITradingOrderRepository {
  create(order: Omit<TradingOrder, 'created_at' | 'updated_at'>, client?: DbClient): Promise<TradingOrder>;
  findById(tenantId: string, id: string, client?: DbClient): Promise<TradingOrder | null>;
  findByClientOrderId(tenantId: string, userId: string, clientOrderId: string, client?: DbClient): Promise<TradingOrder | null>;
  getOrders(tenantId: string, userId?: string, status?: string, client?: DbClient): Promise<TradingOrder[]>;
  update(tenantId: string, id: string, updates: Partial<TradingOrder>, client?: DbClient): Promise<TradingOrder | null>;
  cancelOrders(tenantId: string, scope: 'TENANT' | 'USER', userId?: string, client?: DbClient): Promise<number>;
}
