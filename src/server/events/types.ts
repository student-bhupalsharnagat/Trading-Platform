/**
 * Internal Asynchronous Event Types & Definitions
 *
 * Constraints:
 * - Never include passwords, JWTs, cookies, HMAC secrets, or private credentials.
 * - Tenant-scoped structure.
 */

export type InternalEventType =
  | 'trade.executed'
  | 'risk.margin_breach'
  | 'execution.failure'
  | 'emergency.control_activated'
  | 'reconciliation.mismatch'
  | string;

export interface InternalEvent<T = any> {
  eventId: string;
  eventType: InternalEventType;
  tenantId: string;
  timestamp: string;
  version: number;
  payload: T;
}

export interface TradeExecutedPayload {
  orderId: string;
  userId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  executionPrice: number;
  executedAt: string;
}

export interface MarginBreachPayload {
  userId: string;
  usedMargin: number;
  availableMargin: number;
  exposure: number;
  threshold: number;
  detectedAt: string;
}

export interface ExecutionFailurePayload {
  orderId: string;
  userId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  reason: string;
  failedAt: string;
}

export interface EmergencyControlPayload {
  action: string;
  scope: string;
  targetId?: string;
  reason?: string;
  triggeredAt: string;
}

export interface ReconciliationMismatchPayload {
  tenantId: string;
  mismatchType: string;
  discrepancyDetails: Record<string, any>;
  detectedAt: string;
}
