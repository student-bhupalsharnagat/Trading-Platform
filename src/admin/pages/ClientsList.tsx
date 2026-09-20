import React, { useEffect, useState } from 'react';
import { Users, Eye, CheckCircle2, XCircle } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { HierarchyNode } from '../types/adminTypes';
import { DataTable, Column } from '../components/DataTable';

interface ClientsListProps {
  onNavigate: (path: string) => void;
}

export const ClientsList: React.FC<ClientsListProps> = ({ onNavigate }) => {
  const [clients, setClients] = useState<HierarchyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadClients = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getClients();
      setClients(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load downstream clients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    try {
      const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
      await adminApi.updateClientStatus(id, nextStatus);
      await loadClients();
    } catch (err: any) {
      setError(err.message || 'Failed to update client status');
    }
  };

  const columns: Column<HierarchyNode>[] = [
    {
      header: 'Client ID',
      accessorKey: 'userId',
      cell: (item) => (
        <span className="font-mono text-xs text-blue-400 font-semibold">{item.userId}</span>
      ),
    },
    {
      header: 'Trader Name',
      cell: (item) => (
        <div>
          <p className="font-semibold text-slate-100">{item.fullName}</p>
          <p className="text-xs text-slate-400">{item.mobile}</p>
        </div>
      ),
    },
    {
      header: 'Parent Node / Path',
      cell: (item) => (
        <div className="text-xs font-mono text-slate-400">
          <p className="text-slate-300 font-medium">{item.parentName || item.parentId || 'Direct'}</p>
          <p className="text-[10px] text-slate-500 truncate max-w-xs">{item.hierarchyPath}</p>
        </div>
      ),
    },
    {
      header: 'Account Balance',
      cell: (item) => (
        <span className="font-mono text-xs font-bold text-emerald-400">
          ₹{(item.balance ?? 0).toLocaleString('en-IN')}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (item) => (
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
            item.status === 'active'
              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
              : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
          }`}
        >
          {item.status.toUpperCase()}
        </span>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right',
      cell: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => onNavigate(`/admin/clients/${item.id}`)}
            className="p-1.5 rounded-lg border border-slate-700/60 hover:bg-slate-800 text-slate-300 hover:text-blue-400"
            title="View Client Profile"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleStatusToggle(item.id, item.status)}
            className={`p-1.5 rounded-lg border border-slate-700/60 hover:bg-slate-800 ${
              item.status === 'active' ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {item.status === 'active' ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-slate-100">Downstream Clients Directory</h2>
          </div>
          <p className="text-xs text-slate-400">
            Trader accounts operating under your downstream hierarchy branches.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        data={clients}
        searchPlaceholder="Search clients by name, ID, or phone..."
        searchField="fullName"
        emptyMessage={loading ? 'Loading Clients...' : 'No downstream clients found.'}
      />
    </div>
  );
};
