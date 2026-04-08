#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${AGENT_PID:-}" ]]; then
    kill "$AGENT_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${MON_SERVER_PID:-}" ]]; then
    kill "$MON_SERVER_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${MON_AGENT_PID:-}" ]]; then
    kill "$MON_AGENT_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

# Kill any existing node processes to prevent zombies (aggressive but necessary for reset)
pkill -f "node server.js" || true
pkill -f "vite" || true
pkill -f "node collector.js" || true
pkill -f "node index.js" || true
pkill -f "python agent.py" || true
pkill -f "python3 agent.py" || true

# Start Backend
echo "Starting Backend..."
cd "$ROOT_DIR/backend"
npm install
if [[ "${RESET_DB:-}" = "1" || "${RESET_DB:-}" = "true" ]]; then
  echo "Resetting MongoDB (logs collection)..."
  npm run reset:db
fi


# Pipe output to log file
npm start > "$ROOT_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
cd "$ROOT_DIR"

# Start Frontend
echo "Starting Frontend..."
cd "$ROOT_DIR/frontend"
npm install
npm run dev -- --host 0.0.0.0 --port 5173 > "$ROOT_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
cd "$ROOT_DIR"

# Start Agent
echo "Starting Log Collector Agent..."
cd "$ROOT_DIR/agent"
npm install
touch access.log app.log
if [[ "${RESET_OFFSETS:-}" = "1" || "${RESET_OFFSETS:-}" = "true" ]]; then
  echo "Resetting agent offsets..."
fi
RESET_OFFSETS="${RESET_OFFSETS:-0}" node collector.js > "$ROOT_DIR/agent.log" 2>&1 &
AGENT_PID=$!
cd "$ROOT_DIR"

# Start Monitoring System Backend
echo "Starting Monitoring System Backend..."
cd "$ROOT_DIR/monitoring-server"
npm install
export DATABASE_TYPE=influxdb
export INFLUXDB_HOST=http://localhost:8086
export INFLUXDB_TOKEN=my-super-secret-auth-token
export INFLUXDB_ORG=monitoring-org
export INFLUXDB_BUCKET=monitoring
export PORT=5000
npm start > "$ROOT_DIR/monitoring-backend.log" 2>&1 &
MON_SERVER_PID=$!
cd "$ROOT_DIR"

# Start Monitoring System Agent
echo "Starting Monitoring System Agent..."
cd "$ROOT_DIR/monitoring-agent"
npm install
node agent.js > "$ROOT_DIR/monitoring-agent.log" 2>&1 &
MON_AGENT_PID=$!
cd "$ROOT_DIR"

echo "All services started!"
echo "Backend: http://localhost:5002"
echo "Monitoring System Backend: http://localhost:5000"
echo "Frontend: http://localhost:5173"
echo "Check backend.log, frontend.log, agent.log, monitoring-backend.log, and monitoring-agent.log for details."

wait
