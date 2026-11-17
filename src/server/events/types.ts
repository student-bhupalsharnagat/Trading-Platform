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
  | 'broker.added'
  | 'kyc.submitted'
  | 'support.ticket_created'
  | 'support.ticket_updated'
  | 'trade.executed'
  | 'ledger.updated'
  | 'position.updated'
  | 'wallet.updated'
  | 'fund.transaction_updated'
  | 'deposit.created'
  | 'deposit.updated'
  | 'deposit.approved'
  | 'deposit.rejected'
  | 'withdrawal.created'
  | 'withdrawal.updated'
  | 'withdrawal.approved'
  | 'withdrawal.rejected'
  | 'risk.margin_breach'
  | 'risk.alert_triggered'
  | 'execution.failure'
  | 'emergency.control_activated'
  | 'reconciliation.mismatch'
  | 'manual_deposit.created'
  | 'manual_deposit.approved'
  | 'manual_deposit.rejected'
  | string;

export interface InternalEvent<T = any> {
  eventId: string;
  eventType: InternalEventType;
  tenantId: string;
  timestamp: string;
  version: number;
  payload: T;
}

export interface HierarchyScopeFields {
  masterId?: string | null;
  brokerId?: string | null;
  subBrokerId?: string | null;
}

export interface ClientRegisteredPayload extends HierarchyScopeFields {
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

export interface BrokerAddedPayload extends HierarchyScopeFields {
  tenantId: string;
  id: string;
  userId: string;
  name: string;
  fullName?: string;
  email?: string;
  phone?: string;
  role: 'MASTER' | 'BROKER' | 'SUB_BROKER';
  type: 'master' | 'broker' | 'sub_broker';
  parentId?: string | null;
  commissionRate?: number;
  status?: string;
  createdAt?: string;
}

export interface ClientActivatedPayload extends HierarchyScopeFields {
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

export interface TradeExecutedPayload extends HierarchyScopeFields {
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
  [key: string]: any;
}

export interface LedgerUpdatedPayload extends HierarchyScopeFields {
  tenantId: string;
  userId: string;
  transactionId?: string;
  entryId?: string;
  type: 'CREDIT' | 'DEBIT';
  category: string;
  amount: number;
  balanceBefore?: number;
  balanceAfter: number;
  usedMargin?: number;
  reference?: string;
  createdBy?: string;
  timestamp?: string;
}

export interface RiskAlertPayload extends HierarchyScopeFields {
  tenantId: string;
  userId: string;
  alertType: 'MARGIN_SHORTFALL' | 'ORDER_BLOCKED' | 'EXECUTION_FAILURE' | 'MARGIN_BREACH';
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  code?: string;
  reason: string;
  symbol?: string;
  side?: 'BUY' | 'SELL';
  orderId?: string;
  requiredMargin?: number;
  usedMargin?: number;
  availableMargin?: number;
  exposure?: number;
  threshold?: number;
  detectedAt?: string;
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

export interface FundTransactionPayload extends HierarchyScopeFields {
  id?: string;
  depositId?: string;
  transactionId: string;
  clientCode?: string;
  tenantId: string;
  userId: string;
  clientId: string;
  tradingUserId: string;
  userName?: string;
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
  utr?: string;
  utr_number?: string;
  payment_method?: string;
  proof_image_url?: string | null;
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

export interface MarginBreachPayload extends HierarchyScopeFields {
  tenantId?: string;
  userId: string;
  usedMargin: number;
  availableMargin: number;
  exposure: number;
  threshold: number;
  detectedAt: string;
}

export interface ExecutionFailurePayload extends HierarchyScopeFields {
  tenantId?: string;
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
