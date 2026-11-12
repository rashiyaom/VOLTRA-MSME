#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

PORT=${PORT:-8000}
NITRO_PORT=${NITRO_PORT:-3000}
PIDS=()

cleanup() {
  for pid in "${PIDS[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup SIGTERM SIGINT

if [ -f "src/frontend/.output/server/index.mjs" ]; then
  echo "Starting VOLTRA MSME web app on port ${NITRO_PORT}..."
  PORT="$NITRO_PORT" node src/frontend/.output/server/index.mjs &
  PIDS+=("$!")
fi

echo "Starting VOLTRA MSME API on port ${PORT}..."
python -m uvicorn src.backend.main:app --host 0.0.0.0 --port "$PORT" &
BACKEND_PID=$!
PIDS+=("$BACKEND_PID")
wait "$BACKEND_PID"
