import React, { useState, useEffect } from 'react';
import { Calendar, Download, TrendingUp, RefreshCw } from 'lucide-react';
import config from '../config';
import { toast } from '../../components/Toast';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Line } from 'react-chartjs-2';
import { LTTB } from 'downsample';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    zoomPlugin
);

const HistoricalData = ({ vmId, hostname }) => {
    const [historicalData, setHistoricalData] = useState([]);
    const [selectedPeriod, setSelectedPeriod] = useState('1h');
    const [loading, setLoading] = useState(true); // Only true on initial load
    const [isRefreshing, setIsRefreshing] = useState(false); // Separate state for refresh
    const [selectedDataPoint, setSelectedDataPoint] = useState(null);
    const [showCustomRange, setShowCustomRange] = useState(false);
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [customRangeLabel, setCustomRangeLabel] = useState(''); // Store custom range label
    const refreshInterval = 30; // Fixed 30 seconds

    useEffect(() => {
        if (selectedPeriod !== 'custom') {
            fetchHistoricalData(null, null, true); // Initial load
        }
    }, [vmId, selectedPeriod]);

    // Auto-refresh effect (always enabled except for custom range)
    useEffect(() => {
        if (selectedPeriod === 'custom') return;

        const interval = setInterval(() => {
            fetchHistoricalData(null, null, false); // Background refresh
        }, refreshInterval * 1000);

        return () => clearInterval(interval);
    }, [vmId, selectedPeriod]);

    const fetchHistoricalData = async (startDate = null, endDate = null, isInitialLoad = false) => {
        if (isInitialLoad) {
            setLoading(true);
        } else {
            setIsRefreshing(true);
        }

        try {
            let url;
            if (startDate && endDate) {
                console.log(`Fetching custom range data for ${vmId}:`);
                console.log(`  Start: ${startDate}`);
                console.log(`  End: ${endDate}`);
                url = `${config.SERVER_URL}/api/metrics/${vmId}?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&limit=10000`;
                console.log(`  URL: ${url}`);
            } else {
                console.log(`Fetching historical data for ${vmId}, period: ${selectedPeriod}`);
                url = `${config.SERVER_URL}/api/metrics/${vmId}?period=${selectedPeriod}&limit=10000`;
            }

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log(`Received ${data.length} historical records`);

            if (data.length > 0) {
                console.log(`First record timestamp: ${data[0].timestamp}`);
                console.log(`Last record timestamp: ${data[data.length - 1].timestamp}`);
            }

            setHistoricalData(data);
        } catch (error) {
            console.error('Error fetching historical data:', error);
            if (isInitialLoad) {
                setHistoricalData([]);
            }
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    const handleCustomRangeApply = () => {
        if (customStartDate && customEndDate) {
            const start = new Date(customStartDate).toISOString();
            const end = new Date(customEndDate).toISOString();

            // Validate date range
            if (new Date(start) > new Date(end)) {
                toast.error('Start date must be before end date');
                return;
            }

            // Create label for display
            const startLabel = new Date(customStartDate).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const endLabel = new Date(customEndDate).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            setCustomRangeLabel(`${startLabel} - ${endLabel}`);

            console.log('Applying custom range:', { start, end });
            fetchHistoricalData(start, end, true);
            setShowCustomRange(false);
        } else {
            toast.error('Please select both start and end dates');
        }
    };

    const handlePeriodChange = (period) => {
        setSelectedPeriod(period);
        if (period === 'custom') {
            setShowCustomRange(true);
            // Set default dates (last 24 hours)
            const end = new Date();
            const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
            setCustomEndDate(formatDateTimeLocal(end));
            setCustomStartDate(formatDateTimeLocal(start));
            // Clear historical data until custom range is applied
            setHistoricalData([]);
            setCustomRangeLabel('');
        } else {
            setShowCustomRange(false);
            setCustomStartDate('');
            setCustomEndDate('');
            setCustomRangeLabel('');
        }
    };

    // Helper to format date for datetime-local input
    const formatDateTimeLocal = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    const exportData = () => {
        const csvContent = [
            ['Timestamp (IST)', 'CPU %', 'Memory %', 'Disk %'],
            ...historicalData.map(item => [
                new Date(item.timestamp).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata'
                }),
                item.cpu.usage,
                item.memory.percent,
                item.disk?.percent || 0
            ])
        ].map(row => row.join(',')).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${hostname}_metrics_${selectedPeriod}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <div className="glass-card p-12 rounded-lg border border-white/10 text-center text-gray-400">
                Loading historical data...
            </div>
        );
    }

    // Don't return early - always show the time range selector

    // Downsample data using LTTB library for efficient visualization
    const downsampleData = (data, threshold = 500) => {
        if (!data || data.length === 0) {
            return [];
        }

        if (data.length <= threshold) {
            return data;
        }

        try {
            // Convert data to format expected by LTTB: [[x, y], ...]
            const cpuData = data.map((item, idx) => [idx, item.cpu.usage]);
            const memoryData = data.map((item, idx) => [idx, item.memory.percent]);
            const diskData = data.map((item, idx) => [idx, item.disk?.percent || 0]);

            // Downsample each metric
            const cpuDownsampled = LTTB(cpuData, threshold);
            const memoryDownsampled = LTTB(memoryData, threshold);
            const diskDownsampled = LTTB(diskData, threshold);

            // Use CPU indices as the base (they should all be similar)
            const indices = new Set(cpuDownsampled.map(point => point[0]));

            // Return original data points at downsampled indices
            return data.filter((_, idx) => indices.has(idx));
        } catch (error) {
            console.error('Downsampling error:', error);
            // Fallback to simple sampling
            const step = Math.ceil(data.length / threshold);
            return data.filter((_, idx) => idx % step === 0);
        }
    };

    // Prepare chart data with downsampling
    const displayData = historicalData.length > 0 ? downsampleData(historicalData, 500) : [];

    console.log('Historical data:', historicalData.length, 'Display data:', displayData.length);

    const labels = displayData.map(item =>
        new Date(item.timestamp).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        })
    );

    const chartData = {
        labels,
        datasets: [
            {
                label: 'CPU Usage (%)',
                data: displayData.map(item => item.cpu?.usage || 0),
                borderColor: '#7aa2f7',
                backgroundColor: 'rgba(122, 162, 247, 0.1)',
                fill: false,
                tension: 0.4,
                pointRadius: displayData.length > 100 ? 0 : 2,
                pointHoverRadius: 4,
                borderWidth: 2,
            },
            {
                label: 'Memory Usage (%)',
                data: displayData.map(item => item.memory?.percent || 0),
                borderColor: '#bb9af7',
                backgroundColor: 'rgba(187, 154, 247, 0.1)',
                fill: false,
                tension: 0.4,
                pointRadius: displayData.length > 100 ? 0 : 2,
                pointHoverRadius: 4,
                borderWidth: 2,
            },
            {
                label: 'Disk Usage (%)',
                data: displayData.map(item => item.disk?.percent || 0),
                borderColor: '#9ece6a',
                backgroundColor: 'rgba(158, 206, 106, 0.1)',
                fill: false,
                tension: 0.4,
                pointRadius: displayData.length > 100 ? 0 : 2,
                pointHoverRadius: 4,
                borderWidth: 2,
            }
        ]
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 0, // Disable animation for better performance
        },
        scales: {
            y: {
                beginAtZero: true,
                max: 100,
                grid: { color: '#414868' },
                ticks: { color: '#a9b1d6' }
            },
            x: {
                grid: { color: '#414868' },
                ticks: {
                    color: '#a9b1d6',
                    maxTicksLimit: 10,
                    maxRotation: 45,
                    autoSkip: true
                }
            }
        },
        plugins: {
            legend: {
                labels: { color: '#a9b1d6' }
            },
            tooltip: {
                mode: 'index',
                intersect: false,
            },
            zoom: {
                zoom: {
                    wheel: { enabled: true },
                    pinch: { enabled: true },
                    mode: 'x',
                },
                pan: {
                    enabled: true,
                    mode: 'x',
                }
            }
        },
        interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false
        },
        onClick: (event, elements) => {
            if (elements.length > 0) {
                const dataIndex = elements[0].index;
                setSelectedDataPoint(displayData[dataIndex]);
            }
        },
    };

    return (
        <div className="glass-card p-6 rounded-lg border border-white/10 mb-6 mt-4">
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                <div>
                    <h3 className="flex items-center gap-2 m-0 text-lg font-bold text-white mb-1">
                        <TrendingUp size={20} className="text-blue-600" />
                        Historical Data - {hostname}
                    </h3>
                    {selectedPeriod === 'custom' && customRangeLabel && (
                        <div className="text-xs text-gray-400 flex items-center gap-1 font-medium">
                            <Calendar size={12} />
                            {customRangeLabel}
                        </div>
                    )}
                </div>

                <div className="flex gap-3 items-center flex-wrap">
                    <select
                        value={selectedPeriod}
                        onChange={(e) => handlePeriodChange(e.target.value)}
                        className="block w-40 rounded-md border-white/10 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    >
                        <option value="1h">Last Hour</option>
                        <option value="6h">Last 6 Hours</option>
                        <option value="24h">Last 24 Hours</option>
                        <option value="7d">Last 7 Days</option>
                        <option value="30d">Last 30 Days</option>
                        <option value="custom">Custom Range</option>
                    </select>

                    {/* Refresh indicator */}
                    {isRefreshing && selectedPeriod !== 'custom' && (
                        <div className="flex items-center gap-2 text-sm text-gray-400 font-medium">
                            <RefreshCw size={14} className="text-green-600 animate-spin" />
                            Updating...
                        </div>
                    )}

                    <button
                        onClick={exportData}
                        disabled={historicalData.length === 0}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500${historicalData.length === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed border outline-none border-white/10' : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer pointer-events-auto' }`}
                    >
                        <Download size={16} />
                        Export CSV
                    </button>
                </div>
            </div>

            {historicalData.length === 0 ? (
                <div className="h-96 mb-4 flex items-center justify-center glass-panel/5 rounded-lg border border-dashed border-white/10">
                    <div className="text-center text-gray-400">
                        <TrendingUp size={48} className="opacity-30 mb-4 mx-auto text-gray-400" />
                        <div className="text-lg font-medium mb-1 text-white">No historical data available for the selected period</div>
                        <div className="text-sm">Try selecting a different time range above</div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="h-96 mb-4">
                        <Line data={chartData} options={chartOptions} />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                        <div className="text-center p-4 glass-panel/5 rounded-lg border border-white/10">
                            <div className="text-xs text-blue-700 font-semibold uppercase tracking-wider mb-1">Avg CPU</div>
                            <div className="font-bold text-2xl text-blue-900">
                                {(historicalData.reduce((sum, item) => sum + item.cpu.usage, 0) / historicalData.length).toFixed(1)}%
                            </div>
                        </div>
                        <div className="text-center p-4 glass-panel/5 rounded-lg border border-white/10">
                            <div className="text-xs text-cyan-700 font-semibold uppercase tracking-wider mb-1">Avg Memory</div>
                            <div className="font-bold text-2xl text-cyan-900">
                                {(historicalData.reduce((sum, item) => sum + item.memory.percent, 0) / historicalData.length).toFixed(1)}%
                            </div>
                        </div>
                        <div className="text-center p-4 glass-panel/5 rounded-lg border border-white/10">
                            <div className="text-xs text-green-700 font-semibold uppercase tracking-wider mb-1">Total Points</div>
                            <div className="font-bold text-2xl text-green-900">
                                {historicalData.length.toLocaleString()}
                            </div>
                        </div>
                        <div className="text-center p-4 glass-panel/5 rounded-lg border border-white/10">
                            <div className="text-xs text-amber-700 font-semibold uppercase tracking-wider mb-1">Displayed</div>
                            <div className="font-bold text-2xl text-amber-900">
                                {displayData.length.toLocaleString()}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Custom Date Range Modal */}
            {showCustomRange && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="glass-card rounded-xl p-8 min-w-[400px] border border-white/10">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="m-0 flex items-center gap-2 text-lg font-bold text-white">
                                <Calendar size={20} className="text-blue-600" />
                                Select Custom Date Range
                            </h3>
                            <button
                                onClick={() => {
                                    setShowCustomRange(false);
                                    setSelectedPeriod('1h');
                                }}
                                className="bg-transparent border-none text-gray-400 hover:text-white text-2xl cursor-pointer"
                                aria-label="Close custom range selector"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="mb-6">
                            <label className="block mb-2 text-sm font-medium text-gray-200">
                                Start Date & Time
                            </label>
                            <input
                                type="datetime-local"
                                value={customStartDate}
                                onChange={(e) => setCustomStartDate(e.target.value)}
                                className="w-full p-3 rounded-lg border border-white/10 glass-panel/5 text-white text-base focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>

                        <div className="mb-6">
                            <label className="block mb-2 text-sm font-medium text-gray-200">
                                End Date & Time
                            </label>
                            <input
                                type="datetime-local"
                                value={customEndDate}
                                onChange={(e) => setCustomEndDate(e.target.value)}
                                className="w-full p-3 rounded-lg border border-white/10 glass-panel/5 text-white text-base focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setShowCustomRange(false);
                                    setSelectedPeriod('1h');
                                }}
                                className="px-6 py-3 rounded-lg border border-white/10 glass-panel/5 hover:bg-gray-100 text-gray-200 font-medium cursor-pointer transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCustomRangeApply}
                                disabled={!customStartDate || !customEndDate}
                                className={`px-6 py-3 rounded-lg border-none font-bold text-white transition-colors${customStartDate && customEndDate ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer' : 'bg-gray-300 cursor-not-allowed'}`}
                            >
                                Apply Range
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Data Point Detail Modal */}
            {selectedDataPoint && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <div className="glass-card rounded-xl p-8 max-w-4xl w-[90%] max-h-[85vh] overflow-y-auto border border-white/10 scrollbar-thin scrollbar-thumb-gray-300">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
                            <h3 className="m-0 text-xl font-bold text-white">Detailed Metrics</h3>
                            <button
                                onClick={() => setSelectedDataPoint(null)}
                                className="bg-transparent border-none text-gray-400 hover:text-white text-2xl cursor-pointer"
                                aria-label="Close detailed metrics"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="mb-6 p-4 glass-panel/5 rounded-lg flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center">
                            <div className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                                Timestamp
                            </div>
                            <div className="font-bold text-blue-700 text-lg">
                                {new Date(selectedDataPoint.timestamp).toLocaleString('en-IN', {
                                    timeZone: 'Asia/Kolkata'
                                })}
                            </div>
                        </div>

                        {/* CPU Details */}
                        <div className="mb-6 p-5 bg-blue-50/50 border border-white/10 rounded-lg">
                            <h4 className="m-0 mb-4 text-lg font-bold text-blue-700 flex items-center gap-2">
                                <Activity size={18} /> CPU
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                <div>
                                    <div className="text-xs font-semibold text-blue-500 uppercase tracking-wide">Overall Usage</div>
                                    <div className="text-2xl font-bold text-blue-900">{selectedDataPoint.cpu.usage.toFixed(1)}%</div>
                                </div>
                            </div>

                            <div>
                                <div className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-3">Per-Core Usage ({selectedDataPoint.cpu.cores.length} cores)</div>
                                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                                    {selectedDataPoint.cpu.cores.map((coreUsage, idx) => (
                                        <div key={idx} className="p-2 glass-card border border-white/10 rounded-md text-center">
                                            <div className="text-[0.65rem] font-medium text-gray-400 mb-1">C {idx}</div>
                                            <div className={`text-sm font-bold${coreUsage > 50 ? 'text-red-500' : 'text-green-600'}`}>
                                                {coreUsage.toFixed(0)}%
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Memory Details */}
                        <div className="mb-6 p-5 bg-cyan-50/50 border border-white/10 rounded-lg">
                            <h4 className="m-0 mb-4 text-lg font-bold text-cyan-700 flex items-center gap-2">
                                <Database size={18} /> Memory
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                <div className="glass-card p-3 rounded-md border border-white/10">
                                    <div className="text-xs font-semibold text-cyan-500 uppercase tracking-wide">Total</div>
                                    <div className="text-lg font-bold text-cyan-900">{(selectedDataPoint.memory.total / 1024 / 1024 / 1024).toFixed(2)} GB</div>
                                </div>
                                <div className="glass-card p-3 rounded-md border border-white/10">
                                    <div className="text-xs font-semibold text-cyan-500 uppercase tracking-wide">Used</div>
                                    <div className="text-lg font-bold text-cyan-900">{(selectedDataPoint.memory.used / 1024 / 1024 / 1024).toFixed(2)} GB</div>
                                </div>
                                <div className="glass-card p-3 rounded-md border border-white/10">
                                    <div className="text-xs font-semibold text-cyan-500 uppercase tracking-wide">Percent</div>
                                    <div className="flex items-center gap-2">
                                        <div className={`text-lg font-bold${selectedDataPoint.memory.percent > 80 ? 'text-red-500' : 'text-cyan-900'}`}>{selectedDataPoint.memory.percent.toFixed(1)}%</div>
                                        <div className="flex-1 h-2 glass-panel/10 rounded-full overflow-hidden hidden sm:block">
                                            <div className={`h-full${selectedDataPoint.memory.percent > 80 ? 'bg-red-500/10 border-red-500/30 text-red-2000' : 'bg-cyan-500'}`} style={{ width: `${selectedDataPoint.memory.percent}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Disk Details */}
                        {selectedDataPoint.disk && (
                            <div className="mb-6 p-5 bg-green-50/50 border border-white/10 rounded-lg">
                                <h4 className="m-0 mb-4 text-lg font-bold text-green-700 flex items-center gap-2">
                                    <Server size={18} /> Disk
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                    <div className="glass-card p-3 rounded-md border border-white/10">
                                        <div className="text-xs font-semibold text-green-500 uppercase tracking-wide">Total</div>
                                        <div className="text-lg font-bold text-green-900">{(selectedDataPoint.disk.total / 1024 / 1024 / 1024).toFixed(2)} GB</div>
                                    </div>
                                    <div className="glass-card p-3 rounded-md border border-white/10">
                                        <div className="text-xs font-semibold text-green-500 uppercase tracking-wide">Used</div>
                                        <div className="text-lg font-bold text-green-900">{(selectedDataPoint.disk.used / 1024 / 1024 / 1024).toFixed(2)} GB</div>
                                    </div>
                                    <div className="glass-card p-3 rounded-md border border-white/10">
                                        <div className="text-xs font-semibold text-green-500 uppercase tracking-wide">Percent</div>
                                        <div className="flex items-center gap-2">
                                            <div className={`text-lg font-bold${selectedDataPoint.disk.percent > 80 ? 'text-red-500' : 'text-green-900'}`}>{selectedDataPoint.disk.percent.toFixed(1)}%</div>
                                            <div className="flex-1 h-2 glass-panel/10 rounded-full overflow-hidden hidden sm:block">
                                                <div className={`h-full${selectedDataPoint.disk.percent > 80 ? 'bg-red-500/10 border-red-500/30 text-red-2000' : 'bg-green-500'}`} style={{ width: `${selectedDataPoint.disk.percent}%` }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Top 5 CPU Processes */}
                        {selectedDataPoint.processes && (
                            <div className="mb-6 p-5 bg-orange-50/50 border border-white/10 rounded-lg">
                                <h4 className="m-0 mb-4 text-lg font-bold text-orange-700 flex items-center gap-2">
                                    <Activity size={18} /> Top 5 CPU Processes
                                </h4>
                                {(() => {
                                    // Handle both array and object formats
                                    let processList = [];

                                    if (Array.isArray(selectedDataPoint.processes)) {
                                        processList = selectedDataPoint.processes.map(proc => ({
                                            name: proc.name,
                                            cpu: proc.cpu_percent || proc.cpu || proc.cpuPercent || 0,
                                            memory: proc.memory_percent || proc.memory || proc.memoryPercent || 0,
                                            pid: proc.pid || 'N/A'
                                        }));
                                    } else if (typeof selectedDataPoint.processes === 'object') {
                                        // Convert object to array
                                        processList = Object.entries(selectedDataPoint.processes).map(([name, data]) => ({
                                            name: name,
                                            cpu: data.cpu_percent || data.cpu || data.cpuPercent || 0,
                                            memory: data.memory_percent || data.memory || data.memoryPercent || 0,
                                            pid: data.pid || 'N/A'
                                        }));
                                    }

                                    // Filter and sort
                                    const topProcesses = processList
                                        .filter(process => process && typeof process.cpu === 'number' && process.cpu > 0)
                                        .sort((a, b) => (b.cpu || 0) - (a.cpu || 0))
                                        .slice(0, 5);

                                    if (topProcesses.length === 0) {
                                        return (
                                            <div className="text-center p-4 text-gray-400 font-medium glass-card rounded-lg border border-white/10">
                                                No process data available
                                            </div>
                                        );
                                    }

                                    return (
                                        <div className="flex flex-col gap-2">
                                            {topProcesses.map((process, idx) => (
                                                <div key={idx} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 sm:p-4 glass-card border border-white/10 rounded-lg gap-3 sm:gap-0">
                                                    <div className="flex items-center gap-3">
                                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm${idx === 0 ? 'bg-red-500/10 border-red-500/30 text-red-2000' : idx === 1 ? 'bg-orange-400' : 'bg-orange-300'}`}>
                                                            {idx + 1}
                                                        </span>
                                                        <span className="font-bold text-gray-100 break-all sm:break-normal">
                                                            {process.name || 'Unknown'}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap sm:flex-nowrap gap-4 sm:gap-6 items-center glass-panel/5 sm:bg-transparent p-2 sm:p-0 rounded-md sm:rounded-none">
                                                        <div className="flex-1 sm:flex-none text-left sm:text-right">
                                                            <div className="text-[0.65rem] font-bold text-gray-400 uppercase tracking-widest">CPU</div>
                                                            <div className="font-bold text-orange-600 text-sm">
                                                                {(process.cpu || 0).toFixed(1)}%
                                                            </div>
                                                        </div>
                                                        <div className="flex-1 sm:flex-none text-left sm:text-right border-l sm:border-none border-white/10 pl-4 sm:pl-0">
                                                            <div className="text-[0.65rem] font-bold text-gray-400 uppercase tracking-widest">Memory</div>
                                                            <div className="font-bold text-cyan-600 text-sm">
                                                                {(process.memory || 0).toFixed(1)}%
                                                            </div>
                                                        </div>
                                                        <div className="flex-1 sm:flex-none text-left sm:text-right border-l sm:border-none border-white/10 pl-4 sm:pl-0 min-w-[60px]">
                                                            <div className="text-[0.65rem] font-bold text-gray-400 uppercase tracking-widest">PID</div>
                                                            <div className="font-medium text-gray-300 text-sm">
                                                                {process.pid || 'N/A'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        {/* Services Status */}
                        {selectedDataPoint.services && Object.keys(selectedDataPoint.services).length > 0 && (
                            <div className="p-5 glass-panel/5 border border-white/10 rounded-lg">
                                <h4 className="text-lg font-bold text-gray-200 m-0 mb-4 flex items-center gap-2">
                                    <Server size={20} /> Services
                                </h4>
                                <div className="flex flex-col gap-3">
                                    {Object.entries(selectedDataPoint.services).map(([service, statusData]) => {
                                        const state = typeof statusData === 'string' ? statusData : statusData.state;
                                        const checks = typeof statusData === 'object' ? statusData.checks : null;

                                        const getStateColor = (state) => {
                                            switch (state) {
                                                case 'healthy': return 'bg-green-100 text-green-800 border-green-200';
                                                case 'degraded': return 'bg-orange-100 text-orange-800 border-orange-200';
                                                case 'down': return 'bg-red-100 text-red-400 border-red-200';
                                                case 'unknown': return 'bg-gray-100 text-gray-200 border-white/10';
                                                case 'running': return 'bg-green-100 text-green-800 border-green-200';
                                                case 'stopped': return 'bg-red-100 text-red-400 border-red-200';
                                                default: return 'bg-gray-100 text-gray-200 border-white/10';
                                            }
                                        };

                                        const colorClasses = getStateColor(state);

                                        return (
                                            <div key={service} className="p-4 glass-card border border-white/10 rounded-lg">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-semibold text-white">{service}</span>
                                                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full border${colorClasses}`}>
                                                        {state.charAt(0).toUpperCase() + state.slice(1)}
                                                    </span>
                                                </div>
                                                {checks && (
                                                    <div className="mt-3 pl-2 border-l-2 border-white/10 space-y-2">
                                                        {Object.entries(checks).map(([checkName, checkResult]) => (
                                                            <div key={checkName} className="flex items-center gap-2 text-sm">
                                                                <span className={`w-2 h-2 rounded-full${checkResult.passed ? 'bg-green-500' : 'bg-red-500/10 border-red-500/30 text-red-2000'}`}></span>
                                                                <span className="text-gray-300 font-medium capitalize">{checkName}:</span>
                                                                <span className={checkResult.passed ? 'text-green-600' : 'text-red-500'}>
                                                                    {checkResult.message || (checkResult.passed ? 'OK' : 'Failed')}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default HistoricalData;