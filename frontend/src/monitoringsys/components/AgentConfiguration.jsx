import React, { useState, useEffect } from 'react';
import { Settings, Save, RefreshCw, Clock, Database } from 'lucide-react';
import appConfig from '../config';

const AgentConfiguration = ({ vmId, hostname }) => {
    const [config, setConfig] = useState({
        broadcastInterval: 0.5,
        storageInterval: 5
    });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchConfiguration();
    }, [vmId]);

    const fetchConfiguration = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${appConfig.SERVER_URL}/api/config/${vmId}`);
            if (response.ok) {
                const data = await response.json();
                setConfig({
                    broadcastInterval: data.broadcastInterval || 0.5,
                    storageInterval: data.storageInterval || 5
                });
            }
        } catch (error) {
            console.error('Error fetching configuration:', error);
            setMessage('✗ Failed to load configuration');
        } finally {
            setLoading(false);
        }
    };

    const saveConfiguration = async () => {
        setSaving(true);
        setMessage('');

        try {
            const response = await fetch(`${appConfig.SERVER_URL}/api/config/${vmId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            });

            const result = await response.json();

            if (result.success) {
                setMessage('✓ Configuration updated successfully');
            } else {
                setMessage('✗ Failed to update configuration');
            }
        } catch (error) {
            setMessage(`✗ Error: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleInputChange = (field, value) => {
        const numValue = parseFloat(value);
        if (isNaN(numValue) || numValue <= 0) return;

        setConfig(prev => ({
            ...prev,
            [field]: numValue
        }));
    };

    const calculateDataPoints = () => {
        const pointsPerMinute = 60 / config.storageInterval;
        const pointsPerHour = pointsPerMinute * 60;
        const pointsPerDay = pointsPerHour * 24;

        return {
            perMinute: Math.round(pointsPerMinute),
            perHour: Math.round(pointsPerHour),
            perDay: Math.round(pointsPerDay)
        };
    };

    const dataPoints = calculateDataPoints();

    return (
        <div className="glass-card p-6 rounded-lg border border-white/10 mb-6 mt-4">
            <h3 className="flex items-center gap-2 m-0 text-lg font-bold text-white mb-6">
                <Settings size={20} className="text-gray-400" />
                Agent Configuration - {hostname}
            </h3>

            {loading ? (
                <div className="text-center p-8 text-gray-400">
                    Loading configuration...
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        {/* Real-time Broadcast Interval */}
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <Clock size={16} className="text-blue-600" />
                                <h4 className="m-0 text-md font-bold text-gray-100">Real-time Updates</h4>
                            </div>

                            <div className="mb-4">
                                <label className="block mb-2 text-sm font-medium text-gray-200">
                                    Broadcast Interval (seconds)
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0.1"
                                    max="10"
                                    value={config.broadcastInterval}
                                    onChange={(e) => handleInputChange('broadcastInterval', e.target.value)}
                                    className="block w-full rounded-md border-white/10 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-3 border glass-panel/5 text-white"
                                />
                            </div>

                            <div className="p-4 glass-panel/5 rounded-lg border border-white/10">
                                <div className="text-sm text-blue-700 font-semibold mb-1">
                                    Dashboard Update Frequency
                                </div>
                                <div className="font-bold text-blue-900">
                                    Every {config.broadcastInterval}s ({Math.round(60 / config.broadcastInterval)} updates/min)
                                </div>
                            </div>
                        </div>

                        {/* Database Storage Interval */}
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <Database size={16} className="text-green-600" />
                                <h4 className="m-0 text-md font-bold text-gray-100">Database Storage</h4>
                            </div>

                            <div className="mb-4">
                                <label className="block mb-2 text-sm font-medium text-gray-200">
                                    Storage Interval (seconds)
                                </label>
                                <input
                                    type="number"
                                    step="1"
                                    min="1"
                                    max="300"
                                    value={config.storageInterval}
                                    onChange={(e) => handleInputChange('storageInterval', e.target.value)}
                                    className="block w-full rounded-md border-white/10 shadow-sm focus:border-green-500 focus:ring-green-500 sm:text-sm p-3 border glass-panel/5 text-white"
                                />
                            </div>

                            <div className="p-4 glass-panel/5 rounded-lg border border-white/10">
                                <div className="text-sm text-green-700 font-semibold mb-1">
                                    Data Points Stored
                                </div>
                                <div className="text-sm font-bold text-green-900">
                                    {dataPoints.perMinute}/min • {dataPoints.perHour}/hour • {dataPoints.perDay}/day
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Preset Configurations */}
                    <div className="mb-8">
                        <h4 className="mb-4 text-md font-bold text-gray-100">Quick Presets</h4>
                        <div className="flex gap-3 flex-wrap">
                            <button
                                onClick={() => setConfig({ broadcastInterval: 0.5, storageInterval: 5 })}
                                className="px-4 py-2 glass-button hover:glass-panel/20 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                High Frequency (0.5s / 5s)
                            </button>
                            <button
                                onClick={() => setConfig({ broadcastInterval: 1, storageInterval: 30 })}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                            >
                                Balanced (1s / 30s)
                            </button>
                            <button
                                onClick={() => setConfig({ broadcastInterval: 2, storageInterval: 60 })}
                                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                            >
                                Low Frequency (2s / 60s)
                            </button>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-4 items-center">
                        <button
                            onClick={saveConfiguration}
                            disabled={saving}
                            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
                        >
                            <Save size={18} />
                            {saving ? 'Saving...' : 'Save Configuration'}
                        </button>

                        <button
                            onClick={fetchConfiguration}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2.5 glass-card border border-white/10 hover:glass-panel/10 text-gray-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                            <RefreshCw size={18} />
                            Refresh
                        </button>
                    </div>

                    {message && (
                        <div className={`mt-4 p-3 rounded-lg text-sm font-medium${message.startsWith('✓') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-500/10 border-red-500/30 text-red-200 text-red-700 border border-red-200' }`}>
                            {message}
                        </div>
                    )}

                    {/* Information Panel */}
                    <div className="mt-8 p-4 glass-panel/5 rounded-lg border border-white/10">
                        <div className="text-sm text-gray-200 space-y-1">
                            <strong className="text-yellow-400 font-bold block mb-2">Configuration Notes:</strong>
                            <div className="flex items-start gap-2"><span className="text-yellow-600 mt-0.5">•</span> <span><strong>Broadcast Interval:</strong> How often the dashboard receives updates (affects real-time responsiveness)</span></div>
                            <div className="flex items-start gap-2"><span className="text-yellow-600 mt-0.5">•</span> <span><strong>Storage Interval:</strong> How often data is saved to InfluxDB (affects storage usage)</span></div>
                            <div className="flex items-start gap-2"><span className="text-yellow-600 mt-0.5">•</span> <span>Lower intervals = more responsive but higher resource usage</span></div>
                            <div className="flex items-start gap-2"><span className="text-yellow-600 mt-0.5">•</span> <span>Changes take effect immediately after saving</span></div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default AgentConfiguration;