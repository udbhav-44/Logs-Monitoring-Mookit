import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Clock, MapPin, ExternalLink } from 'lucide-react';
import { fetchUserActivity } from '../lib/api';

const UserActivity = () => {
  const [uid, setUid] = useState('');
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const knownIps = activity?.summary?.ips || [];
  const topActions = activity?.summary?.topActions || [];
  const navigate = useNavigate();

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!uid) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchUserActivity(uid);
      setActivity(res);
    } catch (err) {
      console.error(err);
      setError('Unable to load activity for this UID.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">User Activity Tracker</h1>
          <p className="text-gray-500">Answer “did this user perform the action?” with a chronological trail.</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 max-w-3xl">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1 relative">
            <User className="absolute left-3 top-3 text-gray-400" size={18} />
            <input
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              placeholder="Enter User ID (UID) to trace"
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 flex items-center gap-2">
            <Search size={18} />
            Trace
          </button>
        </form>
        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      </div>

      {loading && <p className="text-gray-500">Loading activity...</p>}

      {activity && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-100 rounded-lg p-4">
              <p className="text-sm text-gray-500">Events</p>
              <p className="text-2xl font-bold text-gray-900">{activity.summary.total}</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-lg p-4">
              <p className="text-sm text-gray-500">First Seen</p>
              <p className="text-base font-semibold text-gray-900">
                {activity.summary.firstSeen ? new Date(activity.summary.firstSeen).toLocaleString() : '—'}
              </p>
            </div>
            <div className="bg-white border border-gray-100 rounded-lg p-4">
              <p className="text-sm text-gray-500">Last Seen</p>
              <p className="text-base font-semibold text-gray-900">
                {activity.summary.lastSeen ? new Date(activity.summary.lastSeen).toLocaleString() : '—'}
              </p>
            </div>
            <div className="bg-white border border-gray-100 rounded-lg p-4">
              <p className="text-sm text-gray-500">IPs used</p>
              <p className="text-2xl font-bold text-gray-900">{knownIps.length}</p>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Known IP Addresses</h3>
            <div className="flex flex-wrap gap-2">
              {knownIps.map((ip) => (
                <button
                  key={ip}
                  type="button"
                  className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-mono flex items-center gap-1 hover:bg-indigo-50"
                  onClick={() => navigate(`/logs?uid=${uid}&ip=${ip}`)}
                >
                  <MapPin size={12} /> {ip}
                </button>
              ))}
              {knownIps.length === 0 && <span className="text-gray-500 text-sm">No IPs recorded.</span>}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Top Actions</h3>
            <div className="space-y-2">
                  {topActions.map((action) => (
                <button
                  key={action.action}
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 hover:bg-indigo-50"
                  onClick={() => navigate(`/logs?uid=${uid}&search=${encodeURIComponent(action.action || '')}`)}
                >
                  <span className="truncate pr-4 text-left">{action.action || 'unknown'}</span>
                  <span className="text-gray-700 font-semibold">{action.count}</span>
                </button>
              ))}
                  {topActions.length === 0 && <p className="text-sm text-gray-500">No recent actions.</p>}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-gray-800 mb-4">Activity Timeline</h3>
            <div className="relative border-l-2 border-indigo-200 ml-3 space-y-8 pb-8">
              {activity.timeline.map((log) => (
                <div
                  key={log._id || `${log.timestamp}-${log.rawMessage}`}
                  className="relative pl-8"
                >
                  <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-indigo-600 border-4 border-white shadow-sm"></div>
                  <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-gray-800">
                        {log.parsedData?.method || 'EVENT'} {log.parsedData?.url || ''}
                      </h4>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          Number(log.parsedData?.status) >= 400 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {log.parsedData?.status || '—'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Clock size={14} />
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                      <span>IP: {log.parsedData?.ip || 'unknown'}</span>
                      <span>VM: {log.appInfo?.vmId || '-'}</span>
                    </div>
                    {log.parsedData?.message && (
                      <p className="text-sm text-gray-600 mt-2 line-clamp-2">{log.parsedData.message}</p>
                    )}
                    <button
                      type="button"
                      className="mt-3 inline-flex items-center gap-1 text-indigo-600 text-sm font-semibold hover:text-indigo-800"
                      onClick={() => navigate(`/logs?uid=${uid}&start=${new Date(log.timestamp).toISOString()}`)}
                    >
                      View in Log Explorer <ExternalLink size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {activity.timeline.length === 0 && <p className="text-gray-500">No activity recorded for this UID.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserActivity;
