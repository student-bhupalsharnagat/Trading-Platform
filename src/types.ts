export interface User {
  id: string;
  fullName: string;
  userId: string;
  countryCode: string;
  mobile: string;
  isVerified: boolean;
  status: 'active' | 'suspended' | 'demo';
  referralCode?: string;
  createdAt: string;
  lastLoginAt?: string;
  demoBalance?: number;
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
  type: 'success' | 'error' | 'info' | 'otp';
  title: string;
  description?: string;
  otpCode?: string;
  duration?: number;
}

export interface Instrument {
  id: string;
  symbol: string;
  category: 'ALL' | 'CRYPTO' | 'EQUITY' | 'FOREX' | 'COMMODITY' | 'INDEX';
  expiry: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  intraday: number;
  holding: number;
  sparkline: number[];
  trend: 'up' | 'down';
}

export interface PortfolioData {
  wallet: {
    availableBalance: number;
    usedMargin: number;
    totalPnL: number;
    todayPnL: number;
  };
  positions: Array<{
    symbol: string;
    type: 'BUY' | 'SELL';
    qty: number;
    avgPrice: number;
    ltp: number;
    pnl: number;
    pnlPercent: number;
  }>;
  orders: Array<{
    id: string;
    symbol: string;
    type: 'BUY' | 'SELL';
    qty: number;
    price: number;
    status: string;
    time: string;
  }>;
}
