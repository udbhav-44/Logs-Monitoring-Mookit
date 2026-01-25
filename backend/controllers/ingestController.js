const Log = require('../models/Log');
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

        const processedLogs = logs.map((log, index) => {
            if (!log.rawMessage) {
                throw new Error(`Missing rawMessage for log at index ${index}`);
            }

            const parsedInfo = parseLog(log);
            const sourceType = log.sourceType || log.logSource || 'app';

            return {
                timestamp: parsedInfo.timestamp || log.timestamp || new Date(),
                sourceType,
                appInfo: {
                    name: log.appInfo?.name || log.appName || 'unknown-app',
                    vmId: log.appInfo?.vmId || log.vmId || 'unknown-vm',
                    source: sourceType
                },
                rawMessage: typeof log.rawMessage === 'string' ? log.rawMessage : JSON.stringify(log.rawMessage),
                parsedData: parsedInfo.parsedData
            };
        });

        await Log.insertMany(processedLogs, { ordered: false });

        res.status(201).json({ message: 'Logs ingested successfully', count: processedLogs.length });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { ingestLogs };
