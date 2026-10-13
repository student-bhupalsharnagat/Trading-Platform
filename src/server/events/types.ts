/**
 * Internal Asynchronous Event Types & Definitions
 *
 * Constraints:
 * - Never include passwords, JWTs, cookies, HMAC secrets, or private credentials.
 * - Tenant-scoped structure.
 */

export type InternalEventType =
  | 'client.registered'
  | 'client.activated'
  | 'kyc.submitted'
  | 'support.ticket_created'
  | 'support.ticket_updated'
  | 'trade.executed'
  | 'position.updated'
  | 'wallet.updated'
  | 'deposit.created'
  | 'deposit.updated'
  | 'deposit.approved'
  | 'deposit.rejected'
  | 'withdrawal.created'
  | 'withdrawal.updated'
  | 'withdrawal.approved'
  | 'withdrawal.rejected'
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

export interface ClientRegisteredPayload {
  tenantId: string;
  tradingUserId: string;
  userId: string;
  clientId?: string;
  clientCode: string;
  name: string;
  email?: string;
  phone: string;
  status: string;
  kycStatus?: string;
  accountStatus?: string;
  createdAt: string;
}

export interface ClientActivatedPayload {
  tenantId: string;
  tradingUserId: string;
  userId: string;
  clientId: string;
  clientCode: string;
  name: string;
  email?: string;
  phone: string;
  status: string;
  kycStatus?: string;
  accountStatus?: string;
  createdAt: string;
}

export interface TradeExecutedPayload {
  tenantId?: string;
  userId: string;
  clientId?: string;
  tradingUserId?: string;
  clientCode?: string;
  clientName?: string;
  orderId: string;
  tradeId?: string;
  symbol: string;
  exchange?: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  qty?: number;
  price?: number;
  executionPrice: number;
  executionValue?: number;
  totalValue?: number;
  turnover?: number;
  fees?: number;
  commission?: number;
  realizedPnl?: number;
  executedAt?: string;
}

export interface PositionUpdatedPayload {
  tenantId: string;
  userId: string;
  clientId: string;
  tradingUserId: string;
  positionId: string;
  symbol: string;
  quantity: number;
  qty?: number;
  averagePrice: number;
  avgPrice?: number;
  buyPrice: number;
  currentPrice: number;
  ltp?: number;
  realizedPnl: number;
  unrealizedPnl: number;
  marginUsed: number;
  status: 'OPEN' | 'CLOSED';
  updatedAt: string;
}

export interface WalletUpdatedPayload {
  tenantId: string;
  userId: string;
  clientId: string;
  tradingUserId: string;
  balance?: number;
  available?: number;
  availableBalance: number;
  blocked?: number;
  blockedBalance: number;
  usedMargin: number;
  realizedPnl: number;
  equity: number;
  updatedAt: string;
}

export interface FundTransactionPayload {
  id?: string;
  transactionId: string;
  clientCode?: string;
  tenantId: string;
  userId: string;
  clientId: string;
  tradingUserId: string;
  amount: number;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  method?: string;
  paymentMethod?: string;
  reference?: string;
  referenceId?: string;
  balanceBefore?: number;
  balanceAfter?: number;
  approvedBy?: string;
  reason?: string;
  createdAt?: string;
  timestamp: string;
}

export interface KycSubmittedPayload {
  tenantId: string;
  userId: string;
  clientCode: string;
  name: string;
  email?: string;
  phone?: string;
  kycStatus: string;
  accountStatus?: string;
  createdAt?: string;
  submittedAt: string;
}

export interface SupportTicketPayload {
  tenantId: string;
  ticketId: string;
  userId: string;
  clientCode?: string;
  subject: string;
  category?: string;
  status: string;
  priority?: string;
  createdAt: string;
  updatedAt: string;
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
