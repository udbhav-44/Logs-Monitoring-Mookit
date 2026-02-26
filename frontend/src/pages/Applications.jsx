import React, { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { fetchApplications } from '../lib/api';
import DeleteLogModal from '../components/DeleteLogModal';

import { toast } from '../components/Toast';

const SkeletonCard = () => (
  <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm animate-pulse">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2 w-1/2">
        <div className="w-5 h-5 bg-gray-200 rounded-full shrink-0" />
        <div className="h-5 bg-gray-200 rounded w-3/4" />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-6 w-24 bg-gray-200 rounded-lg" />
        <div className="h-6 w-16 bg-gray-200 rounded-full" />
      </div>
    </div>
    <div className="h-3 w-1/3 bg-gray-200 rounded mb-4" />
    <div className="flex justify-between mb-4">
      <div className="w-1/3">
        <div className="h-7 bg-gray-200 rounded mb-2 w-full max-w-[4rem]" />
        <div className="h-3 bg-gray-200 rounded w-1/2 max-w-[2rem]" />
      </div>
      <div className="w-1/3 flex flex-col items-end">
        <div className="h-7 bg-gray-200 rounded mb-2 w-full max-w-[4rem]" />
        <div className="h-3 bg-gray-200 rounded w-3/4 max-w-[3rem]" />
      </div>
    </div>
    <div className="flex gap-2">
      <div className="h-6 w-16 bg-gray-200 rounded-full" />
      <div className="h-6 w-16 bg-gray-200 rounded-full" />
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
          <h1 className="text-2xl font-bold text-gray-800">Application Overview</h1>
          <p className="text-gray-500">Traffic, error rate, and VM footprint per application.</p>
        </div>
        <button onClick={load} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700">
          Refresh
        </button>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {warming && !loading && <p className="text-gray-500 text-sm">Warming up application metrics...</p>}

      {loading && apps.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {apps.map((app) => (
            <div key={app.app} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:border-indigo-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Layers className="text-indigo-600" size={18} />
                  <p className="font-semibold text-gray-900">{app.app}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDeleteModal({ app: app.app, vmIds: app.vmIds })}
                    className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    Manage Storage
                  </button>
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{app.vmIds.length} VM(s)</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-2">VMs: {app.vmIds.join(', ')}</p>
              <div className="flex justify-between mb-3">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{app.total}</p>
                  <p className="text-xs text-gray-500">Logs</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-red-600">{app.errors}</p>
                  <p className="text-xs text-gray-500">Errors ({app.errorRate}%)</p>
                </div>
              </div>
              <div className="text-xs text-gray-600">
                Sources:{' '}
                {Object.entries(app.sources || {}).map(([key, val]) => (
                  <span key={key} className="inline-flex items-center gap-1 mr-2 px-2 py-1 bg-gray-50 rounded-full">
                    <span className="font-semibold">{key}</span>
                    <span>{val}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {apps.length === 0 && !loading && <p className="text-gray-500">No application data yet.</p>}

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
