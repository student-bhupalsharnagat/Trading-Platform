import React, { useEffect, useState } from 'react';
import { Users, Eye, CheckCircle2, XCircle, Network } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { HierarchyNode } from '../types/adminTypes';
import { DataTable, Column } from '../components/DataTable';

interface ClientsListProps {
  onNavigate: (path: string) => void;
}

export const ClientsList: React.FC<ClientsListProps> = ({ onNavigate }) => {
  const [clients, setClients] = useState<HierarchyNode[]>([]);
  const [brokers, setBrokers] = useState<HierarchyNode[]>([]);
  const [subBrokers, setSubBrokers] = useState<HierarchyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Hierarchy Assignment Modal State
  const [assigningClient, setAssigningClient] = useState<HierarchyNode | null>(null);
  const [selectedBrokerId, setSelectedBrokerId] = useState<string>('');
  const [selectedSubBrokerId, setSelectedSubBrokerId] = useState<string>('');
  const [submittingAssign, setSubmittingAssign] = useState(false);

  const loadClients = async () => {
    try {
      setLoading(true);
      const [clientData, brokerData, subBrokerData] = await Promise.all([
        adminApi.getClients(),
        adminApi.getBrokers().catch(() => []),
        adminApi.getSubBrokers().catch(() => []),
      ]);
      setClients(clientData);
      setBrokers(brokerData);
      setSubBrokers(subBrokerData);
    } catch (err: any) {
      setError(err.message || 'Failed to load downstream clients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const openAssignModal = (client: HierarchyNode) => {
    setAssigningClient(client);
    setSelectedBrokerId((client as any).broker_id || client.parentId || (brokers[0]?.id || ''));
    setSelectedSubBrokerId((client as any).sub_broker_id || '');
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningClient) return;
    try {
      setSubmittingAssign(true);
      setError(null);
      await adminApi.assignClientHierarchy(assigningClient.id, {
        brokerId: selectedBrokerId || undefined,
        subBrokerId: selectedSubBrokerId || undefined,
      });
      setAssigningClient(null);
      await loadClients();
    } catch (err: any) {
      setError(err.message || 'Failed to assign client hierarchy');
    } finally {
      setSubmittingAssign(false);
    }
  };

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    try {
      const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
      await adminApi.updateClientStatus(id, nextStatus);
      await loadClients();
    } catch (err: any) {
      setError(err.message || 'Failed to update client status');
    }
  };

  const filteredSubBrokers = subBrokers.filter(
    (sb) => !selectedBrokerId || sb.parentId === selectedBrokerId || (sb as any).brokerId === selectedBrokerId
  );

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
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              item.status === 'active'
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
            }`}
          >
            {item.status.toUpperCase()}
          </span>
          {item.account_type === 'demo' && (
            <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              DEMO
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right',
      cell: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => openAssignModal(item)}
            className="p-1.5 rounded-lg border border-slate-700/60 hover:bg-slate-800 text-slate-300 hover:text-amber-400"
            title="Assign Broker / Sub-Broker"
          >
            <Network className="w-3.5 h-3.5" />
          </button>
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

      {/* Assign Broker / Sub-Broker Modal */}
      {assigningClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Network className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-base font-bold text-slate-100">Assign Hierarchy</h3>
                  <p className="text-xs text-slate-400 font-mono">{assigningClient.fullName} ({assigningClient.userId})</p>
                </div>
              </div>
              <button
                onClick={() => setAssigningClient(null)}
                className="text-slate-400 hover:text-slate-200 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Select Broker *</label>
                <select
                  value={selectedBrokerId}
                  onChange={(e) => {
                    setSelectedBrokerId(e.target.value);
                    setSelectedSubBrokerId('');
                  }}
                  className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- No Broker (Direct Admin) --</option>
                  {brokers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.fullName} ({b.userId})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Select Sub-Broker (Optional)</label>
                <select
                  value={selectedSubBrokerId}
                  onChange={(e) => setSelectedSubBrokerId(e.target.value)}
                  disabled={!selectedBrokerId || filteredSubBrokers.length === 0}
                  className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                >
                  <option value="">-- No Sub-Broker --</option>
                  {filteredSubBrokers.map((sb) => (
                    <option key={sb.id} value={sb.id}>
                      {sb.fullName} ({sb.userId})
                    </option>
                  ))}
                </select>
                {selectedBrokerId && filteredSubBrokers.length === 0 && (
                  <p className="text-[10px] text-slate-500 mt-1">No sub-brokers registered under this broker yet.</p>
                )}
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAssigningClient(null)}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAssign}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {submittingAssign ? 'Assigning...' : 'Save Hierarchy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
