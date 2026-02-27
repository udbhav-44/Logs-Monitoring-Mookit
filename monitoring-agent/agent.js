const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const child_process = require('child_process');
const util = require('util');

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Server: SocketIOServer } = require('socket.io');
const { io: socketIoClient } = require('socket.io-client');
const si = require('systeminformation');

const execFile = util.promisify(child_process.execFile);
const exec = util.promisify(child_process.exec);

// Load Configuration
const configPath = path.join(__dirname, 'config.json');
let config = {};
try {
    const rawData = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(rawData);
} catch (error) {
    console.error('Error reading config.json:', error);
    process.exit(1);
}

// Ensure the server_url from config points to the root of the backend discovery server
let SERVER_URL = process.env.SERVER_URL || config.server_url || 'http://localhost:5000';
let DISCOVERY_URL = SERVER_URL.includes('/api/') ? SERVER_URL.split('/api/')[0] : SERVER_URL.replace(/\/$/, "");

const AGENT_PORT = process.env.AGENT_PORT || 5001;
const VM_ID = process.env.VM_ID || config.vm_id || 'vm-default';
const HOSTNAME = process.env.HOSTNAME || config.hostname || os.hostname();
let BROADCAST_INTERVAL = config.broadcast_interval || 0.5;
let STORAGE_INTERVAL = config.storage_interval || 5;
const SERVICES_MONITOR = config.services_to_monitor || [];

let broadcast_counter = 0;
let storage_counter = 0;

// Create Express Server for direct dashboard connections
const app = express();
app.use(cors({ origin: true, credentials: true }));

const httpServer = http.createServer(app);
const sio = new SocketIOServer(httpServer, {
    cors: { origin: "*", credentials: true }
});

// Create Socket.IO Client for interacting with the main server
const serverSio = socketIoClient(DISCOVERY_URL, {
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity
});

let server_connected = false;

serverSio.on('connect', () => {
    server_connected = true;
    console.log(`✓ Connected to server for storage at ${DISCOVERY_URL}`);
});

serverSio.on('disconnect', () => {
    server_connected = false;
    console.warn("✗ Disconnected from server");
});

serverSio.on('connect_error', (error) => {
    server_connected = false;
    console.error(`✗ Server connection error:`, error.message);
});

async function getCpuMetrics() {
    const load = await si.currentLoad();
    return {
        usage: load.currentLoad,
        cores: load.cpus.map(cpu => cpu.load)
    };
}

function getLoadAverage() {
    return os.loadavg();
}

async function getMemoryMetrics() {
    const mem = await si.mem();
    return {
        total: mem.total,
        used: mem.active,
        percent: (mem.active / mem.total) * 100
    };
}

async function getSwapMetrics() {
    const mem = await si.mem();
    if (mem.swaptotal === 0) return null;
    return {
        total: mem.swaptotal,
        used: mem.swapused,
        percent: (mem.swapused / mem.swaptotal) * 100
    };
}

async function getDiskMetrics() {
    try {
        const fsSize = await si.fsSize();
        // Typically the first returned filesystem is the root, or we look for mount '/'
        const rootFs = fsSize.find(fs => fs.mount === '/') || fsSize[0];

        let result = {
            total: rootFs.size,
            used: rootFs.used,
            percent: rootFs.use
        };

        // Try to gather I/O wait and inodes if possible, though systeminformation handles this abstractly
        const currentLoad = await si.currentLoad();
        if (currentLoad && currentLoad.currentLoadIdle !== undefined) {
            // currentLoad doesn't expose direct iowait in all OS, falling back gracefully
            result.ioWait = null;
        }

        return result;
    } catch (e) {
        console.error("Error getting disk metrics", e);
        return { total: 0, used: 0, percent: 0 };
    }
}

async function getTopProcesses(n = 5) {
    try {
        const processes = await si.processes();
        // Sort by CPU percentage
        let list = processes.list.sort((a, b) => b.cpu - a.cpu).slice(0, n);
        return list.map(p => ({
            name: p.name,
            pid: p.pid,
            cpu_percent: p.cpu,
            memory_percent: p.mem
        }));
    } catch (e) {
        console.error("Error getting processes", e);
        return [];
    }
}

