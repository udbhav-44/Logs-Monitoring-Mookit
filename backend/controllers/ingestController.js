const Log = require('../models/Log');
const { parseLog } = require('../services/parser');

const INGEST_BATCH_SIZE = Number(process.env.INGEST_BATCH_SIZE) || 2000;
const INGEST_MAX_BYTES = Number(process.env.INGEST_MAX_BYTES) || 5 * 1024 * 1024;
const INGEST_QUEUE_MAX = Number(process.env.INGEST_QUEUE_MAX) || 200000;
const INGEST_QUEUE_MAX_BYTES = Number(process.env.INGEST_QUEUE_MAX_BYTES) || 200 * 1024 * 1024;
const INGEST_FLUSH_INTERVAL_MS = Number(process.env.INGEST_FLUSH_INTERVAL_MS) || 200;
const INGEST_RETRY_BASE_MS = Number(process.env.INGEST_RETRY_BASE_MS) || 500;
const INGEST_RETRY_MAX_MS = Number(process.env.INGEST_RETRY_MAX_MS) || 10000;
const INGEST_RETRY_JITTER_MS = Number(process.env.INGEST_RETRY_JITTER_MS) || 200;

let ingestQueue = [];
let ingestQueueBytes = 0;
let drainInProgress = false;
let nextDrainAt = 0;
let retryDelayMs = INGEST_RETRY_BASE_MS;

const estimateSize = (value) => {
    try {
        return Buffer.byteLength(JSON.stringify(value));
    } catch (e) {
        return 0;
    }
};

const pullBatch = () => {
    if (ingestQueue.length === 0) return [];
    const batch = [];
    let bytes = 0;
    while (ingestQueue.length > 0 && batch.length < INGEST_BATCH_SIZE) {
        const item = ingestQueue[0];
        if (batch.length > 0 && bytes + item.size > INGEST_MAX_BYTES) break;
        batch.push(ingestQueue.shift());
        bytes += item.size;
        ingestQueueBytes = Math.max(0, ingestQueueBytes - item.size);
        if (bytes >= INGEST_MAX_BYTES) break;
    }
    if (batch.length === 0 && ingestQueue.length > 0) {
        const item = ingestQueue.shift();
        batch.push(item);
        ingestQueueBytes = Math.max(0, ingestQueueBytes - item.size);
    }
    return batch;
};

const requeueBatch = (batch) => {
    const batchBytes = batch.reduce((sum, item) => sum + item.size, 0);
    if (ingestQueue.length + batch.length > INGEST_QUEUE_MAX) return false;
    if (ingestQueueBytes + batchBytes > INGEST_QUEUE_MAX_BYTES) return false;
    ingestQueue = [...batch, ...ingestQueue];
    ingestQueueBytes += batchBytes;
    return true;
};

const recordDrainFailure = () => {
    const jitter = Math.floor(Math.random() * INGEST_RETRY_JITTER_MS);
    retryDelayMs = Math.min(INGEST_RETRY_MAX_MS, retryDelayMs * 2);
    nextDrainAt = Date.now() + retryDelayMs + jitter;
};

const resetDrainRetry = () => {
    retryDelayMs = INGEST_RETRY_BASE_MS;
    nextDrainAt = 0;
};

const drainQueue = async () => {
    if (drainInProgress) return;
    if (Date.now() < nextDrainAt) return;
    if (ingestQueue.length === 0) return;
    drainInProgress = true;

    try {
        resetDrainRetry();
        while (ingestQueue.length > 0) {
            const batchItems = pullBatch();
            if (batchItems.length === 0) break;

            const processedLogs = [];
            batchItems.forEach((item, index) => {
                const log = item.log;
                if (!log || !log.rawMessage) return;
                const parsedInfo = parseLog(log);
                const sourceType = log.sourceType || log.logSource || 'app';
                processedLogs.push({
                    timestamp: parsedInfo.timestamp || log.timestamp || new Date(),
                    sourceType,
                    appInfo: {
                        name: log.appInfo?.name || log.appName || 'unknown-app',
                        vmId: log.appInfo?.vmId || log.vmId || 'unknown-vm',
                        source: sourceType
                    },
                    rawMessage: typeof log.rawMessage === 'string' ? log.rawMessage : JSON.stringify(log.rawMessage),
                    parsedData: parsedInfo.parsedData
                });
            });

            if (processedLogs.length === 0) continue;
            try {
                await Log.collection.insertMany(processedLogs, { ordered: false });
            } catch (error) {
                console.error('Failed to insert logs:', error.message);
                if (!requeueBatch(batchItems)) {
                    console.warn('Ingest queue full, dropping batch.');
                }
                recordDrainFailure();
                break;
            }
        }
    } finally {
        drainInProgress = false;
    }
};

setInterval(drainQueue, INGEST_FLUSH_INTERVAL_MS);

// @desc    Ingest logs
// @route   POST /api/ingest
// @access  Public (Internal)
const ingestLogs = async (req, res) => {
    try {
        const { logs } = req.body; // Expecting an array of raw log objects

        if (!logs || !Array.isArray(logs) || logs.length === 0) {
            return res.status(400).json({ message: 'Invalid log data: expected a non-empty array' });
        }

        const batchBytes = estimateSize(logs);
        if (logs.length + ingestQueue.length > INGEST_QUEUE_MAX || ingestQueueBytes + batchBytes > INGEST_QUEUE_MAX_BYTES) {
            return res.status(503).json({ message: 'Ingest queue full, please retry' });
        }

        const items = logs.map((log) => ({ log, size: estimateSize(log) }));
        ingestQueue = [...ingestQueue, ...items];
        ingestQueueBytes += items.reduce((sum, item) => sum + item.size, 0);
        drainQueue();

        res.status(202).json({ message: 'Logs queued', count: logs.length });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { ingestLogs };
