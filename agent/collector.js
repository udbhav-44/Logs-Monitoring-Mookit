const chokidar = require('chokidar');
const axios = require('axios');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
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
    usePolling: process.env.USE_POLLING === '1' || process.env.USE_POLLING === 'true',
    stateFile: process.env.STATE_FILE || path.join(__dirname, '.offsets.json'),
    resetOffsets: process.env.RESET_OFFSETS === '1' || process.env.RESET_OFFSETS === 'true',
    readNewFilesFromStart: process.env.READ_NEW_FILES_FROM_START !== '0',
    nginxRejectPrefixes: (process.env.NGINX_REJECT_PREFIXES || '')
        .split(',')
        .map((prefix) => prefix.trim())
        .filter((prefix) => prefix),
    maxBatchBytes: Number(process.env.MAX_BATCH_BYTES) || 1000000,
    useGzip: process.env.USE_GZIP === '1' || process.env.USE_GZIP === 'true',
    maxBufferItems: Number(process.env.MAX_BUFFER_ITEMS) || 20000,
    maxBufferBytes: Number(process.env.MAX_BUFFER_BYTES) || 20000000,
    enableSpool: process.env.ENABLE_SPOOL !== '0',
    spoolDir: process.env.SPOOL_DIR || path.join(__dirname, 'spool'),
    maxSpoolBytes: Number(process.env.MAX_SPOOL_BYTES) || 200 * 1024 * 1024,
    retryBaseMs: Number(process.env.RETRY_BASE_MS) || 1000,
    retryMaxMs: Number(process.env.RETRY_MAX_MS) || 30000,
    retryJitterMs: Number(process.env.RETRY_JITTER_MS) || 250,
    httpTimeoutMs: Number(process.env.HTTP_TIMEOUT_MS) || 10000
};

let logBuffer = [];
let bufferBytes = 0;
let flushTimer = null;
let isFlushing = false;
const fileStates = new Map();
let rejectedLines = 0;
const offsetsState = { version: 1, files: {} };
let pendingStateSave = null;
let nextFlushAt = 0;
let retryDelayMs = CONFIG.retryBaseMs;
let spoolCounter = 0;
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });
const apiClient = axios.create({ httpAgent, httpsAgent, timeout: CONFIG.httpTimeoutMs });

const loadOffsetsState = () => {
    if (CONFIG.resetOffsets) {
        try {
            if (fs.existsSync(CONFIG.stateFile)) fs.unlinkSync(CONFIG.stateFile);
        } catch (e) {
            console.warn(`Unable to remove state file ${CONFIG.stateFile}:`, e.message);
        }
        return;
    }

    try {
        if (!fs.existsSync(CONFIG.stateFile)) return;
        const raw = fs.readFileSync(CONFIG.stateFile, 'utf8');
        if (!raw.trim()) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.files) return;
        offsetsState.files = parsed.files;
    } catch (e) {
        console.warn(`Unable to read state file ${CONFIG.stateFile}:`, e.message);
    }
};

const scheduleStateSave = () => {
    if (pendingStateSave) return;
    pendingStateSave = setTimeout(() => {
        pendingStateSave = null;
        try {
            const payload = JSON.stringify(offsetsState, null, 2);
            fs.writeFileSync(CONFIG.stateFile, payload);
        } catch (e) {
            console.warn(`Unable to write state file ${CONFIG.stateFile}:`, e.message);
        }
    }, 1000);
};

const saveOffsetsNow = () => {
    if (pendingStateSave) {
        clearTimeout(pendingStateSave);
        pendingStateSave = null;
    }
    try {
        const payload = JSON.stringify(offsetsState, null, 2);
        fs.writeFileSync(CONFIG.stateFile, payload);
    } catch (e) {
        console.warn(`Unable to write state file ${CONFIG.stateFile}:`, e.message);
    }
};

