import React, { useState, useEffect } from 'react';
import { Database, Trash2, BarChart3, AlertCircle, RefreshCw } from 'lucide-react';
import config from '../config';
import { toast } from '../../components/Toast';

const DataManagement = ({ vmId, hostname }) => {
    const [storageStats, setStorageStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const refreshInterval = 30; // Fixed 30 seconds

    useEffect(() => {
        fetchStorageStats();
    }, []);

    // Auto-refresh effect - refresh every 1 minute
    useEffect(() => {
        const interval = setInterval(() => {
            fetchStorageStats(true); // Background refresh
        }, 60 * 1000); // 60 seconds = 1 minute

        return () => clearInterval(interval);
    }, []);

    const fetchStorageStats = async (isBackgroundRefresh = false) => {
        if (isBackgroundRefresh) {
            setIsRefreshing(true);
        }

        try {
            const response = await fetch(`${config.SERVER_URL}/api/storage-stats`);
            const data = await response.json();
            console.log('Storage stats received:', data); // Debug log
            setStorageStats(data);
        } catch (error) {
            console.error('Error fetching storage stats:', error);
        } finally {
            setIsRefreshing(false);
        }
    };

    const deleteOldData = async (period) => {
        if (!confirm(`Are you sure you want to delete data older than ${period}? This action cannot be undone.`)) {
            return;
        }

        setLoading(true);
        setLoading(true);

        try {
            const response = await fetch(`${config.SERVER_URL}/api/metrics/${vmId}?period=${period}`, {
                method: 'DELETE'
            });
            const result = await response.json();

            if (result.success) {
                toast.success(result.message);
                fetchStorageStats(); // Refresh stats
            } else {
                toast.error('Failed to delete data');
            }
        } catch (error) {
            toast.error(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const formatBytes = (bytes) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const currentVmStats = storageStats?.vmStats?.find(vm => vm._id === vmId);

    return (
        <div className="glass-card p-6 rounded-lg border border-white/10 mb-6 mt-4">
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                <h3 className="flex items-center gap-2 m-0 text-lg font-bold text-white">
                    <Database size={20} className="text-blue-600" />
                    Data Management - {hostname}
                </h3>

                {/* Refresh indicator */}
                {isRefreshing && (
                    <div className="flex items-center gap-2 text-sm text-gray-400 font-medium">
                        <RefreshCw size={14} className="text-green-600 animate-spin" />
                        Updating...
                    </div>
                )}
            </div>

            {storageStats && (
                <div className="mb-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                        {/* Total Records Card */}
                        <div className="p-4 glass-panel/5 rounded-lg border border-white/10">
                            <div className="text-sm text-blue-700 font-semibold mb-2">Total Records</div>
                            <div className="text-3xl font-bold text-blue-900">
                                {storageStats.totalRecords ? storageStats.totalRecords.toLocaleString() : '0'}
                            </div>
                        </div>

                        {/* VM-specific stats */}
                        {currentVmStats && (
                            <>
                                <div className="p-4 glass-panel/5 rounded-lg border border-white/10">
                                    <div className="text-sm text-cyan-700 font-semibold mb-2">VM Records</div>
                                    <div className="text-3xl font-bold text-cyan-900">
                                        {currentVmStats.totalRecords ? currentVmStats.totalRecords.toLocaleString() : '0'}
                                    </div>
                                </div>

                                {currentVmStats.oldestRecord && currentVmStats.newestRecord && (
                                    <div className="p-4 glass-panel/5 rounded-lg border border-white/10">
                                        <div className="text-sm text-green-700 font-semibold mb-2">Data Range</div>
                                        <div className="text-sm font-medium text-green-900">
                                            {formatDate(currentVmStats.oldestRecord)} <br />
                                            to <br />
                                            {formatDate(currentVmStats.newestRecord)}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className="mb-6">
                <h4 className="flex items-center gap-2 text-lg font-bold text-gray-100 mb-4">
                    <Trash2 size={18} className="text-red-500" />
                    Delete Old Data
                </h4>

                <div className="flex gap-3 flex-wrap">
                    <button
                        onClick={() => deleteOldData('1d')}
                        disabled={loading}
                        className="px-4 py-2 bg-red-500/10 border-red-500/30 text-red-2000 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Delete &gt; 1 Day
                    </button>
                    <button
                        onClick={() => deleteOldData('7d')}
                        disabled={loading}
                        className="px-4 py-2 bg-red-500/10 border-red-500/30 text-red-2000 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Delete &gt; 1 Week
                    </button>
                    <button
                        onClick={() => deleteOldData('30d')}
                        disabled={loading}
                        className="px-4 py-2 bg-red-500/10 border-red-500/30 text-red-2000 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Delete &gt; 1 Month
                    </button>
                </div>
            </div>

            <div className="p-4 glass-panel/5 border border-white/10 rounded-lg">
                <div className="flex items-center gap-2 mb-2 text-orange-800">
                    <AlertCircle size={18} />
                    <strong className="font-bold">Data Storage Info</strong>
                </div>
                <ul className="list-disc list-inside text-sm text-gray-200 space-y-1 ml-1">
                    <li>Metrics are collected every 5 seconds by default</li>
                    <li>Data is automatically expired after 30 days (configurable)</li>
                    <li>Use the delete options above to manage storage manually</li>
                    <li>Historical data is used for trend analysis and reporting</li>
                </ul>
            </div>
        </div>
    );
};

export default DataManagement;