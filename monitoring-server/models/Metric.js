const { pool } = require('../db');

class Metric {
    // Save a new metric to TimescaleDB
    static async save(metricData) {
        const query = `
            INSERT INTO metrics (
                vm_id, hostname, timestamp,
                cpu_usage, cpu_cores,
                memory_total, memory_used, memory_percent,
                disk_total, disk_used, disk_percent,
                processes, services
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *;
        `;
        
        const values = [
            metricData.vmId,
            metricData.hostname,
            new Date(metricData.timestamp),
            metricData.cpu.usage,
            metricData.cpu.cores,
            metricData.memory.total,
            metricData.memory.used,
            metricData.memory.percent,
            metricData.disk?.total || null,
            metricData.disk?.used || null,
            metricData.disk?.percent || null,
            JSON.stringify(metricData.processes || []),
            JSON.stringify(metricData.services || {})
        ];
        
        const result = await pool.query(query, values);
        return result.rows[0];
    }
    
    // Find metrics by vmId and time range
    static async find(vmId, startTime, limit = 100) {
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
            WHERE vm_id = $1 AND timestamp >= $2
            ORDER BY timestamp DESC
            LIMIT $3;
        `;
        
        const result = await pool.query(query, [vmId, startTime, limit]);
        
        // Transform to match MongoDB format
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
    
    // Delete old metrics
    static async deleteMany(vmId, cutoffDate) {
        const query = `
            DELETE FROM metrics
            WHERE vm_id = $1 AND timestamp < $2;
        `;
        
        const result = await pool.query(query, [vmId, cutoffDate]);
        return { deletedCount: result.rowCount };
    }
    
    // Get storage statistics
    static async getStats() {
        const query = `
            SELECT 
                vm_id,
                COUNT(*) as total_records,
                MIN(timestamp) as oldest_record,
                MAX(timestamp) as newest_record,
                MAX(hostname) as hostname
            FROM metrics
            GROUP BY vm_id;
        `;
        
        const result = await pool.query(query);
        
        // Get total count
        const countQuery = 'SELECT COUNT(*) as total FROM metrics;';
        const countResult = await pool.query(countQuery);
        
        return {
            totalRecords: parseInt(countResult.rows[0].total),
            vmStats: result.rows.map(row => ({
                _id: row.vm_id,
                totalRecords: parseInt(row.total_records),
                oldestRecord: row.oldest_record,
                newestRecord: row.newest_record,
                hostname: row.hostname
            }))
        };
    }
}

module.exports = Metric;
