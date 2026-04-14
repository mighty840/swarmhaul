# Reputation-Weighted Economics in SwarmHaul

**Author:** Sharang Parnerkar
**Status:** Design spec with reference implementation.
**Companion to:** [`reputation-system.md`](./reputation-system.md)

This document specifies how the reputation system influences economic
decisions in SwarmHaul: which swarm forms, who gets which leg, and how
the shipper's budget is distributed among couriers.

The design is motivated by a single scientific question:

> How do we provide agents with a measurable, ongoing incentive to
> maintain reputation — without letting reputation dominate markets,
> exclude newcomers, or enable cartelization?

This paper argues for a **bounded-nudge** approach: reputation modifies
economic outcomes in small, continuous, explainable ways. The dominant
signals remain cost and capacity. Reputation is a tiebreaker and a small
premium, never a hard filter.

---

## 1. Motivation & Prior Art

Reputation-weighted markets fail in two directions.

**Under-weighting reputation** produces systems where bad actors face no
economic consequence from damage to their score. Reputation becomes
decorative. Most token-based systems land here — badges exist, but the
market doesn't price them.

**Over-weighting reputation** produces systems where new agents cannot
bootstrap, incumbents capture all surplus, and reputation scores ossify
into caste. Cartels form naturally: trade surplus with trusted allies,
exclude outsiders. Uber-style "driver ratings" approach this — a 4.6 is
indistinguishable from a 4.9 in practice, but deplatforming thresholds at
4.5 create cliffs that reward incumbents and punish edge-case bad luck.

SwarmHaul's design target sits between these: reputation produces
*measurable* but *bounded* economic effects. An agent should feel the
delta over 100 interactions, not over one. The delta should compound over
careers, not over single moments. And no delta should ever exclude an
otherwise-capable agent from the market.

---

## 2. Design Principles

Five constraints bound the design:

1. **Cost is canonical.** Reputation may nudge, but cost comparisons
   dominate. A 20% cheaper chain of low-rep agents should always beat a
   marginally cheaper chain of high-rep agents.
2. **Continuous, not discrete.** No tiers, ranks, or badges. Reputation is
   a scalar in `[0, 1]` and economic effects are smooth functions of it.
3. **Bounded effect size.** Every nudge has a single tuning parameter
   whose maximum effect is explicit and documented.
4. **Fairness floor.** Newcomers at baseline reputation earn a meaningful
   share of work and rewards. No threshold at which agents become
   economically invisible.
5. **Symmetric around neutral.** Actors at neutral reputation (0.5) face
   no nudge in either direction. The nudge is centered, not one-sided.

---

## 3. Reputation-Weighted Reward Distribution

### 3.1 Problem statement

When a swarm settles, the shipper's escrow vault must be distributed to
couriers. Each courier submitted a bid for their leg. The question: if
the shipper's budget `B` exceeds the sum of bids `ΣbᵢBudget`, how should the
*surplus* `S = B − Σbᵢ` be allocated?

Three options:
1. **Refund to shipper.** Safe but wasteful — couriers have no incentive
   to over-perform their bids.
2. **Even split.** Ignores reputation entirely.
3. **Reputation-weighted.** Rewards long-term reliability.

SwarmHaul chooses (3), with a softened weighting function.

### 3.2 The softened weight function

For each courier `i` with reputation `rᵢ ∈ [0, 1]` and a fairness floor
parameter `α ∈ [0, 1]`:

```
wᵢ = α + (1 − α) × rᵢ
```

The normalized share:

```
shareᵢ = wᵢ / Σ_j wⱼ
```

Each courier receives:

```
paymentᵢ = bidᵢ + shareᵢ × S
```

### 3.3 Properties

| α     | Behaviour                                                    |
|-------|--------------------------------------------------------------|
| `0`   | Pure proportional — reputation ratios translate directly. Can produce 3:1 or higher splits. |
| `1`   | Reputation ignored — every courier gets equal bonus share.   |
| `0.7` | **Default** — small measurable nudge without dominance.      |

With the default `α = 0.7`, two couriers with reputations 0.9 and 0.3
receive bonus shares of approximately 55% and 45% respectively — a ratio
of 1.23:1 rather than 3:1.

### 3.4 Why this specific shape?

The linear combination `α + (1−α)r` was chosen over sigmoidal or
polynomial alternatives because:

1. **One parameter.** No curvature tuning, no inflection points to
   explain. `α` directly readable as "baseline fairness floor."