const updateOffsetsState = (absolutePath, stat, offset) => {
    offsetsState.files[absolutePath] = {
        inode: stat.ino,
        offset,
        size: stat.size,
        updatedAt: new Date().toISOString()
    };
    scheduleStateSave();
};

const nginxLineRegex = /^(\S+) - (\S+) \[([^\]]+)\] "([^"]+)" (\d{3}) (\d+|-) "([^"]*)" "([^"]*)"/;
const appFormattedRegex = /^\[(?<timestamp>[^\]]+)\]\s+(?<method>\S+)\s+(?<status>\d{3}|-)\s+(?<url>\S+)\s+(?<uid>\S+)\s+(?<course>\S+)\s+(?<ip>\S+)\s+\[(?<responseTimeMs>[\d.]+|-)\s*ms\]\s+(?<userAgent>.+)$/;
const nginxRejectPrefixes = CONFIG.nginxRejectPrefixes.length
    ? CONFIG.nginxRejectPrefixes
    : ['/studentapi', '/api'];

console.log(' Starting Log Collector Agent...');
console.log(' Configuration:', CONFIG);
loadOffsetsState();

const ensureSpoolDir = () => {
    if (!CONFIG.enableSpool) return;
    if (!fs.existsSync(CONFIG.spoolDir)) {
        fs.mkdirSync(CONFIG.spoolDir, { recursive: true });
    }
};

const listSpoolFiles = () => {
    if (!CONFIG.enableSpool || !fs.existsSync(CONFIG.spoolDir)) return [];
    return fs.readdirSync(CONFIG.spoolDir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => path.join(CONFIG.spoolDir, name))
        .sort();
};

const getSpoolSize = (files) => {
    return files.reduce((sum, file) => {
        try {
            return sum + fs.statSync(file).size;
        } catch (e) {
            return sum;
        }
    }, 0);
};

const trimSpoolToFit = (bytesNeeded) => {
    if (!CONFIG.enableSpool) return true;
    ensureSpoolDir();
    let files = listSpoolFiles();
    let total = getSpoolSize(files);
    if (total + bytesNeeded <= CONFIG.maxSpoolBytes) return true;

    for (const file of files) {
        try {
            const size = fs.statSync(file).size;
            fs.unlinkSync(file);
            total -= size;
            if (total + bytesNeeded <= CONFIG.maxSpoolBytes) return true;
        } catch (e) {
            // ignore and continue
        }
    }
    return total + bytesNeeded <= CONFIG.maxSpoolBytes;
};

const writeSpoolFile = (payload) => {
    if (!CONFIG.enableSpool) return false;
    ensureSpoolDir();
    const bytes = Buffer.byteLength(payload);
    if (!trimSpoolToFit(bytes)) {
        console.warn('Spool full, dropping payload.');
        return false;
    }
    const name = `spool-${Date.now()}-${spoolCounter++}.json`;
    const filePath = path.join(CONFIG.spoolDir, name);
    try {
        fs.writeFileSync(filePath, payload);
        return true;
    } catch (e) {
        console.warn(`Failed to write spool file ${filePath}:`, e.message);
        return false;
    }
};

const readSpoolPayload = (filePath) => {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (e) {
        return null;
    }
};

const removeSpoolFile = (filePath) => {
    try {
        fs.unlinkSync(filePath);
    } catch (e) {
        // ignore
    }
};

const recordSendFailure = () => {
    const jitter = Math.floor(Math.random() * CONFIG.retryJitterMs);
    retryDelayMs = Math.min(CONFIG.retryMaxMs, retryDelayMs * 2);
    nextFlushAt = Date.now() + retryDelayMs + jitter;
};

const resetRetry = () => {
    retryDelayMs = CONFIG.retryBaseMs;
    nextFlushAt = 0;
};

const sendPayload = async (payload) => {
    const body = CONFIG.useGzip ? zlib.gzipSync(payload) : payload;
    const headers = { 'Content-Type': 'application/json' };
    if (CONFIG.useGzip) headers['Content-Encoding'] = 'gzip';

    await apiClient.post(CONFIG.backendUrl, body, {
        headers,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
    });
};

