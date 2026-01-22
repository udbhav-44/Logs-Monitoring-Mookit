import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, AlertOctagon, Activity, ExternalLink } from 'lucide-react';
import { fetchSuspicious } from '../lib/api';

const severityBadge = (severity = 'medium') => {
  const styles = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-orange-100 text-orange-700',
    low: 'bg-yellow-50 text-yellow-700'
  };
  return styles[severity] || styles.medium;
};

const Security = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const severityRank = { high: 0, medium: 1, low: 2 };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetchSuspicious();
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
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldAlert className="text-red-600" />
        <h1 className="text-2xl font-bold text-gray-800">Security & Anomalies</h1>
      </div>
      <div className="bg-red-50 border border-red-100 p-4 rounded-lg flex items-start gap-4">
        <AlertOctagon className="text-red-600 shrink-0" />
        <div>
          <h3 className="font-bold text-red-800 mb-1">Automated detections (last 24h)</h3>
          <p className="text-red-700 text-sm">
            Spikes in unauthorized requests, 5xx errors, and abnormal request rates are highlighted here. Investigate the listed actors promptly.
          </p>
        </div>
      </div>

      {loading && <p className="text-gray-500">Scanning logs for anomalies...</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {alerts.map((alert, idx) => (
          <div key={`${alert.type}-${alert.actor || idx}`} className="bg-white p-5 rounded-xl shadow-sm border border-red-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${severityBadge(alert.severity)}`}>
                {alert.severity || 'medium'}
              </span>
              <span className="text-xs text-gray-500">{alert.type.replace(/_/g, ' ')}</span>
            </div>
            <div className="font-mono text-sm text-gray-800 mb-2">{alert.actor || 'unknown'}</div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-3xl font-bold text-gray-900">{alert.count}</div>
              <div className="text-gray-500 text-sm flex items-center gap-1">
                <Activity size={16} /> events
              </div>
            </div>
            <p className="text-sm text-gray-600">{alert.description}</p>
            <p className="text-xs text-gray-400 mt-2">Last seen: {alert.lastSeen ? new Date(alert.lastSeen).toLocaleString() : '—'}</p>
            {alert.actor && (
              <button
                onClick={() => navigate(`/logs?ip=${encodeURIComponent(alert.actor)}`)}
                className="mt-3 inline-flex items-center gap-1 text-indigo-600 text-sm font-semibold hover:text-indigo-800"
              >
                View related logs <ExternalLink size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {alerts.length === 0 && !loading && (
        <div className="p-8 text-center bg-white rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-500">No high-risk anomalies detected in the last 24 hours.</p>
        </div>
      )}
    </div>
  );
};

export default Security;