2. **Closed-form reasoning.** Share ratios can be computed mentally:
   for `α = 0.7`, extreme rep 1.0 vs 0.0 produces a `1 : 0.7` ratio,
   bounded.
3. **Compositional.** Nested into larger payoff structures without
   producing unexpected non-linearities.

A logistic or ramp function would create "sweet spots" that actors could
target strategically, distorting behaviour. Linear preserves the
invariant that every unit of reputation is worth the same marginal
bonus.

### 3.5 Edge cases

- **All couriers at rep = 0** (or no scores available): weights collapse
  to `α`, normalize to `1/n`. Surplus is split evenly.
- **Zero surplus** (`Σbᵢ = B`): every courier gets exactly their bid,
  weights are irrelevant.
- **Unknown agents:** treated as at baseline reputation (`0.3` by
  default) so they participate but without veteran premium.

### 3.6 Game-theoretic reading

An agent's expected per-leg reward is:

```
E[paymentᵢ] ≈ bidᵢ + (α + (1 − α) × rᵢ) / N̄ × S̄
```

where `N̄` is the expected swarm size and `S̄` is the expected surplus.
The marginal reward of rising from reputation `r` to `r + Δr` is:

```
dE/dr = (1 − α) / N̄ × S̄
```

With `α = 0.7`, `N̄ = 3`, and typical `S̄ = 0.15 SOL`, each 0.1 increase
in reputation is worth approximately `0.005 SOL` per contract. Across a
courier's career (10,000 contracts), that's 50 SOL — non-trivial, not
dominant.

A `ContractBreached` event drops reputation by 0.8. At `α = 0.7`, that
wipes out approximately `80 × 0.005 = 0.4 SOL` of expected per-contract
value going forward, plus the damage to future chain selection (§4).
The present-value cost of a breach easily exceeds the one-time gain from
defection, for any realistic discount rate.

---

## 4. Reputation-Weighted Swarm Formation

### 4.1 Problem statement

The route optimizer finds all viable relay chains from `origin` to
`destination` within the budget, then returns the cheapest. When
multiple chains are within a few percent of each other, how should
reputation influence the selection?

### 4.2 Effective-cost multiplier

For each candidate chain with average courier reputation `r̄`:

```
effective_cost = raw_cost × (1 − γ × (r̄ − r_neutral))
```

- `γ` is the nudge strength, default `0.08`.
- `r_neutral = 0.5` is the "no nudge" reference point.

The optimizer picks the chain minimizing `effective_cost`.

### 4.3 Properties

For a chain with:
- `r̄ = 0.9`: multiplier = `1 − 0.08 × 0.4 = 0.968` → chain looks 3.2%
  cheaper.
- `r̄ = 0.5`: multiplier = `1.0` → no nudge.
- `r̄ = 0.1`: multiplier = `1.032` → chain looks 3.2% more expensive.

Maximum total swing between a rep-1.0 chain and a rep-0.0 chain is
approximately 8% in effective cost. This is enough to decide ties and
near-ties, but never enough to overturn a materially cheaper offer.

### 4.4 Why a multiplicative nudge?

Alternatives considered:

- **Additive:** `effective_cost = raw_cost − β × (r̄ − 0.5)`. Breaks at
  small absolute costs: a 0.01 SOL chain could have the nudge exceed its
  own cost. Scale-dependent.
- **Lexicographic:** rank by cost first, break ties with reputation.
  Discontinuous — a 0.0001 SOL cost difference can override arbitrary
  reputation differences.
- **Pareto-optimal:** return multiple chains and let shipper choose.
  Adds UI complexity and removes protocol neutrality.

The multiplicative form is scale-invariant, continuous, and has a single
tuning parameter with a clear geometric meaning.

### 4.5 Why `γ = 0.08`?

The parameter was chosen such that:

1. **Ties broken predictably.** Two chains within ~5% cost of each other
   resolve toward higher reputation.
2. **Large cost gaps survive.** A chain that's 15%+ cheaper always wins,
   regardless of reputation.
3. **No exclusion cascade.** A new courier at baseline rep `0.3` faces a
   `1.6%` penalty — noticeable over thousands of contracts but
   competitive on any individual one.
4. **Matches the reward-nudge order of magnitude.** Both nudges produce
   single-digit percentage effects. An agent reasoning about their total
   expected value can think in a single unified range.

### 4.6 Interaction with bid pricing

A low-reputation agent can compensate for the formation nudge by
underbidding slightly. Given `γ = 0.08`, a 0.3-rep agent bidding 5%
below a 0.9-rep agent still wins. This preserves the core market
discipline: cost reflects willingness-to-serve, reputation reflects
reliability, both matter.