const drainSpool = async () => {
    if (!CONFIG.enableSpool) return true;
    const files = listSpoolFiles();
    for (const file of files) {
        const payload = readSpoolPayload(file);
        if (!payload) {
            removeSpoolFile(file);
            continue;
        }
        try {
            await sendPayload(payload);
            removeSpoolFile(file);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Failed to send spooled logs:`, error.message);
            recordSendFailure();
            return false;
        }
    }
    return true;
};

const flushLogs = async () => {
    if (isFlushing) return;
    if (Date.now() < nextFlushAt) return;
    if (logBuffer.length === 0 && (!CONFIG.enableSpool || listSpoolFiles().length === 0)) {
        if (rejectedLines > 0) {
            console.log(`[${new Date().toISOString()}] Rejected ${rejectedLines} non-matching lines.`);
            rejectedLines = 0;
        }
        return;
    }
    isFlushing = true;

    try {
        if (!(await drainSpool())) return;
        resetRetry();
        while (logBuffer.length > 0) {
            const batchItems = pullBatch();
            if (batchItems.length === 0) break;
            const batch = batchItems.map((item) => item.entry);
            try {
                const payload = JSON.stringify({ logs: batch });
                await sendPayload(payload);
                console.log(`[${new Date().toISOString()}] Flushed ${batch.length} logs to backend.`);
            } catch (error) {
                console.error(`[${new Date().toISOString()}] Failed to send logs:`, error.message);
                const payload = JSON.stringify({ logs: batch });
                if (!writeSpoolFile(payload)) {
                    // Put them back to avoid data loss, but cap to avoid memory leaks if backend is down.
                    if (logBuffer.length < CONFIG.maxBufferItems) {
                        logBuffer = [...batchItems, ...logBuffer];
                        bufferBytes = logBuffer.reduce((sum, item) => sum + item.size, 0);
                    } else {
                        console.warn('Buffer full, dropping logs.');
                    }
                }
                recordSendFailure();
                break;
            }
        }
    } finally {
        if (rejectedLines > 0) {
            console.log(`[${new Date().toISOString()}] Rejected ${rejectedLines} non-matching lines.`);
            rejectedLines = 0;
        }
        isFlushing = false;
    }
};

// Ensure flush runs periodically
flushTimer = setInterval(flushLogs, CONFIG.flushInterval);

const processLine = (filePath, line) => {
    if (!line.trim()) return;

    const sourceType = getSourceType(line);
    if (!sourceType) {
        rejectedLines += 1;
        return;
    }
    if (sourceType === 'nginx' && shouldRejectNginxLine(line)) {
        rejectedLines += 1;
        return;
    }

    const logEntry = {
        sourceType,
        appInfo: {
            name: CONFIG.appName,
            vmId: CONFIG.vmId
        },
        rawMessage: line
    };

    const size = estimateEntrySize(logEntry);
    logBuffer.push({ entry: logEntry, size });
    bufferBytes += size;

    if (logBuffer.length > CONFIG.maxBufferItems || bufferBytes > CONFIG.maxBufferBytes) {
        const overflowBatch = pullBatch();
        if (overflowBatch.length > 0) {
            const payload = JSON.stringify({ logs: overflowBatch.map((item) => item.entry) });
            if (!writeSpoolFile(payload)) {
                console.warn('Unable to spool overflow batch, dropping logs.');
            }
        }
    }

    if (logBuffer.length >= CONFIG.batchSize || bufferBytes >= CONFIG.maxBatchBytes) {
        flushLogs();
    }
};

const estimateEntrySize = (entry) => {
    try {
        return Buffer.byteLength(JSON.stringify(entry));
    } catch (e) {
        return 0;
    }
};

const pullBatch = () => {
    if (logBuffer.length === 0) return [];
    const batch = [];
    let bytes = 0;
    while (logBuffer.length > 0 && batch.length < CONFIG.batchSize) {
        const item = logBuffer[0];
        if (batch.length > 0 && bytes + item.size > CONFIG.maxBatchBytes) break;
        batch.push(logBuffer.shift());
        bytes += item.size;
        bufferBytes = Math.max(0, bufferBytes - item.size);
        if (bytes >= CONFIG.maxBatchBytes) break;
    }
    if (batch.length === 0 && logBuffer.length > 0) {
        const item = logBuffer.shift();
        batch.push(item);
        bufferBytes = Math.max(0, bufferBytes - item.size);
    }
    return batch;
};

const extractNginxPathname = (line) => {
    const match = line.match(nginxLineRegex);
    if (!match) return null;
    const request = match[4] || '';
    const parts = request.split(' ');
    const url = parts[1];
    if (!url) return null;
    try {
        const urlObj = new URL(url.startsWith('http') ? url : `http://dummy${url}`);
        return urlObj.pathname || null;
    } catch (e) {
        return null;
    }
};

const shouldRejectNginxLine = (line) => {
    const pathname = extractNginxPathname(line);
    if (!pathname) return false;
    return nginxRejectPrefixes.some(prefix => pathname.startsWith(prefix));
};

const getSourceType = (line) => {
    if (nginxLineRegex.test(line)) return 'nginx';
    if (appFormattedRegex.test(line)) return 'app';
    return null;
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

const getFileState = (filePath) => {
    const absolutePath = path.resolve(filePath);
    let state = fileStates.get(absolutePath);
    if (!state) {
        state = {
            currentSize: 0,
            currentInode: null,
            initialReadPromise: Promise.resolve(),
            initialReadInProgress: false,
            changePromise: Promise.resolve(),
            changeInProgress: false
        };
        fileStates.set(absolutePath, state);
    }
    return state;
};

const resolveInitialOffset = (absolutePath, stat) => {
    const persisted = offsetsState.files[absolutePath];
    if (persisted && persisted.inode === stat.ino && typeof persisted.offset === 'number') {
        if (persisted.offset >= 0 && persisted.offset <= stat.size) {
            return persisted.offset;
        }
    }

    if (!CONFIG.readNewFilesFromStart && CONFIG.tailFromEnd) {
        return stat.size;
    }

    return 0;
};

const isReadableFile = (targetPath) => {
    try {
        const stat = fs.statSync(targetPath);
        return stat.isFile();
    } catch (e) {
        return false;
    }
};

const shouldIgnorePath = (targetPath) => {
    const baseName = path.basename(targetPath);
    return baseName.startsWith('.');
};

const readFromStartAndCatchUp = async (targetPath, state) => {
    if (!isReadableFile(targetPath)) return;

    try {
        const stat = fs.statSync(targetPath);
        const absolutePath = path.resolve(targetPath);
        const startOffset = resolveInitialOffset(absolutePath, stat);
        state.currentInode = stat.ino;
        state.currentSize = startOffset;

        if (stat.size > state.currentSize) {
            await streamFileLines(targetPath, state.currentSize, stat.size - 1);
            state.currentSize = stat.size;
        }
        updateOffsetsState(absolutePath, stat, state.currentSize);

        // Catch any new lines appended while we were reading.
        const latest = fs.statSync(targetPath);
        if (latest.size > state.currentSize) {
            await streamFileLines(targetPath, state.currentSize, latest.size - 1);
            state.currentSize = latest.size;
            updateOffsetsState(absolutePath, latest, state.currentSize);
        } else if (latest.size < state.currentSize) {
            state.currentSize = latest.size;
            updateOffsetsState(absolutePath, latest, state.currentSize);
        }
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.error(`Error reading ${targetPath}:`, e.message);
        }
    }
};

const scheduleInitialRead = (targetPath) => {
    const state = getFileState(targetPath);
    if (state.initialReadInProgress) return state.initialReadPromise;

    state.initialReadInProgress = true;
    state.initialReadPromise = readFromStartAndCatchUp(targetPath, state).finally(() => {
        state.initialReadInProgress = false;
    });
    return state.initialReadPromise;
};

const handleFileChange = async (targetPath) => {
    if (!isReadableFile(targetPath)) return;

    const state = getFileState(targetPath);
    if (state.changeInProgress) return state.changePromise;

    state.changeInProgress = true;
    state.changePromise = (async () => {
        try {
            await state.initialReadPromise;
        } catch (e) {
            // If initial read failed, still attempt to process new data.
        }

        try {
            const stat = fs.statSync(targetPath);
            const absolutePath = path.resolve(targetPath);
            if (state.currentInode && stat.ino !== state.currentInode) {
                state.currentInode = stat.ino;
                state.currentSize = 0;
                updateOffsetsState(absolutePath, stat, 0);
            }
            if (stat.size > state.currentSize) {
                await streamFileLines(targetPath, state.currentSize, stat.size - 1);
                state.currentSize = stat.size;
                updateOffsetsState(absolutePath, stat, state.currentSize);
            } else if (stat.size < state.currentSize) {
                // File truncated (log rotated)
                state.currentSize = 0;
                updateOffsetsState(absolutePath, stat, state.currentSize);
            }
        } catch (e) {
            console.error(`Error reading ${targetPath}:`, e.message);
        }
    })().finally(() => {
        state.changeInProgress = false;
    });

    return state.changePromise;
};

const watchFile = (filePath) => {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
        console.warn(`File not found: ${absolutePath}, waiting for it to be created...`);
    }

    console.log(`Watching file: ${absolutePath}`);

    const watcher = chokidar.watch(absolutePath, {
        persistent: true,
        usePolling: CONFIG.usePolling,
        ignoreInitial: true
    });

    if (fs.existsSync(absolutePath)) {
        scheduleInitialRead(absolutePath);
    }

    watcher.on('change', async (changedPath) => {
        if (shouldIgnorePath(changedPath)) return;
        await handleFileChange(changedPath);
    });

    watcher.on('add', async (addedPath) => {
        if (shouldIgnorePath(addedPath)) return;
        console.log(`File detected: ${addedPath}`);
        await scheduleInitialRead(addedPath);
    });
};

