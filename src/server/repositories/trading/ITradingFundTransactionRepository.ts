export interface TradingFundTransaction {
  id: string;
  tenant_id: string;
  user_id: string;
  transaction_type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
  payment_method?: string;
  reference_id?: string;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  failure_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ITradingFundTransactionRepository {
  create(tx: Omit<TradingFundTransaction, 'created_at' | 'updated_at'>): Promise<TradingFundTransaction>;
  findById(tenantId: string, id: string): Promise<TradingFundTransaction | null>;
  getByTenant(tenantId: string, userId?: string, type?: 'DEPOSIT' | 'WITHDRAWAL', status?: string): Promise<TradingFundTransaction[]>;
  updateStatus(
    tenantId: string,
    id: string,
    status: 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED',
    adminId?: string,
    reason?: string
  ): Promise<TradingFundTransaction | null>;
}
