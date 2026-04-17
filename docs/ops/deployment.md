# SwarmHaul Deployment

Target: public Orca cluster at `*.defited.com`, services hosted at
- API ▸ `https://api.swarmhaul.defited.com`
- Dashboard ▸ `https://dashboard.swarmhaul.defited.com`

Database + agents are internal to the `swarmhaul` Orca network.

## Prereqs

1. **Devnet program deployed.** Run `scripts/devnet-setup.sh` (see
   top of the file for the faucet workflow). Capture the printed
   `PROGRAM_ID` and `COORDINATOR` pubkey.
2. **Three agent keypairs generated** (e.g. in `/tmp/swarmhaul-devnet/`).
   Each needs a small SOL balance on devnet for signature fees if it
   ever signs directly (the current agent daemon only POSTs to the
   API, so balance is optional today but useful for the near-future
   `confirm_leg` flow).
3. **Orca cluster already bootstrapped** — we assume the same cluster
   used by `kitchenasty` and `signaldeck` (see `~/workspace/orca-infra`).

## GitHub Actions secrets

Add these under repo → Settings → Secrets and variables → Actions:

| Name | Purpose |
|---|---|
| `ORCA_REGISTRY` | *(optional)* overrides the default `registry.meghsakha.com` |
| `ORCA_REGISTRY_USER` | username for `docker login` against the registry |
| `ORCA_REGISTRY_TOKEN` | PAT or password for the registry |
| `ORCA_WEBHOOK_URL` | e.g. `https://orca.meghsakha.com:6880/api/v1/webhooks/github` |
| `ORCA_WEBHOOK_TOKEN` | bearer token Orca checks on incoming webhooks |

If `ORCA_WEBHOOK_URL` is unset the deploy workflow still builds + pushes
images, it just skips the notify step (useful for first-time testing).

## Orca secrets

Run on the Orca host:

```sh
orca secrets set SWARMHAUL_DB_PASSWORD "$(openssl rand -hex 24)"
orca secrets set LITELLM_API_KEY "sk-…"

# Orca has no set-file, so base64-encode each keypair JSON:
orca secrets set SWARMHAUL_COORDINATOR_KEYPAIR_B64 \
  "$(base64 -w0 ~/.config/solana/swarmhaul-devnet.json)"
orca secrets set SWARMHAUL_AGENT_ALPHA_KEYPAIR_B64 \
  "$(base64 -w0 /tmp/swarmhaul-devnet/keypair-alpha.json)"
orca secrets set SWARMHAUL_AGENT_BRAVO_KEYPAIR_B64 \
  "$(base64 -w0 /tmp/swarmhaul-devnet/keypair-bravo.json)"
orca secrets set SWARMHAUL_AGENT_CHARLIE_KEYPAIR_B64 \
  "$(base64 -w0 /tmp/swarmhaul-devnet/keypair-charlie.json)"
```

The API and agent entrypoints decode the `*_KEYPAIR_B64` env into a
0600 file at `/run/swarmhaul/coordinator.json` (or `…/agent.json`) and
export the path for the Solana SDK to pick up. See `Dockerfile.api` +
`Dockerfile.agent`.

## First deploy

```sh
# In orca-infra:
cp ~/workspace/swarmhaul/docs/ops/orca-service.toml \
   services/swarmhaul/service.toml
git add services/swarmhaul/service.toml && git commit -m "swarmhaul"
git push

orca webhooks add --repo mighty840/swarmhaul \
  --service swarmhaul-api --branch main
orca webhooks add --repo mighty840/swarmhaul \
  --service swarmhaul-dashboard --branch main
orca webhooks add --repo mighty840/swarmhaul \
  --service swarmhaul-agent-alpha --branch main
orca webhooks add --repo mighty840/swarmhaul \
  --service swarmhaul-agent-bravo --branch main
orca webhooks add --repo mighty840/swarmhaul \
  --service swarmhaul-agent-charlie --branch main

orca deploy swarmhaul
```

## Agent config JSONs

Each agent container looks for its config at `CONFIG_PATH` — the three
files (`agent-alpha.config.json`, `…-bravo`, `…-charlie`) should be
baked into the image or mounted as a secret/configmap. For the first
pass, commit them under `apps/agent/configs/` and adjust
`Dockerfile.agent` to `COPY apps/agent/configs /app/config`.

## Seeding reputation

After the first successful boot, open a one-shot shell in the API
container and run:

```sh
bunx tsx apps/api/src/scripts/seed-e2e-reps.ts
```

Update the pubkeys in that script to match the three Orca-hosted
agents before running.

## Smoke tests

```sh
curl https://api.swarmhaul.defited.com/health                  # → {"status":"ok", …}
curl https://api.swarmhaul.defited.com/reputation/leaderboard  # → [..] with 3 agents
open https://dashboard.swarmhaul.defited.com                    # Observatory loads
```

Any failure will show up in:

```sh
orca logs --service swarmhaul-api --follow
orca logs --service swarmhaul-dashboard --follow
```
