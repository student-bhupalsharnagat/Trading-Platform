export interface LedgerEntry {
  id: string;
  transaction_id: string;
  user_id: string;
  type: 'CREDIT' | 'DEBIT';
  category: 'DEPOSIT' | 'WITHDRAWAL' | 'TRADE_PNL' | 'COMMISSION' | 'ADMIN_ADJUSTMENT';
  amount: number;
  balance_before: number;
  balance_after: number;
  reference: string;
  created_by: string;
  created_at: string;
}

export interface ILedgerRepository {
  createEntry(entry: Omit<LedgerEntry, 'id' | 'created_at'>): Promise<LedgerEntry>;
  getByUserId(userId: string): Promise<LedgerEntry[]>;
  getAll(): Promise<LedgerEntry[]>;
}
