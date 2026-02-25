import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Server, Activity } from 'lucide-react';
import config from '../config';

const ConnectionStatus = ({ agentUrl, vmId, agentStatus }) => {
    const [serverStatus, setServerStatus] = useState('disconnected');

    useEffect(() => {
        // Check server connection
        const checkServerConnection = async () => {
            try {
                const response = await fetch(`${config.SERVER_URL}/api/vms`);
                setServerStatus(response.ok ? 'connected' : 'error');
            } catch (error) {
                setServerStatus('error');
            }
        };

        checkServerConnection();
        const serverInterval = setInterval(checkServerConnection, 10000); // Check every 10s

        return () => clearInterval(serverInterval);
    }, []);

    return (
        <div className="flex items-center gap-4 px-4 py-2 bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2">
                <Activity size={14} className={agentStatus === 'connected' ? 'text-green-500' : 'text-red-500'} />
                <span className="text-xs font-medium text-gray-500">
                    Real-time:
                </span>
                <span className={`text-xs font-bold tracking-wide ${agentStatus === 'connected' ? 'text-green-600' : 'text-red-600'}`}>
                    {agentStatus === 'connected' ? 'LIVE' : 'OFFLINE'}
                </span>
            </div>

            <div className="w-px h-5 bg-gray-200" />

            <div className="flex items-center gap-2">
                <Server size={14} className={serverStatus === 'connected' ? 'text-green-500' : 'text-red-500'} />
                <span className="text-xs font-medium text-gray-500">
                    Storage:
                </span>
                <span className={`text-xs font-bold tracking-wide ${serverStatus === 'connected' ? 'text-green-600' : 'text-red-600'}`}>
                    {serverStatus === 'connected' ? 'ONLINE' : 'OFFLINE'}
                </span>
            </div>
        </div>
    );
};

export default ConnectionStatus;