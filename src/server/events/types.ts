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
  | 'deposit.created'
  | 'deposit.updated'
  | 'deposit.approved'
  | 'deposit.rejected'
  | 'withdrawal.created'
  | 'withdrawal.updated'
  | 'withdrawal.approved'
  | 'withdrawal.rejected'
  | 'fund.transaction_updated'
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

export interface ClientRegisteredPayload {
  tenantId: string;
  masterId?: string | null;
  brokerId?: string | null;
  subBrokerId?: string | null;
  master_id?: string | null;
  broker_id?: string | null;
  sub_broker_id?: string | null;
  tradingUserId: string;
  userId: string;
  clientId?: string;
  clientCode: string;
  name: string;
  fullName?: string;
  email?: string;
  phone: string;
  status: string;
  kycStatus?: string;
  accountStatus?: string;
  createdAt: string;
}

export interface BrokerAddedPayload {
  tenantId: string;
  masterId?: string | null;
  brokerId?: string | null;
  subBrokerId?: string | null;
  master_id?: string | null;
  broker_id?: string | null;
  sub_broker_id?: string | null;
  userId: string;
  id: string;
  name: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: 'MASTER' | 'BROKER' | 'SUB_BROKER' | string;
  parentId?: string | null;
  status: string;
  commissionRate?: number;
  createdAt: string;
}

export interface ClientActivatedPayload {
  tenantId: string;
  masterId?: string | null;
  brokerId?: string | null;
  subBrokerId?: string | null;
  master_id?: string | null;
  broker_id?: string | null;
  sub_broker_id?: string | null;
  tradingUserId: string;
  userId: string;
  clientId: string;
  clientCode: string;
  name: string;
  fullName?: string;
  email?: string;
  phone: string;
  status: string;
  kycStatus?: string;
  accountStatus?: string;
  createdAt: string;
}

export interface TradeExecutedPayload {
  tenantId?: string;
  masterId?: string | null;
  brokerId?: string | null;
  subBrokerId?: string | null;
  master_id?: string | null;
  broker_id?: string | null;
  sub_broker_id?: string | null;
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
  depositId?: string;
  transactionId: string;
  clientCode?: string;
  tenantId: string;
  masterId?: string | null;
  brokerId?: string | null;
  subBrokerId?: string | null;
  master_id?: string | null;
  broker_id?: string | null;
  sub_broker_id?: string | null;
  userId: string;
  clientId: string;
  tradingUserId: string;
  userName?: string;
  amount: number;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  action?: 'REQUESTED' | 'APPROVED' | 'REJECTED' | string;
  method?: string;
  paymentMethod?: string;
  reference?: string;
  referenceId?: string;
  balanceBefore?: number;
  balanceAfter?: number;
  approvedBy?: string;
  rejectedBy?: string;
  reason?: string;
  createdAt?: string;
  timestamp: string;
  utr?: string;
  utr_number?: string;
  payment_method?: string;
  proof_image_url?: string | null;
}

export interface LedgerUpdatedPayload {
  id?: string;
  ledgerId?: string;
  tenantId: string;
  masterId?: string | null;
  brokerId?: string | null;
  subBrokerId?: string | null;
  master_id?: string | null;
  broker_id?: string | null;
  sub_broker_id?: string | null;
  userId: string;
  clientId?: string;
  tradingUserId?: string;
  transactionId?: string;
  type: 'CREDIT' | 'DEBIT';
  category: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  balance_before?: number;
  balance_after?: number;
  reference?: string;
  createdAt?: string;
  timestamp?: string;
}

export interface RiskAlertTriggeredPayload {
  alertId?: string;
  tenantId: string;
  masterId?: string | null;
  brokerId?: string | null;
  subBrokerId?: string | null;
  master_id?: string | null;
  broker_id?: string | null;
  sub_broker_id?: string | null;
  userId: string;
  clientId?: string;
  tradingUserId?: string;
  alertType: 'MARGIN_SHORTFALL' | 'BLOCKED_ORDER' | 'LIMIT_BREACH' | 'ORDER_EXECUTION_FAILURE' | string;
  type?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  requiredMargin?: number;
  availableMargin?: number;
  shortfall?: number;
  exposure?: number;
  usedMargin?: number;
  orderId?: string;
  symbol?: string;
  details?: any;
  timestamp?: string;
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
