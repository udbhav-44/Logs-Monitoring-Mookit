import React, { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { fetchApplications } from '../lib/api';
import DeleteLogModal from '../components/DeleteLogModal';

import { toast } from '../components/Toast';

const SkeletonCard = () => (
  <div className="glass-card p-5 rounded-xl border border-white/10 animate-pulse">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2 w-1/2">
        <div className="w-5 h-5 glass-panel/15 rounded-full shrink-0" />
        <div className="h-5 glass-panel/15 rounded w-3/4" />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-6 w-24 glass-panel/15 rounded-lg" />
        <div className="h-6 w-16 glass-panel/15 rounded-full" />
      </div>
    </div>
    <div className="h-3 w-1/3 glass-panel/15 rounded mb-4" />
    <div className="flex justify-between mb-4">
      <div className="w-1/3">
        <div className="h-7 glass-panel/15 rounded mb-2 w-full max-w-[4rem]" />
        <div className="h-3 glass-panel/15 rounded w-1/2 max-w-[2rem]" />
      </div>
      <div className="w-1/3 flex flex-col items-end">
        <div className="h-7 glass-panel/15 rounded mb-2 w-full max-w-[4rem]" />
        <div className="h-3 glass-panel/15 rounded w-3/4 max-w-[3rem]" />
      </div>
    </div>
    <div className="flex gap-2">
      <div className="h-6 w-16 glass-panel/15 rounded-full" />
      <div className="h-6 w-16 glass-panel/15 rounded-full" />
    </div>
  </div>
);

const Applications = () => {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warming, setWarming] = useState(false);
  const [deleteModal, setDeleteModal] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchApplications();
      const data = res?.data || {};
      if (res?.status === 202 && (data.applications || []).length === 0) {
        setWarming(true);
      } else {
        setApps(data.applications || []);
        setWarming(false);
      }
    } catch (err) {
      console.error(err);
      setError('Unable to load application metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const refreshMs = Number(import.meta.env.VITE_APPLICATIONS_REFRESH_MS) || 10000;
    if (Number.isNaN(refreshMs) || refreshMs <= 0) return undefined;
    const interval = setInterval(() => {
      load();
    }, refreshMs);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Application Overview</h1>
          <p className="text-gray-400">Traffic, error rate, and VM footprint per application.</p>
        </div>
        <button onClick={load} className="px-4 py-2 glass-button text-white rounded-lg text-sm font-semibold hover:glass-panel/20">
          Refresh
        </button>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {warming && !loading && <p className="text-gray-400 text-sm">Warming up application metrics...</p>}

      {loading && apps.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {apps.map((app) => (
            <div key={app.app} className="glass-card p-5 rounded-xl border border-white/10 hover:border-blue-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Layers className="text-blue-600" size={18} />
                  <p className="font-semibold text-white">{app.app}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDeleteModal({ app: app.app, vmIds: app.vmIds })}
                    className="text-xs text-red-600 hover:text-red-700 hover:glass-panel/10 px-3 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    Manage Storage
                  </button>
                  <span className="text-xs glass-panel/10 text-gray-200 px-2 py-1 rounded-full">{app.vmIds.length} VM(s)</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-2">VMs: {app.vmIds.join(', ')}</p>
              <div className="flex justify-between mb-3">
                <div>
                  <p className="text-2xl font-bold text-white">{app.total}</p>
                  <p className="text-xs text-gray-400">Logs</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-red-600">{app.errors}</p>
                  <p className="text-xs text-gray-400">Errors ({app.errorRate}%)</p>
                </div>
              </div>
              <div className="text-xs text-gray-300">
                Sources:{' '}
                {Object.entries(app.sources || {}).map(([key, val]) => (
                  <span key={key} className="inline-flex items-center gap-1 mr-2 px-2 py-1 glass-panel/5 rounded-full">
                    <span className="font-semibold">{key}</span>
                    <span>{val}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {apps.length === 0 && !loading && <p className="text-gray-400">No application data yet.</p>}

      {deleteModal && (
        <DeleteLogModal
          app={deleteModal.app}
          vmIds={deleteModal.vmIds}
          onClose={() => setDeleteModal(null)}
          onSuccess={() => {
            load();
            toast.success('Logs deleted successfully.');
          }}
        />
      )}
    </div>
  );
};

export default Applications;
