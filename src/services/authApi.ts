import { AuthResponse, Instrument, PortfolioData } from '../types.ts';

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
    // Include cookies for session authentication
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

  async getInstruments(): Promise<{ success: boolean; instruments: Instrument[] }> {
    return fetchJson('/api/trading/instruments', { method: 'GET' });
  },

  async getPortfolio(): Promise<{ success: boolean } & PortfolioData> {
    return fetchJson('/api/trading/portfolio', { method: 'GET' });
  },
};
