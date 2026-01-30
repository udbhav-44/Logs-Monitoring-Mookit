# Backend API

The backend ingests logs, parses them, stores them in MongoDB, and serves analytics/search endpoints.

## Install

```bash
npm install
```

## Run

```bash
npm start
```

## Environment (`backend/.env`)

```
PORT=5002
HOST=0.0.0.0
MONGO_URI=mongodb://localhost:27017/log-monitoring
JSON_BODY_LIMIT=10mb
OVERVIEW_PRECOMPUTE_MS=5000
APPLICATIONS_PRECOMPUTE_MS=10000
APPLICATIONS_PRECOMPUTE_MS=10000
MONGO_MAX_POOL_SIZE=50
MONGO_MIN_POOL_SIZE=5
MONGO_AUTO_INDEX=1
MONGO_CAP_BYTES=53687091200
HTTP_KEEPALIVE_TIMEOUT_MS=60000
HTTP_HEADERS_TIMEOUT_MS=65000
HTTP_REQUEST_TIMEOUT_MS=120000
INGEST_BATCH_SIZE=2000
INGEST_MAX_BYTES=5242880
INGEST_QUEUE_MAX=200000
INGEST_QUEUE_MAX_BYTES=209715200
INGEST_FLUSH_INTERVAL_MS=200
INGEST_RETRY_BASE_MS=500
INGEST_RETRY_MAX_MS=10000
INGEST_RETRY_JITTER_MS=200
```

## Endpoints (Core)

- `POST /api/ingest`  
  Body: `{ logs: [ { rawMessage, sourceType, appInfo } ] }`

- `GET /api/analytics/overview`  
  Query: `range=24h|7d|30d|all` or `start`/`end`

- `GET /api/analytics/search`  
  Query: `ip`, `uid`, `course`, `status`, `sourceType`, `app`, `vmId`, `start`, `end`, `search`

- `GET /api/analytics/applications`  
  Query: `start`/`end`

## Performance Notes

- Overview stats are precomputed every `OVERVIEW_PRECOMPUTE_MS`.
- Aggregations use `allowDiskUse(true)` to avoid memory pressure.
- MongoDB connection pooling is enabled.
- Size-based retention via capped collection (`MONGO_CAP_BYTES`).

## Reset Database

```bash
npm run reset:db
```

If you enable `MONGO_CAP_BYTES`, drop the database first so the capped collection is created.
