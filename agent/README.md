# Log Collector Agent

This agent tails log files or folders, filters non-matching lines, batches them, and sends them to the central backend.

## Accepted Log Formats (Strict)

Only these formats are ingested. Everything else is rejected.

**Nginx combined**
```
49.37.223.210 - - [28/Jan/2026:00:00:10 +0000] "POST /studentapi/see908q32526/lectures/12/analytics HTTP/1.1" 200 63 "https://..." "Mozilla/5.0 ..."
```

**App log format**
```
[2026-01-22T00:04:43.874Z]  POST  200  /quizzes/take/1  62146  ee966q32526  174.230.185.2  [155.586 ms]  Mozilla/5.0 ...
```
Where `ee966q32526` is the course code.

## Install

```bash
npm install
```

## Configuration (`agent/.env`)

```
BACKEND_URL=http://<BACKEND_HOST>:5002/api/ingest
LOG_FILES=/var/log/nginx/access.log,/var/log/my-app.log
APP_NAME=Central-VM
VM_ID=vm-01
BATCH_SIZE=1000
FLUSH_INTERVAL_MS=500
TAIL_FROM_END=0
USE_POLLING=0

# Resume offsets (restart-safe)
STATE_FILE=.offsets.json
RESET_OFFSETS=0
READ_NEW_FILES_FROM_START=1

# Filter nginx routes
NGINX_REJECT_PREFIXES=/studentapi,/api

# Payload sizing / compression
MAX_BATCH_BYTES=1000000
USE_GZIP=1

# Reliability / buffering
MAX_BUFFER_ITEMS=20000
MAX_BUFFER_BYTES=20000000
ENABLE_SPOOL=1
SPOOL_DIR=spool
MAX_SPOOL_BYTES=209715200
RETRY_BASE_MS=1000
RETRY_MAX_MS=30000
RETRY_JITTER_MS=250
HTTP_TIMEOUT_MS=10000
```

### Folder watch

`LOG_FILES` can include folders. Folder watches are **non-recursive**. New files appearing in that folder are detected and tailed.

```
LOG_FILES=/var/log/nginx,/var/log/my-app
```

## Start

```bash
node collector.js
```

## Resume Behavior (Offsets)

- The agent saves per-file offsets in `.offsets.json`.
- On restart, it resumes from the last saved byte position.
- Rotated/new files (inode change) start from the beginning.

Reset offsets:
```bash
RESET_OFFSETS=1 node collector.js
```

## Spooling (Disk Buffer)

When the backend is unavailable, the agent can spill batches to disk instead of dropping them.
Spool files live in `SPOOL_DIR` and are retried before in-memory buffers.

## Production Tips

- Use PM2:
  ```bash
  pm2 start collector.js --name log-agent
  ```
- For high ingest, keep `MAX_BATCH_BYTES` conservative and enable gzip.
