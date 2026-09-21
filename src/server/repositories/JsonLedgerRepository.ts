import { ILedgerRepository, LedgerEntry } from './ILedgerRepository';
import crypto from 'crypto';

const inMemoryLedger: LedgerEntry[] = [];

export class JsonLedgerRepository implements ILedgerRepository {
  public async createEntry(entry: Omit<LedgerEntry, 'id' | 'created_at'>): Promise<LedgerEntry> {
    const record: LedgerEntry = {
      ...entry,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    inMemoryLedger.push(record);
    return record;
  }

  public async getByUserId(userId: string): Promise<LedgerEntry[]> {
    return inMemoryLedger.filter((e) => e.user_id === userId);
  }

  public async getAll(): Promise<LedgerEntry[]> {
    return [...inMemoryLedger];
  }
}

export const jsonLedgerRepository = new JsonLedgerRepository();
