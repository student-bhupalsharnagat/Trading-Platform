import React, { useEffect, useState } from 'react';
import { ArrowLeft, Briefcase, Users, Activity } from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { HierarchyNode } from '../types/adminTypes';
import { HierarchyBadge } from '../components/HierarchyBadge';

interface BrokerDetailsProps {
  id: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
}

export const BrokerDetails: React.FC<BrokerDetailsProps> = ({ id, onBack, onNavigate }) => {
  const [broker, setBroker] = useState<HierarchyNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBroker = async () => {
      try {
        setLoading(true);
        const data = await adminApi.getBrokerById(id);
        setBroker(data);
      } catch (err: any) {
        setError(err.message || 'Broker not found or access denied');
      } finally {
        setLoading(false);
      }
    };
    fetchBroker();
  }, [id]);

  if (loading) return <div className="p-8 text-center text-slate-400 text-xs">Loading Broker record...</div>;
  if (error || !broker) {
    return (
      <div className="p-6 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
        <p className="font-bold mb-2">Access Boundary Notice</p>
        <p>{error || 'This broker does not exist in your authorized subtree.'}</p>
        <button onClick={onBack} className="mt-4 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs font-semibold">
          Return to Directory
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg border border-slate-700/60 hover:bg-slate-800 text-slate-300">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <HierarchyBadge role="BROKER" />
            <span className="text-xs font-mono text-slate-400">Path: {broker.hierarchyPath}</span>
          </div>
          <h2 className="text-xl font-bold text-slate-100">{broker.fullName}</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-[#0f172a] border border-slate-800/80 rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-100 mb-4">Broker Overview</h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-500 block mb-1">Broker User ID</span>
              <span className="text-slate-200 font-mono font-semibold">{broker.userId}</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-1">Direct Mobile</span>
              <span className="text-slate-200">{broker.mobile}</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-1">Parent Master Node</span>
              <span className="text-purple-300 font-semibold">{broker.parentName || broker.parentId}</span>
            </div>
            <div>
              <span className="text-slate-500 block mb-1">Commission Share</span>
              <span className="text-slate-200 font-bold">{broker.commissionRate ?? 12}%</span>
            </div>
          </div>
        </div>

        <div className="bg-[#0f172a] border border-slate-800/80 rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-100 mb-3">Quick Navigation</h3>
          <div className="space-y-2">
            <button
              onClick={() => onNavigate('/admin/sub-brokers')}
              className="w-full py-2 px-3 rounded-lg bg-amber-600/20 text-amber-300 hover:bg-amber-600/30 text-xs font-semibold border border-amber-500/30 text-left"
            >
              + Create Sub-Broker Under This Broker
            </button>
            <button
              onClick={() => onNavigate('/admin/clients')}
              className="w-full py-2 px-3 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 text-xs font-semibold border border-emerald-500/30 text-left"
            >
              View Downstream Clients ({broker.clientsCount ?? 0})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
