const { InfluxDB, Point } = require('@influxdata/influxdb-client');

let influxDB = null;
let writeApi = null;
let queryApi = null;
let org = process.env.INFLUXDB_ORG || 'monitoring-org';
let bucket = process.env.INFLUXDB_BUCKET || 'monitoring';

// Initialize InfluxDB client (singleton pattern)
function initializeInfluxDB() {
    if (influxDB) return influxDB;

    try {
        const url = process.env.INFLUXDB_HOST || 'http://localhost:8086';
        const token = process.env.INFLUXDB_TOKEN || 'my-super-secret-auth-token';
        org = process.env.INFLUXDB_ORG || 'monitoring-org';
        bucket = process.env.INFLUXDB_BUCKET || 'monitoring';

        if (!token) throw new Error('INFLUXDB_TOKEN is required');

        console.log('Initializing InfluxDB v2 client...');
        console.log('Host:', url);
        console.log('Org:', org);
        console.log('Bucket:', bucket);

        influxDB = new InfluxDB({ url, token });
        writeApi = influxDB.getWriteApi(org, bucket, 'ns');
        queryApi = influxDB.getQueryApi(org);

        console.log('✓ InfluxDB v2 client initialized');
        return influxDB;
    } catch (error) {
        console.error('✗ InfluxDB initialization error:', error.message);
        throw error;
    }
}

// Write metrics to InfluxDB
async function writeMetrics(data) {
    if (!writeApi) throw new Error('InfluxDB client not initialized');

    try {
        const { vmId, hostname, timestamp, cpu, memory, disk, processes, services } = data;
        if (!vmId || !hostname) throw new Error(`Missing required fields: vmId=${vmId}, hostname=${hostname}`);

        const ts = new Date(timestamp);

        // CPU metrics
        const pCpu = new Point('cpu')
            .tag('vm_id', vmId)
            .tag('hostname', hostname)
            .floatField('usage', cpu.usage)
            .stringField('cores', cpu.cores ? cpu.cores.join(',') : '')
            .timestamp(ts);
        writeApi.writePoint(pCpu);

        // Memory metrics
        const pMem = new Point('memory')
            .tag('vm_id', vmId)
            .tag('hostname', hostname)
            .floatField('total', memory.total)
            .floatField('used', memory.used)
            .floatField('percent', memory.percent)
            .timestamp(ts);
        writeApi.writePoint(pMem);

        // Disk metrics
        if (disk && disk.total !== undefined) {
            const pDisk = new Point('disk')
                .tag('vm_id', vmId)
                .tag('hostname', hostname)
                .floatField('total', disk.total)
                .floatField('used', disk.used)
                .floatField('percent', disk.percent)
                .timestamp(ts);
            writeApi.writePoint(pDisk);
        }

        // Process metrics
        if (processes && Array.isArray(processes)) {
            processes.slice(0, 5).forEach((proc, index) => {
                if (!proc) return;
                const pProc = new Point('processes')
                    .tag('vm_id', vmId)
                    .tag('hostname', hostname)
                    .tag('rank', String(index + 1))
                    .tag('name', proc.name || 'unknown')
                    .floatField('cpu', proc.cpu_percent || 0)
                    .floatField('mem', proc.memory_percent || 0)
                    .intField('pid', proc.pid || 0)
                    .timestamp(ts);
                writeApi.writePoint(pProc);
            });
        }

        // Service metrics
        if (services && typeof services === 'object') {
            for (const [serviceName, serviceData] of Object.entries(services)) {
                if (!serviceName || !serviceData) continue;
                const state = serviceData.state || 'unknown';
                const stateValue = state === 'healthy' ? 1 : state === 'degraded' ? 0.5 : 0;
                const pServ = new Point('services')
                    .tag('vm_id', vmId)
                    .tag('hostname', hostname)
                    .tag('service', serviceName)
                    .stringField('state', state)
                    .floatField('state_value', stateValue)
                    .timestamp(ts);
                writeApi.writePoint(pServ);
            }
        }

        await writeApi.flush();
        return { success: true };
    } catch (error) {
        console.error('✗ Error writing to InfluxDB:', error.message);
        throw error;
    }
}

// Function to collect rows using Flux
async function runQuery(flux) {
    if (!queryApi) throw new Error('InfluxDB client not initialized');
    return new Promise((resolve, reject) => {
        const rows = [];
        queryApi.queryRows(flux, {
            next(row, tableMeta) {
                const o = tableMeta.toObject(row);
                rows.push(o);
            },
            error(error) {
                reject(error);
            },
            complete() {
                resolve(rows);
            },
        });
    });
}