class ServiceHealthChecker {
    HEALTHY = "healthy";
    DEGRADED = "degraded";
    DOWN = "down";
    UNKNOWN = "unknown";

    constructor(serviceConfigs) {
        this.serviceConfigs = serviceConfigs;
    }

    async checkHttp(config, timeout = 3000) {
        try {
            const url = config.url || 'http://127.0.0.1';
            const expectedStatus = config.expected_status || [200, 204];

            const response = await axios.get(url, {
                timeout,
                validateStatus: function (status) {
                    return expectedStatus.includes(status);
                }
            });
            return { passed: true, message: `HTTP ${response.status}` };
        } catch (error) {
            if (error.response) return { passed: false, message: `HTTP ${error.response.status}` };
            if (error.code === 'ECONNABORTED') return { passed: false, message: "HTTP timeout" };
            return { passed: false, message: `HTTP error: ${error.message.substring(0, 50)}` };
        }
    }

    async checkTcpPort(config, timeoutMs = 3000) {
        const host = config.host || '127.0.0.1';
        const port = config.port;

        if (!port) return { passed: false, message: "No port specified" };

        return new Promise((resolve) => {
            const socket = new net.Socket();
            let resolved = false;

            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    socket.destroy();
                    resolve({ passed: false, message: "Port check timeout" });
                }
            }, timeoutMs);

