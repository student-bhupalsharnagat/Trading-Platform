export * from './types/tenant.ts';

export type UserRole = 'SUPER_ADMIN' | 'MASTER' | 'BROKER' | 'SUB_BROKER' | 'CLIENT';

export interface User {
  id: string;
  fullName: string;
  userId: string;
  countryCode: string;
  mobile: string;
  email?: string;
  role?: UserRole;
  parentId?: string | null;
  hierarchyPath?: string;
  company?: string;
  isVerified: boolean;
  status: 'active' | 'suspended' | 'demo' | 'deactivated';
  referralCode?: string;
  createdAt: string;
  lastLoginAt?: string;
  demoBalance?: number;
  kycStatus?: 'verified' | 'pending' | 'rejected';
  segments?: string[];
  panNumber?: string;
  bankAccount?: {
    bankName: string;
    accountNumber: string;
    ifsc: string;
  };
  tenantId?: string;
  isFrozen?: boolean;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: User;
  token?: string;
  userId?: string;
  maskedMobile?: string;
  expiresAt?: string;
  devOtp?: string;
  errors?: Record<string, string>;
  requiresVerification?: boolean;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info' | 'otp';
  title: string;
  description?: string;
  otpCode?: string;
  duration?: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Instrument {
  id: string;
  symbol: string;
  name?: string;
  sectionName?: string;
  category: 'ALL' | 'CRYPTO' | 'EQUITY' | 'FOREX' | 'COMMODITY' | 'INDEX' | 'OPTIONS';
  expiry: string;
  lastPrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  prevClose: number;
  change: number;
  changePercent: number;
  intraday: number;
  holding: number;
  lotSize: number;
  maxLots: number;
  ask: number;
  bid: number;
  sparkline: number[];
  trend: 'up' | 'down';
  candles?: Candle[];
}

export interface Position {
  id: string;
  symbol: string;
  category?: string;
  type: 'BUY' | 'SELL';
  product: 'INTRADAY' | 'HOLDING';
  qty: number;
  lots: number;
  lotSize: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
  pnlPercent: number;
  timestamp: string;
  userId?: string;
  tenantId?: string;
}

export interface Order {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  product: 'INTRADAY' | 'HOLDING';
  qty: number;
  lots: number;
  lotSize: number;
  price: number;
  triggerPrice?: number;
  stopLoss?: number;
  target?: number;
  status: 'EXECUTED' | 'PENDING' | 'CANCELLED' | 'REJECTED';
  time: string;
  date: string;
  userId?: string;
  tenantId?: string;
}

export interface WalletFunds {
  availableBalance: number;
  usedMargin: number;
  totalPnL: number;
  todayPnL: number;
  deposited: number;
  withdrawn: number;
}

export interface PortfolioData {
  wallet: WalletFunds;
  positions: Position[];
  orders: Order[];
}

export interface TicketMessage {
  id?: string;
  sender: 'user' | 'support';
  senderName?: string;
  text: string;
  time: string;
  timestamp?: string;
  attachmentUrl?: string;
  attachmentName?: string;
}

export type TicketCategory =
  | 'Account & Login'
  | 'Trading Issues'
  | 'Payment & Withdrawal'
  | 'Technical Support'
  | 'General Enquiry'
  | 'KYC & Documents'
  | 'Billing'
  | 'Technical'
  | 'Trading'
  | 'KYC'
  | 'General';

export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'Open' | 'In Progress' | 'Resolved';

export interface SupportTicket {
  id: string;
  subject: string;
  category: TicketCategory;
  priority?: TicketPriority;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: string;
  updatedAt?: string;
  rating?: number;
  feedback?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  messages: TicketMessage[];
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'ORDER' | 'PRICE_ALERT' | 'MARGIN' | 'SYSTEM';
  time: string;
  read: boolean;
}
