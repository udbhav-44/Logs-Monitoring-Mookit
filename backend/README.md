# Backend API (ClickHouse Edition)

The backend ingests logs, parses them, stores them in **ClickHouse** (migrated from InfluxDB for better performance and lower memory usage), and serves analytics/search endpoints.

## Install

```bash
npm install
```

## Run

```bash
npm start
```

## Environment (`backend/.env`)

Copy `.env.example` to `.env` and configure:

```
PORT=5002
HOST=0.0.0.0

# ClickHouse Configuration
CLICKHOUSE_HOST=http://localhost:8123
CLICKHOUSE_DATABASE=logs
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=

# Ingestion
INGEST_BATCH_SIZE=2000
INGEST_FLUSH_INTERVAL_MS=200

# Cache / Precompute (Optional)
OVERVIEW_CACHE_TTL_MS=5000
```

## Prerequisites

You need **ClickHouse** installed and running. 

### Installing ClickHouse (Ubuntu/Debian)

```bash
sudo apt-get install -y apt-transport-https ca-certificates dirmngr
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 8919F6BD2B48D754
echo "deb https://packages.clickhouse.com/deb stable main" | sudo tee /etc/apt/sources.list.d/clickhouse.list
sudo apt-get update
sudo apt-get install -y clickhouse-server clickhouse-client
sudo service clickhouse-server start
```

### Using Docker

```bash
docker run -d --name clickhouse \
  -p 8123:8123 -p 9000:9000 \
  --ulimit nofile=262144:262144 \
  clickhouse/clickhouse-server
```

The backend will automatically create the database and table on first connection.

## Endpoints (Core)

- `POST /api/ingest`  
  Body: `{ logs: [ { rawMessage, sourceType, appInfo } ] }`
  *Writes to ClickHouse with efficient batching.*

- `GET /api/analytics/overview`  
  Query: `range=24h|7d|30d`

- `GET /api/analytics/search`  
  Query: `ip`, `uid`, `course`, `status`, `sourceType`, `app`, `vmId`, `start`, `end`, `search`
  *Uses ClickHouse ILIKE for full text search.*

- `GET /api/analytics/applications`  
  Query: `start`/`end`

## Migration from InfluxDB

If you have existing data in InfluxDB and want to migrate it to ClickHouse:

1. Ensure you have both InfluxDB and ClickHouse credentials in `.env`.
2. Temporarily install InfluxDB client:

```bash
npm install @influxdata/influxdb-client
```

3. Run the migration script:

```bash
node scripts/migrate-influx-to-clickhouse.js
```

4. After successful migration, you can stop InfluxDB to free up resources.

**Note**: The migration script will automatically create the ClickHouse database and table if they don't exist.

## ClickHouse Schema Design

**Table**: `logs`

**Columns**:
- `timestamp` (DateTime) - Log entry timestamp
- `sourceType` (LowCardinality(String)) - Source type: 'app', 'nginx', etc.
- `app` (LowCardinality(String)) - Application name
- `vmId` (LowCardinality(String)) - VM identifier
- `method` (LowCardinality(String)) - HTTP method
- `status` (UInt16) - HTTP status code
- `level` (LowCardinality(String)) - Log level
- `course` (LowCardinality(String)) - Course identifier
- `rawMessage` (String) - Raw log message
- `url` (String) - Request URL
- `ip` (String) - Client IP address
- `uid` (String) - User identifier
- `userAgent` (String) - User agent string
- `parsedMessage` (String) - Parsed message
- `responseSize` (Nullable(UInt32)) - Response size in bytes

**Engine**: `MergeTree() ORDER BY (timestamp, app, sourceType)`

**Partitioning**: By month (`toYYYYMM(timestamp)`)

### Benefits of ClickHouse

- **Lightweight**: Uses significantly less memory than InfluxDB
- **Fast Analytics**: Optimized for OLAP queries with excellent compression
- **Standard SQL**: More intuitive than InfluxDB's Flux language
- **Better Scalability**: Handles massive datasets efficiently
- **Auto-partitioning**: Automatic data lifecycle management

## Data Retention

ClickHouse partitions data monthly. You can set up retention policies using:

```sql
ALTER TABLE logs DROP PARTITION '202301';  -- Drop January 2023 data
```

Or use TTL (Time To Live) settings:

```sql
ALTER TABLE logs MODIFY TTL timestamp + INTERVAL 6 MONTH;
```