            socket.connect(port, host, () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    socket.destroy();
                    resolve({ passed: true, message: `Port ${port} open` });
                }
            });

            socket.on('error', (err) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve({ passed: false, message: `Port error: ${err.message.substring(0, 50)}` });
                }
            });
        });
    }

    async checkUnixSocket(config, timeoutMs = 3000) {
        const socketPath = config.socket_path;
        if (!socketPath) return { passed: false, message: "No socket path specified" };
        if (!fs.existsSync(socketPath)) return { passed: false, message: "Socket not found" };

        return new Promise((resolve) => {
            const socket = new net.Socket();
            let resolved = false;

            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    socket.destroy();
                    resolve({ passed: false, message: "Socket timeout" });
                }
            }, timeoutMs);

            socket.connect(socketPath, () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    socket.destroy();
                    resolve({ passed: true, message: "Socket accessible" });
                }
            });

            socket.on('error', (err) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve({ passed: false, message: `Socket error: ${err.message.substring(0, 50)}` });
                }
            });
        });
    }

    async checkCommand(config, timeout = 5000) {
        const cmd = config.command;
        if (!cmd) return { passed: false, message: "No command specified" };

        let commandStr = Array.isArray(cmd) ? cmd.join(' ') : cmd;

        try {
            await exec(commandStr, { timeout });
            return { passed: true, message: "Command succeeded" };
        } catch (error) {
            if (error.killed) return { passed: false, message: "Command timeout" };
            return { passed: false, message: `Command failed (exit ${error.code})` };
        }
    }

    async checkSystemd(serviceName, timeout = 5000) {
        try {
            await execFile('systemctl', ['is-active', serviceName], { timeout });

            // If we get here, exit code was 0 (active)
            try {
                const { stdout } = await execFile('systemctl', ['show', serviceName, '--property=SubState,ActiveState'], { timeout });
                const stateInfo = stdout.trim() || "active";
                return { passed: true, message: stateInfo };
            } catch (e) {
                return { passed: true, message: "active" };
            }
        } catch (error) {
            if (error.killed) return { passed: false, message: "systemd timeout" };
            if (error.code === 'ENOENT') return { passed: null, message: "systemd not available" };
            // Exit code non-zero means inactive
            return { passed: false, message: "inactive" };
        }
    }

    async checkProcess(serviceName) {
        try {
            const processes = await si.processes();
            for (let proc of processes.list) {
                const procName = proc.name.toLowerCase();
                const cmdline = proc.command.toLowerCase();
                if (procName.includes(serviceName.toLowerCase()) || cmdline.includes(serviceName.toLowerCase())) {
                    return { passed: true, message: `Process found (PID: ${proc.pid})` };
                }
            }
            return { passed: false, message: "Process not found" };
        } catch (error) {
            return { passed: false, message: `Process check error: ${error.message.substring(0, 50)}` };
        }
    }

    async checkPm2(serviceName = null) {
        try {
            const { stdout } = await execFile('pm2', ['jlist'], { timeout: 5000 });
            const processes = JSON.parse(stdout);

            if (!processes || processes.length === 0) {
                return { passed: false, message: "No PM2 processes running" };
            }

            if (serviceName) {
                for (let proc of processes) {
                    if (proc.name.toLowerCase().includes(serviceName.toLowerCase())) {
                        const status = (proc.pm2_env && proc.pm2_env.status) ? proc.pm2_env.status : 'unknown';
                        if (status === 'online') {
                            return { passed: true, message: `PM2: ${proc.name} online (PID: ${proc.pid})` };
                        } else {
                            return { passed: false, message: `PM2: ${proc.name} ${status}` };
                        }
                    }
                }
                return { passed: false, message: `Service '${serviceName}' not found in PM2` };
            } else {
                const onlineCount = processes.filter(p => p.pm2_env && p.pm2_env.status === 'online').length;
                if (onlineCount > 0) return { passed: true, message: `PM2: ${onlineCount} process(es) online` };
                return { passed: false, message: "PM2: No processes online" };
            }
        } catch (error) {
            if (error.code === 'ENOENT') return { passed: null, message: "PM2 not installed" };
            return { passed: null, message: `PM2 check error: ${error.message.substring(0, 50)}` };
        }
    }

    async checkNodejsProcesses() {
        try {
            const { stdout } = await execFile('ps', ['aux'], { timeout: 5000 });
            const lines = stdout.toLowerCase().split('\n');
            let nodeProcesses = [];

            for (let line of lines) {
                if (line.includes('node ') || line.includes('npm ') || line.includes('nodejs')) {
                    if (!line.includes('grep') && !line.includes('node.mojom')) {
                        const parts = line.trim().split(/\s+/);
                        if (parts.length >= 2) {
                            const pid = parseInt(parts[1], 10);
                            if (!isNaN(pid)) nodeProcesses.push(pid);
                        }
                    }
                }
            }

            if (nodeProcesses.length > 0) {
                return { passed: true, message: `Found ${nodeProcesses.length} Node.js process(es)` };
            }

            const { stdout: pgrepOut } = await exec('pgrep -f "node|npm"', { timeout: 5000 });
            if (pgrepOut.trim()) {
                const pids = pgrepOut.trim().split('\n');
                return { passed: true, message: `Found ${pids.length} Node.js process(es) via pgrep` };
            }

            return { passed: false, message: "No Node.js processes found" };
        } catch (error) {
            return { passed: null, message: "Process check error" };
        }
    }

    async checkService(serviceName, config) {
        let checks = {};
        let functionalPassed = false;

        const checkType = config.check_type || 'auto';

        if (checkType === 'http' || (checkType === 'auto' && config.url)) {
            const res = await this.checkHttp(config);
            checks.http = res;
            functionalPassed = res.passed;
        } else if (checkType === 'tcp' || (checkType === 'auto' && config.port)) {
            const res = await this.checkTcpPort(config);
            checks.tcp_port = res;
            functionalPassed = res.passed;
        } else if (checkType === 'socket' || (checkType === 'auto' && config.socket_path)) {
            const res = await this.checkUnixSocket(config);
            checks.unix_socket = res;
            functionalPassed = res.passed;
        } else if (checkType === 'command' || (checkType === 'auto' && config.command)) {
            const res = await this.checkCommand(config);
            checks.command = res;
            functionalPassed = res.passed;
        }

        const systemdRes = await this.checkSystemd(serviceName);
        if (systemdRes.passed !== null) checks.systemd = systemdRes;

        if (['node', 'nodejs'].includes(serviceName.toLowerCase())) {
            const pm2Res = await this.checkPm2();
            if (pm2Res.passed !== null) {
                checks.pm2 = pm2Res;
                if (pm2Res.passed) functionalPassed = true;
            }

            const nodeProcRes = await this.checkNodejsProcesses();
            if (nodeProcRes.passed !== null) {
                checks.nodejs_processes = nodeProcRes;
                if (nodeProcRes.passed) functionalPassed = true;
            }
        }

        if (!functionalPassed && (!Object.keys(checks).length || systemdRes.passed === null || systemdRes.passed === false)) {
            const procRes = await this.checkProcess(serviceName);
            checks.process = procRes;
        }

        const state = this._determineState(checks, functionalPassed, systemdRes.passed);

        return { state, checks };
    }

    _determineState(checks, functionalPassed, systemdPassed) {
        if (!Object.keys(checks).length) return this.UNKNOWN;
        if (functionalPassed) return this.HEALTHY;

        if (checks.http || checks.tcp_port || checks.unix_socket || checks.command) {
            if (!functionalPassed) {
                if (systemdPassed || (checks.process && checks.process.passed)) return this.DEGRADED;
                return this.DOWN;
            }
        }

        if (systemdPassed || (checks.process && checks.process.passed)) return this.HEALTHY;
        if (systemdPassed === false || (checks.process && checks.process.passed === false)) return this.DOWN;

        return this.UNKNOWN;
    }

    async checkAllServices() {
        let results = {};
        for (const [serviceName, svcConfig] of Object.entries(this.serviceConfigs)) {
            try {
                results[serviceName] = await this.checkService(serviceName, svcConfig);
            } catch (e) {
                console.error(`Error checking service ${serviceName}:`, e);
                results[serviceName] = {
                    state: this.UNKNOWN,
                    checks: { error: { passed: false, message: e.message.substring(0, 100) } }
                };
            }
        }
        return results;
    }
}

