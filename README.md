# Centralized Log Monitoring System

A scalable, full-stack platform for monitoring logs from distributed applications and web servers (Nginx). The system provides real-time ingestion, search capabilities, and analytics dashboards to track traffic, user activity, and security anomalies.

## Features

-   **Real-time Log Ingestion**: Lightweight agents tail logs from multiple VMs and ship them to the central server.
-   **Parsing Engine**: Automatically parses Nginx combined logs and custom JSON application logs.
-   **Interactive Dashboard**:
    -   **Overview**: Visual traffic trends and status code distribution. Charts are clickable to open filtered views in the Log Explorer.
    -   **Log Explorer**: Full-text search with filtering by IP, UID, status, time, source, app, and VM. Clicking a row opens a detail modal; clicking status/IP/UID chips refines the search.
    -   **User Activity**: Trace a specific user's actions across the system using their UID, with quick links to related logs and IP usage.
    -   **Security**: Auto-detect suspicious IP addresses (brute-force/scanning patterns) with one-click drill-down to related logs.
-   **Multi-VM Support**: Designed to aggregate logs from multiple sources.

## Technology Stack

-   **Frontend**: React, Vite, Tailwind CSS, Recharts
-   **Backend**: Node.js, Express
-   **Database**: MongoDB via Mongoose (indexes on timestamp, UID, IP, source)
-   **Agent**: Node.js, Chokidar (for efficient file watching)

## Prerequisites

-   **Node.js**: v20.19+ or v22.12+ recommended (works with Homebrew `node@22`)
-   **NPM**: v9 or higher
-   **MongoDB**: running locally or reachable at your `MONGO_URI` (default `mongodb://localhost:27017/log-monitoring`)

## Quick Start

1.  **Clone the repository** (if you haven't already).
2.  **Make the start script executable**:
    ```bash
    chmod +x start-all.sh
    ```
3.  **Run the application** (ensure MongoDB is running):
    ```bash
    ./start-all.sh
    ```
    This script automatically:
    -   Installs dependencies for Backend, Frontend, and Agent.
    -   Starts the Backend API on `http://localhost:5001`.
    -   Starts the Frontend Dashboard on `http://localhost:5173`.
    -   Starts the Log Agent (watching `./agent/access.log`).

4.  **Open the Dashboard**: Go to [http://localhost:5173](http://localhost:5173).

## Project Structure

```
├── agent/              # Log Collector Agent
│   ├── collector.js    # Main agent logic
│   ├── access.log      # Dummy log file for testing
│   └── .env            # Agent configuration
├── backend/            # Central API & Parsing Logic
│   ├── server.js       # Entry point
│   ├── models/         # Database models (NeDB)
│   └── controllers/    # API Controllers (Ingest, Analytics)
├── frontend/           # React Dashboard
│   ├── src/pages/      # Dashboard Views (Overview, Explorer, etc.)
│   └── src/components/ # Reusable UI components
└── start-all.sh        # Helper script to launch everything
```

## Configuration

### Ports
-   **Backend**: 5002 (Configurable in `backend/.env`, binds to `HOST` env, default `0.0.0.0`)
-   **Frontend**: 5173 (Default Vite port)
-   **Frontend API target**: If not using the default hostname, set `VITE_API_BASE_URL` in `frontend/.env` (otherwise it falls back to `window.location.hostname:5002`)

### Backend environment (`backend/.env`)
```
PORT=5002
HOST=0.0.0.0
MONGO_URI=mongodb://localhost:27017/log-monitoring
```
If your MongoDB uses authentication or a different host, update `MONGO_URI` accordingly.

### Multi-VM Setup
To monitor logs from other Virtual Machines:

1.  Copy the `agent/` folder to the target VM.
2.  Edit `agent/.env` on that VM:
    ```ini
    # Point this to your central backend IP
    BACKEND_URL=http://<YOUR_BACKEND_IP>:5001/api/ingest
    
    # Unique ID for this VM
    VM_ID=web-server-02
    
    # Absolute paths to logs you want to watch
    LOG_FILES=/var/log/nginx/access.log,/var/log/app.log
    ```
3.  Run the agent: `node collector.js`

## Testing the System

The `agent` folder contains a dummy `access.log` file that is being watched by default. You can manually append lines to this file to see them appear in the dashboard instantly.

**Example Nginx Log:**
```bash
echo '192.168.1.10 - user_123 [17/Jan/2026:20:00:00 +0530] "GET /api/data HTTP/1.1" 200 1024 "-" "Mozilla/5.0"' >> agent/access.log
```

**Example App Log (JSON):**
```bash
echo '{"timestamp": "2026-01-17T20:05:00Z", "level": "error", "message": "Database connection failed", "ip": "10.0.0.5"}' >> agent/app.log
```

## Troubleshooting

-   **"Error loading data"**: Ensure the backend is running on port 5001. Check `backend.log` if created.
-   **MongoDB connection failed**: Verify `MONGO_URI` in `backend/.env` and that `mongod` is running and reachable.
-   **Agent not sending logs**: The agent only reads *new* lines added to the file. It will not upload the entire history on startup. Append new lines to test.
-   **Port 5001 in use**: Update `PORT` in `backend/.env`, `BACKEND_URL` in `agent/.env`, and the API URLs in `frontend/src/pages/*.jsx`.