// Group points by timestamp into metrics object
function buildMetricsFromRows(rows, limit) {
    const timeMap = {};
    rows.forEach(r => {
        const tStr = r._time;
        if (!timeMap[tStr]) {
            timeMap[tStr] = {
                vmId: r.vm_id,
                hostname: r.hostname,
                timestamp: new Date(tStr),
                cpu: { usage: 0, cores: [] },
                memory: { total: 0, used: 0, percent: 0 },
                disk: { total: 0, used: 0, percent: 0 },
                processes: [],
                services: {}
            };
        }
        const m = r._measurement;
        const f = r._field;
        const v = r._value;
        if (m === 'cpu') {
            if (f === 'usage') timeMap[tStr].cpu.usage = v;
            if (f === 'cores') timeMap[tStr].cpu.cores = String(v).split(',').map(Number);
        } else if (m === 'memory') {
            if (f === 'total') timeMap[tStr].memory.total = v;
            if (f === 'used') timeMap[tStr].memory.used = v;
            if (f === 'percent') timeMap[tStr].memory.percent = v;
        } else if (m === 'disk') {
            if (f === 'total') timeMap[tStr].disk.total = v;
            if (f === 'used') timeMap[tStr].disk.used = v;
            if (f === 'percent') timeMap[tStr].disk.percent = v;
        } else if (m === 'processes') {
            let p = timeMap[tStr].processes.find(x => x.rank === r.rank);
            if (!p) {
                p = { rank: r.rank, name: r.name, cpu_percent: 0, memory_percent: 0, pid: 0 };
                timeMap[tStr].processes.push(p);
            }
            if (f === 'cpu') p.cpu_percent = v;
            if (f === 'mem') p.memory_percent = v;
            if (f === 'pid') p.pid = v;
        } else if (m === 'services') {
            if (!timeMap[tStr].services[r.service]) {
                timeMap[tStr].services[r.service] = { state: 'unknown', checks: {} };
            }
            if (f === 'state') timeMap[tStr].services[r.service].state = v;
        }
    });

    const results = Object.values(timeMap).sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    return results.map(r => {
        if (r.processes.length === 0) r.processes = undefined;
        else r.processes.sort((a, b) => a.rank - b.rank);
        if (Object.keys(r.services).length === 0) r.services = undefined;
        return r;
    });
}

// Query metrics from InfluxDB
async function queryMetrics(vmId, startTime, limit = 100) {
    if (!queryApi) throw new Error('InfluxDB client not initialized');
    try {
        const startSec = Math.floor(new Date(startTime).getTime() / 1000);
        const flux = `
            from(bucket:"${bucket}")
            |> range(start: ${startSec})
            |> filter(fn: (r) => r.vm_id == "${vmId}")
            |> filter(fn: (r) => r._measurement == "cpu" or r._measurement == "memory" or r._measurement == "disk" or r._measurement == "processes" or r._measurement == "services")
            |> sort(columns: ["_time"], desc: true)
        `;
        const rows = await runQuery(flux);
        return buildMetricsFromRows(rows, limit);
    } catch (error) {
        console.error('✗ Error querying InfluxDB:', error.message);
        throw error;
    }
}

// Query metrics with custom date range
async function queryMetricsRange(vmId, startTime, endTime, limit = 100) {
    if (!queryApi) throw new Error('InfluxDB client not initialized');
    try {
        const startSec = Math.floor(new Date(startTime).getTime() / 1000);
        const endSec = Math.floor(new Date(endTime).getTime() / 1000);
        const flux = `
            from(bucket:"${bucket}")
            |> range(start: ${startSec}, stop: ${endSec})
            |> filter(fn: (r) => r.vm_id == "${vmId}")
            |> filter(fn: (r) => r._measurement == "cpu")
            |> sort(columns: ["_time"], desc: true)
        `;
        const rows = await runQuery(flux);
        return buildMetricsFromRows(rows, limit);
    } catch (error) {
        console.error('✗ Error querying InfluxDB range:', error.message);
        throw error;
    }
}

