/**
 * SwarmHaul reputation projection tool.
 *
 * Runs five canonical scenarios from docs/reference/reputation-system.md
 * and prints the score trajectories as ASCII charts.
 *
 * Run: bunx tsx scripts/reputation-projection.ts
 */

import {
  applyEvent,
  trajectory,
  selfEstimate,
  summarize,
  DEFAULT_CONFIG,
  type ReputationEvent,
  type EventKind,
} from "../apps/api/src/services/reputation-engine.js";

// ─── Drawing helpers ─────────────────────────────────────────────────

function sparkline(values: number[], width = 60, height = 12): string {
  if (values.length === 0) return "";
  const min = 0;
  const max = 1;
  const lines: string[][] = Array.from({ length: height }, () => Array(width).fill(" "));

  // Sample values evenly across width
  for (let x = 0; x < width; x++) {
    const idx = Math.floor((x / (width - 1)) * (values.length - 1));
    const v = values[idx];
    const y = Math.floor(((v - min) / (max - min)) * (height - 1));
    const row = height - 1 - y;
    if (row >= 0 && row < height) lines[row][x] = "█";
  }

  // Axis markers at 1.0, 0.5, 0.0
  return lines
    .map((line, i) => {
      let label = "     ";
      if (i === 0) label = "1.00 ";
      else if (i === Math.floor(height / 2)) label = "0.50 ";
      else if (i === height - 1) label = "0.00 ";
      return label + "│" + line.join("");
    })
    .join("\n");
}

function bar(score: number, width = 40): string {
  const filled = Math.round(score * width);
  return "[" + "█".repeat(filled) + "░".repeat(width - filled) + "]";
}

function header(title: string) {
  console.log("\n" + "━".repeat(80));
  console.log("  " + title);
  console.log("━".repeat(80));
}

function event(kind: EventKind, t = 0): ReputationEvent {
  return { kind, timestamp: t };
}

// ─── Scenario 1 — Good citizen ───────────────────────────────────────

function goodCitizen() {
  header("Scenario 1 — Good Citizen: 200 successful contracts in a row");

  const events: ReputationEvent[] = [];
  for (let i = 0; i < 200; i++) events.push(event("ContractCompleted", i));

  const traj = trajectory(0.3, events);
  const summary = summarize(0.3, events);

  console.log(sparkline(traj));
  console.log();
  console.log(`  Starting:  ${bar(0.3)} 0.300`);
  console.log(`  After 50:  ${bar(traj[50])} ${traj[50].toFixed(3)}`);
  console.log(`  After 100: ${bar(traj[100])} ${traj[100].toFixed(3)}`);
  console.log(`  After 200: ${bar(traj[200])} ${traj[200].toFixed(3)}`);
  console.log(`  Successes: ${summary.successfulCount}, Failures: ${summary.failedCount}`);
  console.log(`  Insight:   diminishing returns — first 50 matter more than the last 150`);
}

// ─── Scenario 2 — Good citizen burns out (§6.2) ──────────────────────

function goodCitizenBurnout() {
  header("Scenario 2 — Burned Out: reliable courier whose key is compromised");

  // 6 months of reliable work → ~0.87
  const events: ReputationEvent[] = [];
  for (let i = 0; i < 180; i++) events.push(event("ContractCompleted", i));

  // Key compromise → SignatureFailed
  events.push(event("SignatureFailed", 180));

  // Recovery: 30 days of clean deliveries
  for (let i = 0; i < 30; i++) events.push(event("ContractCompleted", 181 + i));

  const traj = trajectory(0.3, events);

  console.log(sparkline(traj));
  console.log();
  console.log(`  Peak before fail:   ${bar(traj[180])} ${traj[180].toFixed(3)}`);
  console.log(`  After SignatureFailed: ${bar(traj[181])} ${traj[181].toFixed(3)}  (drop of ${(traj[180] - traj[181]).toFixed(3)})`);
  console.log(`  30 days later:      ${bar(traj[211])} ${traj[211].toFixed(3)}`);
  console.log(`  Insight:            recovery is possible but not free — one bad event costs a month`);
}

// ─── Scenario 3 — Contract breach (catastrophic) ─────────────────────

function contractBreach() {
  header("Scenario 3 — Catastrophic Breach: high-rep actor commits fraud");

  const events: ReputationEvent[] = [];
  for (let i = 0; i < 500; i++) events.push(event("ContractCompleted", i));
  events.push(event("ContractBreached", 500));
  // Rebuild attempt
  for (let i = 0; i < 200; i++) events.push(event("ContractCompleted", 501 + i));

  const traj = trajectory(0.3, events);

  console.log(sparkline(traj));
  console.log();
  console.log(`  Peak (500 good):     ${bar(traj[500])} ${traj[500].toFixed(3)}`);
  console.log(`  After breach:        ${bar(traj[501])} ${traj[501].toFixed(3)}`);
  console.log(`  After 200 rebuilds:  ${bar(traj[701])} ${traj[701].toFixed(3)}`);
  console.log(`  Insight:             one breach wipes out years — rebuild path is long`);
}

// ─── Scenario 4 — Sybil attack (§6.1) ────────────────────────────────