---

## 5. What We Deliberately Do Not Do

### 5.1 No reputation-gated work

We do not impose minimum reputation thresholds for accepting leg
assignments. Every courier who passes the bid-validity check is
eligible. Reputation affects *ranking* and *payment share*, never
*access*.

Rationale: thresholds create cliff behaviour (a single bad event
suddenly removes an agent from the market), which makes reputation
fragile and incentivizes Sybil recovery rather than rehabilitation.

### 5.2 No reputation-gated pricing

We do not let shippers set a minimum reputation in their package specs.
Rationale: shipper-declared reputation floors would re-introduce cartels
(shippers exclude competitors' couriers) and make reputation a political
weapon rather than a protocol signal.

### 5.3 No reputation discounts or surcharges on bids

A courier's bid price is their bid price. We do not inflate or deflate
the bid based on reputation. Rationale: the bid is a commitment the
courier chose; modifying it post-hoc breaks economic consent.

Reputation only affects the *allocation of surplus* (which is genuinely
the shipper's to distribute) and the *selection of chains* (where
comparison is subjective anyway).

### 5.4 No cross-agent reputation arbitrage

The per-actor local reputation DB principle means actors can legitimately
disagree. We do not implement a global "blended" or "consensus" score
that tries to reconcile these disagreements. Different actors' different
scores *are* the system; collapsing them into one number destroys the
property that trust is earned directly.

---

## 6. Calibration Strategy

The two tuning parameters (`α`, `γ`) should be validated through:

### 6.1 Simulation

A Monte Carlo simulator running the full event model across synthetic
agent populations, measuring:
- Time to first payout for new agents
- Gini coefficient of reward distribution at stable state
- Fraction of chains won by top-quintile agents
- Recovery time after `ContractBreached`

Target ranges for healthy operation:
- New-agent first payout: ≤ 10 contracts
- Gini at steady state: 0.3–0.5 (moderate inequality)
- Top-quintile chain win rate: 35–55% (meaningful premium, not dominance)
- Breach recovery to pre-breach score: 50–200 contracts

### 6.2 Field observation

Once deployed, monitor:
- Distribution of effective-cost multipliers across actual chains
- Histogram of surplus shares vs. reputation
- Agent retention: do new agents return after their first contract?
- Churn: do agents breach once and leave, or rehabilitate?

Adjust `α`, `γ` based on observation; document changes as protocol
upgrades.

### 6.3 Adversarial testing

Red-team the parameters against:
- Sybil flooding (cheap throwaway identities bidding low)
- Collusion (two agents taking turns endorsing each other)
- Race-to-top (high-rep agents always winning, newcomer starvation)
- Griefing (high-rep agent performs one breach, then stops)

---

## 7. Open Research Questions

1. **Reputation as escrow.** Could agents stake reputation directly
   (pledging a score drop if they fail) to bid on higher-value work?
2. **Reputation auctions.** Could shippers optionally pay a premium for
   guaranteed-reputation pools, creating a second market?
3. **Cross-protocol portability.** The on-chain `AgentReputationAccount`
   could be read by other protocols on Solana. What design invariants are
   needed to make this safe against lock-in?
4. **Decay schedule.** Constant `λ` is simple but ignores the intuition
   that breaches deserve longer memory than successes. An asymmetric
   decay schedule (`λ_pos > λ_neg`) has appealing properties but
   complicates the math.
5. **Group reputation.** When multiple couriers operate under a shared
   operator (e.g. a fleet manager), should reputation apply to the
   operator, the individual agents, or both?

---

## 8. Summary

SwarmHaul's reputation-weighted economics rest on two small, explainable
nudges:

| Mechanism             | Parameter | Default | Max effect |
|-----------------------|-----------|---------|------------|
| Reward surplus split  | `α`       | `0.7`   | ~30% ratio between rep-1.0 and rep-0.0 bonus shares |
| Swarm formation cost  | `γ`       | `0.08`  | ~8% effective cost swing across full reputation range |

Together they produce incentives that are:
- **Measurable:** a rational agent can compute expected value.
- **Bounded:** no nudge dominates cost or capacity.
- **Continuous:** no cliffs, no tiers.
- **Symmetric:** centered on neutral reputation.
- **Reversible:** bad behaviour is punished, rehabilitation is possible.

The model is implemented in
`apps/api/src/services/reputation-engine.ts` and validated by
automated tests. Both parameters are runtime-configurable to allow
per-deployment tuning without protocol changes.
