# Week 2 — `swarm update product` paste

Paste-ready body for the Colosseum CLI weekly update. Mirrors the
Week 1 voice (em-dash entries, "What we shipped" / "This week's focus"
/ trailer line with links).

```
SwarmHaul — Week 2 Product Update

What we shipped:
— Reputation economics layer. Softened payment split (α=0.7, bounded 1.23× premium), formation-nudge γ=0.08 (±3.2% swing), first-meeting Sybil ceiling at 0.6. White paper at docs/reference/reputation-economics.md.
— Interactive Observatory. Live α/γ sliders drive a real payment-allocator simulator through the API. Canonical reputation trajectories rendered client-side.
— Wallet-signed dispatch. Shippers connect Phantom/Solflare on devnet and sign list_package themselves. API split into /packages/build-tx + /packages/confirm.
— Recipient-signs confirm_leg. Protocol now requires the shipper (not the courier) to sign the on-chain confirmation. Courier self-attestation was a trust hole. Anchor program upgraded live on devnet.
— Swarm inspector + live confirm UI. SwarmDetailView renders per-leg colors, agent reputation badges, explorer links, and a CONFIRM DELIVERY button visible only to the shipper.
— O(n²) route optimiser (1000 bids in 58ms, was timeout). 66 new unit tests + 24 API integration tests. Stress: 1,443 req/s @ 50 concurrent. Semgrep SAST added.
— Public deployment. api.swarmhaul.defited.com + dashboard.swarmhaul.defited.com live on Orca, three always-on agents auto-deploying on every push to main.

This week's focus (Week 3):
— Multi-leg handoff auth: lift the v1 total_legs==1 guard. Intermediate-leg recipient is the next-hop courier; final-leg recipient is the shipper. Unlocks real relay delivery.
— Courier in-transit signal: on-chain courier_arrived event (signed by the courier) gates the shipper's CONFIRM DELIVERY button. Goods move → courier pings → shipper confirms → vault pays.
— Agent execution loop: agents run their itinerary and auto-sign courier_arrived. Full demo runs autonomously end-to-end.
— Privy embedded wallets: remove the "install Phantom" barrier. Shipper identity becomes an email.
— Public MCP endpoint at mcp.swarmhaul.defited.com. AI clients (Claude, Cursor, etc.) can list packages, read the reputation leaderboard, and inspect swarms as MCP tools.
— Reputation PDA as DID+VC primitive: expose a resolver so third parties can verify agent track records without trusting our API.
— Playwright E2E suite as the pre-submission regression net.

Video: https://youtu.be/EYbVwvqK2C4 | GitHub: https://github.com/mighty840/swarmhaul | Pitch: https://swarmhaul.defited.com | Observatory: https://dashboard.swarmhaul.defited.com
```

## How to submit

```
swarm update product
# paste the fenced block above (without the backticks)
```
