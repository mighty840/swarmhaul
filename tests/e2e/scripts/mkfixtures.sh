#!/usr/bin/env bash
# Generate local-only agent keypairs + configs under /tmp/swarmhaul-e2e.
# Used by CI and available for anyone bootstrapping a fresh local stack.
set -euo pipefail

REPO=${REPO:-$(git rev-parse --show-toplevel)}
SOLANA_BIN=${SOLANA_BIN:-$HOME/.local/share/solana/install/active_release/bin}
FIX_DIR=${FIX_DIR:-/tmp/swarmhaul-e2e}

export PATH="$SOLANA_BIN:$PATH"
mkdir -p "$FIX_DIR"

# Coordinator keypair (referenced by API via PROTOCOL_AUTHORITY_KEYPAIR_PATH).
if [ ! -f "$HOME/.config/solana/swarmhaul-devnet.json" ]; then
  mkdir -p "$HOME/.config/solana"
  solana-keygen new --no-bip39-passphrase -s -o "$HOME/.config/solana/swarmhaul-devnet.json"
fi

# Agent keypairs + configs for alpha/bravo/charlie, all on the same
# Munich itinerary so they produce overlapping bids and exercise the
# route optimizer.
gen_agent() {
  local name="$1"; local make="$2"; local model="$3"
  local kp="$FIX_DIR/keypair-$name.json"
  local cfg="$FIX_DIR/agent-$name.config.json"
  if [ ! -f "$kp" ]; then
    solana-keygen new --no-bip39-passphrase -s -o "$kp"
  fi
  local pubkey
  pubkey=$(solana-keygen pubkey "$kp")
  sed \
    -e "s|__AGENT_PUBKEY__|$pubkey|g" \
    -e "s|__KEYPAIR_PATH__|$kp|g" \
    -e "s|__VEHICLE_MAKE__|$make|g" \
    -e "s|__VEHICLE_MODEL__|$model|g" \
    "$REPO/tests/e2e/fixtures/agent-config.template.json" > "$cfg"
  echo "fixture $name → $pubkey"
}

gen_agent alpha   Fiat  Panda
gen_agent bravo   VW    Caddy
gen_agent charlie Tesla Model3
