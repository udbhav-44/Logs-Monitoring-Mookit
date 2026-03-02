# Monitoring Agent

This is the metrics agent responsible for tracking and sending system telemetry to the backend, including CPU, memory, disk usage, and process statistics.

## Requirements
- Node.js (v18+)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configuration:
   Update `config.json` with the appropriate settings for your environment, including the backend URL.

3. Run the agent:
   ```bash
   node agent.js
   ```

## Files
- `agent.js`: Main telemetry collector and sender.
- `config.json`: Configuration file for the agent.

## Deployment
This agent should be deployed to all remote VMs that you wish to monitor. It will connect to the `monitoring-server` WebSocket and stream stats in real-time.
