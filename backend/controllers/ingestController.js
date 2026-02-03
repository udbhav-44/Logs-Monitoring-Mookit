const { getClient } = require('../config/clickhouse');
const { parseLog } = require('../services/parser');

// @desc    Ingest logs
// @route   POST /api/ingest
// @access  Public (Internal)
const ingestLogs = async (req, res) => {
    try {
        const { logs } = req.body; // Expecting an array of raw log objects

        if (!logs || !Array.isArray(logs) || logs.length === 0) {
            return res.status(400).json({ message: 'Invalid log data: expected a non-empty array' });
        }

        const client = getClient();

        // Transform logs to ClickHouse row format
        const rows = logs.map(log => {
            if (!log || !log.rawMessage) return null;

            const parsedInfo = parseLog(log);
            const sourceType = log.sourceType || log.logSource || 'app';
            const timestamp = new Date(parsedInfo.timestamp || log.timestamp || Date.now());
            const appName = log.appInfo?.name || log.appName || 'unknown-app';
            const vmId = log.appInfo?.vmId || log.vmId || 'unknown-vm';
            const rawMessage = typeof log.rawMessage === 'string' ? log.rawMessage : JSON.stringify(log.rawMessage);
            const parsedData = parsedInfo.parsedData || {};

            return {
                timestamp: Math.floor(timestamp.getTime() / 1000), // ClickHouse DateTime uses seconds
                sourceType,
                app: appName,
                vmId,
                method: parsedData.method || '',
                status: parsedData.status ? Number(parsedData.status) : 0,
                level: parsedData.level || '',
                course: parsedData.course || '',
                rawMessage,
                url: parsedData.url || '',
                ip: parsedData.ip || '',
                uid: parsedData.uid || '',
                userAgent: parsedData.userAgent || '',
                parsedMessage: parsedData.message || '',
                responseSize: parsedData.responseSize || null
            };
        }).filter(row => row !== null);

        if (rows.length === 0) {
            return res.status(400).json({ message: 'No valid logs to ingest' });
        }

        // Batch insert into ClickHouse
        await client.insert({
            table: 'logs',
            values: rows,
            format: 'JSONEachRow',
        });

        res.status(202).json({ message: 'Logs inserted', count: rows.length });
    } catch (error) {
        console.error('Ingest error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { ingestLogs };
