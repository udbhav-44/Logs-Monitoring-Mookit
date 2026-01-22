#!/bin/bash


# Kill any existing node processes to prevent zombies (aggressive but necessary for reset)
pkill -f "node server.js"
pkill -f "vite"
pkill -f "node collector.js"

# Start Backend
echo "Starting Backend..."
cd backend
npm install
# if [ "$RESET_DB" = "1" ] || [ "$RESET_DB" = "true" ]; then
  echo "Resetting MongoDB (logs collection)..."
  npm run reset:db
# Pipe output to log file
npm start > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Start Frontend
echo "Starting Frontend..."
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173 > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Start Agent
echo "Starting Log Collector Agent..."
cd agent
npm install
touch access.log
node collector.js > ../agent.log 2>&1 &
AGENT_PID=$!
cd ..

echo "All services started!"
echo "Backend: http://localhost:5002"
echo "Frontend: http://localhost:5173"
echo "Check backend.log, frontend.log, and agent.log for details."

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID $AGENT_PID" EXIT

wait
