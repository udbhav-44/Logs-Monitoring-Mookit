const { pool } = require('../db');

class Alert {
    // Alert severity levels
    static SEVERITY = {
        WARNING: 'warning',
        CRITICAL: 'critical'
    };

    // Save a new alert (just log it)
    static async save(alertData) {
        const query = `
            INSERT INTO alerts (
                vm_id, hostname, metric_type, severity,
                threshold_value, current_value, message, 
                triggered_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
        `;
        
        const values = [
            alertData.vmId,
            alertData.hostname,
            alertData.metricType,
            alertData.severity,
            alertData.thresholdValue,
            alertData.currentValue,
            alertData.message,
            alertData.triggeredAt || new Date()
        ];
        
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    // Find all alerts for a VM with optional filters
    static async find(vmId, options = {}) {
        let query = `SELECT * FROM alerts WHERE vm_id = $1`;
        const params = [vmId];
        let paramCount = 1;

        if (options.severity) {
            paramCount++;
            query += ` AND severity = $${paramCount}`;
            params.push(options.severity);
        }

        if (options.metricType) {
            paramCount++;
            query += ` AND metric_type = $${paramCount}`;
            params.push(options.metricType);
        }

        if (options.startTime) {
            paramCount++;
            query += ` AND triggered_at >= $${paramCount}`;
            params.push(options.startTime);
        }

        query += ` ORDER BY triggered_at DESC`;

        if (options.limit) {
            paramCount++;
            query += ` LIMIT $${paramCount}`;
            params.push(options.limit);
        }

        const result = await pool.query(query, params);
        return result.rows;
    }

    // Get alert statistics
    static async getStats(vmId, period = '24h') {
        let timeFilter = "triggered_at >= NOW() - INTERVAL '24 hours'";
        
        switch (period) {
            case '1h': timeFilter = "triggered_at >= NOW() - INTERVAL '1 hour'"; break;
            case '6h': timeFilter = "triggered_at >= NOW() - INTERVAL '6 hours'"; break;
            case '24h': timeFilter = "triggered_at >= NOW() - INTERVAL '24 hours'"; break;
            case '7d': timeFilter = "triggered_at >= NOW() - INTERVAL '7 days'"; break;
            case '30d': timeFilter = "triggered_at >= NOW() - INTERVAL '30 days'"; break;
        }

        const query = `
            SELECT 
                COUNT(*) FILTER (WHERE severity = 'warning') as warning_count,
                COUNT(*) FILTER (WHERE severity = 'critical') as critical_count,
                COUNT(*) as total_count
            FROM alerts
            WHERE vm_id = $1 AND ${timeFilter};
        `;

        const result = await pool.query(query, [vmId]);
        return result.rows[0];
    }

    // Delete old alerts
    static async deleteOld(vmId, daysOld = 30) {
        const query = `
            DELETE FROM alerts
            WHERE vm_id = $1 
            AND triggered_at < NOW() - INTERVAL '${daysOld} days'
            RETURNING id;
        `;

        const result = await pool.query(query, [vmId]);
        return { deletedCount: result.rowCount };
    }
}

module.exports = Alert;
