// Database adapter to switch between TimescaleDB and InfluxDB
const timescaledb = require('./db');
const influxdb = require('./influxdb');
const Metric = require('./models/Metric');
const Alert = require('./models/Alert');

const DATABASE_TYPE = process.env.DATABASE_TYPE || 'timescaledb';

let dbClient = null;
let isInitialized = false;

// Initialize the selected database
async function initializeDatabase() {
    console.log(`\n🔧 Initializing database: ${DATABASE_TYPE.toUpperCase()}`);
    
    try {
        if (DATABASE_TYPE === 'influxdb') {
            dbClient = influxdb.initializeInfluxDB();
            isInitialized = true;
            console.log('✓ InfluxDB Core 3 ready');
        } else if (DATABASE_TYPE === 'timescaledb') {
            await timescaledb.initializeDatabase();
            dbClient = timescaledb.pool;
            isInitialized = true;
            console.log('✓ TimescaleDB ready');
        } else {
            throw new Error(`Unknown database type: ${DATABASE_TYPE}. Use 'timescaledb' or 'influxdb'`);
        }
        
        console.log(`Database: ${getDatabaseName()}\n`);
        return dbClient;
    } catch (error) {
        console.error(`✗ ${DATABASE_TYPE.toUpperCase()} initialization error:`, error.message);
        console.error('💡 Please check:');
        
        if (DATABASE_TYPE === 'influxdb') {
            console.error('   1. InfluxDB Core 3 is running');
            console.error('   2. INFLUXDB_HOST, INFLUXDB_TOKEN, and INFLUXDB_DATABASE are set in .env');
            console.error('   3. Token has write permissions');
        } else {
            console.error('   1. PostgreSQL/TimescaleDB is running');
            console.error('   2. Database credentials in .env are correct');
            console.error('   3. Database exists or user has CREATE privileges');
        }
        
        throw error;
    }
}

// Save metrics to the selected database
async function saveMetrics(data) {
    if (!isInitialized) {
        throw new Error('Database not initialized');
    }
    
    if (DATABASE_TYPE === 'influxdb') {
        return await influxdb.writeMetrics(data);
    } else {
        return await Metric.save(data);
    }
}

// Find metrics from the selected database
async function findMetrics(vmId, startTime, limit = 100) {
    if (!isInitialized) {
        throw new Error('Database not initialized');
    }
    
    if (DATABASE_TYPE === 'influxdb') {
        return await influxdb.queryMetrics(vmId, startTime, limit);
    } else {
        return await Metric.find(vmId, startTime, limit);
    }
}

// Find metrics with custom date range
async function findMetricsRange(vmId, startTime, endTime, limit = 100) {
    if (!isInitialized) {
        throw new Error('Database not initialized');
    }
    
    if (DATABASE_TYPE === 'influxdb') {
        return await influxdb.queryMetricsRange(vmId, startTime, endTime, limit);
    } else {
        // Use existing Metric.find with startTime for TimescaleDB
        // We'll need to add endTime support to the query
        const query = `
            SELECT 
                id,
                vm_id as "vmId",
                hostname,
                timestamp,
                cpu_usage,
                cpu_cores,
                memory_total,
                memory_used,
                memory_percent,
                disk_total,
                disk_used,
                disk_percent,
                processes,
                services
            FROM metrics
            WHERE vm_id = $1 AND timestamp >= $2 AND timestamp <= $3
            ORDER BY timestamp DESC
            LIMIT $4;
        `;
        
        const result = await dbClient.query(query, [vmId, startTime, endTime, limit]);
        
        return result.rows.map(row => ({
            vmId: row.vmId,
            hostname: row.hostname,
            timestamp: row.timestamp,
            cpu: {
                usage: row.cpu_usage,
                cores: row.cpu_cores
            },
            memory: {
                total: row.memory_total,
                used: row.memory_used,
                percent: row.memory_percent
            },
            disk: {
                total: row.disk_total,
                used: row.disk_used,
                percent: row.disk_percent
            },
            processes: row.processes,
            services: row.services
        }));
    }
}

// Delete old metrics
async function deleteMetrics(vmId, cutoffDate) {
    if (!isInitialized) {
        throw new Error('Database not initialized');
    }
    
    if (DATABASE_TYPE === 'influxdb') {
        return await influxdb.deleteMetrics(vmId, cutoffDate);
    } else {
        return await Metric.deleteMany(vmId, cutoffDate);
    }
}

// Get storage statistics
async function getStorageStats() {
    if (!isInitialized) {
        throw new Error('Database not initialized');
    }
    
    if (DATABASE_TYPE === 'influxdb') {
        return await influxdb.getStats();
    } else {
        return await Metric.getStats();
    }
}

// Get unique VMs from database
async function getUniqueVMs() {
    if (!isInitialized) {
        throw new Error('Database not initialized');
    }
    
    if (DATABASE_TYPE === 'influxdb') {
        // Query unique VMs from InfluxDB
        return await influxdb.getUniqueVMs();
    } else {
        const query = `
            SELECT DISTINCT ON (vm_id)
                vm_id,
                hostname,
                timestamp
            FROM metrics
            ORDER BY vm_id, timestamp DESC;
        `;
        
        const result = await dbClient.query(query);
        return result.rows;
    }
}

// Save alert to the selected database
async function saveAlert(alertData) {
    if (!isInitialized) {
        throw new Error('Database not initialized');
    }
    
    if (DATABASE_TYPE === 'influxdb') {
        return await influxdb.writeAlert(alertData);
    } else {
        return await Alert.save(alertData);
    }
}

// Find alerts from the selected database
async function findAlerts(vmId, options = {}) {
    if (!isInitialized) {
        throw new Error('Database not initialized');
    }
    
    if (DATABASE_TYPE === 'influxdb') {
        return await influxdb.queryAlerts(vmId, options);
    } else {
        return await Alert.find(vmId, options);
    }
}

// Get alert statistics
async function getAlertStats(vmId, period = '24h') {
    if (!isInitialized) {
        throw new Error('Database not initialized');
    }
    
    if (DATABASE_TYPE === 'influxdb') {
        return await influxdb.getAlertStats(vmId, period);
    } else {
        return await Alert.getStats(vmId, period);
    }
}

// Delete old alerts
async function deleteOldAlerts(vmId, days = 30) {
    if (!isInitialized) {
        throw new Error('Database not initialized');
    }
    
    if (DATABASE_TYPE === 'influxdb') {
        console.warn('⚠ Delete operation not fully supported in InfluxDB Core 3');
        return { deletedCount: 0 };
    } else {
        return await Alert.deleteOld(vmId, days);
    }
}

// Get database name
function getDatabaseName() {
    if (DATABASE_TYPE === 'influxdb') {
        return process.env.INFLUXDB_DATABASE || 'monitoring';
    } else {
        return process.env.PGDATABASE || 'postgres';
    }
}

// Get database type
function getDatabaseType() {
    return DATABASE_TYPE;
}

// Close database connection
async function close() {
    if (DATABASE_TYPE === 'influxdb') {
        await influxdb.close();
    } else {
        await dbClient.end();
    }
    console.log(`${DATABASE_TYPE.toUpperCase()} connection closed`);
}

module.exports = {
    initializeDatabase,
    saveMetrics,
    findMetrics,
    findMetricsRange,
    deleteMetrics,
    getStorageStats,
    getUniqueVMs,
    saveAlert,
    findAlerts,
    getAlertStats,
    deleteOldAlerts,
    getDatabaseName,
    getDatabaseType,
    close,
    pool: dbClient // For backward compatibility
};
