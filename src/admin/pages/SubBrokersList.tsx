import React, { useEffect, useState } from 'react';
import { GitBranch, Plus, Eye, CheckCircle2, XCircle } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { HierarchyNode, CreateEntityPayload } from '../types/adminTypes';
import { DataTable, Column } from '../components/DataTable';

interface SubBrokersListProps {
  onNavigate: (path: string) => void;
}

export const SubBrokersList: React.FC<SubBrokersListProps> = ({ onNavigate }) => {
  const [subBrokers, setSubBrokers] = useState<HierarchyNode[]>([]);
  const [brokers, setBrokers] = useState<HierarchyNode[]>([]);
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
    commissionRate: 8,
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [subBrokerData, brokerData] = await Promise.all([
        adminApi.getSubBrokers(),
        adminApi.getBrokers().catch(() => []),
      ]);
      setSubBrokers(subBrokerData);
      setBrokers(brokerData);
      if (brokerData.length > 0 && !formData.parentId) {
        setFormData((prev) => ({ ...prev, parentId: brokerData[0].id }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Sub-Brokers directory');
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
      await adminApi.createSubBroker({
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
        parentId: brokers[0]?.id || '',
        company: '',
        address: '',
        commissionRate: 8,
      });
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create Sub-Broker');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<HierarchyNode>[] = [
    {
      header: 'Sub-Broker ID',
      accessorKey: 'userId',
      cell: (item) => (
        <span className="font-mono text-xs text-amber-400 font-semibold">{item.userId}</span>
      ),
    },
    {
      header: 'Sub-Broker Name',
      cell: (item) => (
        <div>
          <p className="font-semibold text-slate-100">{item.fullName}</p>
          {item.company && <p className="text-xs text-slate-400">{item.company}</p>}
        </div>
      ),
    },
    {
      header: 'Parent Broker',
      cell: (item) => (
        <span className="text-xs text-blue-300 font-medium">
          {item.parentName || item.parentId || 'Direct Broker'}
        </span>
      ),
    },
    {
      header: 'Downstream Clients',
      cell: (item) => (
        <span className="text-emerald-400 font-semibold text-xs">{item.clientsCount ?? 0} Clients</span>
      ),
    },
    {
      header: 'Commission',
      cell: (item) => (
        <span className="font-mono text-xs font-semibold text-slate-200">
          {item.commissionRate ?? 8}%
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
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <GitBranch className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold text-slate-100">Sub-Brokers Directory</h2>
          </div>
          <p className="text-xs text-slate-400">
            Regional and local sub-clearing agents with assigned downstream traders.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create Sub-Broker</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        data={subBrokers}
        searchPlaceholder="Search Sub-Brokers..."
        searchField="fullName"
        emptyMessage={loading ? 'Loading Sub-Brokers...' : 'No Sub-Brokers found.'}
      />

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100">Create Sub-Broker Under Broker</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-200">
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Parent Broker *</label>
                <select
                  required
                  value={formData.parentId}
                  onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  {brokers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.fullName} ({b.userId})
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
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Username / ID *</label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none"
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
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Commission Share (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.commissionRate}
                    onChange={(e) => setFormData({ ...formData, commissionRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-700 rounded-lg text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-amber-600 rounded-lg text-xs text-white font-semibold"
                >
                  {submitting ? 'Creating...' : 'Provision Sub-Broker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
