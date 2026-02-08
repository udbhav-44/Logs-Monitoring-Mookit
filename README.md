# Centralized Log Monitoring System

A full-stack platform for ingesting, parsing, and exploring logs from distributed applications and web servers (Nginx). The system provides real-time ingestion, fast search, SQL-based filtering, and analytics dashboards to track traffic, user activity, and anomalies.

## Highlights

- **Real-time ingestion**: Lightweight agents tail logs and stream them to the backend.
- **Strict format parsing**: Accepts only well-formed nginx combined logs and your app log format.
- **Fast analytics**: Powered by ClickHouse for high-performance querying of millions of log lines.
- **Explorer + filters**: Full-text search plus structured filters (IP, UID, course, status, source, app, VM, time range).
- **Security Alerts**: Automated email alerts for suspicious activity (Brute force, etc.).
- **Multi-VM ready**: Agent is portable and configurable per VM.

## Architecture

- **Agent** (Node.js + Chokidar): watches log files/folders, filters, batches, and sends logs.
- **Backend** (Node.js + Express + ClickHouse): parses, stores, creates alerts, and serves analytics/search APIs.
- **Frontend** (React + Vite + Recharts): dashboard and log explorer.

## Quick Start

1. **Make the start script executable**
   ```bash
   chmod +x start-all.sh
   ```
2. **Run the stack**
   ```bash
   ./start-all.sh
   ```
   This script:
   - Installs dependencies (backend, frontend, agent)
   - Starts backend API on `http://localhost:5002`
   - Starts frontend on `http://localhost:5173`
   - Starts the agent
3. **Open the dashboard**
   ```text
   http://localhost:5173
   ```

Optional clean start (resets ClickHouse data):
```bash
RESET_DB=1 ./start-all.sh
```

## Log Formats Accepted (Strict)

Only these two formats are ingested. Everything else is rejected at the agent.

**1) Nginx combined**
```
49.37.223.210 - - [28/Jan/2026:00:00:10 +0000] "POST /studentapi/see908q32526/lectures/12/analytics HTTP/1.1" 200 63 "https://..." "Mozilla/5.0 ..."
```

**2) App log format**
```
[2026-01-22T00:04:43.874Z]  POST  200  /quizzes/take/1  62146  ee966q32526  174.230.185.2  [155.586 ms]  Mozilla/5.0 ...
```
Where:
- `uid` = `62146`
- `course` = `ee966q32526`

## Project Structure

```
├── agent/              # Log Collector Agent
│   ├── collector.js    # Main agent logic
│   └── .env            # Agent configuration
├── backend/            # Central API & Parsing Logic
│   ├── server.js       # Entry point
│   ├── controllers/    # API Controllers (Ingest, Analytics)
│   ├── services/       # Alert Service, Parser
│   └── config/         # ClickHouse config
├── frontend/           # React Dashboard
│   ├── src/pages/      # Dashboard Views (Overview, Explorer, etc.)
│   └── src/components/ # Reusable UI components
└── start-all.sh        # Helper script to launch everything
```

## Configuration

### Backend environment (`backend/.env`)
```
PORT=5002
HOST=0.0.0.0
JSON_BODY_LIMIT=10mb
OVERVIEW_PRECOMPUTE_MS=5000
APPLICATIONS_PRECOMPUTE_MS=10000

# ClickHouse Configuration
CLICKHOUSE_HOST=http://localhost:8123
CLICKHOUSE_DATABASE=logs
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=login123

# Email Alerts
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
ALERT_TO_EMAIL=recipient@example.com
```

### Frontend environment (`frontend/.env`)
```
VITE_API_BASE_URL=http://<BACKEND_HOST>:5002
VITE_DASHBOARD_REFRESH_MS=5000
VITE_APPLICATIONS_REFRESH_MS=10000
```

### Agent environment (`agent/.env`)
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

## Log Explorer

- **Course filter**: matches `parsedData.course` (supports partial matches).
- **Course column**: visible in the table and clickable for quick filtering.
- **Full-text search**: searches URL/message/raw text.

## Security & Threat Detection

The system includes an automated threat detection engine that scans logs every 15 minutes for suspicious patterns.

**Detected Threats:**
- **Brute Force Attacks**: High volume of 401/403 errors from a single IP (>20 reqs/15min).
- **SQL Injection (SQLi)**: Patterns like `UNION SELECT`, `OR 1=1`, `DROP TABLE`.
- **Cross-Site Scripting (XSS)**: Patterns like `<script>`, `javascript:`, `onerror=`.
- **Path Traversal**: Attempts to access parent directories (`../`, `..%2F`, `/etc/passwd`).
- **Sensitive File Access**: Access attempts for `.env`, `.git`, `.aws` config files.

**Alerting:**
- Alerts are aggregated and sent via email.
- **Cooldown**: To prevent spam, alerts for the same actor and threat type are silenced for 1 hour after the first notification.

## Multi-VM Setup

1. Copy the `agent/` folder to each VM.
2. Set `BACKEND_URL`, `VM_ID`, `APP_NAME`, and `LOG_FILES` on each VM.
3. Start the agent:
   ```bash
   node collector.js
   ```

## Production Ops (PM2, systemd, sysctl)

We include production helpers under `ops/`.

### PM2 (multi-core backend)
```bash
npm install -g pm2
pm2 start ops/pm2/ecosystem.config.cjs
pm2 save
pm2 startup
```
*Note: The security alert cron job is designed to run only on the first instance (`NODE_APP_INSTANCE=0`) to prevent duplicate emails.*

### systemd (auto-restart on boot)
```bash
sudo cp ops/systemd/log-backend.service /etc/systemd/system/
sudo cp ops/systemd/log-agent.service /etc/systemd/system/
sudo cp ops/systemd/log-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now log-backend log-agent log-frontend
```

### sysctl (kernel tuning)

## Docker Deployment

You can run the entire stack (Backend, Frontend, ClickHouse) using Docker Compose.

### Prerequisites
- Docker & Docker Compose installed.

### Run with Docker
1. **Configure Environment**
   - Ensure `backend/.env` has the correct `ALERT_TO_EMAIL` and SMTP settings.
   - The `CLICKHOUSE_HOST` in `backend/.env` will be overridden by docker-compose to point to the `clickhouse` container automatically.

2. **Start Services**
   ```bash
   docker-compose up -d --build
   ```

3. **Access Application**
   - Frontend: `http://localhost:80` (or just `http://localhost`)
   - Backend API: `http://localhost:5002`
   - ClickHouse: `http://localhost:8123`

4. **Stop Services**
   ```bash
   docker-compose down
   ```

5. **View Logs**
   ```bash
   docker-compose logs -f
   ```