// Delete old metrics
async function deleteMetrics(vmId, cutoffDate) {
    if (!influxDB) throw new Error('InfluxDB client not initialized');

    try {
        const url = process.env.INFLUXDB_HOST || 'http://localhost:8086';
        const token = process.env.INFLUXDB_TOKEN || 'my-super-secret-auth-token';
        const deleteUrl = `${url}/api/v2/delete?org=${encodeURIComponent(org)}&bucket=${encodeURIComponent(bucket)}`;

        const start = new Date(0).toISOString(); // 1970
        const stop = new Date(cutoffDate).toISOString();

        const measurements = ['cpu', 'memory', 'disk', 'processes', 'services', 'alerts'];

        for (const measurement of measurements) {
            const payload = JSON.stringify({
                start: start,
                stop: stop,
                predicate: `_measurement="${measurement}" and vm_id="${vmId}"`
            });

            const response = await fetch(deleteUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Token ${token}`,
                    'Content-Type': 'application/json'
                },
                body: payload
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`InfluxDB delete partial failed for ${measurement}: ${response.status} ${response.statusText} - ${errorText}`);
            }
        }

        console.log(`✓ successfully deleted metrics older than ${stop} for vm_id: ${vmId}`);
        // Assuming 1 since we can't get exact dropped records from the /api/v2/delete endpoint
        return { deletedCount: 1 };
    } catch (error) {
        console.error(`✗ Error deleting partial metrics for VM ${vmId}:`, error.message);
        throw error;
    }
}

// Delete all metrics and alerts for a specific VM
async function deleteVM(vmId) {
    if (!influxDB) throw new Error('InfluxDB client not initialized');

    try {
        const url = process.env.INFLUXDB_HOST || 'http://localhost:8086';
        const token = process.env.INFLUXDB_TOKEN || 'my-super-secret-auth-token';
        const deleteUrl = `${url}/api/v2/delete?org=${encodeURIComponent(org)}&bucket=${encodeURIComponent(bucket)}`;

        const now = new Date();
        const past = new Date(0); // 1970

        const measurements = ['cpu', 'memory', 'disk', 'processes', 'services', 'alerts'];

        for (const measurement of measurements) {
            const payload = JSON.stringify({
                start: past.toISOString(),
                stop: now.toISOString(),
                predicate: `_measurement="${measurement}" and vm_id="${vmId}"`
            });

            // We use the global fetch API since Node 18+ has it
            const response = await fetch(deleteUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Token ${token}`,
                    'Content-Type': 'application/json'
                },
                body: payload
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`InfluxDB delete failed for ${measurement}: ${response.status} ${response.statusText} - ${errorText}`);
            }
        }

        console.log(`✓ successfully deleted all metrics and alerts for vm_id: ${vmId}`);
        return { success: true };
    } catch (error) {
        console.error(`✗ Error deleting VM ${vmId} from InfluxDB:`, error.message);
        throw error;
    }
}

// Get storage statistics
async function getStats() {
    if (!queryApi) throw new Error('InfluxDB client not initialized');
    try {
        const flux = `
            from(bucket:"${bucket}")
            |> range(start: -30d)
            |> filter(fn: (r) => r._measurement == "cpu" and r._field == "usage")
            |> group(columns: ["vm_id"])
            |> count()
        `;
        const rows = await runQuery(flux);
        let totalRecords = 0;
        const vmStats = rows.map(r => {
            totalRecords += Number(r._value || 0);
            return {
                _id: r.vm_id,
                totalRecords: Number(r._value || 0),
                oldestRecord: null,
                newestRecord: null,
                hostname: r.vm_id
            };
        });

        return {
            totalRecords,
            database: bucket,
            type: 'influxdb',
            vmStats
        };
    } catch (error) {
        console.error('✗ Error getting InfluxDB stats:', error.message);
        return { totalRecords: 0, database: bucket, type: 'influxdb', vmStats: [], error: error.message };
    }
}

// Get storage statistics for a specific VM
async function getVMStats(vmId) {
    if (!queryApi) throw new Error('InfluxDB client not initialized');
    try {
        const flux = `
            from(bucket:"${bucket}")
            |> range(start: -30d)
            |> filter(fn: (r) => r.vm_id == "${vmId}")
            |> count()
        `;
        const rows = await runQuery(flux);
        const totalRecords = rows.reduce((acc, row) => acc + Number(row._value || 0), 0);
        return {
            vmId,
            totalRecords,
            database: bucket,
            type: 'influxdb'
        };
    } catch (error) {
        console.error(`✗ Error getting VM stats for ${vmId}:`, error.message);
        return { vmId, totalRecords: 0, database: bucket, type: 'influxdb', error: error.message };
    }
}

