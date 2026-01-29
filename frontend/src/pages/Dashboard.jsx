import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Activity, AlertTriangle, FileText, Shield } from 'lucide-react';
import { fetchOverview } from '../lib/api';

const RANGE_STORAGE_KEY = 'logs.monitoring.dashboard.range';
const rangeOptions = [
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' },
  { value: 'all', label: 'All time' }
];

const getStoredRange = (fallback) => {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(RANGE_STORAGE_KEY);
  const allowed = new Set(rangeOptions.map((option) => option.value));
  return stored && allowed.has(stored) ? stored : fallback;
};

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState(() => getStoredRange('30d'));
  const hasUserSetRange = useRef(false);
  const refreshInFlight = useRef(false);
  const navigate = useNavigate();

  const rangeLabel = rangeOptions.find((option) => option.value === range)?.label || 'Last 24h';

  const load = async (selectedRange = range, options = {}) => {
    const { silent = false } = options;
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (!silent && !stats) setLoading(true);
    setError('');
    try {
      const data = await fetchOverview({ range: selectedRange });
      setStats(data);
    } catch (err) {
      console.error(err);
      setError('Unable to load analytics right now. Please verify the backend is running on the configured port.');
    } finally {
      if (!silent && !stats) setLoading(false);
      refreshInFlight.current = false;
    }
  };

  useEffect(() => {
    load(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useEffect(() => {
    const refreshMs = Number(import.meta.env.VITE_DASHBOARD_REFRESH_MS) || 5000;
    if (Number.isNaN(refreshMs) || refreshMs <= 0) return undefined;
    const interval = setInterval(() => {
      load(range, { silent: true });
    }, refreshMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(RANGE_STORAGE_KEY, range);
  }, [range]);

  useEffect(() => {
    if (hasUserSetRange.current) return;
    if (stats?.totals?.window === 0 && (stats?.totals?.overall || 0) > 0 && range !== 'all') {
      setRange('all');
    }
  }, [stats, range]);

  const goToLogs = (params = {}) => {
    const search = new URLSearchParams(params).toString();
    navigate(`/logs${search ? `?${search}` : ''}`);
  };

  const handleStatusClick = (entry) => {
    const status = entry?.payload?.code || entry?.payload?._id;
    if (status) goToLogs({ status });
  };

  const handleTrafficClick = (chartState) => {
    if (!chartState?.activeLabel) return;
    const bucket = chartState.activeLabel;
    const bucketUnit = stats?.bucketUnit || 'hour';
    const start = bucketUnit === 'day' ? `${bucket}T00:00:00` : `${bucket}:00:00`;
    const end = bucketUnit === 'day' ? `${bucket}T23:59:59` : `${bucket}:59:59`;
    goToLogs({ start, end });
  };

  const safeStats = stats || {
    totals: {},
    statusBuckets: {},
    traffic: [],
    errorTrend: [],
    statusDist: [],
    applications: []
  };

  const statusDist = useMemo(
    () => (safeStats.statusDist || []).filter(item => item.code !== null && item.code !== undefined),
    [safeStats.statusDist]
  );
  const applications = useMemo(() => safeStats.applications || [], [safeStats.applications]);
  const rangeCount = useMemo(
    () => (safeStats.totals?.window ?? safeStats.totals?.last24h),
    [safeStats.totals]
  );
  const cards = useMemo(() => ([
    { title: 'Total Logs', value: safeStats.totals.overall, icon: <FileText className="text-blue-600" />, color: 'bg-blue-50' },
    { title: range === '24h' ? 'Last 24h' : `Range (${rangeLabel})`, value: rangeCount, icon: <Activity className="text-indigo-600" />, color: 'bg-indigo-50' },
    { title: 'Client Errors (4xx)', value: safeStats.statusBuckets.client4xx, icon: <AlertTriangle className="text-orange-600" />, color: 'bg-orange-50' },
    { title: 'Server Errors (5xx)', value: safeStats.statusBuckets.server5xx, icon: <Shield className="text-red-600" />, color: 'bg-red-50' },
  ]), [range, rangeLabel, rangeCount, safeStats.statusBuckets, safeStats.totals]);

  const trafficData = useMemo(() => {
    const trafficMap = new Map();
    (safeStats.traffic || []).forEach(item => trafficMap.set(item.bucket, { bucket: item.bucket, requests: item.count, errors: 0 }));
    (safeStats.errorTrend || []).forEach(item => {
      const existing = trafficMap.get(item.bucket) || { bucket: item.bucket, requests: 0, errors: 0 };
      existing.errors = item.count;
      trafficMap.set(item.bucket, existing);
    });
    return Array.from(trafficMap.values()).sort((a, b) => (a.bucket > b.bucket ? 1 : -1));
  }, [safeStats.traffic, safeStats.errorTrend]);

  const bucketUnit = useMemo(() => safeStats.bucketUnit || 'hour', [safeStats.bucketUnit]);
  const formatBucket = useCallback((bucket) => {
    if (!bucket) return '';
    if (bucketUnit === 'day') return bucket;
    return bucket.replace('T', ' ').slice(5);
  }, [bucketUnit]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (error || !stats) return <div className="p-8 text-red-600">{error || 'Error loading data'}</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">System Overview</h1>
          <p className="text-gray-500">Traffic, errors, and activity across all monitored apps.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-500">Range</div>
          <select
            value={range}
            onChange={(event) => {
              hasUserSetRange.current = true;
              setRange(event.target.value);
            }}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            {rangeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button onClick={() => load(range)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700">
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {cards.map((card, index) => (
          <div key={card.title} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">{card.title}</p>
                <h3 className="text-2xl font-bold text-gray-900">{(card.value || 0).toLocaleString()}</h3>
              </div>
              <div className={`p-3 rounded-lg ${card.color}`}>
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Traffic vs Errors ({rangeLabel})</h2>
              <p className="text-sm text-gray-500">{bucketUnit === 'day' ? 'Daily' : 'Hourly'} breakdown of requests and 4xx/5xx responses.</p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trafficData} onClick={handleTrafficClick}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} />
                <YAxis />
                <Tooltip labelFormatter={(label) => formatBucket(label)} />
                <Line type="monotone" dataKey="requests" stroke="#4F46E5" strokeWidth={2} name="Requests" />
                <Line type="monotone" dataKey="errors" stroke="#EF4444" strokeWidth={2} name="Errors" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Status Code Distribution</h2>
              <p className="text-sm text-gray-500">Click a bar to filter logs by status code.</p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusDist} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(value) => value.toLocaleString()} />
                <YAxis type="category" dataKey="code" width={50} tickFormatter={(value) => String(value)} />
                <Tooltip
                  formatter={(value) => [Number(value).toLocaleString(), 'Requests']}
                  labelFormatter={(label) => `Status ${label}`}
                />
                <Bar
                  dataKey="count"
                  fill="#818CF8"
                  radius={[0, 6, 6, 0]}
                  barSize={20}
                  minPointSize={4}
                  onClick={handleStatusClick}
                  cursor="pointer"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 mb-3">Top Endpoints ({rangeLabel})</h2>
          <div className="space-y-3">
            {(stats.topEndpoints || []).map((item) => (
              <div
                key={item.endpoint}
                className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3 hover:border-indigo-100 cursor-pointer"
                onClick={() => goToLogs({ search: item.endpoint })}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{item.endpoint || 'unknown'}</p>
                  <p className="text-sm text-gray-500">Errors: {item.errors || 0}</p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-gray-900">{item.count}</div>
                  <p className="text-xs text-gray-400">hits</p>
                </div>
              </div>
            ))}
            {(!stats.topEndpoints || stats.topEndpoints.length === 0) && (
              <p className="text-gray-500 text-sm">No endpoint activity yet.</p>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 mb-4">Top Actors ({rangeLabel})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-2">IP Addresses</h3>
              <div className="space-y-2">
                {(stats.topIps || []).map((ip) => (
                  <div
                    key={ip.ip}
                    className="flex justify-between items-center px-3 py-2 rounded-lg bg-gray-50 cursor-pointer"
                    onClick={() => goToLogs({ ip: ip.ip })}
                  >
                    <span className="font-mono text-sm text-gray-700">{ip.ip || 'unknown'}</span>
                    <span className="text-gray-600 font-semibold">{ip.count}</span>
                  </div>
                ))}
                {(!stats.topIps || stats.topIps.length === 0) && <p className="text-gray-500 text-sm">No IP activity.</p>}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-2">Users (UID)</h3>
              <div className="space-y-2">
                {(stats.topUids || []).map((u) => (
                  <div
                    key={u.uid}
                    className="flex justify-between items-center px-3 py-2 rounded-lg bg-gray-50 cursor-pointer"
                    onClick={() => goToLogs({ uid: u.uid })}
                  >
                    <span className="font-mono text-sm text-gray-700">{u.uid || 'unknown'}</span>
                    <span className="text-gray-600 font-semibold">{u.count}</span>
                  </div>
                ))}
                {(!stats.topUids || stats.topUids.length === 0) && <p className="text-gray-500 text-sm">No UID activity.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Application Health</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {applications.map((app) => (
            <div
              key={app.app}
              className="border border-gray-100 rounded-xl p-4 hover:border-indigo-100 cursor-pointer"
              onClick={() => goToLogs({ app: app.app })}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-gray-800">{app.app}</p>
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">{app.errorRate}% errors</span>
              </div>
              <p className="text-sm text-gray-500 mb-3">VMs: {app.vmIds.join(', ')}</p>
              <div className="flex items-center justify-between text-sm text-gray-600">
                <div>
                  <p className="font-semibold text-gray-800">{app.total}</p>
                  <p>Logs</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-red-600">{app.errors}</p>
                  <p>Errors</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">Sources: {Object.entries(app.sources || {}).map(([k, v]) => `${k}:${v}`).join('  ')}</p>
            </div>
          ))}
          {applications.length === 0 && <p className="text-gray-500 text-sm">No application data.</p>}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
