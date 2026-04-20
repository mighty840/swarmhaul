# SwarmHaul — Week 2 pitch video shot-list (1 min)

Record once PR #71 (recipient-signs confirm), #72 (docs), #73 (Week 3
spec) are live and Orca has redeployed. One take, screen recording at
1440×900, audio voiceover in post.

## Setup before recording

- **Dashboard** open at [dashboard.swarmhaul.defited.com](https://dashboard.swarmhaul.defited.com)
- **Phantom** logged in, devnet network, ≥ 0.2 SOL on the shipper
  wallet (`57LY…pwG`)
- **Observatory** view showing live organic activity — no seed data,
  just whatever the three agents have earned over today's trial runs
- Three agents running on Orca with live devnet reputations (whatever
  `/reputation/leaderboard` currently returns — authentic data only)
- A second monitor or split-screen showing one agent's log tail so
  the LLM reasoning is visible during the bid moment
- Solana Explorer tab pre-opened on the program page
  (`GW9wYUcfa6LT5vxJ12aN7nu8VxWVrM53jaZcrZak41sg`) for a quick cut

## Shot list

### 0:00 – 0:10 — Hook
*(Observatory view, full-screen)*

> "Autonomous AI agents. Forming delivery swarms. Settling payment on
> Solana. **No central dispatcher. Watch.**"

Overlay fade-in: `SwarmHaul — multi-agent coordination protocol`.

### 0:10 – 0:28 — Dispatch
*(Cut to DISPATCH tab, Phantom already connected, balance visible)*

1. Fill the form: description `Art frames`, 1 kg, 5 L, **0.05 SOL
   budget**, Munich origin + destination (use the map picker — click
   two points).
2. Click **▸ DISPATCH ORDER**. Phantom popup → approve.
3. Status pill cycles: BUILDING TX → AWAITING SIGNATURE → BROADCASTING
   → CONFIRMING → PERSISTING → **DISPATCHED** (green).

Overlay: `Shipper wallet signs list_package. Escrow PDA is the Solana
protocol, not our server.`

### 0:28 – 0:45 — Swarm formation
*(Quick cut to split-screen: dashboard Observatory on left, agent log
tail on right)*

Agents bid within ~10s of listing. Voiceover reads **one rationale
verbatim** from the log (something like "High margin, fits the
vehicle, small detour, worth the reputation gain").

Cut to SWARM MAP. The package's leg renders as a phosphor polyline.
Click the origin marker → popup → **▸ INSPECT SWARM**.

Overlay: `Reputation-weighted optimiser picks the winner. γ nudges
toward trusted agents. Cost still dominates.`

### 0:45 – 0:58 — Shipper confirms → settle
*(SwarmDetailView open, leg pending)*

> "As the shipper — and only the shipper — I confirm receipt. The
> protocol requires the recipient to sign `confirm_leg`, not the
> courier. Self-attestation would be a trust hole."

Click **CONFIRM DELIVERY**. Phantom popup → approve. Status pill
cycles: BUILDING TX → AWAITING SIGNATURE → SENDING → CONFIRMING →
PERSISTING → leg flips to **COMPLETED**.

Cut to the rep leaderboard — the winning agent's bar ticks up in
real time.

Quick Explorer cut: settle tx (coordinator-signed), vault drained,
courier wallet credited.

### 0:58 – 1:00 — Close + next week

Overlay card (3 s, fades out):
```
SwarmHaul  ▸  devnet live
Next week: multi-leg swarms · autonomous courier execution · MCP endpoint for AI clients
swarmhaul.defited.com  ▸  Built for the SWARM hackathon · Colosseum
```

## Tone notes

- No hype music — scanline-era UI deserves clean ambient or silence.
- Read the LLM reasoning **verbatim** from the dashboard. Don't
  paraphrase. Authenticity > polish.
- Keep the cursor slow. Every click should feel deliberate.
- No fast cuts. The whole piece should read like a live observatory
  recording, not a trailer.
- When the CONFIRM DELIVERY button appears, pause 1-2 seconds before
  clicking. That beat sells the "only the recipient can do this"
  protocol story.

## What's coming next week (Week 3)

The video's closing card teases these — the weekly update at
[`2026-04-17.md`](./2026-04-17.md) and the Week 3 spec at
[`../reference/in-transit-signal.md`](../reference/in-transit-signal.md)
have the full detail. Highlights:

- **Multi-leg handoff auth.** v1's `confirm_leg` is single-leg only
  (hard guard `total_legs == 1`, error `MultiLegNotSupported`).
  Week 3 lifts this: intermediate-leg recipient is the next-hop
  courier (attesting handoff), final-leg recipient is the shipper.
  Unlocks actual relay delivery, the thing that makes this a *swarm*
  protocol and not a glorified bid market.
- **Courier in-transit signal.** Today the shipper can confirm the
  moment the swarm forms — too early, the courier hasn't moved.
  Week 3 adds an on-chain `courier_arrived` event (signed by the
  courier) that gates the shipper's CONFIRM DELIVERY button. Order
  becomes: goods move → courier pings → shipper confirms → vault
  pays. Spec: `docs/reference/in-transit-signal.md`.
- **Agent execution loop.** Layer on top of the in-transit signal:
  after a bid wins, the agent daemon runs its itinerary (simulated
  transit delay), then auto-signs `courier_arrived`. Full demo loop
  becomes autonomous end-to-end — dispatch, bid, execute, arrive,
  confirm, settle, all without human intervention except the
  shipper's click.
- **Privy embedded wallets.** Remove the "install Phantom" barrier
  for normal users. Shipper identity becomes an email; keys are
  generated and custodied in-browser via Privy.
- **Public MCP endpoint** at `mcp.swarmhaul.defited.com`. AI clients
  (Claude, Cursor, etc.) can list packages, read the reputation
  leaderboard, and inspect swarms as MCP tools. Agents-dispatching-
  agents, zero CAC.
- **Reputation PDA as DID+VC primitive.** The on-chain reputation PDA
  is already a durable, tamper-proof agent identity. Expose a
  resolver so third parties can verify an agent's track record
  without trusting our API — useful for other coordination protocols
  that want to piggy-back on SwarmHaul's reputation surface.
- **Playwright E2E suite.** Regression net before final Colosseum
  submission.

## Hard constraints

- Do **not** fake or pre-seed reputation data. The leaderboard
  reflects whatever the three agents earned in today's trial runs.
  Authenticity is the pitch.
- Do **not** cut together multiple takes. One take, one flow.
- Budget must be ≥ **0.025 SOL** or bravo/charlie won't bid
  profitably (cost model: `apps/agent/src/bidder.ts:3`, EUR→SOL
  hardcoded at 0.007).
