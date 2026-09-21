import React, { useEffect, useState } from 'react';
import { Briefcase, Plus, Eye, CheckCircle2, XCircle } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { HierarchyNode, CreateEntityPayload } from '../types/adminTypes';
import { DataTable, Column } from '../components/DataTable';

interface BrokersListProps {
  onNavigate: (path: string) => void;
}

export const BrokersList: React.FC<BrokersListProps> = ({ onNavigate }) => {
  const [brokers, setBrokers] = useState<HierarchyNode[]>([]);
  const [masters, setMasters] = useState<HierarchyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState<CreateEntityPayload>({
    fullName: '',
    username: '',
    email: '',
    mobile: '',
    password: '',
    parentId: '',
    company: '',
    address: '',
    commissionRate: 12,
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [brokerData, masterData] = await Promise.all([
        adminApi.getBrokers(),
        adminApi.getMasters().catch(() => []),
      ]);
      setBrokers(brokerData);
      setMasters(masterData);
      if (masterData.length > 0 && !formData.parentId) {
        setFormData((prev) => ({ ...prev, parentId: masterData[0].id }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Brokers directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError(null);
      await adminApi.createBroker({
        ...formData,
        userId: formData.username || formData.fullName.toLowerCase().replace(/\s+/g, '_'),
      } as any);

      setShowCreateModal(false);
      setFormData({
        fullName: '',
        username: '',
        email: '',
        mobile: '',
        password: '',
        parentId: masters[0]?.id || '',
        company: '',
        address: '',
        commissionRate: 12,
      });
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create Broker');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    try {
      const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
      await adminApi.updateBrokerStatus(id, nextStatus);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update Broker status');
    }
  };

  const columns: Column<HierarchyNode>[] = [
    {
      header: 'Broker ID',
      accessorKey: 'userId',
      cell: (item) => (
        <span className="font-mono text-xs text-blue-400 font-semibold">{item.userId}</span>
      ),
    },
    {
      header: 'Broker Name',
      cell: (item) => (
        <div>
          <p className="font-semibold text-slate-100">{item.fullName}</p>
          {item.company && <p className="text-xs text-slate-400">{item.company}</p>}
        </div>
      ),
    },
    {
      header: 'Parent Master',
      cell: (item) => (
        <span className="text-xs text-purple-300 font-medium">
          {item.parentName || item.parentId || 'Direct Master'}
        </span>
      ),
    },
    {
      header: 'Downstream',
      cell: (item) => (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-amber-400 font-semibold">{item.subBrokersCount ?? 0} Sub-Brokers</span>
          <span className="text-emerald-400 font-semibold">{item.clientsCount ?? 0} Clients</span>
        </div>
      ),
    },
    {
      header: 'Commission',
      cell: (item) => (
        <span className="font-mono text-xs font-semibold text-slate-200">
          {item.commissionRate ?? 12}%
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
            onClick={() => onNavigate(`/admin/brokers/${item.id}`)}
            className="p-1.5 rounded-lg border border-slate-700/60 hover:bg-slate-800 text-slate-300 hover:text-blue-400"
            title="View Broker Details"
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
            <Briefcase className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-bold text-slate-100">Brokers Directory</h2>
          </div>
          <p className="text-xs text-slate-400">
            Mid-tier clearing brokers operating under assigned Master nodes.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create Broker</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        data={brokers}
        searchPlaceholder="Search Brokers by name, ID, or Master..."
        searchField="fullName"
        emptyMessage={loading ? 'Loading Brokers...' : 'No Brokers found in your hierarchy.'}
      />

      {/* Create Broker Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-slate-100">Create Broker Under Master</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-200 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Parent Master *</label>
                <select
                  required
                  value={formData.parentId}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  {masters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName} ({m.userId})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="e.g. Apex Broking"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Username / ID *</label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    placeholder="e.g. broker_apex"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Mobile *</label>
                  <input
                    type="tel"
                    required
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Provision Broker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
