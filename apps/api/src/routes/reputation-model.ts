/**
 * Reputation model introspection endpoints.
 *
 * Serves the config, event deltas, scenario projections, and payment
 * allocation previews. Consumed by:
 *   - Dashboard (ReputationModelView)
 *   - Future MCP tool (planned)
 *
 * Keeps the model derivable in one place — no divergence between UI,
 * docs, and the production scorer.
 */
import type { FastifyInstance } from "fastify";
import {
  DEFAULT_CONFIG,
  applyEvent,
  trajectory,
  selfEstimate,
  summarize,
  allocateReputationWeightedPayments,
  type ReputationEvent,
  type EventKind,
} from "../services/reputation-engine.js";

type ScenarioPoint = { score: number; label: string; kind?: EventKind };

interface Scenario {
  id: string;
  title: string;
  description: string;
  insight: string;
  points: ScenarioPoint[];
  startingScore: number;
}

function buildScenarios(): Scenario[] {
  const good = (n: number) =>
    Array.from({ length: n }, (_, i): ReputationEvent => ({
      kind: "ContractCompleted",
      timestamp: i,
    }));

  // 1 — Good citizen
  const goodCitizen = (() => {
    const events = good(200);
    const t = trajectory(0.3, events);
    return {
      id: "good-citizen",
      title: "Good Citizen",
      description: "200 consecutive successful contracts",
      insight: "Diminishing returns — first 50 contracts matter more than the last 150.",
      startingScore: 0.3,
      points: t.map((score, i) => ({ score, label: i === 0 ? "start" : `+${i}` })),
    };
  })();

  // 2 — Burnout
  const burnout = (() => {
    const events: ReputationEvent[] = [
      ...good(180),
      { kind: "SignatureFailed" as const, timestamp: 180 },
      ...Array.from({ length: 30 }, (_, i): ReputationEvent => ({
        kind: "ContractCompleted",
        timestamp: 181 + i,
      })),
    ];
    const t = trajectory(0.3, events);
    return {
      id: "burnout",
      title: "Good Citizen Burns Out",
      description: "Reliable courier's key is compromised; recovery follows.",
      insight: "One bad event undoes roughly a month of clean work.",
      startingScore: 0.3,
      points: t.map((score, i) => ({
        score,
        label: i === 0 ? "start" : i <= 180 ? `day ${i}` : i === 181 ? "BREACH" : `day ${i - 1}`,
        kind: i === 181 ? "SignatureFailed" : undefined,
      })),
    };
  })();

  // 3 — Catastrophic breach
  const breach = (() => {
    const events: ReputationEvent[] = [
      ...good(500),
      { kind: "ContractBreached" as const, timestamp: 500 },
      ...Array.from({ length: 200 }, (_, i): ReputationEvent => ({
        kind: "ContractCompleted",
        timestamp: 501 + i,
      })),
    ];
    const t = trajectory(0.3, events);
    return {
      id: "breach",
      title: "Catastrophic Breach",
      description: "500 successful contracts → fraud → attempted rebuild.",
      insight: "A single breach wipes out years of accumulated trust.",
      startingScore: 0.3,
      points: t.map((score, i) => ({
        score,
        label: i === 501 ? "BREACH" : `event ${i}`,
        kind: i === 501 ? "ContractBreached" : undefined,
      })),
    };
  })();

  // 4 — Realistic lifecycle
  const lifecycle = (() => {
    const events: ReputationEvent[] = [];
    let day = 0;
    for (let i = 0; i < 30; i++) {
      events.push({ kind: "ContractCompleted", timestamp: day++ });
      if (i % 7 === 0) events.push({ kind: "ApiCall500", timestamp: day });
    }
    events.push({ kind: "VcExpired", timestamp: day++ });
    for (let i = 0; i < 28; i++) {
      events.push({ kind: "ContractCompleted", timestamp: day++ });
      if (i % 10 === 0) events.push({ kind: "SignatureVerified", timestamp: day });
    }
    events.push({ kind: "SignatureFailed", timestamp: day++ });
    for (let i = 0; i < 39; i++) {
      events.push({ kind: "ContractCompleted", timestamp: day++ });
    }
    const t = trajectory(0.3, events);
    return {
      id: "lifecycle",
      title: "Realistic Courier Lifecycle",
      description: "Mixed daily operations over ~100 days: successes, failures, recoveries.",
      insight: "Real agents show scars — the model rewards long-term consistency.",
      startingScore: 0.3,
      points: t.map((score, i) => ({
        score,
        label: `t${i}`,
        kind: i > 0 ? events[i - 1].kind : undefined,
      })),
    };
  })();

  return [goodCitizen, burnout, breach, lifecycle];
}

