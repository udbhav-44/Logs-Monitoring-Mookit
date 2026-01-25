const chokidar = require('chokidar');
const axios = require('axios');
const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const CONFIG = {
    backendUrl: process.env.BACKEND_URL || 'http://localhost:5002/api/ingest',
    files: (process.env.LOG_FILES || '').split(',').map(f => f.trim()).filter(f => f),
    appName: process.env.APP_NAME || 'unknown-app',
    vmId: process.env.VM_ID || 'unknown-vm',
    batchSize: Number(process.env.BATCH_SIZE) || 100,
    flushInterval: Number(process.env.FLUSH_INTERVAL_MS) || 5000,
    tailFromEnd: process.env.TAIL_FROM_END === '1' || process.env.TAIL_FROM_END === 'true',
    usePolling: process.env.USE_POLLING === '1' || process.env.USE_POLLING === 'true'
};

let logBuffer = [];
let flushTimer = null;
let isFlushing = false;

console.log(' Starting Log Collector Agent...');
console.log(' Configuration:', CONFIG);

const flushLogs = async () => {
    if (isFlushing || logBuffer.length === 0) return;
    isFlushing = true;

    try {
        while (logBuffer.length > 0) {
            const batch = logBuffer.splice(0, CONFIG.batchSize);
            try {
                await axios.post(CONFIG.backendUrl, { logs: batch });
                console.log(`[${new Date().toISOString()}] Flushed ${batch.length} logs to backend.`);
            } catch (error) {
                console.error(`[${new Date().toISOString()}] Failed to send logs:`, error.message);
                // Put them back to avoid data loss, but cap to avoid memory leaks if backend is down.
                if (logBuffer.length < 1000) {
                    logBuffer = [...batch, ...logBuffer];
                } else {
                    console.warn('Buffer full, dropping logs.');
                }
                break;
            }
        }
    } finally {
        isFlushing = false;
    }
};

// Ensure flush runs periodically
flushTimer = setInterval(flushLogs, CONFIG.flushInterval);

const processLine = (filePath, line) => {
    if (!line.trim()) return;

    const sourceType = filePath.includes('access.log') || filePath.includes('nginx') ? 'nginx' : 'app';

    const logEntry = {
        sourceType,
        appInfo: {
            name: CONFIG.appName,
            vmId: CONFIG.vmId
        },
        rawMessage: line
    };

    logBuffer.push(logEntry);

    if (logBuffer.length >= CONFIG.batchSize) {
        flushLogs();
    }
};

const streamFileLines = (filePath, start, end) => {
    return new Promise((resolve, reject) => {
        let remainder = '';
        const streamOptions = { start };
        if (typeof end === 'number' && end >= start) {
            streamOptions.end = end;
        }

        const stream = fs.createReadStream(filePath, streamOptions);

        stream.on('data', (chunk) => {
            const data = remainder + chunk.toString();
            const lines = data.split('\n');
            remainder = lines.pop();
            lines.forEach(line => processLine(filePath, line));
        });

        stream.on('end', () => {
            if (remainder) {
                processLine(filePath, remainder);
            }
            resolve();
        });

        stream.on('error', (error) => {
            reject(error);
        });
    });
};

const watchFile = (filePath) => {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
        console.warn(`File not found: ${absolutePath}, waiting for it to be created...`);
    }

    console.log(`Watching file: ${absolutePath}`);

    // Simple implementation: Track file size.
    let currentSize = 0;
    let initialReadPromise = Promise.resolve();

    const watcher = chokidar.watch(absolutePath, {
        persistent: true,
        usePolling: CONFIG.usePolling,
        ignoreInitial: true
    });

    const readFromStartAndCatchUp = async (targetPath) => {
        try {
            const stat = fs.statSync(targetPath);
            if (stat.size > 0 && !CONFIG.tailFromEnd) {
                await streamFileLines(targetPath, 0, stat.size - 1);
            }
            currentSize = stat.size;

            // Catch any new lines appended while we were reading.
            const latest = fs.statSync(targetPath);
            if (latest.size > currentSize) {
                await streamFileLines(targetPath, currentSize, latest.size - 1);
                currentSize = latest.size;
            } else if (latest.size < currentSize) {
                currentSize = latest.size;
            }
        } catch (e) {
            if (e.code !== 'ENOENT') {
                console.error(`Error reading ${targetPath}:`, e.message);
            }
        }
    };

    const scheduleInitialRead = (targetPath) => {
        initialReadPromise = readFromStartAndCatchUp(targetPath);
        return initialReadPromise;
    };

    if (fs.existsSync(absolutePath)) {
        scheduleInitialRead(absolutePath);
    }

    watcher.on('change', async (path) => {
        try {
            await initialReadPromise;
        } catch (e) {
            // If initial read failed, still attempt to process new data.
        }

        try {
            const stat = fs.statSync(path);
            if (stat.size > currentSize) {
                await streamFileLines(path, currentSize, stat.size - 1);
                currentSize = stat.size;
            } else if (stat.size < currentSize) {
                // File truncated (log rotated)
                currentSize = 0;
            }
        } catch (e) {
            console.error(`Error reading ${path}:`, e.message);
        }
    });

    watcher.on('add', async (path) => {
        console.log(`File detected: ${path}`);
        await scheduleInitialRead(path);
    });
};

CONFIG.files.forEach(file => watchFile(file));

// Handle exit
process.on('SIGINT', async () => {
    console.log('Stopping agent...');
    clearInterval(flushTimer);
    await flushLogs();
    process.exit(0);
});
