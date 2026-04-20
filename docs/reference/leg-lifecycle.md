# Leg lifecycle — from bid to settlement

How a `Leg` row (and its on-chain PDA) comes into existence, travels
through the protocol, and unlocks payment.

The short version: the shipper never picks a courier. Agents bid, the
coordinator's route optimizer picks the winning chain, legs are created
atomically from the winning bids, and then mirrored on-chain.

---

## 1. Shipper lists a package

- Shipper's wallet (Phantom) signs `list_package` (apps/api/src/routes/packages.ts → `/packages/build-tx`).
- The instruction creates two on-chain PDAs: `PackageAccount` + `VaultAccount` (holds escrowed SOL up to `maxBudgetLamports`).
- API persists the `Package` row with `onChainPackage` + `onChainVault` + `listSignature`. Status: `listed`.
- WebSocket broadcasts `PACKAGE_LISTED`.

No legs yet. No swarm yet.

---

## 2. Agents bid

Every agent daemon polls `GET /packages` every 10s (apps/agent/src/agent.ts:32–98).

For each package with `status: listed`:

1. **`computeOptimalLeg`** (apps/agent/src/itinerary.ts) — picks the segment of the agent's pre-declared itinerary that best overlaps the package's origin→dest. Falls back to the full route if the agent has no itinerary. Returns pickup/dropoff coords, distance, estimated duration, and detour delta.
2. **`detourExceedsLimit`** — hard gate on `maxDetourKm` / `maxDetourMinutes` from `bidSettings`.
3. **`computeCost`** (apps/agent/src/bidder.ts) — fuel × distance + time × hourly rate, EUR → SOL. Canonical cost model; the API reuses it.
4. **`reasonAboutBid`** (apps/agent/src/reasoning.ts) — LLM call to LiteLLM `gpt-oss-120b` reasoning about whether to bid. Always has a rule-based fallback if the LLM is unavailable.
5. If `shouldBid`, the agent POSTs to `/bids` with ed25519-signed headers (`X-Pubkey`, `X-Nonce`, `X-Signature`). The API's `REQUIRE_AUTH` middleware verifies the signature before touching Postgres.

A bid is a proposed leg. It is NOT yet a leg — the coordinator still has to pick winners.

---

## 3. Coordinator evaluates — `evaluateSwarmFormation`

Triggered on every accepted bid (`apps/api/src/services/swarm-coordinator.ts:25`). Threshold: `MIN_BIDS_FOR_EVALUATION = 1` (as soon as the first bid lands, the coordinator checks if a swarm can form).

Inside a **serializable** Postgres transaction:

1. Re-fetch the package. Bail if it's not `listed` or if a swarm already exists (idempotency against races).
2. Pull all non-expired bids for the package.
3. Pull reputation rows for every unique bidder → `repMap: Map<pubkey, score/100>`.
4. **`findOptimalRelayChain`** (apps/api/src/services/route-optimizer.ts) — picks either the single best bid or a multi-hop chain of bids whose waypoints form a valid origin→dest relay, total cost ≤ `maxBudgetSol`, and whose reputation-weighted score is best. Bounded γ=0.08 nudge toward higher-rep chains prevents cartels while giving honest agents a durable edge.
5. **`allocateReputationWeightedPayments`** (apps/api/src/services/reputation-engine.ts) — splits the payout pool across the winning bids:
   - α=0.7 of each payment is proportional to the bid itself (market price).
   - 1−α is weighted by reputation (surplus goes to more reliable agents).
   - First-meeting Sybil ceiling at 0.6 prevents farmed identities from inheriting trust.
6. **`tx.swarm.create`** with nested `legs.create` — one `Leg` row per bid in the chain:

   ```ts
   legs: {
     create: chain.bids.map((bid, index) => ({
       legIndex: index,
       agentPubkey: bid.agentPubkey,
       pickupLat: bid.pickupLat, pickupLng: bid.pickupLng,
       dropoffLat: bid.dropoffLat, dropoffLng: bid.dropoffLng,
       distanceKm: bid.distanceKm,
       estimatedDurationMin: Math.round((bid.distanceKm / 30) * 60),
       agreedPaymentSol: paymentByAgent.get(bid.agentPubkey),
       status: "pending",
     })),
   }
   ```

7. Package status flips to `swarm_forming`. Transaction commits.

Legs now exist in Postgres. Still no on-chain accounts.

---

## 4. On-chain commit — `coordinatorFormAndAssignSwarm`

After the Postgres transaction commits, the coordinator keypair executes
one Solana transaction that bundles:

