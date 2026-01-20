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
    batchSize: 10,
    flushInterval: 5000 // 5 seconds
};

let logBuffer = [];
let flushTimer = null;

console.log(' Starting Log Collector Agent...');
console.log(' Configuration:', CONFIG);

const flushLogs = async () => {
    if (logBuffer.length === 0) return;

    const batch = [...logBuffer];
    logBuffer = [];

    try {
        await axios.post(CONFIG.backendUrl, { logs: batch });
        console.log(`[${new Date().toISOString()}] Flushed ${batch.length} logs to backend.`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Failed to send logs:`, error.message);
        // Determine strict retry logic or drop? For now, we put them back to avoid data loss, 
        // but limit to avoid memory leak if backend is down for long.
        if (logBuffer.length < 1000) {
            logBuffer = [...batch, ...logBuffer];
        } else {
            console.warn('Buffer full, dropping logs.');
        }
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

const watchFile = (filePath) => {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
        console.warn(`File not found: ${absolutePath}, waiting for it to be created...`);
    }

    console.log(`Watching file: ${absolutePath}`);

    // Use chokidar to watch file changes
    // We only want to tail new content, so we need to handle that.
    // Chokidar 'change' event gives mainly stats or just signals change.
    // A robust tailing implementation usually involves tracking file size/inode.
    // For simplicity in this project, we can use a library or implement a simple size tracker.

    // Simple implementation: Track file size.
    let currentSize = 0;
    try {
        currentSize = fs.statSync(absolutePath).size;
    } catch (e) { }

    const watcher = chokidar.watch(absolutePath, {
        persistent: true,
        usePolling: true
    });

    watcher.on('change', async (path) => {
        try {
            const stat = fs.statSync(path);
            if (stat.size > currentSize) {
                const stream = fs.createReadStream(path, {
                    start: currentSize,
                    end: stat.size
                });

                currentSize = stat.size;

                stream.on('data', (chunk) => {
                    const lines = chunk.toString().split('\n');
                    lines.forEach(line => processLine(path, line));
                });
            } else if (stat.size < currentSize) {
                // File truncated (log rotated)
                currentSize = 0;
            }
        } catch (e) {
            console.error(`Error reading ${path}:`, e.message);
        }
    });

    watcher.on('add', (path) => {
        console.log(`File detected: ${path}`);
        try {
            currentSize = fs.statSync(path).size;
        } catch (e) { }
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
