#!/usr/bin/env bash
# Tear down the E2E stack.
set -euo pipefail

REPO=${REPO:-$(git rev-parse --show-toplevel)}

stop() {
  local name="$1"; local pidfile="$2"
  if [ -f "$pidfile" ]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      echo "[e2e:down] stopping $name ($pid)"
      kill "$pid" 2>/dev/null || true
      # Give it a moment, then force if still up.
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  fi
}

stop "dashboard"      /tmp/swarmhaul-e2e-dashboard.pid
stop "api"            /tmp/swarmhaul-e2e-api.pid
stop "agent-alpha"    /tmp/swarmhaul-e2e-agent-alpha.pid
stop "agent-bravo"    /tmp/swarmhaul-e2e-agent-bravo.pid
stop "agent-charlie"  /tmp/swarmhaul-e2e-agent-charlie.pid
stop "validator"      /tmp/swarmhaul-e2e-validator.pid

(cd "$REPO" && docker compose down -v >/dev/null 2>&1 || true)

echo "[e2e:down] done"
