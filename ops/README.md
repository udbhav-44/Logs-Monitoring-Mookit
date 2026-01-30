# Ops / Production Helpers

This folder contains production-oriented helpers: PM2 configs, systemd unit files, and sysctl tuning.
These are safe defaults for a single-node deployment.

## PM2 (multi-core backend)

```bash
npm install -g pm2
pm2 start ops/pm2/ecosystem.config.cjs
pm2 save
pm2 startup
```

## systemd (auto-restart on boot)

```bash
sudo cp ops/systemd/log-backend.service /etc/systemd/system/
sudo cp ops/systemd/log-agent.service /etc/systemd/system/
sudo cp ops/systemd/log-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now log-backend log-agent log-frontend
```

## Sysctl tuning (network)

```bash
sudo cp ops/sysctl.d/99-log-monitoring.conf /etc/sysctl.d/
sudo sysctl --system
```

## Notes

- `log-frontend.service` uses `npm run preview` and expects a prebuilt `frontend/dist`.
- To build frontend:
  ```bash
  cd frontend
  npm install
  npm run build
  ```
