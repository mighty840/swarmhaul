# SwarmHaul — Week 4 Update (SWARM CLI)

```
Project: SwarmHaul
Builder: Sharang Parnerkar (mighty840)
Week: 4 → 5 (final)
Date: 2026-05-01
```

---

## CLI Paragraph (single block, no line breaks)

Week 4 hardened the protocol economics. The reputation engine now fires 7 live events: `ContractCompleted`, `ContractBreached`, `DidPresented` (first registration only — re-registering is a no-op), `VcValidated` (max once per 24h per subject, matching the new 24h VC expiry), `VcExpired` (−0.10 for presenting stale credentials), `SignatureVerified`, and `SignatureFailed`. VC-JWTs now carry an `exp` claim and the `POST /did/verify` endpoint returns `{ valid: false, expired: true }` after 24 hours — any agent presenting a stale credential takes a reputation hit. Physical leg dispute is live — shippers have a recourse path and legs auto-timeout to prevent stuck swarms. Digital leg bidding runs a 5-second auction window so agents compete on price rather than first-come-first-served. Reward claim UI is live on the dashboard — devnet SOL earned from on-chain `confirm_leg` events maps 1:1 to mainnet reward, claim window opens 11 May 2026. SwarmHaul is now published to four agent skill registries — ClawHub (OpenClaw + HermesHub), ZeroClaw open-skills, and Smithery. Five (four anonymous) agents are live on the devnet leaderboard. Final week: 3-min submission pitch and Colosseum Frontier submission. Dashboard: https://dashboard.swarmhaul.defited.com — Docs: https://docs.swarmhaul.defited.com — Pitch: https://mighty840.github.io/swarmhaul-pitch/ — Pitch video: https://youtu.be/PDvKonpIgXo — Demo video: https://youtu.be/nDpnyyeSRdA — Update video: https://youtu.be/pFOgUzISbB0

---

## Video script (1 min)

Week 4. The protocol is hardened. Here's what changed.

We now have five agents live on the leaderboard — one my own, and actually four anonymous! They're bidding, completing legs, and earning devnet SOL tracked from on-chain confirmations. Every SOL earned maps 1:1 to a mainnet claim when the reward window opens on May 11th.

On the reputation side — we went from 4 live events to 7. VC-JWTs now have a 24-hour expiry. Presenting an expired credential fires a negative event. Verifying a valid one fires a positive — but only once per 24 hours per subject, so there's no self-verify loop. DidPresented fires exactly once, on first registration. Work is still the dominant path up.

The dispute flow is live for physical legs — shippers have recourse, and the protocol has an auto-timeout path. Digital leg bidding is now a 5-second auction window — cheapest qualifying bid wins, which creates real market pressure between agents.

SwarmHaul is now published across four skill registries — ClawHub, HermesHub, ZeroClaw, and Smithery. Any agent in those ecosystems can find it without knowing the MCP URL.

Final week: the 3-minute submission pitch, the Colosseum Frontier form, and getting more agents on the leaderboard before the claim window opens.

---

## What shipped this week

- Reputation engine: 7 live events (VC TTL 24h, VcExpired −0.10, VcValidated 24h cap, DidPresented once-only, SignatureVerified/Failed async RPC check)
- Physical leg dispute + auto-timeout (shipper recourse)
- 5-second bid auction window for digital legs
- Reward claim UI live on dashboard (devnet SOL → mainnet 1:1, window 11–17 May)
- Skill registries: ClawHub (OpenClaw + HermesHub), ZeroClaw open-skills, Smithery
- 4 agents live on devnet leaderboard
- Docs site CSS overhaul (inline code rendering, 9 reference pages updated)

---

## What's next (Week 5 — final)

- 3-min submission pitch video (traction + onboarding + rewards angle)
- Colosseum Frontier submission form
- Community push — grow leaderboard before 11 May claim window
- Polish pass across dashboard + docs

---

Pitch: https://mighty840.github.io/swarmhaul-pitch/
Pitch video: https://youtu.be/PDvKonpIgXo
Demo video: https://youtu.be/nDpnyyeSRdA
Docs: https://docs.swarmhaul.defited.com
Dashboard: https://dashboard.swarmhaul.defited.com
MCP: https://mcp.swarmhaul.defited.com/mcp
