# Frontend (Dashboard + Explorer)

This React app provides the system overview, log explorer, and detail views.

## Install

```bash
npm install
```

## Run (Dev)

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

## Environment (`frontend/.env`)

```
VITE_API_BASE_URL=http://<BACKEND_HOST>:5002
VITE_DASHBOARD_REFRESH_MS=5000
```

## Pages

- **Overview**: traffic + status code distribution + top endpoints/ips/uids.
- **Log Explorer**: filters by IP, UID, course, status, time range, source, app, VM, and full-text search.
- **User Activity**: per-UID timeline and actions.
- **Security**: suspicious activity trends.

## Notes

- The Overview page auto-refreshes on a timer (`VITE_DASHBOARD_REFRESH_MS`).
- Course search is a partial match on `parsedData.course` (e.g., `ee966` matches `ee966q32526`).