function getDefaultServiceConfig(serviceName) {
    const defaults = {
        'nginx': { check_type: 'http', url: 'http://127.0.0.1:80', expected_status: [200, 301, 302, 404] },
        'apache2': { check_type: 'http', url: 'http://127.0.0.1:80', expected_status: [200, 301, 302, 404] },
        'mysql': { check_type: 'command', command: 'mysqladmin ping -h 127.0.0.1' },
        'mariadb': { check_type: 'command', command: 'mysqladmin ping -h 127.0.0.1' },
        'postgresql': { check_type: 'tcp', host: '127.0.0.1', port: 5432 },
        'mongodb': { check_type: 'tcp', host: '127.0.0.1', port: 27017 },
        'redis': { check_type: 'command', command: 'redis-cli ping' },
        'redis-server': { check_type: 'command', command: 'redis-cli ping' },
        'elasticsearch': { check_type: 'http', url: 'http://127.0.0.1:9200/_cluster/health', expected_status: [200] },
        'php-fpm': { check_type: 'socket', socket_path: '/run/php/php-fpm.sock' },
        'php7.4-fpm': { check_type: 'socket', socket_path: '/run/php/php7.4-fpm.sock' },
        'node': { check_type: 'auto' },
        'nodejs': { check_type: 'auto' },
        'docker': { check_type: 'socket', socket_path: '/var/run/docker.sock' },
        'ssh': { check_type: 'tcp', host: '127.0.0.1', port: 22 },
        'sshd': { check_type: 'tcp', host: '127.0.0.1', port: 22 }
    };
    return defaults[serviceName] || { check_type: 'auto' };
}

async function getServiceStatus() {
    let serviceConfigs = {};
    for (const service of SERVICES_MONITOR) {
        serviceConfigs[service] = getDefaultServiceConfig(service);
    }
    const checker = new ServiceHealthChecker(serviceConfigs);
    return await checker.checkAllServices();
}

function getIstTimestamp() {
    // Current timestamp in ms
    return Date.now();
}

async function collectMetrics() {
    const cpuMetrics = await getCpuMetrics();
    const memoryMetrics = await getMemoryMetrics();
    const diskMetrics = await getDiskMetrics();
    const loadAvg = getLoadAverage();
    const topProcesses = await getTopProcesses();
    const serviceStatus = await getServiceStatus();
    const swapMetrics = await getSwapMetrics();

    let metrics = {
        vmId: VM_ID,
        hostname: HOSTNAME,
        cpu: cpuMetrics,
        memory: memoryMetrics,
        disk: diskMetrics,
        processes: topProcesses,
        services: serviceStatus,
        timestamp: getIstTimestamp(),
        loadAverage: loadAvg
    };

    if (swapMetrics) {
        metrics.swap = swapMetrics;
    }

    return metrics;
}