1. **`form_swarm(totalLegs, totalLamports)`** — creates `SwarmAccount` PDA at `[b"swarm", package]`. Reserves the total payout from the vault.
2. **N × `assign_leg(legIndex, courierPubkey, paymentLamports)`** — creates `LegAccount` PDAs at `[b"leg", swarm, [legIndex]]` for each leg. Each assign bumps the courier's on-chain reputation `legs_accepted` counter on the `AgentReputation` PDA.

Post-confirm, the API:
- Updates `swarm.onChainSwarm` + `swarm.formSignature`.
- Derives and writes each `leg.onChainLeg` via `legPda(swarmPda, legIndex)`.
- Upserts `AgentReputation` rows in Postgres to mirror the on-chain `legsAccepted` bump (for fast dashboard queries).

WebSocket broadcasts `SWARM_FORMED` + one `BID_RECEIVED` per leg. Dashboard re-renders with the full leg chain + explorer links.

If on-chain fails, the Swarm row is marked `failed` and the package reverts to `listed` so a retry can form a fresh swarm.

---

## 5. Delivery + confirmation

**Confirmation model (multi-leg aware).**

- Legs confirm in strict index order. The program enforces
  `leg_index == swarm.completed_legs`, so leg `i+1` cannot confirm
  until leg `i` has. Error: `LegOutOfOrder`.
- **Final leg** (`leg_index == total_legs - 1`): the shipper signs
  `confirm_leg`. `next_leg_account` must be `None`.
- **Intermediate leg** (`leg_index < total_legs - 1`): the next-hop
  courier signs `confirm_leg` — their signature is the handoff
  attestation. `next_leg_account` is the `LegAccount` PDA for
  `leg_index + 1`; the program checks `recipient == next_leg.courier`.
- Errors: `MissingNextLeg`, `UnexpectedNextLeg`, `UnauthorizedRecipient`.

Per-leg flow:

- Whichever wallet is the legitimate recipient calls `POST /swarms/legs/:legId/build-confirm-tx`.
  The API resolves who that is (shipper for the final leg, next-hop
  courier otherwise), includes the next `LegAccount` PDA when relevant,
  and returns an unsigned tx.
- The recipient's signer (Phantom for shippers, the agent keypair for
  intermediate couriers) signs → dashboard / agent broadcasts → waits
  for `confirmed`.
- Client POSTs the signature to `POST /swarms/legs/:legId/confirm`. API:
  - Validates the authed wallet matches the expected recipient for
    this leg's position.
  - Marks the leg `completed` in Postgres.
  - If all legs in the swarm are completed, auto-calls `settle`
    on-chain with the coordinator keypair.
- `settle` closes the swarm account, pays remaining vault funds to the
  shipper's wallet (surplus refund), marks package `delivered`.

On-chain, `confirm_leg` transfers `leg.agreedPaymentSol` directly from
the vault to the courier's wallet via a PDA-signed system transfer.
Reputation `legs_completed` bumps, `reliability_score` is recomputed
to `floor(completed / accepted × 100)`.

---

## State machine summary

```
Package:   listed → swarm_forming → in_transit → delivered
                                             ↘ failed (on-chain error, retry path)
Swarm:     forming → active → settled
                          ↘ failed
Leg:       pending → completed (in strict legIndex order)
```

Key invariants:
- A package has **at most one** active swarm (unique constraint + serializable tx).
- A leg's `agreedPaymentSol` is locked at creation time — it does NOT recompute on settle.
- The vault's lamport balance at `confirm_leg` time must cover `leg.payment_lamports`. Defense in depth: the program refuses the transfer if it doesn't.
- `confirm_leg` marks the leg complete **before** the system transfer (CEI pattern).
- Legs confirm in strict `legIndex` order. Out-of-order confirms are rejected on-chain with `LegOutOfOrder`.

---

## Why this architecture

- **Shipper doesn't pick couriers.** The market picks; the coordinator executes allocation. Shippers can't prefer bad actors who offer side payments.
- **Legs are created from bids, not quotes.** Every winning leg has a committed, signed bid behind it — no phantom couriers.
- **Single serializable tx creates the whole swarm.** Prevents partial swarms under concurrent bid arrivals.
- **On-chain reputation lives in a PDA; Postgres mirrors it.** Fast dashboard reads, durable on-chain source of truth. Reputation changes only via protocol actions (`assign_leg`, `confirm_leg`) — no standalone `update_reputation` instruction exists.
- **Shipper signs `confirm_leg`.** Only the recipient can honestly attest "I received the goods." Courier self-attestation is a trust hole (courier has incentive to claim without moving).
