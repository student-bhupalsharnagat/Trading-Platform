import { HierarchyNode, AdminDashboardKPIs, ChartDataPoint, AuditLogEntry, CreateEntityPayload } from '../types/adminTypes';

const API_BASE = '/api/admin';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('vertex_auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `API error ${response.status}`);
  }

  return data.data;
}

export const adminApi = {
  getKPIs: async (): Promise<{ kpis: AdminDashboardKPIs; charts: ChartDataPoint[] }> => {
    return request<{ kpis: AdminDashboardKPIs; charts: ChartDataPoint[] }>('/dashboard/kpis');
  },

  // Masters
  getMasters: async (): Promise<HierarchyNode[]> => {
    return request<HierarchyNode[]>('/masters');
  },
  getMasterById: async (id: string): Promise<HierarchyNode> => {
    return request<HierarchyNode>(`/masters/${id}`);
  },
  createMaster: async (payload: CreateEntityPayload): Promise<HierarchyNode> => {
    return request<HierarchyNode>('/masters', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateMasterStatus: async (id: string, status: string): Promise<HierarchyNode> => {
    return request<HierarchyNode>(`/masters/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Brokers
  getBrokers: async (): Promise<HierarchyNode[]> => {
    return request<HierarchyNode[]>('/brokers');
  },
  getBrokerById: async (id: string): Promise<HierarchyNode> => {
    return request<HierarchyNode>(`/brokers/${id}`);
  },
  createBroker: async (payload: CreateEntityPayload): Promise<HierarchyNode> => {
    return request<HierarchyNode>('/brokers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateBrokerStatus: async (id: string, status: string): Promise<HierarchyNode> => {
    return request<HierarchyNode>(`/brokers/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Sub-Brokers
  getSubBrokers: async (): Promise<HierarchyNode[]> => {
    return request<HierarchyNode[]>('/sub-brokers');
  },
  getSubBrokerById: async (id: string): Promise<HierarchyNode> => {
    return request<HierarchyNode>(`/sub-brokers/${id}`);
  },
  createSubBroker: async (payload: CreateEntityPayload): Promise<HierarchyNode> => {
    return request<HierarchyNode>('/sub-brokers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateSubBrokerStatus: async (id: string, status: string): Promise<HierarchyNode> => {
    return request<HierarchyNode>(`/sub-brokers/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Clients
  getClients: async (): Promise<HierarchyNode[]> => {
    return request<HierarchyNode[]>('/clients');
  },
  getClientById: async (id: string): Promise<HierarchyNode> => {
    return request<HierarchyNode>(`/clients/${id}`);
  },
  getClientAccount: async (id: string): Promise<any> => {
    return request<any>(`/clients/${id}/account`);
  },
  getClientOrders: async (id: string): Promise<any> => {
    return request<any>(`/clients/${id}/orders`);
  },
  getClientTrades: async (id: string): Promise<any> => {
    return request<any>(`/clients/${id}/trades`);
  },
  getClientPositions: async (id: string): Promise<any> => {
    return request<any>(`/clients/${id}/positions`);
  },
  getClientFunds: async (id: string): Promise<any> => {
    return request<any>(`/clients/${id}/funds`);
  },
  updateClientStatus: async (id: string, status: string): Promise<HierarchyNode> => {
    return request<HierarchyNode>(`/clients/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Audit Logs
  getAuditLogs: async (): Promise<AuditLogEntry[]> => {
    return request<AuditLogEntry[]>('/audit-logs');
  },

  // Orders & Trades
  getOrders: async (params?: { userId?: string; status?: string }): Promise<any> => {
    const query = new URLSearchParams(params as any).toString();
    return request<any>(`/orders${query ? `?${query}` : ''}`);
  },
  getTrades: async (params?: { userId?: string; orderId?: string }): Promise<any> => {
    const query = new URLSearchParams(params as any).toString();
    return request<any>(`/orders/trades${query ? `?${query}` : ''}`);
  },

  // Risk & Limits (RMS)
  getRiskSummary: async (): Promise<any> => {
    return request<any>('/risk/summary');
  },
  getRiskPositions: async (): Promise<any[]> => {
    return request<any[]>('/risk/positions');
  },
  squareOffPosition: async (userId: string, positionId: string): Promise<any> => {
    return request<any>('/risk/square-off', {
      method: 'POST',
      body: JSON.stringify({ userId, positionId }),
    });
  },
  freezeClient: async (userId: string, freeze: boolean, reason?: string): Promise<any> => {
    return request<any>('/risk/freeze-client', {
      method: 'POST',
      body: JSON.stringify({ userId, freeze, reason }),
    });
  },

  // Funds
  getFunds: async (params?: { status?: string; type?: string }): Promise<any[]> => {
    const query = new URLSearchParams(params as any).toString();
    return request<any[]>(`/funds${query ? `?${query}` : ''}`);
  },
  processFundTransaction: async (transactionId: string, action: 'APPROVE' | 'REJECT', reason?: string): Promise<any> => {
    return request<any>('/funds/process', {
      method: 'POST',
      body: JSON.stringify({ transactionId, action, reason }),
    });
  },
  requestFundTransaction: async (payload: { userId: string; type: 'DEPOSIT' | 'WITHDRAWAL'; amount: number; paymentMethod?: string; referenceId?: string }): Promise<any> => {
    return request<any>('/funds/request', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Ledger
  getLedger: async (userId?: string): Promise<any[]> => {
    return request<any[]>(`/ledger${userId ? `?userId=${userId}` : ''}`);
  },

  // KYC
  getKycPipeline: async (): Promise<any[]> => {
    return request<any[]>('/kyc/pipeline');
  },
  verifyKyc: async (userId: string, action: 'APPROVE' | 'REJECT', reason?: string): Promise<any> => {
    return request<any>('/kyc/verify', {
      method: 'POST',
      body: JSON.stringify({ userId, action, reason }),
    });
  },
};
