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
};
