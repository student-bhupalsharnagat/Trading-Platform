import { AuthResponse, Instrument, PortfolioData, Candle, SupportTicket, AppNotification, Order, Position } from '../types.ts';

async function fetchJson<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    credentials: 'same-origin',
  });

  const data = await response.json();

  if (!response.ok) {
    const error: any = new Error(data.message || 'Request failed');
    error.status = response.status;
    error.data = data;
    error.errors = data.errors;
    error.field = data.field;
    error.requiresVerification = data.requiresVerification;
    error.userId = data.userId;
    throw error;
  }

  return data;
}

export const authApi = {
  // Auth endpoints
  async register(body: {
    fullName: string;
    userId: string;
    countryCode: string;
    mobile: string;
    password: string;
    confirmPassword: string;
    referralCode?: string;
  }): Promise<AuthResponse> {
    return fetchJson<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async verifyOtp(body: {
    userId: string;
    otp: string;
    purpose?: string;
  }): Promise<AuthResponse> {
    return fetchJson<AuthResponse>('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async resendOtp(body: {
    userId: string;
    purpose?: string;
  }): Promise<AuthResponse> {
    return fetchJson<AuthResponse>('/api/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async login(body: { userId: string; password: string }): Promise<AuthResponse> {
    return fetchJson<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async demoLogin(): Promise<AuthResponse> {
    return fetchJson<AuthResponse>('/api/auth/demo', {
      method: 'POST',
    });
  },

  async logout(): Promise<AuthResponse> {
    return fetchJson<AuthResponse>('/api/auth/logout', {
      method: 'POST',
    });
  },

  async getMe(): Promise<AuthResponse> {
    return fetchJson<AuthResponse>('/api/auth/me', {
      method: 'GET',
    });
  },

  async forgotPassword(body: { identifier: string }): Promise<AuthResponse> {
    return fetchJson<AuthResponse>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async resetPassword(body: {
    userId: string;
    otp: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<AuthResponse> {
    return fetchJson<AuthResponse>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async getDevOtp(userId: string, purpose = 'registration'): Promise<{ success: boolean; otp?: string }> {
    try {
      return await fetchJson(`/api/auth/dev-otp/${encodeURIComponent(userId)}?purpose=${purpose}`, {
        method: 'GET',
      });
    } catch {
      return { success: false };
    }
  },

  // Trading & Market Endpoints
  async getInstruments(): Promise<{ success: boolean; instruments: Instrument[] }> {
    return fetchJson('/api/trading/instruments', { method: 'GET' });
  },

  async getCandles(
    symbol: string,
    timeframe = '15m'
  ): Promise<{ success: boolean; symbol: string; timeframe: string; candles: Candle[]; instrument: Instrument }> {
    return fetchJson(`/api/trading/candles/${encodeURIComponent(symbol)}?timeframe=${timeframe}`, { method: 'GET' });
  },

  async getPortfolio(): Promise<{ success: boolean } & PortfolioData> {
    return fetchJson('/api/trading/portfolio', { method: 'GET' });
  },

  async placeOrder(orderData: {
    symbol: string;
    type: 'BUY' | 'SELL';
    orderType: 'MARKET' | 'LIMIT';
    product: 'INTRADAY' | 'HOLDING';
    lots: number;
    limitPrice?: number;
    stopLoss?: number;
    target?: number;
  }): Promise<{ success: boolean; message: string; order: Order; wallet: any; positions: Position[] }> {
    return fetchJson('/api/trading/order', {
      method: 'POST',
      body: JSON.stringify(orderData),
    });
  },

  async closePosition(positionId: string): Promise<{ success: boolean; message: string; wallet: any; positions: Position[] }> {
    return fetchJson('/api/trading/position/close', {
      method: 'POST',
      body: JSON.stringify({ positionId }),
    });
  },

  async depositFunds(amount: number, method = 'UPI Instant'): Promise<{ success: boolean; message: string; wallet: any }> {
    return fetchJson('/api/trading/funds/deposit', {
      method: 'POST',
      body: JSON.stringify({ amount, method }),
    });
  },

  async withdrawFunds(amount: number, bankName?: string, accountNumber?: string): Promise<{ success: boolean; message: string; wallet: any }> {
    return fetchJson('/api/trading/funds/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount, bankName, accountNumber }),
    });
  },

  async getTickets(): Promise<{ success: boolean; tickets: SupportTicket[] }> {
    return fetchJson('/api/trading/tickets', { method: 'GET' });
  },

  async getTicketById(id: string): Promise<{ success: boolean; ticket: SupportTicket }> {
    return fetchJson(`/api/trading/tickets/${id}`, { method: 'GET' });
  },

  async createTicket(data: {
    subject: string;
    category: string;
    priority?: string;
    message: string;
    attachmentUrl?: string;
    attachmentName?: string;
  }): Promise<{ success: boolean; message: string; ticket: SupportTicket }> {
    return fetchJson('/api/trading/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async replyTicket(
    ticketId: string,
    message: string,
    attachmentUrl?: string,
    attachmentName?: string
  ): Promise<{ success: boolean; message: string; ticket: SupportTicket }> {
    return fetchJson(`/api/trading/tickets/${ticketId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ message, attachmentUrl, attachmentName }),
    });
  },

  async updateTicketStatus(
    ticketId: string,
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
  ): Promise<{ success: boolean; message: string; ticket: SupportTicket }> {
    return fetchJson(`/api/trading/tickets/${ticketId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  async rateTicket(
    ticketId: string,
    rating: number,
    feedback?: string
  ): Promise<{ success: boolean; message: string; ticket: SupportTicket }> {
    return fetchJson(`/api/trading/tickets/${ticketId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating, feedback }),
    });
  },

  async getNotifications(): Promise<{ success: boolean; notifications: AppNotification[] }> {
    return fetchJson('/api/trading/notifications', { method: 'GET' });
  },

  async markNotificationsRead(): Promise<{ success: boolean; message: string }> {
    return fetchJson('/api/trading/notifications/mark-read', { method: 'POST' });
  },
};