const watchDirectory = (dirPath) => {
    const absoluteDir = path.resolve(dirPath);
    if (!fs.existsSync(absoluteDir)) {
        console.warn(`Directory not found: ${absoluteDir}, waiting for it to be created...`);
    }

    console.log(`Watching directory: ${absoluteDir}`);

    const watcher = chokidar.watch(absoluteDir, {
        persistent: true,
        usePolling: CONFIG.usePolling,
        ignoreInitial: false,
        depth: 0
    });

    watcher.on('add', async (addedPath) => {
        if (shouldIgnorePath(addedPath)) return;
        if (!isReadableFile(addedPath)) return;
        console.log(`File detected: ${addedPath}`);
        await scheduleInitialRead(addedPath);
    });

    watcher.on('change', async (changedPath) => {
        if (shouldIgnorePath(changedPath)) return;
        await handleFileChange(changedPath);
    });
};

const watchPath = (targetPath) => {
    const absolutePath = path.resolve(targetPath);
    try {
        const stat = fs.statSync(absolutePath);
        if (stat.isDirectory()) {
            watchDirectory(absolutePath);
        } else {
            watchFile(absolutePath);
        }
    } catch (e) {
        // If we can't stat, assume it's a file path and wait for it to appear.
        watchFile(absolutePath);
    }
};

CONFIG.files.forEach(file => watchPath(file));

// Handle exit
process.on('SIGINT', async () => {
    console.log('Stopping agent...');
    clearInterval(flushTimer);
    await flushLogs();
    saveOffsetsNow();
    process.exit(0);
});
