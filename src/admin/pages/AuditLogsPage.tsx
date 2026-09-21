import React, { useEffect, useState } from 'react';
import { History, ShieldCheck } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { AuditLogEntry } from '../types/adminTypes';
import { DataTable, Column } from '../components/DataTable';

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi
      .getAuditLogs()
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  const columns: Column<AuditLogEntry>[] = [
    {
      header: 'Timestamp',
      accessorKey: 'timestamp',
      cell: (item) => (
        <span className="font-mono text-xs text-slate-400">
          {new Date(item.timestamp).toLocaleString()}
        </span>
      ),
    },
    {
      header: 'Actor ID',
      accessorKey: 'actorId',
      cell: (item) => (
        <span className="font-mono text-xs font-semibold text-blue-400">{item.actorId}</span>
      ),
    },
    {
      header: 'Action',
      accessorKey: 'action',
      cell: (item) => (
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
          {item.action}
        </span>
      ),
    },
    {
      header: 'Target Entity',
      cell: (item) => (
        <div className="text-xs">
          <span className="text-slate-300 font-medium">{item.targetName || item.targetRole || 'Entity'}</span>
          <span className="text-slate-500 font-mono ml-2">({item.targetId})</span>
        </div>
      ),
    },
    {
      header: 'Changes',
      cell: (item) => (
        <span className="text-xs text-slate-400 truncate max-w-sm block">
          {item.newValue ? JSON.stringify(item.newValue) : item.module}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-1">
        <History className="w-5 h-5 text-blue-400" />
        <div>
          <h2 className="text-xl font-bold text-slate-100">Immutable Audit Logs</h2>
          <p className="text-xs text-slate-400">
            System trail of administrative changes, entity provisioning, and permissions.
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={logs}
        searchPlaceholder="Search audit logs..."
        emptyMessage={loading ? 'Loading logs...' : 'No audit records recorded.'}
      />
    </div>
  );
};
