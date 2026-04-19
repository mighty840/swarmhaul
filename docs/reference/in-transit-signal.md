# In-transit signal — gating Confirm Delivery

**Status:** spec, targeting Week 3. Not yet implemented.

## Problem

Today (v1) the shipper can click **CONFIRM DELIVERY** the instant the
swarm forms. That's too early: at that moment the courier hasn't
picked up anything, let alone delivered it. Nothing in the protocol
prevents the shipper from confirming a leg the courier has not
actually moved — the on-chain constraint only checks that the
recipient is the shipper, not that the goods arrived.

In the single-leg happy path this doesn't cause immediate harm
(shipper would only be cheating themselves — they'd pay out without
receiving goods). But it's bad protocol design:

- Eliminates the courier's incentive to move. They get paid whether
  they drive or not.
- No audit trail that the courier even claimed to be en-route.
- Judges / reviewers see a dashboard where `CONFIRM DELIVERY` is live
  two seconds after dispatch, which reads as theatre.

## Proposed lifecycle

Introduce an intermediate **in-transit** phase between
`swarm_forming` and `confirmable`:

```
Package:  listed → swarm_forming → in_transit → delivered
                                         ↑
                                         └── courier signals
                                             coordinator here
Leg:      pending → picked_up → delivered_claim → confirmed
                  ↑            ↑                   ↑
                  courier      courier             shipper
```

The shipper's **CONFIRM DELIVERY** button is disabled until the leg's
courier has pushed a `delivered_claim` signal to the coordinator.
That signal is what unlocks the gate.

## Design options (pick one in Week 3)

### Option A — off-chain signed attestation (cheapest)

Courier signs a canonical message:
```
SWARMHAUL_DELIVERED\n<legId>\n<timestamp>
```
with their ed25519 agent keypair and POSTs it to
`POST /swarms/legs/:legId/courier-arrived` (new endpoint).

- API verifies signature against `leg.agentPubkey`, stamps
  `leg.deliveredClaimAt` + `leg.deliveredClaimSig`.
- WS broadcasts `LEG_DELIVERED_CLAIM`.
- Dashboard `SwarmDetailView` only shows the `CONFIRM DELIVERY` button
  when `leg.deliveredClaimAt` is set.

**Pros:** no Anchor change, no on-chain tx cost, ships in a day.
**Cons:** the claim lives in Postgres only; not a trust anchor.

### Option B — on-chain courier event (richer provenance)

Add a new instruction `courier_arrived` to the Anchor program.
Signer: courier. Writes a `delivered_claim_at` field on
`LegAccount`. Emits `CourierArrived` event.

`confirm_leg` then gets an additional constraint:
```rust
constraint = leg_account.delivered_claim_at > 0
             @ SwarmError::NoDeliveryClaim,
```

**Pros:** claim is on-chain, tamper-proof, indexable via events.
Judges can verify courier claim and shipper receipt are *separate*
on-chain signatures.
**Cons:** second on-chain tx per leg (more fees, more latency),
program redeploy.

### Option C — agent runs execution loop + Option B

On top of B, the agent daemon gets a small execution loop: after its
bid wins and the swarm forms, it runs its itinerary, then signs
`courier_arrived` automatically. For the demo this is fully
autonomous — judges watch an agent bid, drive the route (simulated
delay), ping arrival, shipper confirms, vault pays out, reputation
ticks up. That's the story.

**Recommendation for Week 3: B + the execution-loop half of C.**

## UI changes

`apps/dashboard/src/pages/SwarmDetailView.tsx` already has the button
wired to `leg.status === "pending"`. New gate: also require
`leg.deliveredClaimAt != null`.

When the claim is missing, render the button as a disabled status pill
with the text `AWAITING COURIER ARRIVAL…` so the user sees the gate
explicitly rather than a missing control.

## Open questions

- Should the courier be able to retract a `delivered_claim` if they
  were mistaken? v1: no. Retraction adds attack surface.
- What happens if the courier signals arrival but the shipper never
  confirms? We need a **dispute / timeout** path. Probably a 48h
  window after which the shipper's inaction is treated as implicit
  acceptance — vault pays out anyway. Out of scope for Week 3;
  tracks as a separate spec.
- Multi-leg: each intermediate hop claim is "I handed off to the
  next courier," not "I delivered to the final recipient." The
  next-hop courier is the recipient of that leg per the
  recipient-signs model; their `courier_arrived` on the *next* leg
  implicitly attests handoff. Explore whether the protocol should
  couple these, or keep them independent and let the multi-leg
  confirm tx naturally chain.

## Non-goals (Week 3)

- GPS verification of arrival. Out of scope forever for the core
  protocol — that's an oracle problem, not a coordination problem.
  Anyone can add a verifier plugin that attests GPS off-chain and
  the shipper can choose to require it; the protocol stays neutral.
