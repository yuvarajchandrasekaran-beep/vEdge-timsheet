#!/bin/bash
# Starts both TimeSync services (backend API :4000, frontend SPA :5173) in the
# background, using the project-local Node runtime via nrun.sh. Logs go to
# logs/backend.log and logs/frontend.log; PIDs are recorded under .pids/ for
# stop.sh. Safe to re-run — it skips a service that's already listening on
# its port instead of starting a second copy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT/logs"
PID_DIR="$ROOT/.pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

BACKEND_PORT=4000
FRONTEND_PORT=5173

port_listener_pid() {
  lsof -ti ":$1" -sTCP:LISTEN 2>/dev/null | head -1 || true
}

wait_for_http() {
  local url="$1" name="$2" tries=60
  until curl -sf "$url" >/dev/null 2>&1; do
    tries=$((tries - 1))
    if [ "$tries" -le 0 ]; then
      echo "  ✗ $name did not come up at $url within 30s — check its log."
      return 1
    fi
    sleep 0.5
  done
  echo "  ✓ $name is responding at $url"
}

start_service() {
  local name="$1" port="$2" dir="$3" log="$4" pidfile="$5"

  local existing
  existing="$(port_listener_pid "$port")" || true
  if [ -n "$existing" ]; then
    echo "→ $name already running on port $port (pid $existing) — leaving it alone."
    return 0
  fi

  echo "→ Starting $name (cd $dir && npm run dev) ..."
  (cd "$ROOT/$dir" && exec "$ROOT/nrun.sh" npm run dev) >"$log" 2>&1 &
  local wrapper_pid=$!
  echo "$wrapper_pid" >"$pidfile"
  disown "$wrapper_pid" 2>/dev/null || true
}

echo "Starting TimeSync..."
start_service "backend" "$BACKEND_PORT" "backend" "$LOG_DIR/backend.log" "$PID_DIR/backend.pid"
wait_for_http "http://localhost:$BACKEND_PORT/health" "backend"

start_service "frontend" "$FRONTEND_PORT" "frontend" "$LOG_DIR/frontend.log" "$PID_DIR/frontend.pid"
wait_for_http "http://localhost:$FRONTEND_PORT/" "frontend"

cat <<EOF

TimeSync is up:
  Frontend:    http://localhost:$FRONTEND_PORT
  Backend API: http://localhost:$BACKEND_PORT
  API docs:    http://localhost:$BACKEND_PORT/api/docs

Logs:  $LOG_DIR/backend.log, $LOG_DIR/frontend.log
Stop:  ./stop.sh
EOF
