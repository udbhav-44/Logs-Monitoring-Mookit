import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Clock, MapPin, ExternalLink } from 'lucide-react';
import { fetchUids, fetchUserActivity } from '../lib/api';

const TIMEFRAMES = [
  { value: '1h', label: 'Last 1 hour', ms: 60 * 60 * 1000 },
  { value: '6h', label: 'Last 6 hours', ms: 6 * 60 * 60 * 1000 },
  { value: '24h', label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000 },
  { value: '7d', label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { value: '30d', label: 'Last 30 days', ms: 30 * 24 * 60 * 60 * 1000 },
  { value: 'all', label: 'All time (latest 500)', ms: null },
  { value: 'custom', label: 'Custom range', ms: null }
];

const UserActivity = () => {
  const [uid, setUid] = useState('');
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeframe, setTimeframe] = useState('24h');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [uidDirectory, setUidDirectory] = useState([]);
  const [uidDirectoryLoading, setUidDirectoryLoading] = useState(false);
  const [uidDirectoryError, setUidDirectoryError] = useState('');
  const [uidFilter, setUidFilter] = useState('');
  const knownIps = activity?.summary?.ips || [];
  const topActions = activity?.summary?.topActions || [];
  const navigate = useNavigate();

  const hasCustomRange = useMemo(() => {
    if (!customStart || !customEnd) return false;
    const startDate = new Date(customStart);
    const endDate = new Date(customEnd);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return false;
    return startDate <= endDate;
  }, [customStart, customEnd]);

  const timeframeLabel = useMemo(() => {
    if (timeframe !== 'custom') {
      return TIMEFRAMES.find((entry) => entry.value === timeframe)?.label || 'Last 24 hours';
    }
    if (!hasCustomRange) return 'Custom range';
    const startLabel = new Date(customStart).toLocaleString();
    const endLabel = new Date(customEnd).toLocaleString();
    return `${startLabel} → ${endLabel}`;
  }, [timeframe, customStart, customEnd, hasCustomRange]);

  const buildRangeParams = (value) => {
    const entry = TIMEFRAMES.find((item) => item.value === value);
    if (!entry || !entry.ms) {
      if (value !== 'custom') return {};
      if (!hasCustomRange) return null;
      return {
        start: new Date(customStart).toISOString(),
        end: new Date(customEnd).toISOString()
      };
    }
    const end = new Date();
    const start = new Date(Date.now() - entry.ms);
    return { start: start.toISOString(), end: end.toISOString() };
  };

  const loadUidDirectory = async (range = timeframe) => {
    setUidDirectoryLoading(true);
    setUidDirectoryError('');
    try {
      const rangeParams = buildRangeParams(range);
      if (rangeParams === null) {
        setUidDirectory([]);
        setUidDirectoryError('Select a valid start and end time to load users.');
        return;
      }
      const params = { limit: 2000, ...rangeParams };
      const uids = await fetchUids(params);
      setUidDirectory(uids || []);
    } catch (err) {
      console.error(err);
      setUidDirectoryError('Unable to load UID list.');
    } finally {
      setUidDirectoryLoading(false);
    }
  };

  useEffect(() => {
    loadUidDirectory(timeframe);
  }, [timeframe]);

  useEffect(() => {
    if (!uid) return;
    if (timeframe === 'custom' && !hasCustomRange) return;
    runSearch(uid, timeframe);
  }, [timeframe, hasCustomRange]);

  const runSearch = async (value, range = timeframe) => {
    if (!value) return;
    const rangeParams = buildRangeParams(range);
    if (rangeParams === null) {
      setError('Select a valid start and end time.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetchUserActivity(value, rangeParams);
      setUid(value);
      setActivity(res);
    } catch (err) {
      console.error(err);
      setError('Unable to load activity for this UID.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    await runSearch(uid.trim());
  };

  const handleUidPick = (value) => {
    if (!value) return;
    runSearch(value);
  };

  const handleCopyUid = async () => {
    if (!activity?.uid || !navigator?.clipboard) return;
    try {
      await navigator.clipboard.writeText(activity.uid);
    } catch (err) {
      console.error(err);
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

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
          <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-4 items-end">
            <div className="relative">
              <User className="absolute left-3 top-3 text-gray-400" size={18} />
              <input
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                placeholder="Enter User ID (UID) to trace"
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Timeframe</label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
              >
                {TIMEFRAMES.map((entry) => (
                  <option key={entry.value} value={entry.value}>{entry.label}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 flex items-center gap-2">
              <Search size={18} />
              Trace
            </button>
          </form>
          {timeframe === 'custom' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500">Start (local time)</label>
                <input
                  type="datetime-local"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">End (local time)</label>
                <input
                  type="datetime-local"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>
          )}
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-600">User Directory</h3>
            <button
              type="button"
              onClick={() => loadUidDirectory(timeframe)}
              className="text-xs text-gray-500 hover:text-gray-800"
            >
              Refresh
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-3">{timeframeLabel}</p>
          <input
            value={uidFilter}
            onChange={(e) => setUidFilter(e.target.value)}
            placeholder="Filter users..."
            className="mb-3 w-full px-3 py-2 border rounded-lg text-sm"
          />
          {uidDirectoryLoading && <p className="text-sm text-gray-500">Loading users...</p>}
          {uidDirectoryError && <p className="text-sm text-red-600">{uidDirectoryError}</p>}
          {!uidDirectoryLoading && uidDirectory.length === 0 && !uidDirectoryError && (
            <p className="text-sm text-gray-500">No UID activity yet.</p>
          )}
          <select
            value={uid}
            onChange={(e) => handleUidPick(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">Select a user...</option>
            {uidDirectory
              .filter((item) => !uidFilter || (item.uid || '').toLowerCase().includes(uidFilter.toLowerCase()))
              .map((item) => {
                if (!item.uid) return null;
                return (
                  <option key={item.uid} value={item.uid}>
                    {item.uid} · {item.count}
                  </option>
                );
              })}
          </select>
        </div>
      </div>

      {loading && <p className="text-gray-500">Loading activity...</p>}

      {activity && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-100 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-gray-500">UID</p>
              <p className="text-lg font-bold text-gray-900 font-mono">{activity.uid || uid}</p>
              <p className="text-xs text-gray-500 mt-1">{activity.summary.total} events · {timeframeLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyUid}
                className="px-3 py-1.5 text-xs font-semibold border rounded-lg text-gray-600 hover:text-gray-900"
              >
                Copy UID
              </button>
              <button
                type="button"
                onClick={() => navigate(`/logs?uid=${activity.uid || uid}`)}
                className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Open Logs
              </button>
            </div>
          </div>
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
