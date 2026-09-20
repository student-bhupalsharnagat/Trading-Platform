/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5G
 * Unified Gateway and Broker/Exchange Architecture Types
 */

export type NormalizedOrderState =
  | 'NEW'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED';

export function isTerminalState(state: NormalizedOrderState): boolean {
  return state === 'FILLED' || state === 'CANCELLED' || state === 'REJECTED';
}

export interface ProviderContext {
  tenantId: string;
  providerId: string;
  environment: 'SANDBOX' | 'SIMULATION' | 'PRODUCTION';
  settings: {
    timeoutMs?: number;
    maxRetries?: number;
    simulatePartialFills?: boolean;
    failProbability?: number;
    [key: string]: any;
  };
  credentials?: {
    keyIdentifier?: string;
    authScheme?: string;
    secret?: string; // Resolved safely server-side, never exposed to clients
  };
}

export interface GatewayPlaceOrderRequest {
  tenantId: string;
  userId: string;
  orderId: string;
  clientOrderId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | string;
  quantity: number;
  price?: number;
  triggerPrice?: number;
  timeInForce?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
}

export interface GatewayCancelOrderRequest {
  tenantId: string;
  userId: string;
  orderId: string;
  brokerOrderId?: string;
  symbol?: string;
  reason?: string;
  correlationId?: string;
}

export interface GatewayModifyOrderRequest {
  tenantId: string;
  userId: string;
  orderId: string;
  brokerOrderId?: string;
  quantity?: number;
  price?: number;
  triggerPrice?: number;
  correlationId?: string;
}

export interface GatewayOrderStatusRequest {
  tenantId: string;
  userId: string;
  orderId: string;
  brokerOrderId?: string;
  correlationId?: string;
}

export interface GatewayOrderResult {
  success: boolean;
  orderId: string;
  brokerOrderId: string;
  status: NormalizedOrderState;
  filledQuantity: number;
  remainingQuantity: number;
  averagePrice: number;
  lastExecutionPrice?: number;
  lastExecutionQuantity?: number;
  rawStatus?: string;
  providerId: string;
  correlationId: string;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
  timestamp: string;
}

export interface MarketQuote {
  symbol: string;
  lastPrice: number;
  bid: number;
  ask: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  timestamp: number;
}

export interface MarketTick {
  symbol: string;
  price: number;
  quantity: number;
  timestamp: number;
  tickType: 'TRADE' | 'BID' | 'ASK';
}

export interface MarketCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
