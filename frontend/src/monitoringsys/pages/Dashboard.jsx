import React, { useEffect, useState, useRef, memo } from 'react';
import { Link } from 'react-router-dom';
import { Server, Activity, Trash2 } from 'lucide-react';
import io from 'socket.io-client';
import config from '../config';

// Memoized VM Card component to prevent unnecessary re-renders
const VMCard = memo(({ vm, onDelete }) => {
    const handleDelete = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to permanently delete VM "${vm.hostname}" (${vm._id}) and all its historical monitoring data?`)) {
            onDelete(vm._id);
        }
    };

    return (
        <Link to={`/metrics/vm/${vm._id}`} state={{ agentUrl: vm.agentUrl }} key={vm._id} className="glass-card p-6 rounded-lg border border-white/10 hover:shadow-md transition-shadow block relative">
            {vm.status === 'offline' && (
                <button
                    onClick={handleDelete}
                    className="absolute top-4 right-4 p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors z-10"
                    title="Delete Agent Data"
                >
                    <Trash2 size={16} />
                </button>
            )}
            <div className="flex items-center gap-4 mb-4">
                <div className="p-2 glass-panel/5 text-blue-600 rounded-lg">
                    <Server size={24} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-white m-0">{vm.hostname}</h3>
                    <span className="text-sm text-gray-400">{vm._id}</span>
                </div>
                <div className="ml-auto">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full${vm.status === 'online' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-400'}`}>
                        {vm.status || 'Unknown'}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                    <div className="text-xs text-gray-400 mb-1">CPU</div>
                    <div className={`font-bold${vm.cpu?.usage > 80 ? 'text-red-600' : 'text-white'}`}>
                        {vm.cpu?.usage ? `${vm.cpu.usage.toFixed(1)}%` : 'N/A'}
                    </div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-gray-400 mb-1">Memory</div>
                    <div className="font-bold text-white">
                        {vm.memory?.percent ? `${vm.memory.percent.toFixed(1)}%` : 'N/A'}
                    </div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-gray-400 mb-1">Status</div>
                    <div className={`text-sm font-medium${vm.status === 'online' ? 'text-green-600' : 'text-red-600'}`}>
                        {vm.status === 'online' ? 'Live' : 'Offline'}
                    </div>
                </div>
            </div>

            {/* Detailed System Stats */}
            {vm.status === 'online' && vm.cpu && vm.memory && (
                <div className="grid grid-cols-3 gap-3 p-3 glass-panel/5 rounded-lg text-xs">
                    {/* CPU Stats */}
                    <div>
                        <div className="font-semibold text-gray-200 mb-1">CPU</div>
                        <div className="flex justify-between mb-0.5">
                            <span className="text-gray-400">Cores:</span>
                            <span className="text-white">{vm.cpu?.cores?.length || 0}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Usage:</span>
                            <span className={`${vm.cpu?.usage > 80 ? 'text-red-600' : 'text-green-600'}`}>
                                {vm.cpu?.usage?.toFixed(1)}%
                            </span>
                        </div>
                    </div>

                    {/* Memory Stats */}
                    <div>
                        <div className="font-semibold text-gray-200 mb-1">Memory</div>
                        <div className="flex justify-between mb-0.5">
                            <span className="text-gray-400">Total:</span>
                            <span className="text-white">{(vm.memory?.total / 1024 / 1024 / 1024).toFixed(1)} GB</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Used:</span>
                            <span className={`${vm.memory?.percent > 80 ? 'text-red-600' : 'text-green-600'}`}>
                                {(vm.memory?.used / 1024 / 1024 / 1024).toFixed(1)} GB
                            </span>
                        </div>
                    </div>

                    {/* Disk Stats */}
                    <div>
                        <div className="font-semibold text-gray-200 mb-1">Disk</div>
                        <div className="flex justify-between mb-0.5">
                            <span className="text-gray-400">Total:</span>
                            <span className="text-white">{vm.disk ? (vm.disk.total / 1024 / 1024 / 1024).toFixed(1) : '0'} GB</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">Used:</span>
                            <span className={`${vm.disk?.percent > 80 ? 'text-red-600' : 'text-green-600'}`}>
                                {vm.disk ? (vm.disk.used / 1024 / 1024 / 1024).toFixed(1) : '0'} GB
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Offline message */}
            {vm.status === 'offline' && (
                <div className="p-3 glass-panel/5 rounded-lg text-xs text-red-600 text-center font-medium">
                    Agent offline - Click to view historical data
                </div>
            )}
        </Link>
    );
}, (prevProps, nextProps) => {
    // Custom comparison function - only re-render if these values change
    const prev = prevProps.vm;
    const next = nextProps.vm;

    return (
        prev._id === next._id &&
        prev.hostname === next.hostname &&
        prev.status === next.status &&
        prev.cpu?.usage === next.cpu?.usage &&
        prev.memory?.percent === next.memory?.percent &&
        prev.disk?.percent === next.disk?.percent
    );
});

