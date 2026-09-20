import { DbClient } from '../../db/postgres.ts';

export interface TradingOrderEvent {
  id: string;
  tenant_id: string;
  order_id: string;
  event_type: string;
  event_payload: any;
  created_at: string;
}

export interface ITradingOrderEventRepository {
  recordEvent(event: Omit<TradingOrderEvent, 'created_at'>, client?: DbClient): Promise<TradingOrderEvent>;
  getEventsByOrder(tenantId: string, orderId: string, client?: DbClient): Promise<TradingOrderEvent[]>;
}