function getLocalIp() {
    return new Promise((resolve) => {
        if (config.external_ip) return resolve(config.external_ip);

        // Use a UDP socket to determine route
        try {
            const socket = net.createConnection(80, DISCOVERY_URL.replace('http://', '').replace('https://', '').split(':')[0]);
            socket.on('connect', () => {
                const ip = socket.localAddress;
                socket.destroy();
                resolve(ip);
            });
            socket.on('error', () => {
                socket.destroy();
                // Fallback to iterating interfaces
                const interfaces = os.networkInterfaces();
                for (let iface in interfaces) {
                    for (let i = 0; i < interfaces[iface].length; i++) {
                        const alias = interfaces[iface][i];
                        if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                            return resolve(alias.address);
                        }
                    }
                }
                resolve('127.0.0.1'); // final fallback
            });
        } catch (e) {
            resolve('127.0.0.1');
        }
    });
}

async function sendToServerForStorage(data) {
    if (!server_connected) {
        return;
    }
    try {
        serverSio.emit('agent:metrics', data);
    } catch (e) {
        console.error("✗ Error sending to server:", e);
        server_connected = false;
    }
}

async function metricBroadcastLoop() {
    setTimeout(async function loop() {
        try {
            const data = await collectMetrics();

            // Broadcast to connected dashboard clients
            sio.emit('metrics:update', data);

            // Storage emit
            const storageCycles = Math.floor(STORAGE_INTERVAL / BROADCAST_INTERVAL);
            if (broadcast_counter % storageCycles === 0) {
                await sendToServerForStorage(data);
                storage_counter++;
            }

            broadcast_counter++;
        } catch (e) {
            console.error("Broadcast error:", e);
        }

        setTimeout(loop, BROADCAST_INTERVAL * 1000);
    }, BROADCAST_INTERVAL * 1000);
}

async function registrationLoop() {
    setTimeout(async function loop() {
        try {
            const localIp = await getLocalIp();
            const payload = {
                vmId: VM_ID,
                hostname: HOSTNAME,
                ip: `http://${localIp}`,
                port: AGENT_PORT,
                broadcastInterval: BROADCAST_INTERVAL,
                storageInterval: STORAGE_INTERVAL
            };

            const response = await axios.post(`${DISCOVERY_URL}/api/register`, payload, { timeout: 5000 });
            if (response.status === 200) {
                console.log(`Successfully registered with discovery server at ${localIp}:${AGENT_PORT}`);
            } else {
                console.warn(`Registration failed with status: ${response.status}`);
            }
        } catch (e) {
            console.error("Registration request failed:", e.message);
        }

        setTimeout(loop, 30000); // 30 seconds
    }, 0);
}

serverSio.on('config_update', (data) => {
    if (data.vmId === VM_ID) {
        console.log("Received configuration update from server:", data);
        if (data.broadcastInterval !== undefined) BROADCAST_INTERVAL = data.broadcastInterval;
        if (data.storageInterval !== undefined) STORAGE_INTERVAL = data.storageInterval;

        broadcast_counter = 0;
        storage_counter = 0;
    }
});

sio.on('connection', (socket) => {
    socket.on('config_update', (data) => {
        if (data.vmId === VM_ID) {
            console.log("Received configuration update from client:", data);
            if (data.broadcastInterval !== undefined) BROADCAST_INTERVAL = data.broadcastInterval;
            if (data.storageInterval !== undefined) STORAGE_INTERVAL = data.storageInterval;

            broadcast_counter = 0;
            storage_counter = 0;
        }
    });
});

console.log(`Starting Node.js Agent Server on 0.0.0.0:${AGENT_PORT}`);
httpServer.listen(AGENT_PORT, '0.0.0.0', () => {
    registrationLoop();
    metricBroadcastLoop();
});
