# Decentralized Reputation System — Spec

> **Origin:** This reputation model was originally co-designed by Sharang Parnerkar as part of the **TRADE** project (*TRustworthy Autonomous Driving by DEcentralized Authentication and Authorization*, BMBF KMU-innovativ, Filancore × ETO GRUPPE × TH Ingolstadt, 2021-2024). SwarmHaul adopts and adapts the same primitives for multi-agent task coordination on Solana.

**Status:** Draft spec. Not yet implemented. Tracked as [#34](https://github.com/mighty840/swarmhaul/issues/34).

---

## 1. Principles

The reputation system is built on five non-negotiable principles:

### 1.1 Peer-to-peer, not global
**There is no single global reputation database.** Every actor maintains their own local reputation database of actors they have directly (or indirectly) interacted with. The global view is emergent, not authoritative.

### 1.2 Self-estimate on first discovery
When actor A encounters actor B for the first time with no interaction history, A computes a **self-estimate** of B's trustworthiness from whatever contextual signals are available — presented DID, any verifiable credentials B can show, indirect references from actors A already trusts. The self-estimate seeds B's entry in A's reputation DB with an initial score.

### 1.3 Score ∈ [0.0, 1.0]
Represented internally as a floating-point value between `0.0` and `1.0` (or displayed as `0–100%`). `1.0` is theoretical perfection; in practice, nobody reaches it.

### 1.4 Skewed ramps — **gaining is hard, losing is fast**
This is the single most important invariant. The functions governing reputation change are asymmetric by design:

- **Gaining** reputation requires sustained, consistent good behavior across many interactions. Each positive event moves the score by a small increment, and the increments shrink as the score approaches `1.0`. Nobody reaches perfection.
- **Losing** reputation can happen in a single interaction. A single bad signal — HTTP 500 from an API, invalid signature on a DID, expired VC, contract breach — causes a large, immediate drop. Severe violations drop the score to near-zero instantly.

This asymmetry is what makes the system Sybil-resistant and socially honest: spinning up a new identity to escape bad reputation is pointless because building a new identity up takes significant time and effort, while destroying it takes seconds.

### 1.5 No cartels by construction
Because each actor has their own DB and trust is emergent from direct (or indirectly transitive) interactions, there is no single point that a colluding group can capture. Actor 1 can have bad reputation with *every* actor except Actor 2, and if Actor 1 and Actor 2 have a strong interaction history with good outcomes, Actor 2's local rank for Actor 1 remains high — and that ranking is as legitimate as any other actor's contrary opinion.

---

## 2. Data Model

Each actor maintains a local `ReputationDB` keyed by the counterparty identifier (DID or pubkey). Every entry records:

```
ReputationEntry {
  subject_id: Did | Pubkey                // who this entry is about
  score: f64                              // current reputation in [0.0, 1.0]
  interaction_count: u64                  // total interactions observed
  successful_count: u64                   // events that moved score up
  failed_count: u64                       // events that moved score down
  first_seen: Timestamp
  last_updated: Timestamp
  events: Vec<InteractionEvent>           // append-only event log
}

InteractionEvent {
  kind: EventKind                         // see §3 event taxonomy
  outcome: Success | Failure(Severity)    // signed magnitude
  timestamp: Timestamp
  context: Option<Bytes>                  // e.g. cred hash, request id
}

EventKind = DidPresented
          | VcValidated
          | VcExpired
          | VcRevoked
          | SignatureVerified
          | SignatureFailed
          | ApiCallSuccess
          | ApiCall500
          | ContractCompleted
          | ContractBreached
          | IndirectReferral

Severity = Minor | Moderate | Major | Critical
```

The `events` log is append-only and immutable once written. Scores are derived deterministically from the log — if a score needs to be recomputed (e.g., after a software upgrade changes the ramp constants), the log is the source of truth.

---

## 3. Event Taxonomy & Impact

Events have a default signed impact on the score, parameterised at config time:

| Event                | Outcome | Default Δ | Notes                                               |
|----------------------|---------|-----------|-----------------------------------------------------|
| `DidPresented`       | success | `+0.005`  | Low weight — just showing up                        |
| `VcValidated`        | success | `+0.02`   | Showing a valid VC from a trusted issuer           |
| `SignatureVerified`  | success | `+0.01`   | Per signature                                       |
| `ApiCallSuccess`     | success | `+0.002`  | High-frequency low-weight                          |
| `ContractCompleted`  | success | `+0.05`   | Significant: finishing a full commitment           |
| `IndirectReferral`   | success | `+0.005`  | From an actor I already trust                      |
| —                    | —       | —         | —                                                   |
| `SignatureFailed`    | failure | `−0.15`   | Invalid signature — trust-destroying               |
| `VcExpired`          | failure | `−0.10`   | Presenting an expired VC                           |
| `VcRevoked`          | failure | `−0.40`   | Presenting a revoked VC                            |
| `ApiCall500`         | failure | `−0.02`   | Per failure; repeated failures compound            |
| `ContractBreached`   | failure | `−0.80`   | Near-catastrophic; score drops to near-zero        |

The exact deltas are configurable per deployment. The **ratios** are the invariant: a single `ContractBreached` undoes roughly 16 `ContractCompleted` events.

---

## 4. Ramp Functions

Scores cannot just be linearly added because that would let someone reach `1.0` with enough noise. The actual update uses asymmetric dampening:

### 4.1 Positive updates (diminishing returns toward 1.0)

```
new_score = old_score + (1.0 − old_score) × gain_factor × base_delta

where gain_factor ∈ (0, 1)       # e.g., 0.5 for a conservative ramp
```

As `old_score → 1.0`, the `(1.0 − old_score)` term shrinks toward zero, making further gains increasingly expensive. A fresh actor at `0.3` gains `0.5 × 0.7 × 0.05 = 0.0175` from a `ContractCompleted`; an actor at `0.9` gains only `0.5 × 0.1 × 0.05 = 0.0025` from the same event.

### 4.2 Negative updates (linear, uncapped below)

```
new_score = max(0.0, old_score + signed_delta)
```

Losses are **not** dampened. A `ContractBreached` at `−0.80` wipes out years of accumulated reputation in one event. The score floor is `0.0` — there is no negative reputation, only trust and the absence of trust.

### 4.3 Time decay (optional)

Older events can be exponentially weighted down over time to let actors rehabilitate:

```
effective_score = Σᵢ eventᵢ.delta × exp(−λ × (now − eventᵢ.timestamp))
```

Deployments that want zero-forgiveness omit the decay term entirely.

---

## 5. Self-Estimate for First Discovery

When actor A first encounters actor B with no prior interaction history, A must compute an initial score. The self-estimate function takes whatever signals B can present:

```
self_estimate(B) =
    base_score                             // e.g. 0.3 — wary default
  + did_bonus        if B.did resolves     // +0.05
  + vc_bonus         for each VC from
                     an issuer in A's DB   // +0.02 × weighted_issuer_score
  + referral_bonus   for each VC endorsing
                     B from an actor C
                     where A.db[C].score   // +0.01 × A.db[C].score
                     > referral_threshold
  capped at 0.6                            // first-meeting ceiling
```

**The first-meeting ceiling is critical.** No matter how many shiny credentials B presents on first contact, A will never grant them more than `0.6` before observing them directly. Reputation must be earned through direct interaction, not imported wholesale.

---

## 6. Example Scenarios

### 6.1 Sybil attack against single actor

Actor M (malicious) creates 1000 fresh identities and spams them at actor A. Each fresh identity has no history and presents no VCs. Under the self-estimate function, each lands at the `base_score` of `0.3`. Because A's own experience with these identities is nil, none of them crosses the threshold to be trusted for any meaningful operation. The attack cost M nothing but buys nothing.

### 6.2 Good citizen burning out

Actor H has been a reliable courier for 6 months, score `0.87`. One day H's keypair is compromised and the attacker signs a malformed `confirm_leg` — `SignatureFailed` triggers, `−0.15`. Score drops to `0.72`. H recovers the key, explains via a fresh VC from a trusted issuer, and resumes work. Over the next month of clean deliveries, H rebuilds back to `0.83`. Recovery is possible but not free.

### 6.3 Actor 1 trusts Actor 2 despite global disapproval

Actor 1 has a bad record with everyone except Actor 2. Actors 3–99 all give Actor 1 a score of `0.1`. But Actor 1 and Actor 2 have completed 200 contracts together, all successful. In Actor 2's local DB, Actor 1 sits at `0.92`. Actor 2 has a legitimate, well-founded, peer-to-peer trust relationship with Actor 1 that nobody else can invalidate. This is the system working as intended: trust is not a majority vote.

### 6.4 Transitive trust propagation

Actor A does not know actor C. Actor B, whom A trusts at `0.78`, issues a VC endorsing C. Under the self-estimate function, A grants C an initial score of `base + referral_bonus` where the referral bonus is weighted by `A.db[B].score = 0.78`. If the `referral_bonus` is `0.01 × 0.78 = 0.0078`, C starts at `0.3 + 0.0078 ≈ 0.308`. If a dozen trusted actors endorse C, the bonuses add up — but still respecting the `0.6` first-meeting ceiling.

---

## 7. Mapping to SwarmHaul

| Concept                     | SwarmHaul implementation                                                                 |
|-----------------------------|------------------------------------------------------------------------------------------|
| Actor                       | Agent or shipper (Solana pubkey, expressed as `did:sol:<base58>`)                        |
| Local ReputationDB          | Off-chain Postgres mirror **plus** an on-chain aggregate anchored in `AgentReputationAccount` PDA |
| Event log                   | On-chain: Anchor events + per-leg `LegConfirmed` records; off-chain: full detailed log |
| Direct interactions         | `assign_leg` → `confirm_leg` pairs (the canonical "contract completed" signal)           |
| Indirect referrals          | VCs issued by reputable actors (future, via Issue #34 DID+VC work)                       |
| Score                       | Existing `AgentReputationAccount.reliability_score` (u8, 0-100) + richer off-chain float |
| Skewed ramps                | Implemented in an off-chain service; on-chain score is the coarse-grained summary       |

The minimal on-chain representation stays simple (`legs_completed`, `legs_accepted`, `reliability_score`) but the off-chain service computes the full ramp-function-derived score and can return richer details via the `/reputation/:pubkey` endpoint.

---

## 8. Open Questions

- **Recovery after catastrophic loss**: should there be a minimum recovery time after `ContractBreached`, or pure behavioural rebuild?
- **Issuer bootstrap**: how does the protocol cold-start the set of trusted issuers for the self-estimate function?
- **Cross-actor log reconciliation**: when two actors disagree about a past event, whose log wins? (TRADE's answer: neither — each actor's DB is sovereign.)
- **Privacy**: the full event log is implicitly a behaviour profile. Deployments may want to publish only derived scores, not raw events.
- **Time decay constant**: should `λ` be per-event-type (e.g., breaches decay slower than successes) or global?

---

## 9. References

- TRADE project (BMBF KMU-innovativ): https://www.forschung-it-sicherheit-kommunikationssysteme.de/projekte/trade
- Filancore technical blog post: https://filancoregmbh.medium.com/distributed-ledger-technology-for-automotive-cyber-systems-6eabb8196efb
- `embedded-did` repository (TRADE reference implementation): https://github.com/securityinmobility/embedded-did
- W3C Verifiable Credentials 2.0: https://www.w3.org/TR/vc-data-model-2.0/
- W3C DIDs 1.0: https://www.w3.org/TR/did-core/
