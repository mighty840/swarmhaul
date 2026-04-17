#!/usr/bin/env bash
# SwarmHaul devnet setup.
#
# One-time path from zero to a deployed program + funded coordinator +
# funded agent keypairs on Solana devnet. Idempotent where possible.
#
# Usage:
#   bash scripts/devnet-setup.sh [--skip-airdrop] [--skip-deploy]
#
# Requirements:
#   - Solana CLI installed (`sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`)
#   - Anchor CLI installed via AVM (`avm install latest && avm use latest`)
#   - ~5 SOL total on the coordinator keypair after airdrops complete.
#
# Steps:
#   1. Create (or reuse) a dedicated coordinator keypair at
#      $HOME/.config/solana/swarmhaul-devnet.json
#   2. Attempt devnet airdrops (rate-limited — the public faucet only
#      gives 2 SOL per ~24h per recipient, so you may need to visit
#      https://faucet.solana.com manually for a second pass).
#   3. Build the program.
#   4. Deploy to devnet using that keypair.
#   5. Print the PROGRAM_ID for .env files.
#
# This script does NOT write to .env files — it prints the values and
# lets you paste them in (avoids clobbering local customisations).

set -euo pipefail

SKIP_AIRDROP=0
SKIP_DEPLOY=0
for arg in "$@"; do
  case "$arg" in
    --skip-airdrop) SKIP_AIRDROP=1 ;;
    --skip-deploy)  SKIP_DEPLOY=1 ;;
    *) echo "unknown flag: $arg"; exit 2 ;;
  esac
done

# Paint the PATH just in case the user's shell profile hasn't been
# reloaded since they installed Solana.
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

KEYPAIR="$HOME/.config/solana/swarmhaul-devnet.json"

if [[ ! -f "$KEYPAIR" ]]; then
  echo "▸ Creating devnet coordinator keypair at $KEYPAIR"
  mkdir -p "$(dirname "$KEYPAIR")"
  solana-keygen new --no-bip39-passphrase --silent -o "$KEYPAIR"
else
  echo "▸ Reusing existing keypair at $KEYPAIR"
fi

COORDINATOR=$(solana-keygen pubkey "$KEYPAIR")
echo "▸ Coordinator pubkey: $COORDINATOR"

solana config set --url devnet --keypair "$KEYPAIR" >/dev/null
echo "▸ Solana CLI pointed at devnet"

BALANCE=$(solana balance --url devnet | awk '{print $1}')
echo "▸ Current balance: $BALANCE SOL"

airdrop_loop() {
  local target_sol=5
  for attempt in 1 2 3; do
    local balance
    balance=$(solana balance --url devnet | awk '{print $1}')
    if awk -v b="$balance" -v t="$target_sol" 'BEGIN{exit !(b >= t)}'; then
      echo "▸ Airdrop target reached ($balance SOL)"
      return 0
    fi
    echo "▸ Airdrop attempt $attempt (current $balance SOL, target $target_sol)"
    if solana airdrop 2 --url devnet 2>&1 | tee /tmp/swarmhaul-airdrop.log | grep -q "rate limit\|Error"; then
      echo "   Faucet rate-limited. Visit https://faucet.solana.com and paste:"
      echo "     $COORDINATOR"
      echo "   Then rerun this script with --skip-airdrop to continue."
      return 1
    fi
    sleep 4
  done
}

if [[ "$SKIP_AIRDROP" -eq 0 ]]; then
  if ! airdrop_loop; then
    echo "✗ Could not fund coordinator via CLI faucet. See instructions above."
    exit 1
  fi
fi

FINAL_BALANCE=$(solana balance --url devnet | awk '{print $1}')
if awk -v b="$FINAL_BALANCE" 'BEGIN{exit !(b < 4)}'; then
  echo "⚠  Balance is $FINAL_BALANCE SOL — program deploy typically costs"
  echo "   2–4 SOL. Top up via https://faucet.solana.com before continuing."
fi

if [[ "$SKIP_DEPLOY" -eq 1 ]]; then
  echo "▸ --skip-deploy set; stopping here"
  exit 0
fi

echo "▸ Building Anchor program"
(cd packages/solana && anchor build)

echo "▸ Deploying to devnet"
(cd packages/solana && anchor deploy --provider.cluster devnet \
  --provider.wallet "$KEYPAIR")

PROGRAM_ID=$(solana-keygen pubkey packages/solana/target/deploy/swarmhaul-keypair.json)

cat <<EOF

────────────────────────────────────────────────────────────
  Devnet deploy complete.

  PROGRAM_ID     = $PROGRAM_ID
  COORDINATOR    = $COORDINATOR
  KEYPAIR_PATH   = $KEYPAIR

  Put these in apps/api/.env:
    SOLANA_RPC_URL=https://api.devnet.solana.com
    SOLANA_CLUSTER=devnet
    PROTOCOL_AUTHORITY_KEYPAIR_PATH=$KEYPAIR

  Put this in apps/dashboard/.env:
    VITE_SOLANA_RPC=https://api.devnet.solana.com
    VITE_API_URL=https://api.swarmhaul.defited.com
    VITE_WS_URL=wss://api.swarmhaul.defited.com

  Explorer:
    https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet
────────────────────────────────────────────────────────────
EOF
