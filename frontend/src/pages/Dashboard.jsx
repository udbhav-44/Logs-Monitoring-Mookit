import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Activity, AlertTriangle, FileText, Shield } from 'lucide-react';
import { fetchOverview, fetchFilters } from '../lib/api';
import anime from 'animejs';

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

// ─── CountUp ────────────────────────────────────────────────────────────────
const CountUp = ({ value, className }) => {
  const ref = useRef(null);
  const prevValue = useRef(0);

  useEffect(() => {
    if (!ref.current || value == null) return;
    const from = prevValue.current;
    const to = value || 0;
    prevValue.current = to;
    const obj = { val: from };
    anime({
      targets: obj,
      val: [from, to],
      round: 1,
      easing: 'easeOutExpo',
      duration: 900,
      update() {
        if (ref.current) {
          ref.current.textContent = Math.round(obj.val).toLocaleString();
        }
      },
    });
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {(value || 0).toLocaleString()}
    </span>
  );
};

// ─── Skeleton ────────────────────────────────────────────────────────────────
const DashboardSkeleton = () => (
  <div className="space-y-8 animate-pulse">
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <div className="h-7 w-48 bg-gray-200 rounded-lg" />
        <div className="h-4 w-72 bg-gray-100 rounded-lg" />
      </div>
      <div className="flex gap-2">
        <div className="h-9 w-28 bg-gray-200 rounded-lg" />
        <div className="h-9 w-28 bg-gray-200 rounded-lg" />
        <div className="h-9 w-24 bg-gray-200 rounded-lg" />
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white p-6 rounded-xl border border-gray-100 space-y-3">
          <div className="flex justify-between">
            <div className="space-y-2 flex-1">
              <div className="h-3.5 w-3/4 bg-gray-200 rounded" />
              <div className="h-7 w-1/2 bg-gray-200 rounded" />
            </div>
            <div className="w-11 h-11 bg-gray-100 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
    <div className="grid grid-cols-3 gap-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white p-6 rounded-xl border border-gray-100">
          <div className="flex justify-between">
            <div className="space-y-2 flex-1">
              <div className="h-3.5 w-3/4 bg-gray-200 rounded" />
              <div className="h-7 w-1/2 bg-gray-200 rounded" />
            </div>
            <div className="w-11 h-11 bg-gray-100 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
    <div className="grid grid-cols-2 gap-8">
      <div className="bg-white p-6 rounded-xl border border-gray-100 h-80" />
      <div className="bg-white p-6 rounded-xl border border-gray-100 h-80" />
    </div>
  </div>
);

// ─── Dashboard ───────────────────────────────────────────────────────────────
const Dashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warming, setWarming] = useState(false);
  const [range, setRange] = useState(() => searchParams.get('range') || getStoredRange('24h'));
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const [filters, setFilters] = useState({ apps: [], vmIds: [] });
  const [selectedApp, setSelectedApp] = useState(() => searchParams.get('app') || '');
  const [selectedVm, setSelectedVm] = useState(() => searchParams.get('vmId') || '');

  const hasUserSetRange = useRef(false);
  const refreshInFlight = useRef(false);
  const hasAnimated = useRef(false);
  const cardsGridRef = useRef(null);
  const perfGridRef = useRef(null);
  const chartsRef = useRef(null);
  const navigate = useNavigate();

  const rangeLabel = rangeOptions.find((option) => option.value === range)?.label || 'Last 24h';

  const load = async (selectedRange = range, app = selectedApp, vm = selectedVm, options = {}) => {
    const { silent = false } = options;
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (!silent && !stats) setLoading(true);
    setError('');
    try {
      const params = { range: selectedRange };
      if (app) params.app = app;
      if (vm) params.vmId = vm;

      const res = await fetchOverview(params);
      const data = res?.data || {};
      if (res?.status === 202) {
        setWarming(true);
      } else {
        setStats(data);
        setWarming(false);
        setLastRefreshed(new Date());
      }
    } catch (err) {
      console.error(err);
      setError('Unable to load analytics right now. Please verify the backend is running on the configured port.');
    } finally {
      if (!silent && !stats) setLoading(false);
      refreshInFlight.current = false;
    }
  };

  useEffect(() => {
    fetchFilters().then(data => {
      setFilters({ apps: data.apps || [], vmIds: data.vmIds || [] });
    }).catch(console.error);
  }, []);

  useEffect(() => {
    load(range, selectedApp, selectedVm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, selectedApp, selectedVm]);

  useEffect(() => {
    const refreshMs = Number(import.meta.env.VITE_DASHBOARD_REFRESH_MS) || 5000;
    if (Number.isNaN(refreshMs) || refreshMs <= 0) return undefined;
    const interval = setInterval(() => {
      load(range, selectedApp, selectedVm, { silent: true });
    }, refreshMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, selectedApp, selectedVm]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(RANGE_STORAGE_KEY, range);
  }, [range]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    let changed = false;

    const setOrDelete = (key, value) => {
      if (value) {
        if (params.get(key) !== value) { params.set(key, value); changed = true; }
      } else {
        if (params.has(key)) { params.delete(key); changed = true; }
      }
    };

    setOrDelete('range', range);
    setOrDelete('app', selectedApp);
    setOrDelete('vmId', selectedVm);

    if (changed) {
      setSearchParams(params, { replace: true });
    }
  }, [range, selectedApp, selectedVm, searchParams, setSearchParams]);

  useEffect(() => {
    if (hasUserSetRange.current) return;
    if (stats?.totals?.window === 0 && (stats?.totals?.overall || 0) > 0 && range !== 'all') {
      setRange('all');
    }
  }, [stats, range]);

  // Entrance animations once data is ready
  useEffect(() => {
    if (!stats || hasAnimated.current) return;
    hasAnimated.current = true;

    const tl = anime.timeline({ easing: 'easeOutQuad' });

    tl.add({
      targets: cardsGridRef.current?.querySelectorAll('.stat-card'),
      opacity: [0, 1],
      translateY: [22, 0],
      delay: anime.stagger(70),
      duration: 450,
    }).add({
      targets: perfGridRef.current?.querySelectorAll('.stat-card'),
      opacity: [0, 1],
      translateY: [22, 0],
      delay: anime.stagger(70),
      duration: 400,
    }, '-=250').add({
      targets: chartsRef.current?.querySelectorAll('.chart-panel'),
      opacity: [0, 1],
      translateY: [18, 0],
      delay: anime.stagger(100),
      duration: 500,
    }, '-=200');
  }, [stats]);

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
    { title: 'Total Logs', value: safeStats.totals.overall, icon: <FileText className="w-5 h-5 text-blue-600" />, color: 'bg-blue-50', accent: 'text-blue-600' },
    { title: range === '24h' ? 'Last 24h' : `Range (${rangeLabel})`, value: rangeCount, icon: <Activity className="w-5 h-5 text-indigo-600" />, color: 'bg-indigo-50', accent: 'text-indigo-600' },
    { title: 'Client Errors (4xx)', value: safeStats.statusBuckets.client4xx, icon: <AlertTriangle className="w-5 h-5 text-orange-600" />, color: 'bg-orange-50', accent: 'text-orange-600' },
    { title: 'Server Errors (5xx)', value: safeStats.statusBuckets.server5xx, icon: <Shield className="w-5 h-5 text-red-600" />, color: 'bg-red-50', accent: 'text-red-600' },
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

  if (loading) return <DashboardSkeleton />;
  if (error || !stats) return (
    <div className="flex flex-col items-center justify-center min-h-64 gap-3">
      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
        <Shield className="w-6 h-6 text-red-500" />
      </div>
      <p className="text-red-600 font-medium">{error || 'Error loading data'}</p>
      <button
        onClick={() => load()}
        className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
      >
        Retry
      </button>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">System Overview</h1>
          <p className="text-gray-500 text-sm mt-0.5">Traffic, errors, and activity across all monitored apps.</p>
          {warming && (
            <p className="text-sm text-amber-600 mt-1 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Warming up overview metrics...
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedApp}
            onChange={(e) => setSelectedApp(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          >
            <option value="">All Apps</option>
            {filters.apps.map(app => <option key={app} value={app}>{app}</option>)}
          </select>

          <select
            value={selectedVm}
            onChange={(e) => setSelectedVm(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          >
            <option value="">All VMs</option>
            {filters.vmIds.map(vm => <option key={vm} value={vm}>{vm}</option>)}
          </select>

          <div className="h-6 w-px bg-gray-200 mx-1" />

          <select
            value={range}
            onChange={(event) => {
              hasUserSetRange.current = true;
              setRange(event.target.value);
            }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          >
            {rangeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <span className="text-xs text-gray-400 ml-2 hidden sm:inline-block">
            Last updated: {lastRefreshed.toLocaleTimeString()}
          </span>

          <button
            onClick={() => load(range, selectedApp, selectedVm)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 active:scale-95 transition-all shadow-sm shadow-indigo-200"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div ref={cardsGridRef} className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {cards.map((card) => (
          <div key={card.title} className="stat-card bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">{card.title}</p>
                <h3 className="text-2xl font-bold text-gray-900">
                  <CountUp value={card.value} />
                </h3>
              </div>
              <div className={`p-2.5 rounded-xl ${card.color}`}>
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Performance Metrics */}
      <div ref={perfGridRef} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="stat-card bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Avg Response Size</p>
              <h3 className="text-2xl font-bold text-gray-900">
                <CountUp value={safeStats.performance?.avgResponseSize} /> B
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-teal-50">
              <Activity className="w-5 h-5 text-teal-600" />
            </div>
          </div>
        </div>
        <div className="stat-card bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Avg Requests/Sec</p>
              <h3 className="text-2xl font-bold text-gray-900">
                <CountUp value={safeStats.performance?.avgRps} />
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-50">
              <Activity className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </div>
        <div className="stat-card bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Peak Requests/Min</p>
              <h3 className="text-2xl font-bold text-gray-900">
                <CountUp value={safeStats.performance?.peakRpm} />
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-pink-50">
              <Activity className="w-5 h-5 text-pink-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div ref={chartsRef} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="chart-panel bg-white p-6 rounded-xl shadow-sm border border-gray-100" style={{ opacity: 0 }}>
          <div className="mb-4">
            <h2 className="text-base font-bold text-gray-800">Traffic vs Errors ({rangeLabel})</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {bucketUnit === 'day' ? 'Daily' : 'Hourly'} breakdown of requests and 4xx/5xx responses.
            </p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trafficData} onClick={handleTrafficClick}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip labelFormatter={(label) => formatBucket(label)} />
                <Line type="monotone" dataKey="requests" stroke="#4F46E5" strokeWidth={2} dot={false} name="Requests" />
                <Line type="monotone" dataKey="errors" stroke="#EF4444" strokeWidth={2} dot={false} name="Errors" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-panel bg-white p-6 rounded-xl shadow-sm border border-gray-100" style={{ opacity: 0 }}>
          <div className="mb-4">
            <h2 className="text-base font-bold text-gray-800">Status Code Distribution</h2>
            <p className="text-sm text-gray-500 mt-0.5">Click a bar to filter logs by status code.</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusDist} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis type="number" tickFormatter={(value) => value.toLocaleString()} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="code" width={50} tickFormatter={(value) => String(value)} tick={{ fontSize: 11 }} />
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

      {/* Bottom panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-base font-bold text-gray-800 mb-3">Top Endpoints ({rangeLabel})</h2>
          <div className="space-y-2">
            {(stats.topEndpoints || []).map((item) => (
              <div
                key={item.endpoint}
                className="flex items-center justify-between border border-gray-100 rounded-xl px-4 py-3 hover:border-indigo-200 hover:bg-indigo-50/30 cursor-pointer transition-all"
                onClick={() => goToLogs({ search: item.endpoint })}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate text-sm">{item.endpoint || 'unknown'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Errors: {item.errors || 0}</p>
                </div>
                <div className="text-right ml-4">
                  <div className="text-xl font-bold text-gray-900">{item.count.toLocaleString()}</div>
                  <p className="text-xs text-gray-400">hits</p>
                </div>
              </div>
            ))}
            {(!stats.topEndpoints || stats.topEndpoints.length === 0) && (
              <p className="text-gray-400 text-sm py-4 text-center">No endpoint activity yet.</p>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-base font-bold text-gray-800 mb-4">Top Actors ({rangeLabel})</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">IP Addresses</h3>
              <div className="space-y-1.5">
                {(stats.topIps || []).map((ip) => (
                  <div
                    key={ip.ip}
                    className="flex justify-between items-center px-3 py-2 rounded-lg bg-gray-50 hover:bg-indigo-50 cursor-pointer transition-colors"
                    onClick={() => goToLogs({ ip: ip.ip })}
                  >
                    <span className="font-mono text-xs text-gray-700 truncate">{ip.ip || 'unknown'}</span>
                    <span className="text-gray-800 font-semibold text-sm ml-2">{ip.count}</span>
                  </div>
                ))}
                {(!stats.topIps || stats.topIps.length === 0) && (
                  <p className="text-gray-400 text-xs">No IP activity.</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Users (UID)</h3>
              <div className="space-y-1.5">
                {(stats.topUids || []).map((u) => (
                  <div
                    key={u.uid}
                    className="flex justify-between items-center px-3 py-2 rounded-lg bg-gray-50 hover:bg-indigo-50 cursor-pointer transition-colors"
                    onClick={() => goToLogs({ uid: u.uid })}
                  >
                    <span className="font-mono text-xs text-gray-700 truncate">{u.uid || 'unknown'}</span>
                    <span className="text-gray-800 font-semibold text-sm ml-2">{u.count}</span>
                  </div>
                ))}
                {(!stats.topUids || stats.topUids.length === 0) && (
                  <p className="text-gray-400 text-xs">No UID activity.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Application Health */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-base font-bold text-gray-800 mb-4">Application Health</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {applications.map((app) => (
            <div
              key={app.app}
              className="border border-gray-100 rounded-xl p-4 hover:border-indigo-200 hover:shadow-sm cursor-pointer transition-all"
              onClick={() => goToLogs({ app: app.app })}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-gray-800 text-sm">{app.app}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${parseFloat(app.errorRate) > 10 ? 'bg-red-50 text-red-700' : 'bg-indigo-50 text-indigo-700'
                  }`}>
                  {app.errorRate}% err
                </span>
              </div>
              <p className="text-xs text-gray-400 mb-3">VMs: {app.vmIds.join(', ')}</p>
              <div className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-bold text-gray-900">{app.total.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">Logs</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-red-600">{app.errors.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">Errors</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2 truncate">
                {Object.entries(app.sources || {}).map(([k, v]) => `${k}:${v}`).join('  ')}
              </p>
            </div>
          ))}
          {applications.length === 0 && (
            <p className="text-gray-400 text-sm py-4">No application data.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