// Write alert to InfluxDB
async function writeAlert(alertData) {
    if (!writeApi) throw new Error('InfluxDB client not initialized');
    try {
        const { vmId, hostname, metricType, severity, thresholdValue, currentValue, message, triggeredAt } = alertData;
        const ts = new Date(triggeredAt || Date.now());

        const pAlert = new Point('alerts')
            .tag('vm_id', vmId)
            .tag('hostname', hostname)
            .tag('metric_type', metricType)
            .tag('severity', severity)
            .stringField('threshold_value', String(thresholdValue))
            .stringField('current_value', String(currentValue))
            .stringField('message', String(message))
            .timestamp(ts);

        writeApi.writePoint(pAlert);
        await writeApi.flush();

        return {
            vm_id: vmId,
            hostname,
            metric_type: metricType,
            severity,
            threshold_value: thresholdValue,
            current_value: currentValue,
            message,
            triggered_at: ts
        };
    } catch (error) {
        console.error('✗ Error writing alert to InfluxDB:', error.message);
        throw error;
    }
}

// Query alerts from InfluxDB
async function queryAlerts(vmId, options = {}) {
    if (!queryApi) throw new Error('InfluxDB client not initialized');
    try {
        const { severity, metricType, startTime, limit = 100 } = options;
        let startFilter = '-30d';
        if (startTime) {
            startFilter = Math.floor(new Date(startTime).getTime() / 1000).toString();
        }

        let flux = `
            from(bucket:"${bucket}")
            |> range(start: ${startFilter})
            |> filter(fn: (r) => r._measurement == "alerts" and r.vm_id == "${vmId}")
        `;
        if (severity) flux += ` |> filter(fn: (r) => r.severity == "${severity}")`;
        if (metricType) flux += ` |> filter(fn: (r) => r.metric_type == "${metricType}")`;
        flux += ` |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")`;
        flux += ` |> sort(columns: ["_time"], desc: true)`;
        flux += ` |> limit(n: ${limit})`;

        const rows = await runQuery(flux);
        return rows.map((r, index) => ({
            id: `${r.vm_id}_${r._time}_${index}`,
            vmId: r.vm_id,
            hostname: r.hostname,
            metric_type: r.metric_type,
            severity: r.severity,
            threshold_value: r.threshold_value,
            current_value: r.current_value,
            message: r.message,
            triggered_at: r._time
        }));
    } catch (error) {
        console.error('✗ Error querying alerts from InfluxDB:', error.message);
        throw error;
    }
}

// Get alert statistics
async function getAlertStats(vmId, period = '24h') {
    if (!queryApi) throw new Error('InfluxDB client not initialized');
    try {
        const flux = `
            from(bucket:"${bucket}")
            |> range(start: -${period})
            |> filter(fn: (r) => r._measurement == "alerts" and r.vm_id == "${vmId}")
            |> filter(fn: (r) => r._field == "message")
            |> group(columns: ["severity"])
            |> count()
        `;
        const rows = await runQuery(flux);
        const stats = { warning_count: 0, critical_count: 0, total_count: 0 };
        rows.forEach(r => {
            const count = Number(r._value || 0);
            if (r.severity === 'warning') stats.warning_count = count;
            else if (r.severity === 'critical') stats.critical_count = count;
            stats.total_count += count;
        });
        return stats;
    } catch (error) {
        console.error('✗ Error getting alert stats from InfluxDB:', error.message);
        return { warning_count: 0, critical_count: 0, total_count: 0 };
    }
}

// Get unique VMs
async function getUniqueVMs() {
    if (!queryApi) throw new Error('InfluxDB client not initialized');
    try {
        const flux = `
            from(bucket:"${bucket}")
            |> range(start: -30d)
            |> filter(fn: (r) => r._measurement == "cpu" and r._field == "usage")
            |> group(columns: ["vm_id", "hostname"])
            |> last()
        `;
        const rows = await runQuery(flux);
        return rows.map(r => ({
            vm_id: r.vm_id,
            hostname: r.hostname,
            timestamp: new Date(r._time)
        }));
    } catch (error) {
        console.error('✗ Error getting unique VMs from InfluxDB:', error.message);
        return [];
    }
}

// Close InfluxDB client
async function close() {
    if (writeApi) {
        try {
            await writeApi.close();
            console.log('✓ InfluxDB client closed');
        } catch (error) {
            console.error('✗ Error closing InfluxDB client:', error.message);
        }
    }
}

module.exports = {
    initializeInfluxDB,
    writeMetrics,
    queryMetrics,
    queryMetricsRange,
    deleteMetrics,
    deleteVM,
    getStats,
    getVMStats,
    writeAlert,
    queryAlerts,
    getAlertStats,
    getUniqueVMs,
    close
};
