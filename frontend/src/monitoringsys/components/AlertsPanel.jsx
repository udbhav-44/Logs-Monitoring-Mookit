import { useState, useEffect } from 'react';
import config from '../config';

const AlertsPanel = ({ vmId, socket }) => {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [severityFilter, setSeverityFilter] = useState('all'); // all, warning, critical
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState(Notification.permission);

  useEffect(() => {
    if (!vmId) return;

    fetchAlerts();
    fetchStats();

    // Listen for real-time alert updates
    if (socket) {
      socket.on('alerts:new', handleNewAlerts);
    }

    const interval = setInterval(() => {
      fetchStats();
    }, 10000); // Refresh every 10 seconds

    return () => {
      clearInterval(interval);
      if (socket) {
        socket.off('alerts:new', handleNewAlerts);
      }
    };
  }, [vmId, socket]);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${config.SERVER_URL}/api/alerts/${vmId}?limit=50`);
      const data = await response.json();
      setAlerts(data);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${config.SERVER_URL}/api/alerts/${vmId}/stats?period=24h`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching alert stats:', error);
    }
  };

  const handleNewAlerts = (data) => {
    if (data.vmId === vmId) {
      fetchAlerts();
      fetchStats();

      // Show browser notification for critical alerts
      data.alerts.forEach(alert => {
        if (alert.severity === 'critical' && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            new Notification('Critical Alert', {
              body: alert.message,
              icon: '/alert-icon.png'
            });
          }
        }
      });
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      setPermission(perm);
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    if (severityFilter !== 'all' && alert.severity !== severityFilter) return false;
    return true;
  });

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleString();
  };

  const getMetricTypeLabel = (metricType) => {
    // Handle undefined or null metricType
    if (!metricType) {
      return 'Unknown';
    }

    const labels = {
      'cpu_usage': 'CPU Usage',
      'load_average': 'Load Average',
      'memory_usage': 'Memory Usage',
      'swap_usage': 'Swap Usage',
      'disk_usage': 'Disk Usage',
      'disk_inodes': 'Disk Inodes',
      'disk_io_wait': 'Disk I/O Wait'
    };

    if (metricType.startsWith('service_')) {
      const serviceName = metricType.replace('service_', '');
      return `Service: ${serviceName}`;
    }

    return labels[metricType] || metricType;
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading alerts...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">Alerts</h2>
        {permission === 'default' && (
          <button onClick={requestNotificationPermission} className="px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">
            Enable Notifications
          </button>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-orange-50 border border-orange-100 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.warning_count || 0}</div>
            <div className="text-sm font-medium text-orange-800">Warnings (24h)</div>
          </div>
          <div className="bg-red-50 border border-red-100 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-600">{stats.critical_count || 0}</div>
            <div className="text-sm font-medium text-red-800">Critical (24h)</div>
          </div>
          <div className="bg-gray-50 border border-gray-100 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-gray-700">{stats.total_count || 0}</div>
            <div className="text-sm font-medium text-gray-600">Total (24h)</div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Severity:</label>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="block w-48 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            <option value="all">All</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
            <p>No alerts found</p>
          </div>
        ) : (
          filteredAlerts.map(alert => (
            <div
              key={alert.id}
              className={`p-4 rounded-lg border ${alert.severity === 'critical'
                ? 'bg-red-50 border-red-200'
                : alert.severity === 'warning'
                  ? 'bg-orange-50 border-orange-200'
                  : 'bg-gray-50 border-gray-200'
                }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${alert.severity === 'critical' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'
                    }`}>
                    {alert.severity.toUpperCase()}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{getMetricTypeLabel(alert.metric_type || alert.metricType)}</span>
                </div>
                <div className="text-xs text-gray-500 font-medium">
                  {formatTimestamp(alert.triggered_at || alert.triggeredAt)}
                </div>
              </div>

              <div className="text-sm text-gray-800 mt-1 mb-3">
                {alert.message}
              </div>

              <div className="flex gap-4 text-xs font-mono text-gray-500 bg-white/50 p-2 rounded">
                <span><span className="text-gray-400">Threshold:</span> {alert.threshold_value || alert.thresholdValue}</span>
                <span><span className="text-gray-400">Current:</span> {alert.current_value || alert.currentValue}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AlertsPanel;
