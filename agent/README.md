# Agent Deployment Guide

This guide explains how to install the Log Collector Agent on multiple Virtual Machines (VMs) to send logs to your central dashboard.

## 1. Prepare the Agent Package
On your main machine (where the backend is running):
1.  Run the packaging script (created for you, see below in chat):
    ```bash
    ./package-agent.sh
    ```
    This creates `agent-dist.zip`.

## 2. Deploy to Remote VM
1.  Copy `agent-dist.zip` to your target VM (using `scp` or any file transfer tool):
    ```bash
    scp agent-dist.zip user@remote-vm-ip:/home/user/
    ```
2.  SSH into the remote VM.

## 3. Install & Configure on Remote VM
1.  Unzip the package:
    ```bash
    unzip agent-dist.zip -d mookit-agent
    cd mookit-agent
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  **Critical Step**: Edit the configuration:
    ```bash
    nano .env
    ```
    -   **BACKEND_URL**: Change `localhost` to the Public IP or Hostname of your central server.
        -   Example: `http://192.168.1.50:5001/api/ingest`
    -   **VM_ID**: Give this VM a unique name (e.g., `web-02`, `db-01`).
    -   **LOG_FILES**: Comma-separated absolute paths to the logs you want to watch.
        -   Example: `/var/log/nginx/access.log,/var/log/my-app.log`

## 4. Start the Agent
Run the agent in the background:
```bash
node collector.js &
```
(Or use a process manager like `pm2` for production: `pm2 start collector.js --name log-agent`)

The agent will immediately start tailing the files and sending new log lines to your central dashboard.
