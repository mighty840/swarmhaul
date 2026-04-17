# SwarmHaul — 1-minute pitch video shot-list

Record once devnet program + Orca deploy are live. One take. Screen
recording at 1440×900, audio voiceover in post.

## Setup before recording

- **Dashboard** open at <https://dashboard.swarmhaul.defited.com>
- **Phantom** logged in, devnet network, ≥ 0.5 SOL
- **Observatory** view showing 3 agents already on the leaderboard,
  recent bids empty, stats zero (a fresh state)
- Three agents running on Orca, pre-seeded reputations (20 / 55 / 85)
- LLM reasoning wired (LITELLM_API_KEY set in API + agent env)
- A second monitor or split-screen showing the agent logs tail so
  their thinking is visible during the swarm-formation moment

## Shot list

**0:00 – 0:10 — Hook**
*(Observatory view, full-screen)*
> "Autonomous AI agents. Forming delivery swarms. Settling payment
> on Solana. No central dispatcher. Watch."

Overlay: `SwarmHaul — multi-agent coordination protocol` fades in.

**0:10 – 0:30 — Dispatch**
*(Cut to DISPATCH tab, wallet banner visible)*

1. Click *Connect Wallet* → Phantom popup → approve. Wallet pubkey
   appears in banner.
2. Fill the form: "Vintage vinyl collection", 2 kg, 8 L, 1.2 SOL
   budget, Munich coords.
3. Click *▸ DISPATCH ORDER*. Phantom confirm popup → approve.
4. Status pill cycles: BUILDING TX → AWAITING SIGNATURE → BROADCASTING
   → CONFIRMING → PERSISTING → **DELIVERED** (green).

Overlay (30s): `Shipper wallet signs list_package. Escrow is a Solana
PDA.`

**0:30 – 0:50 — Swarm formation**
*(Cut to OBSERVATORY, agent reasoning stream visible)*

Agents bid within seconds. Voiceover reads one of the LLM rationales
aloud:
> "High profit margin, fits easily in the vehicle, adds only a modest
> detour, and helps build reputation."

Cut to SWARM MAP. Map zooms. The newly-formed swarm's two legs appear
as phosphor-green and magenta polylines, hand-off marker at the
relay point.

Click the origin marker → popup → *▸ INSPECT SWARM*.

Overlay (30s): `Reputation-weighted optimiser picks the relay chain. γ
nudges toward trusted agents without distorting cost.`

**0:50 – 1:00 — Settlement + reputation**
*(Cut to SwarmDetailView with leg breakdown)*

Trigger leg confirmations (off-screen or via dashboard). Each leg
status pill flips to COMPLETED; reputation leaderboard bars tick up
on-screen-right. Cut to the settle tx's Solana Explorer page in a
browser tab.

Overlay (final): `Paid on-chain. Reputation recorded. Next mission
ready.`

Close card (last 3 s):
> `SwarmHaul ▸ swarmhaul.defited.com`
> `Built for the SWARM hackathon · Colosseum`

## Tone notes

- No hype music — scanline-era UI deserves clean ambient or silence.
- Read the LLM reasoning *verbatim* from the dashboard. Don't
  paraphrase. Authenticity > polish.
- Keep the cursor slow. Every click should feel deliberate.
- No fast cuts. The whole piece is meant to look like a live
  observatory recording, not a trailer.
