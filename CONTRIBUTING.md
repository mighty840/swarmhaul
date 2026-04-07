# Contributing to SwarmHaul

## Workflow

1. **Pick an issue** from https://github.com/mighty840/swarmhaul/issues — sorted by P0 → P3
2. **Create a feature branch** from `main`:
   ```
   git checkout -b <type>/<issue-number>-<short-slug>
   ```
   Examples:
   - `fix/1-confirm-leg-vault-drain`
   - `feat/5-mcp-server-mount`
   - `test/16-route-optimizer-edges`
3. **Commit using Conventional Commits**:
   ```
   <type>(<scope>): <subject>

   <body>

   Refs: #<issue-number>
   ```
   Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
   Scopes: `anchor`, `api`, `agent`, `dashboard`, `sdk`, `infra`, `deps`
4. **Open a PR** when ready:
   ```
   gh pr create --title "<type>(<scope>): <subject>" --body "Closes #<issue>"
   ```
5. **CI must pass** before merge — typecheck, lint, tests, anchor build, security scans
6. **Squash merge to main** — keep history clean

## Conventional Commit Examples

- `fix(anchor): bind courier to leg via per-leg PDA — closes #1`
- `feat(api): mount MCP server with HTTP and stdio transports — closes #5`
- `test(api): add bid storm race condition test — refs #7`
- `chore(deps): bump @coral-xyz/anchor to 0.31.1`
- `ci: add 3-job pipeline with codecov upload — closes #14`

## Local Development

```bash
bun install
docker compose up -d  # Postgres
DATABASE_URL=... bunx prisma migrate dev --schema=apps/api/src/db/schema.prisma

# Run all packages
bun run dev

# Run a single package
cd apps/api && bun run dev
cd apps/dashboard && bun run dev
cd apps/agent && bun run dev
```

## Testing

```bash
bun run test           # All packages
turbo test --filter=@swarmhaul/api  # One package
cd packages/solana && anchor test    # Anchor tests
```

## Code Style

- TypeScript strict mode everywhere
- Files 200-400 lines typical, 800 max
- Organize by feature/domain, not by type
- Zod validation at all API boundaries
- No `console.log` in production code (use Fastify logger in API)
- All money: lamports on-chain, SOL in API JSON, EUR in agent config
- Solana keypairs NEVER committed

## Security

Before submitting a PR:
- [ ] No hardcoded secrets
- [ ] Inputs validated with Zod (API) or Anchor constraints (program)
- [ ] No `as` casts on untrusted data
- [ ] Tests added for new code paths

Run security tooling locally:
```bash
gitleaks detect
bun audit
cargo deny check  # in packages/solana
```
