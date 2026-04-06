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

## Code style
- Many small files over few large files (200-400 lines typical, 800 max)
- Organize by feature/domain, not by type
- No console.log in production code (use Fastify logger in API)
- Input validation with Zod at API boundaries
- Immutability preferred — never mutate objects or arrays in shared state
- Proper error handling with try/catch, never swallow errors silently
- TypeScript strict mode everywhere

## Security
- NEVER hardcode secrets — use environment variables
- NEVER commit: Solana keypairs, seed phrases, .env files, Colosseum PAT
- Validate all user inputs at API boundary (Zod schemas)
- Parameterized queries only (Prisma handles this)
- Anchor constraint checks on all instructions
- Agent keypair loaded from filesystem, never embedded in code

## Testing
- Unit tests for cost model, itinerary matching, route optimization
- Anchor tests for all Solana instructions (happy path + edge cases)
- API integration tests against test database
- Run `turbo test` before committing
