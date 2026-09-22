import crypto from 'crypto';
import type { UserRole } from '../db/database.ts';

export interface AuditLogItem {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  module: string;
  targetId: string;
  targetName?: string;
  targetRole?: UserRole;
  oldValue?: string | Record<string, unknown>;
  newValue?: string | Record<string, unknown>;
  ipAddress?: string;
  timestamp: string;
}

export interface EmergencyAuditRecord {
  id: string;
  action: string;
  source: string;
  tenantId: string;
  targetUser?: string;
  reason?: string;
  result?: any;
  timestamp: string;
}

export function deepRedactSensitiveData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(deepRedactSensitiveData);
  }

  const SENSITIVE_KEYS = [
    'password',
    'passwordhash',
    'secret',
    'signature',
    'token',
    'jwt',
    'apikey',
    'apisecret',
    'accesstoken',
    'refreshtoken',
    'cookie',
    'authorization',
    'privatekey',
    'passphrase',
    'creditcard',
    'pin',
    'cvv',
  ];

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    let isSensitive = false;
    for (const sens of SENSITIVE_KEYS) {
      if (lowerKey.includes(sens)) {
        isSensitive = true;
        break;
      }
    }

    if (isSensitive) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = deepRedactSensitiveData(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

class AuditService {
  private emergencyAuditLogs: EmergencyAuditRecord[] = [];
  private logs: AuditLogItem[] = [
    {
      id: 'audit-001',
      actorId: 'super-admin-root-0001',
      actorName: 'System Administrator',
      actorRole: 'SUPER_ADMIN',
      action: 'SYSTEM_BOOT',
      module: 'PLATFORM',
      targetId: 'root',
      targetName: 'Platform Root Node',
      targetRole: 'SUPER_ADMIN',
      newValue: { status: 'initialized' },
      timestamp: new Date().toISOString(),
    },
  ];

  public log(entry: Omit<AuditLogItem, 'id' | 'timestamp'>): AuditLogItem {
    const item: AuditLogItem = {
      ...entry,
      oldValue: deepRedactSensitiveData(entry.oldValue),
      newValue: deepRedactSensitiveData(entry.newValue),
      id: `audit-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
    };
    this.logs.unshift(item);
    if (this.logs.length > 200) {
      this.logs.pop();
    }
    return item;
  }

  public logEmergencyEvent(event: {
    action: string;
    source: string;
    tenantId: string;
    targetUser?: string;
    reason?: string;
    result?: any;
  }): EmergencyAuditRecord {
    // Redact result to ensure no secrets, signatures, passwords, or JWTs are stored
    const sanitizedResult = deepRedactSensitiveData(event.result);

    const record: EmergencyAuditRecord = {
      id: `emg-${crypto.randomUUID().slice(0, 8)}`,
      action: event.action,
      source: event.source || 'CENTRAL_ADMIN',
      tenantId: event.tenantId,
      targetUser: event.targetUser,
      reason: event.reason,
      result: sanitizedResult,
      timestamp: new Date().toISOString(),
    };

    this.emergencyAuditLogs.unshift(record);
    if (this.emergencyAuditLogs.length > 300) {
      this.emergencyAuditLogs.pop();
    }

    // Also mirror to main audit log
    this.log({
      actorId: `s2s-${event.source.toLowerCase()}`,
      actorName: `Central Admin Service (${event.source})`,
      actorRole: 'SUPER_ADMIN',
      action: event.action,
      module: 'EMERGENCY_CONTROL',
      targetId: event.tenantId,
      targetName: event.targetUser || event.tenantId,
      newValue: {
        reason: event.reason,
        result: sanitizedResult,
      },
    });

    return record;
  }

  public getEmergencyLogs(tenantId?: string): EmergencyAuditRecord[] {
    if (tenantId) {
      return this.emergencyAuditLogs.filter((l) => l.tenantId === tenantId);
    }
    return [...this.emergencyAuditLogs];
  }

  public getLogs(limit = 50): AuditLogItem[] {
    return this.logs.slice(0, limit);
  }

  public getLogsByTarget(targetId: string): AuditLogItem[] {
    return this.logs.filter((l) => l.targetId === targetId);
  }
}

export const auditService = new AuditService();
