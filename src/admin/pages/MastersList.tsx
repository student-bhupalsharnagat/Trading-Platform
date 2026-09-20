import React, { useEffect, useState } from 'react';
import { Crown, Plus, Eye, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { HierarchyNode, CreateEntityPayload } from '../types/adminTypes';
import { DataTable, Column } from '../components/DataTable';
import { HierarchyBadge } from '../components/HierarchyBadge';

interface MastersListProps {
  onNavigate: (path: string) => void;
}

export const MastersList: React.FC<MastersListProps> = ({ onNavigate }) => {
  const [masters, setMasters] = useState<HierarchyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState<CreateEntityPayload>({
    fullName: '',
    username: '',
    email: '',
    mobile: '',
    password: '',
    company: '',
    address: '',
    commissionRate: 20,
  });

  const loadMasters = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getMasters();
      setMasters(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load Masters directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMasters();
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError(null);
      await adminApi.createMaster({
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
        company: '',
        address: '',
        commissionRate: 20,
      });
      await loadMasters();
    } catch (err: any) {
      setError(err.message || 'Failed to create Master');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusToggle = async (id: string, currentStatus: string) => {
    try {
      const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
      await adminApi.updateMasterStatus(id, nextStatus);
      await loadMasters();
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    }
  };

  const columns: Column<HierarchyNode>[] = [
    {
      header: 'Master ID',
      accessorKey: 'userId',
      cell: (item) => (
        <span className="font-mono text-xs text-purple-400 font-semibold">{item.userId}</span>
      ),
    },
    {
      header: 'Master Name',
      cell: (item) => (
        <div>
          <p className="font-semibold text-slate-100">{item.fullName}</p>
          {item.company && <p className="text-xs text-slate-400">{item.company}</p>}
        </div>
      ),
    },
    {
      header: 'Contact',
      cell: (item) => (
        <div className="text-xs">
          <p className="text-slate-300">{item.mobile}</p>
          {item.email && <p className="text-slate-400">{item.email}</p>}
        </div>
      ),
    },
    {
      header: 'Downstream Nodes',
      cell: (item) => (
        <div className="flex items-center gap-3 text-xs">
          <span className="text-blue-400 font-semibold">{item.brokersCount ?? 0} Brokers</span>
          <span className="text-amber-400 font-semibold">{item.subBrokersCount ?? 0} Sub-Brokers</span>
          <span className="text-emerald-400 font-semibold">{item.clientsCount ?? 0} Clients</span>
        </div>
      ),
    },
    {
      header: 'Commission',
      cell: (item) => (
        <span className="font-mono text-xs font-semibold text-slate-200">
          {item.commissionRate ?? 20}%
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
            onClick={() => onNavigate(`/admin/masters/${item.id}`)}
            className="p-1.5 rounded-lg border border-slate-700/60 hover:bg-slate-800 text-slate-300 hover:text-blue-400 transition-colors"
            title="View Details"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleStatusToggle(item.id, item.status)}
            className={`p-1.5 rounded-lg border border-slate-700/60 hover:bg-slate-800 transition-colors ${
              item.status === 'active'
                ? 'text-rose-400 hover:text-rose-300'
                : 'text-emerald-400 hover:text-emerald-300'
            }`}
            title={item.status === 'active' ? 'Suspend Master' : 'Activate Master'}
          >
            {item.status === 'active' ? (
              <XCircle className="w-3.5 h-3.5" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Crown className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-bold text-slate-100">Masters Directory</h2>
          </div>
          <p className="text-xs text-slate-400">
            Top-tier organizational franchises directly under Super Admin supervision.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create Master</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={masters}
        searchPlaceholder="Search Masters by name, ID, or company..."
        searchField="fullName"
        emptyMessage={loading ? 'Loading Masters...' : 'No Masters found in this hierarchy.'}
      />

      {/* Create Master Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold text-slate-100">Create New Master Account</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-200 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                    placeholder="e.g. Paramount Capital"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Username / ID *</label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                    placeholder="e.g. master_paramount"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Mobile Number *</label>
                  <input
                    type="tel"
                    required
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                    placeholder="10-digit mobile"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                    placeholder="master@enterprise.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Company / Entity</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                    placeholder="Paramount Securities LLP"
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
                    className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Initial Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0b1120] border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  placeholder="Defaults to Admin@12345"
                />
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
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Provision Master'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
