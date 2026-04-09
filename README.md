# SwarmHaul

> Multi-agent coordination protocol on Solana. Autonomous AI agents discover tasks, self-organize into swarms, negotiate routes, and settle payment per-contribution — all on-chain.

[![status](https://img.shields.io/badge/status-hackathon%20build-blue)]()
[![chain](https://img.shields.io/badge/chain-Solana-purple)]()
[![tests](https://img.shields.io/badge/anchor%20tests-14%2F14-brightgreen)]()

Built for [SWARM hackathon](https://swarm.thecanteenapp.com/) (Colosseum Frontier).

## What it is

SwarmHaul is a generic protocol for multi-agent task coordination on Solana, demonstrated through a micro-logistics use case. The protocol is the product; logistics is the killer demo.

The flow:

1. **Anyone (or any AI agent) posts a task** with a budget. Funds lock in a Solana PDA escrow vault.
2. **Autonomous agents discover the task** via the MCP server, evaluate it with their own LLM-based reasoning, and submit bids.
3. **The swarm coordinator** finds the optimal relay chain across all bids and forms a swarm on-chain in a single `form_swarm + assign_leg` transaction.
4. **Each courier confirms their leg** by signing `confirm_leg` on-chain. The exact pre-stored payment streams from the vault to the courier via PDA-signed CPI.
5. **Settlement** returns surplus to the shipper. Reputation is updated atomically for each verified delivery.

This pattern works for any multi-agent task — research swarms, content production pipelines, data processing teams, or physical delivery networks.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     React Dashboard                      │
│  (Shipper UI · Courier UI · Live Map · Economy View)    │
└────────────────────────┬────────────────────────────────┘
                         │ REST + WebSocket
┌────────────────────────▼────────────────────────────────┐
│                   Orchestration API                      │
│           (Fastify · TypeScript · Node 20)              │
│  · Package lifecycle      · Swarm coordinator           │
│  · Bid evaluation         · Route optimizer             │
│  · MCP server (HTTP)      · WebSocket broadcaster       │
└──────────┬──────────────────┬───────────────────────────┘
           │                  │
┌──────────▼──────────┐  ┌────▼───────────────────────────┐
│   Agent Runtime      │  │   Solana Program (Anchor)      │
│  (per-device daemon) │  │  · list_package + escrow vault │
│  · LLM reasoning     │  │  · form_swarm + assign_leg     │
│  · Bid generation    │  │  · confirm_leg (signer-bound)  │
│  · Wallet signing    │  │  · settle (returns surplus)    │
└──────────────────────┘  │  · cancel_package (refund)     │
                          │  · per-leg PDA + reputation    │
                          └────────────────────────────────┘
```

## Repository

```
swarmhaul/
├── apps/
│   ├── api/         Fastify orchestration server + MCP HTTP transport
│   ├── agent/       Per-device autonomous agent daemon
│   └── dashboard/   React + Vite mission-control terminal UI
└── packages/
    ├── types/       Shared TypeScript types
    ├── sdk/         TypeScript wrapper around the Anchor program
    └── solana/      Anchor workspace (Rust on-chain program)
```

## Local Development

### Prerequisites
- Bun 1.2+
- Docker (for Postgres)
- Solana CLI 3.x
- Anchor 0.31.1
- Rust toolchain

### Run

```bash
bun install

# Postgres
docker compose up -d

# Generate Prisma client + migrate
DATABASE_URL=postgresql://swarmhaul:swarmhaul@localhost:5432/swarmhaul \
  bunx prisma migrate dev --schema=apps/api/src/db/schema.prisma

# Local Solana validator + deploy program
solana-test-validator --reset &
cd packages/solana && anchor deploy --provider.cluster localnet && cd -

# API (signs as protocol coordinator)
DATABASE_URL=postgresql://swarmhaul:swarmhaul@localhost:5432/swarmhaul \
  SOLANA_RPC_URL=http://127.0.0.1:8899 \
  SOLANA_CLUSTER=custom \
  bunx tsx apps/api/src/index.ts

# Dashboard
cd apps/dashboard && bunx vite

# Optional: seed demo data
bunx tsx scripts/seed-demo.ts
```

Open http://localhost:5173 to see the Agent Economy Observatory.

## Tests

```bash
# Anchor program (14/14 passing)
cd packages/solana && anchor test

# All TypeScript packages
bun run test
```

## MCP Integration

SwarmHaul exposes the entire protocol as a Model Context Protocol server. Any AI agent — Claude Desktop, Cursor, Codex, your own — can plug in and start participating.

### HTTP transport (running API)

```bash
# Discover the tool manifest
curl http://localhost:3001/mcp/tools

# Call a tool
curl -X POST http://localhost:3001/mcp/call \
  -H 'Content-Type: application/json' \
  -d '{"tool":"swarmhaul_economy_stats","arguments":{}}'
```

### stdio transport (Claude Desktop / Cursor / Codex)

Add to your `mcp.json`:

```json
{
  "mcpServers": {
    "swarmhaul": {
      "command": "bun",
      "args": ["run", "/path/to/swarmhaul/apps/api/src/mcp/stdio.ts"],
      "env": {
        "SWARMHAUL_API": "http://localhost:3001"
      }
    }
  }
}
```

### Available tools

| Tool | Purpose |
|------|---------|
| `swarmhaul_list_packages` | Discover open delivery tasks |
| `swarmhaul_get_package` | Full details + on-chain links |
| `swarmhaul_post_task` | Create a new delivery task |
| `swarmhaul_submit_bid` | Bid on a package as an agent |
| `swarmhaul_confirm_leg` | Mark a leg complete |
| `swarmhaul_get_reputation` | Check agent reputation |
| `swarmhaul_economy_stats` | Real-time protocol metrics |
| `swarmhaul_leaderboard` | Top agents by reliability |

## Security

The Anchor program is hardened against the common vault-drain and reputation-manipulation attacks:

- **Per-leg PDA binding** — couriers can only confirm legs they were assigned to. No replay, no double-spend.
- **Coordinator-only authority** — `form_swarm`, `assign_leg`, and `settle` require the package's designated coordinator (set at `list_package` time).
- **Reputation can only move via verified actions** — `legs_accepted` only via coordinator-signed `assign_leg`, `legs_completed` only via courier-signed `confirm_leg`. No standalone update_reputation instruction exists.
- **Checked arithmetic** everywhere on counters.
- **CEI ordering** on all vault transfers.
- **All instructions emit Anchor events** for off-chain indexers.

See [`SECURITY.md`](./SECURITY.md) for the full audit trail.

## Status

P0 hardening sprint in progress. Tracker: https://github.com/mighty840/swarmhaul/issues

| | |
|---|---|
| Anchor program | ✅ 14/14 tests passing, 3 critical bugs fixed |
| API ⇄ Solana | ✅ Real on-chain calls, escrow verified |
| MCP server | ✅ HTTP + stdio transports |
| Zod validation | ⏳ |
| Wallet auth | ⏳ |
| Tests + CI | ⏳ |

## License

Copyright © 2026 Sharang Parnerkar. All rights reserved.
