import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, AlertOctagon, Activity, ExternalLink, CheckCircle, RotateCcw } from 'lucide-react';
import { fetchSuspicious } from '../lib/api';

const severityBadge = (severity = 'medium') => {
  const styles = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-orange-100 text-orange-700',
    low: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200 text-yellow-700'
  };
  return styles[severity] || styles.medium;
};

const LABEL_MAP = {
  high_error_rate: 'High Error Rate',
  brute_force: 'Brute Force Attack',
  sql_injection: 'SQL Injection',
  xss: 'Cross-site Scripting (XSS)',
  path_traversal: 'Path Traversal',
  sensitive_file_access: 'Sensitive File Access',
  unauthorized_access: 'Unauthorized Access',
  traffic_spike: 'Traffic Spike',
};

const RANGE_STORAGE_KEY = 'logs.monitoring.security.range';
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

const Security = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState(() => getStoredRange('24h'));
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState(() => {
    try {
      const stored = window.localStorage.getItem('logs.monitoring.security.acknowledged');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const navigate = useNavigate();
  const severityRank = { high: 0, medium: 1, low: 2 };
  const rangeLabel = rangeOptions.find((option) => option.value === range)?.label || 'Last 24h';

  const toggleAcknowledge = (id, currentStatus) => {
    const updated = { ...acknowledgedAlerts };
    if (currentStatus) {
      delete updated[id];
    } else {
      updated[id] = Date.now();
    }
    setAcknowledgedAlerts(updated);
    window.localStorage.setItem('logs.monitoring.security.acknowledged', JSON.stringify(updated));
  };

  const load = async (selectedRange = range) => {
    setLoading(true);
    try {
      const res = await fetchSuspicious({ range: selectedRange });
      const payload = Array.isArray(res) ? res : res?.alerts || [];
      const ordered = [...payload].sort((a, b) => {
        const aRank = severityRank[a.severity] ?? 3;
        const bRank = severityRank[b.severity] ?? 3;
        if (aRank !== bRank) return aRank - bRank;
        return (b.count || 0) - (a.count || 0);
      });
      setAlerts(ordered);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(RANGE_STORAGE_KEY, range);
  }, [range]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="text-red-600" />
          <h1 className="text-2xl font-bold text-gray-100">Security & Anomalies</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-400">Range</div>
          <select
            value={range}
            onChange={(event) => setRange(event.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            {rangeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button onClick={() => load(range)} className="px-4 py-2 glass-button text-white rounded-lg text-sm font-semibold hover:glass-panel/20">
            Refresh
          </button>
        </div>
      </div>
      <div className="glass-panel/5 border border-white/10 p-4 rounded-lg flex items-start gap-4">
        <AlertOctagon className="text-red-600 shrink-0" />
        <div>
          <h3 className="font-bold text-red-400 mb-1">Automated detections ({rangeLabel})</h3>
          <p className="text-red-700 text-sm">
            Spikes in unauthorized requests, 5xx errors, and abnormal request rates are highlighted here. Investigate the listed actors promptly.
          </p>
        </div>
      </div>

      {loading && <p className="text-gray-400">Scanning logs for anomalies...</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {alerts.map((alert, idx) => {
          const alertId = `${alert.type}-${alert.actor || 'unknown'}-${alert.lastSeen}`;
          const isAck = !!acknowledgedAlerts[alertId];

          return (
            <div key={alertId} className={`glass-card p-5 rounded-xl border relative transition-all${isAck ? 'border-white/10 opacity-60 grayscale-[50%]' : 'border-red-100 hover:shadow-md'}`}>
              <button
                onClick={() => toggleAcknowledge(alertId, isAck)}
                className={`absolute top-4 right-4 p-1 rounded-full transition-colors${isAck ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-100' : 'text-gray-300 hover:text-green-600 hover:bg-green-50'}`}
                title={isAck ? "Undo Acknowledgment" : "Acknowledge Alert"}
              >
                {isAck ? <RotateCcw size={18} /> : <CheckCircle size={18} />}
              </button>

              <div className="flex items-center justify-between mb-3 pr-8">
                <span className={`px-2 py-1 rounded-full text-xs font-semibold${severityBadge(alert.severity)}`}>
                  {alert.severity || 'medium'}
                </span>
                <span className="text-xs text-gray-400">{LABEL_MAP[alert.type] || alert.type.replace(/_/g, ' ')}</span>
              </div>
              <div className="font-mono text-sm text-gray-100 mb-2">{alert.actor || 'unknown'}</div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-3xl font-bold text-white">{alert.count}</div>
                <div className="text-gray-400 text-sm flex items-center gap-1">
                  <Activity size={16} /> events
                </div>
              </div>
              <p className="text-sm text-gray-300">{alert.description}</p>
              {alert.apps && alert.apps.length > 0 && (
                <p className="text-xs text-gray-300 mt-2 font-medium">
                  Apps: <span className="text-blue-600">{alert.apps.join(', ')}</span>
                </p>
              )}
              {alert.sources && alert.sources.length > 0 && (
                <p className="text-xs text-gray-300 mt-1 font-medium">
                  Source: <span className="text-blue-600">{alert.sources.join(', ')}</span>
                </p>
              )}
              {alert.vmIds && alert.vmIds.length > 0 && (
                <p className="text-xs text-gray-300 mt-1 font-medium">
                  VMs: <span className="text-blue-600">{alert.vmIds.join(', ')}</span>
                </p>
              )}
              {alert.uids && alert.uids.length > 0 && (
                <p className="text-xs text-blue-600 mt-2 font-medium">
                  Users: {alert.uids.join(', ')}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1 truncate" title={alert.userAgent}>
                UA: {alert.userAgent || 'Unknown'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Last seen: {alert.lastSeen ? new Date(alert.lastSeen).toLocaleString() : '—'}</p>
              {alert.actor && (
                <button
                  onClick={() => navigate(`/logs?ip=${encodeURIComponent(alert.actor)}&range=${range}`)}
                  className="mt-3 inline-flex items-center gap-1 text-blue-600 text-sm font-semibold hover:text-blue-800"
                >
                  View related logs <ExternalLink size={14} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {alerts.length === 0 && !loading && (
        <div className="p-8 text-center glass-card rounded-xl border border-dashed border-white/10">
          <p className="text-gray-400">No high-risk anomalies detected in {rangeLabel.toLowerCase()}.</p>
        </div>
      )}
    </div>
  );
};

export default Security;
