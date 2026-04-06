import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Cpu, Activity, Database, TrendingUp } from 'lucide-react';
import config from '../config';
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
import io from 'socket.io-client';
import DataManagement from '../components/DataManagement';
import HistoricalData from '../components/HistoricalData';
import ConnectionStatus from '../components/ConnectionStatus';
import AlertsPanel from '../components/AlertsPanel';

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

const VMDetails = () => {
    const { id: vmId } = useParams();
    const location = useLocation();
    const [agentUrl, setAgentUrl] = useState(location.state?.agentUrl || null);
    const [vmInfo, setVmInfo] = useState(null); // Store VM info from discovery

    const [metrics, setMetrics] = useState([]);
    const [latest, setLatest] = useState(null);
    const [activeTab, setActiveTab] = useState('realtime');
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const socketRef = useRef(null);

    // 1. Fetch VM info from Discovery Server
    useEffect(() => {
        const fetchDiscovery = async () => {
            try {
                // Use /api/vms/all to get both online and offline VMs
                const res = await fetch(`${config.SERVER_URL}/api/vms/all`);
                const allVms = await res.json();
                const target = allVms.find(a => a._id === vmId);
                if (target) {
                    setVmInfo(target);
                    if (!agentUrl) {
                        setAgentUrl(`${target.ip}:${target.port}`);
                    }
                } else {
                    console.error("Agent not found in registry");
                }
            } catch (e) {
                console.error("Failed to discover agent", e);
            }
        };

        fetchDiscovery();
        // Poll for status updates
        const interval = setInterval(fetchDiscovery, 5000);
        return () => clearInterval(interval);
    }, [vmId, agentUrl]);

    // 2. Connect when VM is online
    useEffect(() => {
        if (!agentUrl || vmInfo?.status === 'offline') return;

        console.log(`VMDetails connecting to central server for live updates`);
        const ioPath = config.SERVER_URL.endsWith('/') ? `${config.SERVER_URL}socket.io` : `${config.SERVER_URL}/socket.io`;
        const socket = io('/', { path: ioPath });
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('Connected to server stream');
            setConnectionStatus('connected');
        });

        socket.on('metrics:update', (data) => {
            if (data.vmId === vmId) {
                setLatest(data);
                setMetrics(prev => {
                    const newMetrics = [...prev, data];
                    if (newMetrics.length > 30) newMetrics.shift(); // Keep last 30 points
                    return newMetrics;
                });
            }
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server stream');
            setConnectionStatus('disconnected');
        });

        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            setConnectionStatus('error');
        });

        const connectionTimeout = setTimeout(() => {
            if (socket.connected) return;
            console.error('Connection timeout');
            setConnectionStatus('error');
            socket.disconnect();
        }, 8000);

        return () => {
            clearTimeout(connectionTimeout);
            socket.disconnect();
        };
    }, [agentUrl, vmId, vmInfo?.status]);

    if (!agentUrl || !vmInfo) return <div className="container">Loading VM information...</div>;

    const isOffline = vmInfo.status === 'offline';
    const displayHostname = latest?.hostname || vmInfo.hostname || vmId;

    // Chart Data with IST timestamps
    const labels = metrics.map(m =>
        new Date(m.timestamp).toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
    );

    const cpuData = {
        labels,
        datasets: [{
            label: 'CPU Usage (%)',
            data: metrics.map(m => m.cpu.usage),
            borderColor: '#7aa2f7',
            backgroundColor: 'rgba(122, 162, 247, 0.2)',
            fill: true,
            tension: 0.2, // Sharper lines for realtime feel
        }],
    };

    const memData = {
        labels,
        datasets: [{
            label: 'Memory Usage (%)',
            data: metrics.map(m => m.memory.percent),
            borderColor: '#bb9af7',
            backgroundColor: 'rgba(187, 154, 247, 0.2)',
            fill: true,
            tension: 0.2,
        }],
    };

    const chartOptions = {
        responsive: true,
        animation: { duration: 0 }, // Disable animation for instant updates
        scales: {
            y: { beginAtZero: true, max: 100, grid: { color: '#414868' }, ticks: { color: '#a9b1d6' } },
            x: {
                display: true,
                grid: { display: false }, // Keep grid hidden for clean look
                ticks: {
                    color: '#a9b1d6',
                    maxTicksLimit: 4, // Show approx 3-4 timestamps
                    maxRotation: 0,
                    autoSkip: true
                }
            }
        },
        plugins: {
            legend: { display: false },
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
        }
    };

    return (
        <div className="max-w-7xl mx-auto">
            <Link to="/metrics" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 glass-panel/5 hover:bg-blue-100 rounded-lg transition-colors mb-6">
                <ArrowLeft size={16} /> Back to Dashboard
            </Link>

            <div className="flex justify-between items-start mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-white">{displayHostname}</h1>
                    <p className="text-gray-400">Application ID: {vmId}</p>
                </div>
                <ConnectionStatus
                    agentUrl={agentUrl}
                    vmId={vmId}
                    agentStatus={isOffline ? 'offline' : connectionStatus}
                />
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 mb-8 border-b border-white/10">
                <button
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors${activeTab === 'realtime' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-white/20'}`}
                    onClick={() => setActiveTab('realtime')}
                >
                    <Activity size={16} />
                    Real-time
                </button>
                <button
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors${activeTab === 'alerts' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-white/20'}`}
                    onClick={() => setActiveTab('alerts')}
                >
                    Alerts
                </button>
                <button
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors${activeTab === 'historical' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-white/20'}`}
                    onClick={() => setActiveTab('historical')}
                >
                    <TrendingUp size={16} />
                    Historical
                </button>
                <button
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors${activeTab === 'management' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-white/20'}`}
                    onClick={() => setActiveTab('management')}
                >
                    <Database size={16} />
                    Data Management
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'realtime' && (
                <>
                    {isOffline ? (
                        <div className="glass-card p-12 rounded-lg border border-white/10 text-center">
                            <Activity className="w-16 h-16 text-red-500 mx-auto mb-4" />
                            <h2 className="text-2xl font-bold text-red-600 mb-2">Agent Offline</h2>
                            <p className="text-gray-300 text-lg">
                                This VM is currently offline. Real-time monitoring is unavailable.
                            </p>
                            <p className="text-gray-400 mt-4">
                                You can still view historical data and manage stored metrics using the tabs above.
                            </p>
                        </div>
                    ) : connectionStatus === 'error' ? (
                        <div className="glass-card p-12 rounded-lg border border-white/10 text-center">
                            <Activity className="w-16 h-16 text-red-500 mx-auto mb-4" />
                            <h2 className="text-2xl font-bold text-red-600 mb-2">Connection Failed</h2>
                            <p className="text-gray-300 text-lg">
                                Unable to establish a real-time connection to the central monitoring server.
                            </p>
                            <p className="text-gray-400 mt-4">
                                The server may be unreachable or offline. Please try again later.
                            </p>
                            <button
                                onClick={() => window.location.reload()}
                                className="mt-6 px-4 py-2 glass-button text-white rounded hover:glass-panel/20 transition"
                            >
                                Retry Connection
                            </button>
                        </div>
                    ) : !latest ? (
                        <div className="glass-card p-12 rounded-lg border border-white/10 text-center">
                            <Activity className="w-16 h-16 text-blue-600 mx-auto mb-4 animate-spin" />
                            <h2 className="text-2xl font-bold text-white mb-2">Connecting to Agent...</h2>
                            <p className="text-gray-400">
                                Establishing connection to receive real-time metrics.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* System Stats Overview */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                                {/* CPU Stats Card */}
                                <div className="glass-card rounded-xl border border-white/10 p-6 overflow-hidden relative">
                                    <div className="absolute top-0 right-0 w-32 h-32 glass-panel/5 rounded-full -mr-10 -mt-10 opacity-50 pointer-events-none"></div>
                                    <div className="flex items-center gap-3 mb-6 relative">
                                        <div className="p-2 glass-panel/5 rounded-lg">
                                            <Cpu size={24} className="text-blue-500" />
                                        </div>
                                        <h3 className="m-0 text-lg font-semibold text-gray-100">CPU</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 relative">
                                        <div>
                                            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Cores</div>
                                            <div className="text-2xl font-bold text-white">{latest.cpu.cores.length}</div>
                                        </div>
                                        <div>
                                            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Usage</div>
                                            <div className={`text-2xl font-bold${latest.cpu.usage > 80 ? 'text-red-500' : latest.cpu.usage > 60 ? 'text-orange-500' : 'text-blue-600'}`}>
                                                {latest.cpu.usage.toFixed(1)}%
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 h-2 glass-panel/10 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full${latest.cpu.usage > 80 ? 'bg-red-500/10 border-red-500/30 text-red-2000' : latest.cpu.usage > 60 ? 'bg-orange-500' : 'bg-blue-500'}`}
                                            style={{ width: `${latest.cpu.usage}%` }}
                                        ></div>
                                    </div>
                                </div>

                                {/* Memory Stats Card */}
                                <div className="glass-card rounded-xl border border-white/10 p-6 overflow-hidden relative">
                                    <div className="absolute top-0 right-0 w-32 h-32 glass-panel/5 rounded-full -mr-10 -mt-10 opacity-50 pointer-events-none"></div>
                                    <div className="flex items-center gap-3 mb-6 relative">
                                        <div className="p-2 glass-panel/5 rounded-lg">
                                            <Activity size={24} className="text-cyan-500" />
                                        </div>
                                        <h3 className="m-0 text-lg font-semibold text-gray-100">Memory</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 relative">
                                        <div>
                                            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Total</div>
                                            <div className="text-2xl font-bold text-white">
                                                {(latest.memory.total / 1024 / 1024 / 1024).toFixed(1)} <span className="text-sm font-medium text-gray-400">GB</span>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Used</div>
                                            <div className={`text-2xl font-bold${latest.memory.percent > 80 ? 'text-red-500' : latest.memory.percent > 60 ? 'text-orange-500' : 'text-cyan-600'}`}>
                                                {(latest.memory.used / 1024 / 1024 / 1024).toFixed(1)} <span className={`text-sm font-medium${latest.memory.percent > 80 ? 'text-red-400' : latest.memory.percent > 60 ? 'text-orange-400' : 'text-cyan-400'}`}>GB</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex justify-between items-center text-xs text-gray-400 mb-1">
                                        <span>Utilized</span>
                                        <span className="font-medium">{latest.memory.percent.toFixed(1)}%</span>
                                    </div>
                                    <div className="h-2 glass-panel/10 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full${latest.memory.percent > 80 ? 'bg-red-500/10 border-red-500/30 text-red-2000' : latest.memory.percent > 60 ? 'bg-orange-500' : 'bg-cyan-500'}`}
                                            style={{ width: `${latest.memory.percent}%` }}
                                        ></div>
                                    </div>
                                </div>

                                {/* Disk Stats Card */}
                                <div className="glass-card rounded-xl border border-white/10 p-6 overflow-hidden relative">
                                    <div className="absolute top-0 right-0 w-32 h-32 glass-panel/5 rounded-full -mr-10 -mt-10 opacity-50 pointer-events-none"></div>
                                    <div className="flex items-center gap-3 mb-6 relative">
                                        <div className="p-2 glass-panel/5 rounded-lg">
                                            <Database size={24} className="text-green-500" />
                                        </div>
                                        <h3 className="m-0 text-lg font-semibold text-gray-100">Disk</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 relative">
                                        <div>
                                            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Total</div>
                                            <div className="text-2xl font-bold text-white">
                                                {latest.disk ? (latest.disk.total / 1024 / 1024 / 1024).toFixed(1) : '0'} <span className="text-sm font-medium text-gray-400">GB</span>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Used</div>
                                            <div className={`text-2xl font-bold${latest.disk?.percent > 80 ? 'text-red-500' : latest.disk?.percent > 60 ? 'text-orange-500' : 'text-green-600'}`}>
                                                {latest.disk ? (latest.disk.used / 1024 / 1024 / 1024).toFixed(1) : '0'} <span className={`text-sm font-medium${latest.disk?.percent > 80 ? 'text-red-400' : latest.disk?.percent > 60 ? 'text-orange-400' : 'text-green-400'}`}>GB</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex justify-between items-center text-xs text-gray-400 mb-1">
                                        <span>Utilized</span>
                                        <span className="font-medium">{latest.disk ? latest.disk.percent.toFixed(1) : 0}%</span>
                                    </div>
                                    <div className="h-2 glass-panel/10 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full${latest.disk?.percent > 80 ? 'bg-red-500/10 border-red-500/30 text-red-2000' : latest.disk?.percent > 60 ? 'bg-orange-500' : 'bg-green-500'}`}
                                            style={{ width: `${latest.disk ? latest.disk.percent : 0}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
                                <div className="glass-card rounded-xl border border-white/10 p-6">
                                    <h3 className="m-0 mb-6 text-lg font-semibold text-gray-100 flex items-center gap-2">
                                        <Cpu size={18} className="text-blue-500" /> Real-time CPU Usage ({latest.cpu.usage}%)
                                    </h3>
                                    <div className="h-[250px]">
                                        <Line data={cpuData} options={chartOptions} />
                                    </div>
                                </div>
                                <div className="glass-card rounded-xl border border-white/10 p-6">
                                    <h3 className="m-0 mb-6 text-lg font-semibold text-gray-100 flex items-center gap-2">
                                        <Activity size={18} className="text-cyan-500" /> Real-time Memory Usage ({latest.memory.percent}%)
                                    </h3>
                                    <div className="h-[250px]">
                                        <Line data={memData} options={chartOptions} />
                                    </div>
                                </div>
                            </div>

                            {/* Top Processes */}
                            <div className="glass-card rounded-xl border border-white/10 p-6 mb-8 overflow-hidden">
                                <h3 className="m-0 mb-4 text-lg font-semibold text-gray-100">Top Processes</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-white/10 bg-gray-50/50">
                                                <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">PID</th>
                                                <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
                                                <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">CPU %</th>
                                                <th className="py-3 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Mem %</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {latest.processes.map((proc, i) => (
                                                <tr key={i} className="hover:glass-panel/10 transition-colors">
                                                    <td className="py-3 px-4 text-sm font-mono text-gray-300">{proc.pid}</td>
                                                    <td className="py-3 px-4 text-sm font-medium text-gray-100">{proc.name}</td>
                                                    <td className={`py-3 px-4 text-sm text-right font-semibold${proc.cpu_percent > 50 ? 'text-red-500' : proc.cpu_percent > 20 ? 'text-orange-500' : 'text-gray-400'}`}>
                                                        {proc.cpu_percent?.toFixed(1)}
                                                    </td>
                                                    <td className="py-3 px-4 text-sm text-right text-gray-300">{proc.memory_percent?.toFixed(1)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Services Status */}
                            <div className="glass-card rounded-xl border border-white/10 p-6">
                                <h3 className="m-0 mb-4 text-lg font-semibold text-gray-100">Services Status</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {latest.services && Object.entries(latest.services).map(([service, statusData]) => {
                                        const state = typeof statusData === 'string' ? statusData : statusData.state;
                                        const checks = typeof statusData === 'object' ? statusData.checks : null;

                                        const getBadgeClass = (state) => {
                                            switch (state) {
                                                case 'healthy': return 'bg-green-100 text-green-800 border-green-200';
                                                case 'degraded': return 'bg-yellow-100 text-yellow-400 border-yellow-200';
                                                case 'down': return 'bg-red-100 text-red-400 border-red-200';
                                                case 'unknown': return 'bg-gray-100 text-gray-200 border-white/10';
                                                case 'running': return 'bg-green-100 text-green-800 border-green-200';
                                                case 'stopped': return 'bg-red-100 text-red-400 border-red-200';
                                                default: return 'bg-gray-100 text-gray-200 border-white/10';
                                            }
                                        };

                                        return (
                                            <div key={service} className="p-4 rounded-lg border border-white/10 glass-panel/5 hover:glass-panel hover:shadow-sm transition-all flex flex-col h-full">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="font-semibold text-gray-100">{service}</span>
                                                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border${getBadgeClass(state)}`}>
                                                        {state}
                                                    </span>
                                                </div>
                                                {checks ? (
                                                    <div className="mt-auto pt-2 text-xs border-l-2 border-white/10 pl-2 space-y-1.5 flex flex-col">
                                                        {Object.entries(checks).map(([checkName, checkResult]) => (
                                                            <div key={checkName} className="flex items-start gap-2">
                                                                <div className={`mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full${checkResult.passed ? 'bg-green-400' : 'bg-red-400'}`}></div>
                                                                <div className="flex flex-col">
                                                                    <span className="font-medium text-gray-300 capitalize leading-tight">{checkName}</span>
                                                                    <span className={`leading-tight mt-0.5${checkResult.passed ? 'text-green-600' : 'text-red-500'}`}>
                                                                        {checkResult.message}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="mt-auto pt-2"></div> /* Spacer if no checks */
                                                )}
                                            </div>
                                        );
                                    })}
                                    {(!latest.services || Object.keys(latest.services).length === 0) && (
                                        <div className="md:col-span-2 xl:col-span-3 text-gray-400 text-sm text-center py-8 border border-dashed border-white/10 rounded-lg">No services monitored.</div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}

            {activeTab === 'alerts' && (
                <AlertsPanel vmId={vmId} socket={socketRef.current} />
            )}

            {activeTab === 'historical' && (
                <HistoricalData vmId={vmId} hostname={displayHostname} />
            )}

            {activeTab === 'management' && (
                <DataManagement vmId={vmId} hostname={displayHostname} />
            )}
        </div>
    );
};

export default VMDetails;
