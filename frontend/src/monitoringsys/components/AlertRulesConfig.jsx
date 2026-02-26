import { useState, useEffect } from 'react';
import config from '../config';
import { toast } from '../../components/Toast';

const AlertRulesConfig = () => {
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${config.SERVER_URL}/api/alert-rules`);
      const data = await response.json();
      setRules(data);
    } catch (error) {
      console.error('Error fetching alert rules:', error);
      toast.error('Error loading alert rules');
    } finally {
      setLoading(false);
    }
  };

  const saveRules = async () => {
    try {
      setSaving(true);
      const response = await fetch(`${config.SERVER_URL}/api/alert-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules)
      });

      if (response.ok) {
        toast.success('Alert rules saved successfully');
      } else {
        toast.error('Failed to save alert rules');
      }
    } catch (error) {
      console.error('Error saving alert rules:', error);
      toast.error('Failed to save alert rules');
    } finally {
      setSaving(false);
    }
  };

  const updateRule = (metricType, severity, field, value) => {
    setRules(prev => ({
      ...prev,
      [metricType]: {
        ...prev[metricType],
        [severity]: {
          ...prev[metricType][severity],
          [field]: field === 'duration' ? parseInt(value) : parseFloat(value)
        }
      }
    }));
  };

  const formatDuration = (ms) => {
    if (ms === 0) return 'Immediate';
    const minutes = ms / (60 * 1000);
    return `${minutes} min${minutes > 1 ? 's' : ''}`;
  };

  const ruleDescriptions = {
    cpu_usage: {
      name: 'CPU Usage',
      unit: '%'
    },
    load_average: {
      name: 'Load Average',
      unit: 'x cores'
    },
    memory_usage: {
      name: 'Memory Usage',
      unit: '%'
    },
    swap_usage: {
      name: 'Swap Usage',
      unit: '%'
    },
    disk_usage: {
      name: 'Disk Space',
      unit: '%'
    },
    disk_inodes: {
      name: 'Disk Inodes',
      unit: '%'
    },
    disk_io_wait: {
      name: 'Disk I/O Wait',
      unit: '%'
    }
  };

  if (loading) {
    return <div className="text-center p-10 text-gray-500 font-medium">Loading alert rules...</div>;
  }

  if (!rules) {
    return <div className="text-center p-10 text-red-500 font-medium">Failed to load alert rules</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-5">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-4 border-b border-gray-200 gap-4">
        <h2 className="m-0 text-2xl font-bold text-gray-900">Alert Rules Configuration</h2>
        <button
          onClick={saveRules}
          disabled={saving}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
        >
          {saving ? 'Saving...' : 'Save Rules'}
        </button>
      </div>

      <div className="bg-indigo-50 border-l-4 border-indigo-600 p-4 mb-6 rounded-r-lg">
        <p className="m-0 text-gray-700 leading-relaxed text-sm">Configure thresholds and durations for alerting. Duration specifies how long a threshold must be exceeded before triggering an alert.</p>
      </div>

      <div className="flex flex-col gap-6">
        {Object.entries(rules).map(([metricType, rule]) => {
          const desc = ruleDescriptions[metricType];
          if (!desc) return null;

          return (
            <div key={metricType} className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
              <div className="mb-5 pb-4 border-b border-gray-100">
                <h3 className="m-0 text-xl font-bold text-gray-900">{desc.name}</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200 border-l-4 border-l-yellow-500">
                  <h4 className="m-0 mb-4 text-base font-bold text-yellow-800 uppercase tracking-wide">Warning</h4>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-sm font-medium text-gray-700 min-w-[80px]">Threshold:</label>
                      <input
                        type="number"
                        step="0.1"
                        value={rule.warning.threshold || rule.warning.multiplier || 0}
                        onChange={(e) => updateRule(
                          metricType,
                          'warning',
                          rule.warning.threshold !== undefined ? 'threshold' : 'multiplier',
                          e.target.value
                        )}
                        className="p-2 border border-gray-300 rounded text-sm w-24 bg-white text-gray-900 focus:outline-none focus:border-indigo-500 shadow-sm"
                      />
                      <span className="text-sm font-medium text-gray-500">{desc.unit}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-sm font-medium text-gray-700 min-w-[80px]">Duration:</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={rule.warning.duration / 60000}
                        onChange={(e) => updateRule(metricType, 'warning', 'duration', e.target.value * 60000)}
                        className="p-2 border border-gray-300 rounded text-sm w-24 bg-white text-gray-900 focus:outline-none focus:border-indigo-500 shadow-sm"
                      />
                      <span className="text-sm font-medium text-gray-500">minutes</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-red-50 border border-red-200 border-l-4 border-l-red-500">
                  <h4 className="m-0 mb-4 text-base font-bold text-red-800 uppercase tracking-wide">Critical</h4>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-sm font-medium text-gray-700 min-w-[80px]">Threshold:</label>
                      <input
                        type="number"
                        step="0.1"
                        value={rule.critical.threshold || rule.critical.multiplier || 0}
                        onChange={(e) => updateRule(
                          metricType,
                          'critical',
                          rule.critical.threshold !== undefined ? 'threshold' : 'multiplier',
                          e.target.value
                        )}
                        className="p-2 border border-gray-300 rounded text-sm w-24 bg-white text-gray-900 focus:outline-none focus:border-indigo-500 shadow-sm"
                      />
                      <span className="text-sm font-medium text-gray-500">{desc.unit}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-sm font-medium text-gray-700 min-w-[80px]">Duration:</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={rule.critical.duration / 60000}
                        onChange={(e) => updateRule(metricType, 'critical', 'duration', e.target.value * 60000)}
                        className="p-2 border border-gray-300 rounded text-sm w-24 bg-white text-gray-900 focus:outline-none focus:border-indigo-500 shadow-sm"
                      />
                      <span className="text-sm font-medium text-gray-500">minutes</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 pt-6 border-t border-gray-200 text-center">
        <button
          onClick={saveRules}
          disabled={saving}
          className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
        >
          {saving ? 'Saving...' : 'Save Rules'}
        </button>
      </div>
    </div>
  );
};

export default AlertRulesConfig;