export async function reputationModelRoutes(app: FastifyInstance) {
  // Static snapshot of config — LLMs / UI can display the rules
  app.get("/config", async () => ({
    config: DEFAULT_CONFIG,
    description:
      "SwarmHaul reputation model. Positive events use diminishing returns toward 1.0; negative events apply linearly with floor at 0. First-meeting self-estimate caps at firstMeetingCeiling regardless of signals.",
  }));

  // Event taxonomy as a nicely-shaped list
  app.get("/events", async () => ({
    events: Object.entries(DEFAULT_CONFIG.eventDeltas).map(([kind, delta]) => ({
      kind,
      delta,
      direction: delta >= 0 ? "positive" : "negative",
    })),
  }));

  // Projected scenarios — the trajectories the dashboard renders
  app.get("/scenarios", async () => ({
    scenarios: buildScenarios(),
  }));

  // Asymmetry at several score levels — powers the "risk" visualization
  app.get("/asymmetry", async () => {
    const levels = [0.1, 0.3, 0.5, 0.7, 0.9];
    const rows = levels.map((start) => {
      const gain = applyEvent(start, { kind: "ContractCompleted", timestamp: 0 }) - start;
      const loss = start - applyEvent(start, { kind: "ContractBreached", timestamp: 0 });
      return {
        score: start,
        gainPerCompleted: gain,
        lossPerBreach: loss,
        ratio: gain > 0 ? loss / gain : Infinity,
      };
    });
    return { rows };
  });

  // Self-estimate sweep — shows the ceiling
  app.get("/self-estimate", async () => {
    const scenarios = [
      { label: "No signals", signals: { didResolves: false, validVcs: 0, referrals: [] } },
      { label: "DID only", signals: { didResolves: true, validVcs: 0, referrals: [] } },
      { label: "DID + 1 VC", signals: { didResolves: true, validVcs: 1, referrals: [] } },
      {
        label: "1 trusted referrer (0.78)",
        signals: { didResolves: false, validVcs: 0, referrals: [{ referrerScore: 0.78 }] },
      },
      {
        label: "Full profile (3 VCs + 3 referrers)",
        signals: {
          didResolves: true,
          validVcs: 3,
          referrals: [
            { referrerScore: 0.9 },
            { referrerScore: 0.9 },
            { referrerScore: 0.9 },
          ],
        },
      },
      {
        label: "Saturated (100 VCs + 100 referrers)",
        signals: {
          didResolves: true,
          validVcs: 100,
          referrals: Array.from({ length: 100 }, () => ({ referrerScore: 1 })),
        },
      },
    ];
    return {
      ceiling: DEFAULT_CONFIG.firstMeetingCeiling,
      baseScore: DEFAULT_CONFIG.baseScore,
      rows: scenarios.map((s) => ({ label: s.label, score: selfEstimate(s.signals) })),
    };
  });

  // Preview payment allocation for a hypothetical swarm
  // Body: { bids, reputationScores?, maxBudgetSol, fairnessFloor? }
  app.post("/allocate-payments", async (req) => {
    const body = req.body as {
      bids: Array<{ agentPubkey: string; bidSol: number }>;
      reputationScores?: Record<string, number>;
      maxBudgetSol: number;
      fairnessFloor?: number;
    };
    const repMap = new Map(Object.entries(body.reputationScores ?? {}));
    return allocateReputationWeightedPayments(
      body.bids,
      repMap,
      body.maxBudgetSol,
      { fairnessFloor: body.fairnessFloor },
    );
  });
}