const Dashboard = () => {
    const [vms, setVms] = useState({}); // Map: vmId -> vmData
    const serverSocketRef = useRef(null); // Single connection to Server
    const [isInitialLoad, setIsInitialLoad] = useState(true);

    useEffect(() => {
        // Setup central server socket connection
        const socket = io(config.SERVER_URL);
        serverSocketRef.current = socket;

        socket.on('connect', () => {
            console.log('Connected to Monitoring Server Dashboard stream');
        });

        socket.on('metrics:update', (data) => {
            setVms(prev => ({
                ...prev,
                [data.vmId]: {
                    ...prev[data.vmId],
                    _id: data.vmId,
                    hostname: data.hostname,
                    lastSeen: data.timestamp,
                    cpu: data.cpu,
                    memory: data.memory,
                    disk: data.disk,
                    status: 'online',
                    agentUrl: prev[data.vmId] ? prev[data.vmId].agentUrl : null // preserve agentUrl if present
                }
            }));
        });

        socket.on('disconnect', () => {
            console.log('Lost connection to Monitoring Server');
        });

        // 1. Initial fetch of all VMs
        const fetchAllVMs = async () => {
            try {
                const res = await fetch(`${config.SERVER_URL}/api/vms/all`);
                const allVms = await res.json();

                // Initialize VM state with database info
                const vmsMap = {};
                allVms.forEach(vm => {
                    vmsMap[vm._id] = {
                        _id: vm._id,
                        hostname: vm.hostname,
                        lastSeen: vm.lastSeen,
                        status: vm.status,
                        agentUrl: `${vm.ip}:${vm.port}`,
                        cpu: null,
                        memory: null,
                        disk: null
                    };
                });

                setVms(vmsMap);
                setIsInitialLoad(false);
            } catch (err) {
                console.error("Failed to fetch VMs", err);
                setIsInitialLoad(false);
            }
        };

        fetchAllVMs();

        // Cleanup Server socket on unmount
        return () => {
            if (socket) socket.disconnect();
        };
    }, []);

    // 2. Periodic status check (less frequent, only updates status)
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await fetch(`${config.SERVER_URL}/api/vms/all`);
                const allVms = await res.json();

                setVms(prev => {
                    const updated = { ...prev };

                    allVms.forEach(vm => {
                        if (updated[vm._id]) {
                            // Only update status if changed
                            if (updated[vm._id].status !== vm.status) {
                                console.log(`VM ${vm._id} status changed: ${updated[vm._id].status} -> ${vm.status}`);
                                updated[vm._id] = {
                                    ...updated[vm._id],
                                    status: vm.status
                                };
                            }
                        } else {
                            // New VM discovered
                            console.log(`New VM discovered: ${vm._id}`);
                            updated[vm._id] = {
                                _id: vm._id,
                                hostname: vm.hostname,
                                lastSeen: vm.lastSeen,
                                status: vm.status,
                                agentUrl: `${vm.ip}:${vm.port}`,
                                cpu: null,
                                memory: null,
                                disk: null
                            };
                        }
                    });

                    return updated;
                });
            } catch (err) {
                console.error("Status check failed", err);
            }
        };

        const interval = setInterval(checkStatus, 10000); // Check every 10s
        return () => clearInterval(interval);
    }, []);

    const handleDeleteVM = async (vmId) => {
        try {
            const res = await fetch(`${config.SERVER_URL}/api/vms/${vmId}`, { method: 'DELETE' });
            if (res.ok) {
                setVms(prev => {
                    const updated = { ...prev };
                    delete updated[vmId];
                    return updated;
                });
            } else {
                console.error('Failed to delete VM:', await res.text());
            }
        } catch (err) {
            console.error('Error deleting VM:', err);
        }
    };

    const vmList = Object.values(vms);
    const onlineCount = vmList.filter(vm => vm.status === 'online').length;

    if (isInitialLoad) return (
        <div className="text-center mt-16">
            <Activity className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
            <h2 className="text-xl font-bold text-white">Loading Infrastructure...</h2>
            <p className="text-gray-400 mt-2">Discovering agents and establishing connections...</p>
        </div>
    );

    if (vmList.length === 0) return (
        <div className="text-center mt-16 p-8 glass-card border border-white/10 rounded-lg max-w-lg mx-auto">
            <h2 className="text-xl font-bold text-white">No Agents Found</h2>
            <p className="text-gray-400 mt-2">Please ensure the Monitoring Agent is running and registered with the Server.</p>
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">Infrastructure Overview</h1>
                <div className="flex items-center gap-3">
                    <span className="px-3 py-1 glass-panel/10 text-green-800 rounded-full text-sm font-semibold">{onlineCount} Online</span>
                    <span className="px-3 py-1 glass-panel/10 text-red-400 rounded-full text-sm font-semibold">{vmList.length - onlineCount} Offline</span>
                    <span className="text-sm text-gray-400 ml-2">Total: {vmList.length}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                {vmList.map((vm) => (
                    <VMCard key={vm._id} vm={vm} onDelete={handleDeleteVM} />
                ))}
            </div>
        </div>
    );
};

export default Dashboard;
