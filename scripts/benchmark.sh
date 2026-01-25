#!/bin/bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5002}"
RANGE="${RANGE:-30d}"
SEARCH_TERM="${SEARCH_TERM:-error}"
ITERATIONS="${ITERATIONS:-3}"
CONCURRENCY="${CONCURRENCY:-20}"
DURATION="${DURATION:-10}"

time_url() {
  local label="$1"
  local url="$2"
  curl -s -o /dev/null -w "${label}: total=%{time_total}s ttfb=%{time_starttransfer}s\n" "$url"
}

echo "Base URL: $BASE_URL"
echo "Range: $RANGE"
echo "Search: $SEARCH_TERM"
echo "Iterations: $ITERATIONS"
echo

echo "== Availability =="
curl -sf -o /dev/null "$BASE_URL/api/analytics/overview?range=$RANGE" || {
  echo "Backend not reachable at $BASE_URL"
  exit 1
}
echo "OK"
echo

echo "== Overview (first vs cached) =="
time_url "overview:first" "$BASE_URL/api/analytics/overview?range=$RANGE"
time_url "overview:cached" "$BASE_URL/api/analytics/overview?range=$RANGE"
echo

echo "== Overview (repeated) =="
for i in $(seq 1 "$ITERATIONS"); do
  time_url "overview:run#$i" "$BASE_URL/api/analytics/overview?range=$RANGE"
done
echo

echo "== Search (repeated) =="
for i in $(seq 1 "$ITERATIONS"); do
  time_url "search:run#$i" "$BASE_URL/api/analytics/search?search=${SEARCH_TERM}&limit=50&page=1"
done
echo

if command -v autocannon >/dev/null 2>&1; then
  echo "== Autocannon (overview) =="
  autocannon -c "$CONCURRENCY" -d "$DURATION" "$BASE_URL/api/analytics/overview?range=$RANGE"
  echo
else
  echo "autocannon not found; skipping load test."
  echo "Install: npm i -g autocannon"
fi
