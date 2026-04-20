# Week 2 — `swarm update product` paste

Single-line paste body (no newlines — the Colosseum CLI wants it flat).

```
SwarmHaul — Week 2 Product Update. What we shipped: — Reputation economics layer (softened payment split α=0.7 with bounded 1.23× premium, formation-nudge γ=0.08 ±3.2% swing, first-meeting Sybil ceiling at 0.6, white paper at docs/reference/reputation-economics.md). — Interactive Observatory with live α/γ sliders driving a real payment-allocator simulator through the API. — Wallet-signed dispatch: shippers connect Phantom/Solflare on devnet and sign list_package themselves (API split into /packages/build-tx + /packages/confirm). — Recipient-signs confirm_leg: protocol now requires the shipper (not the courier) to sign the on-chain confirmation — courier self-attestation was a trust hole. Anchor program upgraded live on devnet. — Swarm inspector + live confirm UI: SwarmDetailView renders per-leg colors, agent reputation badges, explorer links, and a CONFIRM DELIVERY button visible only to the shipper. — O(n²) route optimiser (1000 bids in 58ms, was timeout), 66 new unit tests + 24 API integration tests, stress 1,443 req/s @ 50 concurrent, Semgrep SAST added. — Public deployment: api.swarmhaul.defited.com + dashboard.swarmhaul.defited.com live on Orca, three always-on agents auto-deploying on every push to main. This week's focus (Week 3): — Multi-leg handoff auth: lift the v1 total_legs==1 guard; intermediate-leg recipient is the next-hop courier, final-leg recipient is the shipper, unlocks real relay delivery. — Courier in-transit signal: on-chain courier_arrived event (signed by the courier) gates the shipper's CONFIRM DELIVERY button — goods move, courier pings, shipper confirms, vault pays. — Agent execution loop: agents run their itinerary and auto-sign courier_arrived; full demo runs autonomously end-to-end. — Privy embedded wallets to remove the "install Phantom" barrier. — Public MCP endpoint at mcp.swarmhaul.defited.com so AI clients can list packages, read the leaderboard, and inspect swarms as MCP tools. — Reputation PDA as DID+VC primitive: expose a resolver so third parties can verify agent track records without trusting our API. — Playwright E2E suite as the pre-submission regression net. Video: https://youtu.be/EYbVwvqK2C4 | GitHub: https://github.com/mighty840/swarmhaul | Pitch: https://swarmhaul.defited.com | Observatory: https://dashboard.swarmhaul.defited.com
```

## How to submit

```
swarm update product
# paste the fenced block above (without the backticks)
```
