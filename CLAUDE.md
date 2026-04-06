# SwarmHaul

Multi-agent coordination protocol on Solana. Autonomous AI agents self-organize into delivery swarms, negotiate relay routes, and settle payment on-chain. Demonstrated through a micro-logistics use case.

Turborepo monorepo. Three apps: api (Fastify), agent (Node daemon), dashboard (React/Vite).
Shared types in packages/types. Solana Anchor program in packages/solana.

## Key conventions
- All Solana interactions go through packages/solana IDL — never raw web3.js in apps
- Swarm coordinator logic lives exclusively in apps/api/src/services/swarm-coordinator.ts
- Cost model is canonical in apps/agent/src/bidder.ts — API reuses it via shared package
- WS events are typed in packages/types — add new events there first
- All money amounts: lamports on-chain, SOL in API JSON, EUR in agent config
- Agent reasoning via LLM in apps/agent/src/reasoning.ts — always has rule-based fallback
- Reputation data: on-chain PDA + mirrored in Postgres for fast queries

## Run locally
```
bun install
docker compose up -d   # postgres
cd apps/api && bun db:generate && bun db:migrate
turbo dev              # starts api + dashboard in watch mode
bun run apps/agent/src/agent.ts   # run agent separately
```

## Test
```
turbo test             # vitest for api + agent
cd packages/solana && anchor test   # Anchor tests (needs localnet)
```

## NEVER commit
- Solana keypairs or seed phrases
- .env files with real secrets
- Colosseum Copilot PAT token