function sybilAttack() {
  header("Scenario 4 — Sybil Attack: 1000 fresh identities");

  const freshScores: number[] = [];
  for (let i = 0; i < 1000; i++) {
    freshScores.push(selfEstimate({ didResolves: false, validVcs: 0, referrals: [] }));
  }

  const avg = freshScores.reduce((a, b) => a + b, 0) / freshScores.length;
  const max = Math.max(...freshScores);
  const min = Math.min(...freshScores);

  console.log(`  Count:      ${freshScores.length}`);
  console.log(`  Avg score:  ${bar(avg)} ${avg.toFixed(3)}`);
  console.log(`  Max:        ${bar(max)} ${max.toFixed(3)}`);
  console.log(`  Min:        ${bar(min)} ${min.toFixed(3)}`);
  console.log(`  First-meeting ceiling: ${DEFAULT_CONFIG.firstMeetingCeiling}`);
  console.log(`  Insight:    all 1000 identities land at baseScore 0.3 — attack buys nothing`);
}

// ─── Scenario 5 — Transitive trust (§6.4) ────────────────────────────

function transitiveTrust() {
  header("Scenario 5 — Transitive Trust: referrals from known actors");

  const levels = [
    { label: "No signals", signals: { didResolves: false, validVcs: 0, referrals: [] } },
    { label: "DID only", signals: { didResolves: true, validVcs: 0, referrals: [] } },
    { label: "DID + 1 VC", signals: { didResolves: true, validVcs: 1, referrals: [] } },
    {
      label: "1 trusted referrer (score 0.78)",
      signals: { didResolves: false, validVcs: 0, referrals: [{ referrerScore: 0.78 }] },
    },
    {
      label: "Full profile (DID + 3 VCs + 3 referrals @ 0.9)",
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
      label: "Absurd profile (100 VCs + 100 max referrals)",
      signals: {
        didResolves: true,
        validVcs: 100,
        referrals: Array.from({ length: 100 }, () => ({ referrerScore: 1 })),
      },
    },
  ];

  for (const l of levels) {
    const s = selfEstimate(l.signals);
    console.log(`  ${l.label.padEnd(48)} ${bar(s, 30)} ${s.toFixed(3)}`);
  }
  console.log(`  Insight: no matter how many credentials, ceiling is ${DEFAULT_CONFIG.firstMeetingCeiling} — earn trust directly`);
}

// ─── Scenario 6 — Gain/loss asymmetry visualization ──────────────────

function asymmetryVisualization() {
  header("Scenario 6 — Gain/Loss Asymmetry Across Score Levels");

  console.log(`                       gain per ContractCompleted    loss per ContractBreached`);
  for (const s of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const gain = applyEvent(s, event("ContractCompleted")) - s;
    const loss = s - applyEvent(s, event("ContractBreached"));
    const ratio = loss / gain;
    console.log(
      `  at score ${s.toFixed(2)}         +${gain.toFixed(4)} ${bar(gain * 20, 20)}  -${loss.toFixed(4)} ${bar(loss, 20)}  (${ratio.toFixed(0)}× harder to gain)`,
    );
  }
  console.log(`  Insight: at every score, losing is ~50-700× faster than gaining`);
}

// ─── Scenario 7 — SwarmHaul courier lifecycle simulation ─────────────

function swarmhaulCourierLifecycle() {
  header("Scenario 7 — SwarmHaul Courier: 100-day simulated lifecycle");

  // Realistic courier: mostly good, occasional 500s, one expired VC, one serious fail
  const events: ReputationEvent[] = [];
  let day = 0;

  // Days 1-30: rookie, lots of completions + some API errors
  for (let i = 0; i < 30; i++) {
    events.push(event("ContractCompleted", day++));
    if (i % 7 === 0) events.push(event("ApiCall500", day));
  }

  // Day 31: presents expired VC
  events.push(event("VcExpired", day++));

  // Days 32-60: recovery, more completions
  for (let i = 0; i < 28; i++) {
    events.push(event("ContractCompleted", day++));
    if (i % 10 === 0) events.push(event("SignatureVerified", day));
  }

  // Day 61: serious issue — signature failed
  events.push(event("SignatureFailed", day++));

  // Days 62-100: rebuild
  for (let i = 0; i < 39; i++) {
    events.push(event("ContractCompleted", day++));
  }

  const traj = trajectory(0.3, events);
  const summary = summarize(0.3, events);

  console.log(sparkline(traj, 70, 14));
  console.log();
  console.log(`  Total events:        ${summary.interactionCount}`);
  console.log(`  Successes/Failures:  ${summary.successfulCount} / ${summary.failedCount}`);
  console.log(`  Final score:         ${bar(summary.score)} ${summary.score.toFixed(3)}`);
  console.log(`  Insight:             realistic agent builds steady score with visible scars`);
}

// ─── Main ────────────────────────────────────────────────────────────

console.log("\n  SwarmHaul Reputation Engine — Projection");
console.log(`  Config: gainFactor=${DEFAULT_CONFIG.gainFactor}, base=${DEFAULT_CONFIG.baseScore}, ceiling=${DEFAULT_CONFIG.firstMeetingCeiling}`);

goodCitizen();
goodCitizenBurnout();
contractBreach();
sybilAttack();
transitiveTrust();
asymmetryVisualization();
swarmhaulCourierLifecycle();

console.log("\n");
