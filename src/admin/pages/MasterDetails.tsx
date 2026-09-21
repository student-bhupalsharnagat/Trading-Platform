import React, { useEffect, useState } from 'react';
import { Crown, ArrowLeft, Briefcase, GitBranch, Users, Activity, CheckCircle, ShieldAlert } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { HierarchyNode } from '../types/adminTypes';
import { HierarchyBadge } from '../components/HierarchyBadge';

interface MasterDetailsProps {
  id: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
}

export const MasterDetails: React.FC<MasterDetailsProps> = ({ id, onBack, onNavigate }) => {
  const [master, setMaster] = useState<HierarchyNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'brokers' | 'subbrokers' | 'clients' | 'activity'>('overview');

  useEffect(() => {
    const fetchMaster = async () => {
      try {
        setLoading(true);
        const data = await adminApi.getMasterById(id);
        setMaster(data);
      } catch (err: any) {
        setError(err.message || 'Master not found or unauthorized');
      } finally {
        setLoading(false);
      }
    };
    fetchMaster();
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-slate-400 text-xs">Loading Master record...</div>;
  }

  if (error || !master) {
    return (
      <div className="p-6 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
        <p className="font-bold mb-2">Access Error</p>
        <p>{error || 'Master account could not be found within your hierarchy boundary.'}</p>
        <button
          onClick={onBack}
          className="mt-4 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
        >
          Return to Directory
        </button>
      </div>
    );
  }

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'brokers', label: `Brokers (${master.brokersCount ?? 0})` },
    { key: 'subbrokers', label: `Sub-Brokers (${master.subBrokersCount ?? 0})` },
    { key: 'clients', label: `Clients (${master.clientsCount ?? 0})` },
    { key: 'activity', label: 'Activity Logs' },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Breadcrumb & Back */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg border border-slate-700/60 hover:bg-slate-800 text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <HierarchyBadge role="MASTER" />
              <span className="text-xs font-mono text-slate-400">Path: {master.hierarchyPath}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-100">{master.fullName}</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
              master.status === 'active'
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
            }`}
          >
            STATUS: {master.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800 flex items-center gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-5">
              <h3 className="text-sm font-bold text-slate-100 mb-4">Organizational Profile</h3>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block mb-1">Entity User ID</span>
                  <span className="text-slate-200 font-mono font-semibold">{master.userId}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Company / Firm</span>
                  <span className="text-slate-200 font-medium">{master.company || 'Direct Entity'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Direct Mobile</span>
                  <span className="text-slate-200">{master.mobile}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Contact Email</span>
                  <span className="text-slate-200">{master.email || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Commission Share</span>
                  <span className="text-slate-200 font-bold">{master.commissionRate ?? 20}%</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-1">Registered Since</span>
                  <span className="text-slate-200">{new Date(master.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-5">
              <h3 className="text-sm font-bold text-slate-100 mb-2">Downstream Tree Architecture</h3>
              <p className="text-xs text-slate-400 mb-4">
                Brokers and Sub-Brokers registered directly under this Master node.
              </p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-[#0b1120] rounded-lg border border-slate-800">
                  <p className="text-xl font-bold text-blue-400">{master.brokersCount ?? 0}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold mt-1">Brokers</p>
                </div>
                <div className="p-3 bg-[#0b1120] rounded-lg border border-slate-800">
                  <p className="text-xl font-bold text-amber-400">{master.subBrokersCount ?? 0}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold mt-1">Sub-Brokers</p>
                </div>
                <div className="p-3 bg-[#0b1120] rounded-lg border border-slate-800">
                  <p className="text-xl font-bold text-emerald-400">{master.clientsCount ?? 0}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-semibold mt-1">Clients</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-5">
              <h3 className="text-sm font-bold text-slate-100 mb-3">Administrative Controls</h3>
              <p className="text-xs text-slate-400 mb-4">Quick actions for managing this Master node.</p>
              <div className="space-y-2">
                <button
                  onClick={() => onNavigate('/admin/brokers')}
                  className="w-full py-2 px-3 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-xs font-semibold border border-blue-500/30 text-left"
                >
                  + Add Broker to this Master
                </button>
                <button
                  onClick={() => onNavigate('/admin/clients')}
                  className="w-full py-2 px-3 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 text-xs font-semibold border border-emerald-500/30 text-left"
                >
                  View All Downstream Clients
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Placeholder for other tabs */}
      {activeTab !== 'overview' && (
        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-8 text-center text-slate-400 text-xs">
          <p className="font-semibold text-slate-300 mb-1">
            Displaying {tabs.find((t) => t.key === activeTab)?.label}
          </p>
          <p>
            Nodes are scoped to this Master's hierarchy path (`{master.hierarchyPath}`).
          </p>
        </div>
      )}
    </div>
  );
};
