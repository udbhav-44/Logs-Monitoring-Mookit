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
MONGO_MAX_POOL_SIZE=50
MONGO_MIN_POOL_SIZE=5
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

## Reset Database

```bash
npm run reset:db
```
