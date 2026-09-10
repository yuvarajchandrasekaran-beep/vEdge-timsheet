#!/bin/bash
# Stops both TimeSync services. Kills whatever is actually listening on each
# port (npm's dev-server child process doesn't receive SIGTERM forwarded to
# the `npm run dev` wrapper PID, so killing by port is the reliable method —
# the recorded PID files are only used to report what we're stopping).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$ROOT/.pids"

BACKEND_PORT=4000
FRONTEND_PORT=5173

stop_port() {
  local name="$1" port="$2" pidfile="$3"
  local pids
  pids="$(lsof -ti ":$port" -sTCP:LISTEN 2>/dev/null)"
  if [ -z "$pids" ]; then
    echo "→ $name not running (nothing listening on $port)."
  else
    echo "→ Stopping $name (port $port, pid(s): $(echo "$pids" | tr '\n' ' '))"
    echo "$pids" | xargs kill 2>/dev/null
    sleep 1
    # Escalate to SIGKILL for anything that ignored the first signal.
    pids="$(lsof -ti ":$port" -sTCP:LISTEN 2>/dev/null)"
    if [ -n "$pids" ]; then
      echo "$pids" | xargs kill -9 2>/dev/null
    fi
  fi
  rm -f "$pidfile"
}

stop_port "frontend" "$FRONTEND_PORT" "$PID_DIR/frontend.pid"
stop_port "backend" "$BACKEND_PORT" "$PID_DIR/backend.pid"

echo "TimeSync stopped."
