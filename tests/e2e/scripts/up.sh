#!/usr/bin/env bash
# Spin up a full local SwarmHaul stack for E2E tests.
#
# Idempotent enough for CI: waits for each service to be ready
# before proceeding. Outputs logs to /tmp/swarmhaul-e2e-*.log so a
# failing test can upload them as artifacts.
#
# Tears down via scripts/down.sh.

set -euo pipefail

REPO=${REPO:-$(git rev-parse --show-toplevel)}
LEDGER_DIR=${LEDGER_DIR:-/tmp/swarmhaul-e2e-ledger}
PROGRAM_ID=${PROGRAM_ID:-GW9wYUcfa6LT5vxJ12aN7nu8VxWVrM53jaZcrZak41sg}
SOLANA_BIN=${SOLANA_BIN:-$HOME/.local/share/solana/install/active_release/bin}
COORDINATOR_KEYPAIR=${COORDINATOR_KEYPAIR:-$HOME/.config/solana/swarmhaul-devnet.json}

log() { echo "[e2e:up] $*"; }
wait_for() {
  local what="$1"; local cmd="$2"; local timeout="${3:-60}"
  log "waiting for $what"
  local t=0
  until eval "$cmd" >/dev/null 2>&1; do
    sleep 1
    t=$((t + 1))
    if [ "$t" -gt "$timeout" ]; then
      log "timed out waiting for $what"
      exit 1
    fi
  done
}

export PATH="$SOLANA_BIN:$PATH"

# 1. Postgres via docker compose.
log "starting postgres"
(cd "$REPO" && docker compose up -d >/dev/null)
wait_for "postgres" "docker compose -f $REPO/docker-compose.yml exec -T postgres pg_isready -U swarmhaul" 60

# 2. Prisma migrations.
log "running prisma migrations"
(cd "$REPO/apps/api" && \
  DATABASE_URL=postgresql://swarmhaul:swarmhaul@localhost:5432/swarmhaul \
  bunx prisma migrate deploy --schema=src/db/schema.prisma >/tmp/swarmhaul-e2e-prisma.log 2>&1)

# 3. Wipe any prior demo data.
(cd "$REPO/apps/api" && \
  DATABASE_URL=postgresql://swarmhaul:swarmhaul@localhost:5432/swarmhaul \
  bunx tsx src/scripts/wipe-demo.ts >/tmp/swarmhaul-e2e-wipe.log 2>&1 || true)

# 4. Fresh validator with program preloaded.
log "resetting validator ledger"
rm -rf "$LEDGER_DIR"
mkdir -p "$LEDGER_DIR"
log "starting solana-test-validator"
(
  cd "$LEDGER_DIR"
  nohup solana-test-validator \
    --bpf-program "$PROGRAM_ID" "$REPO/packages/solana/target/deploy/swarmhaul.so" \
    --reset --quiet \
    >/tmp/swarmhaul-e2e-validator.log 2>&1 &
  echo $! >/tmp/swarmhaul-e2e-validator.pid
)
wait_for "validator" "solana cluster-version -u http://127.0.0.1:8899" 60

# 5. Airdrop coordinator + fixture agents. Derive pubkeys from the
# keypair files so fresh CI fixtures are funded — not a local dev's
# hardcoded pubkey.
log "airdropping coordinator + agents"
airdrop() {
  local kp="$1"
  [ -f "$kp" ] || return
  local pk
  pk=$(solana-keygen pubkey "$kp")
  solana airdrop 50 "$pk" -u http://127.0.0.1:8899 >/dev/null
  log "  funded $pk ($(basename "$kp"))"
}
airdrop "$COORDINATOR_KEYPAIR"
airdrop /tmp/swarmhaul-e2e/keypair-alpha.json
airdrop /tmp/swarmhaul-e2e/keypair-bravo.json
airdrop /tmp/swarmhaul-e2e/keypair-charlie.json

# The dev seed route uses hardcoded alpha/bravo pubkeys for its canned
# bids; override with the freshly-generated CI fixtures so the swarm
# it forms references identities that actually exist in this run.
if [ -f /tmp/swarmhaul-e2e/keypair-alpha.json ]; then
  DEV_SEED_COURIER_0=$(solana-keygen pubkey /tmp/swarmhaul-e2e/keypair-alpha.json)
  export DEV_SEED_COURIER_0
fi
if [ -f /tmp/swarmhaul-e2e/keypair-bravo.json ]; then
  DEV_SEED_COURIER_1=$(solana-keygen pubkey /tmp/swarmhaul-e2e/keypair-bravo.json)
  export DEV_SEED_COURIER_1
fi

# 6. API.
log "starting API"
(
  cd "$REPO/apps/api"
  export DATABASE_URL=postgresql://swarmhaul:swarmhaul@localhost:5432/swarmhaul
  export SOLANA_RPC_URL=http://127.0.0.1:8899
  export SOLANA_CLUSTER=custom
  export PROTOCOL_AUTHORITY_KEYPAIR_PATH="$COORDINATOR_KEYPAIR"
  export PORT=3001
  export ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4321
  export DEV_ROUTES=true
  nohup bun run dev >/tmp/swarmhaul-e2e-api.log 2>&1 &
  echo $! >/tmp/swarmhaul-e2e-api.pid
)
wait_for "api" "curl -sf http://localhost:3001/health" 60

# 7. Agents.
log "starting agents alpha + bravo + charlie"
for name in alpha bravo charlie; do
  (
    cd "$REPO/apps/agent"
    CONFIG_PATH="/tmp/swarmhaul-e2e/agent-$name.config.json" \
      nohup bun run src/agent.ts \
      >"/tmp/swarmhaul-e2e-agent-$name.log" 2>&1 &
    echo $! >"/tmp/swarmhaul-e2e-agent-$name.pid"
  )
done

# 8. Dashboard (vite preview is faster to boot than dev but needs a build).
log "starting dashboard"
(
  cd "$REPO/apps/dashboard"
  # Overwrite env for the test host.
  cat >.env <<EOF
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
VITE_SOLANA_RPC=http://127.0.0.1:8899
EOF
  nohup bun run dev >/tmp/swarmhaul-e2e-dashboard.log 2>&1 &
  echo $! >/tmp/swarmhaul-e2e-dashboard.pid
)
wait_for "dashboard" "curl -sf http://localhost:5173/" 120

log "stack ready"
