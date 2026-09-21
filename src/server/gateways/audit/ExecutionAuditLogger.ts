/**
 * VERTEX Multi-Tenant Trading Platform - Phase 5G
 * Execution Request & Provider Response Audit Logger
 * Strictly scrubs credentials and secrets before writing to PostgreSQL & memory.
 */

import { pgDb } from '../../db/postgres.ts';

export interface ExecutionAuditEntry {
  id: string;
  tenantId: string;
  correlationId: string;
  userId: string;
  orderId?: string;
  brokerOrderId?: string;
  providerId: string;
  action: 'PLACE_ORDER' | 'CANCEL_ORDER' | 'MODIFY_ORDER' | 'GET_STATUS';
  executionStatus: 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'REJECTED' | 'CIRCUIT_OPEN';
  requestPayload: Record<string, any>;
  responsePayload: Record<string, any>;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
}

const SENSITIVE_KEY_PATTERN = /(key|secret|password|token|auth|authorization|credential|api_key|apikey|private)/i;

export function sanitizePayload(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizePayload(item));
  }

  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      clean[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      clean[k] = sanitizePayload(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

export class ExecutionAuditLogger {
  private inMemoryAudits: ExecutionAuditEntry[] = [];
  private readonly MAX_MEM_ENTRIES = 500;

  public async logAudit(entry: Omit<ExecutionAuditEntry, 'id' | 'createdAt'>): Promise<ExecutionAuditEntry> {
    const id = `ea-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = new Date().toISOString();
    const sanitizedRequest = sanitizePayload(entry.requestPayload);
    const sanitizedResponse = sanitizePayload(entry.responsePayload);

    const fullEntry: ExecutionAuditEntry = {
      ...entry,
      userId: entry.userId || 'SYSTEM',
      id,
      requestPayload: sanitizedRequest,
      responsePayload: sanitizedResponse,
      createdAt,
    };

    // Store in-memory ring buffer
    this.inMemoryAudits.unshift(fullEntry);
    if (this.inMemoryAudits.length > this.MAX_MEM_ENTRIES) {
      this.inMemoryAudits.pop();
    }

    // Persist to PostgreSQL provider_execution_audits
    try {
      await pgDb.query(
        `INSERT INTO provider_execution_audits 
         (id, tenant_id, correlation_id, user_id, order_id, broker_order_id, provider_id, action, execution_status, request_payload, response_payload, latency_ms, error_code, error_message, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          fullEntry.id,
          fullEntry.tenantId,
          fullEntry.correlationId,
          fullEntry.userId,
          fullEntry.orderId || null,
          fullEntry.brokerOrderId || null,
          fullEntry.providerId,
          fullEntry.action,
          fullEntry.executionStatus,
          JSON.stringify(fullEntry.requestPayload),
          JSON.stringify(fullEntry.responsePayload),
          fullEntry.latencyMs,
          fullEntry.errorCode || null,
          fullEntry.errorMessage || null,
          fullEntry.createdAt,
        ]
      );
    } catch (err: any) {
      // Non-blocking log failure
      console.warn('[ExecutionAudit] Failed to persist audit to postgres:', err.message);
    }

    return fullEntry;
  }

  public async getAuditsByTenant(tenantId: string, limit = 50): Promise<ExecutionAuditEntry[]> {
    try {
      const res = await pgDb.query(
        `SELECT id, tenant_id AS "tenantId", correlation_id AS "correlationId", user_id AS "userId", 
                order_id AS "orderId", broker_order_id AS "brokerOrderId", provider_id AS "providerId", 
                action, execution_status AS "executionStatus", request_payload AS "requestPayload", 
                response_payload AS "responsePayload", latency_ms AS "latencyMs", 
                error_code AS "errorCode", error_message AS "errorMessage", created_at AS "createdAt"
         FROM provider_execution_audits 
         WHERE tenant_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [tenantId, limit]
      );
      if (res && res.rows.length > 0) {
        return res.rows;
      }
    } catch {
      // fallback to memory
    }

    return this.inMemoryAudits.filter((a) => a.tenantId === tenantId).slice(0, limit);
  }

  public async getAuditsByOrderId(tenantId: string, orderId: string): Promise<ExecutionAuditEntry[]> {
    try {
      const res = await pgDb.query(
        `SELECT id, tenant_id AS "tenantId", correlation_id AS "correlationId", user_id AS "userId", 
                order_id AS "orderId", broker_order_id AS "brokerOrderId", provider_id AS "providerId", 
                action, execution_status AS "executionStatus", request_payload AS "requestPayload", 
                response_payload AS "responsePayload", latency_ms AS "latencyMs", 
                error_code AS "errorCode", error_message AS "errorMessage", created_at AS "createdAt"
         FROM provider_execution_audits 
         WHERE tenant_id = $1 AND order_id = $2 
         ORDER BY created_at ASC`,
        [tenantId, orderId]
      );
      if (res && res.rows.length > 0) {
        return res.rows;
      }
    } catch {
      // fallback
    }

    return this.inMemoryAudits.filter((a) => a.tenantId === tenantId && a.orderId === orderId);
  }

  public clearMemory(): void {
    this.inMemoryAudits = [];
  }
}

export const executionAuditLogger = new ExecutionAuditLogger();
