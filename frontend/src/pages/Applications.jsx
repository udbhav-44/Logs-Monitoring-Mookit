import React, { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { fetchApplications } from '../lib/api';

const Applications = () => {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchApplications();
      setApps(res.applications || []);
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
      {loading && <p className="text-gray-500 text-sm">Loading applications...</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {apps.map((app) => (
          <div key={app.app} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:border-indigo-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="text-indigo-600" size={18} />
                <p className="font-semibold text-gray-900">{app.app}</p>
              </div>
              <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">{app.vmIds.length} VM(s)</span>
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

      {apps.length === 0 && !loading && <p className="text-gray-500">No application data yet.</p>}
    </div>
  );
};

export default Applications;
