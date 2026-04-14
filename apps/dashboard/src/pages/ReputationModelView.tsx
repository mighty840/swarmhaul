/**
 * Reputation Model Observatory
 *
 * Renders the SwarmHaul reputation engine's behavior: event taxonomy, projected
 * trajectories for canonical scenarios, gain/loss asymmetry across score
 * levels, self-estimate ceiling, and a live payment-allocation preview.
 *
 * Data comes from /reputation-model/* endpoints so the model lives in one
 * place (apps/api/src/services/reputation-engine.ts) and is shared with
 * future MCP tooling.
 */
import { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// ─── Shapes ──────────────────────────────────────────────────────────

interface EngineConfig {
  baseScore: number;
  firstMeetingCeiling: number;
  gainFactor: number;
  decayLambda: number;
  eventDeltas: Record<string, number>;
}

interface EventRow {
  kind: string;
  delta: number;
  direction: "positive" | "negative";
}

interface ScenarioPoint {
  score: number;
  label: string;
  kind?: string;
}

interface Scenario {
  id: string;
  title: string;
  description: string;
  insight: string;
  points: ScenarioPoint[];
  startingScore: number;
}

interface AsymmetryRow {
  score: number;
  gainPerCompleted: number;
  lossPerBreach: number;
  ratio: number;
}

interface SelfEstimateRow {
  label: string;
  score: number;
}

interface PaymentBreakdown {
  payments: Array<{
    agentPubkey: string;
    bidSol: number;
    reputationScore: number;
    bonusSol: number;
    totalSol: number;
  }>;
  totalBidSol: number;
  maxBudgetSol: number;
  surplusSol: number;
  totalPaidSol: number;
  fairnessFloor: number;
}

// ─── Fetch hook ──────────────────────────────────────────────────────

function useModelData() {
  const [config, setConfig] = useState<EngineConfig | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [asymmetry, setAsymmetry] = useState<AsymmetryRow[]>([]);
  const [selfEstimate, setSelfEstimate] = useState<{
    ceiling: number;
    baseScore: number;
    rows: SelfEstimateRow[];
  } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/reputation-model/config`).then((r) => r.json()),
      fetch(`${API_URL}/reputation-model/events`).then((r) => r.json()),
      fetch(`${API_URL}/reputation-model/scenarios`).then((r) => r.json()),
      fetch(`${API_URL}/reputation-model/asymmetry`).then((r) => r.json()),
      fetch(`${API_URL}/reputation-model/self-estimate`).then((r) => r.json()),
    ])
      .then(([cfg, evts, scs, asym, selfEst]) => {
        setConfig(cfg.config);
        setEvents(evts.events);
        setScenarios(scs.scenarios);
        setAsymmetry(asym.rows);
        setSelfEstimate(selfEst);
      })
      .catch((err) => console.error("[reputation-model] fetch failed", err));
  }, []);

  return { config, events, scenarios, asymmetry, selfEstimate };
}

// ─── Chart primitives ────────────────────────────────────────────────

function TrajectoryChart({
  points,
  width = 560,
  height = 160,
  highlight,
}: {
  points: ScenarioPoint[];
  width?: number;
  height?: number;
  highlight?: number; // index of point to highlight
}) {
  const padding = { top: 10, right: 10, bottom: 20, left: 36 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const n = points.length;

  const x = (i: number) => padding.left + (i / Math.max(1, n - 1)) * chartW;
  const y = (score: number) => padding.top + (1 - score) * chartH;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`)
    .join(" ");

  // Area under the curve
  const areaD =
    pathD +
    ` L ${x(n - 1).toFixed(1)} ${(padding.top + chartH).toFixed(1)}` +
    ` L ${x(0).toFixed(1)} ${(padding.top + chartH).toFixed(1)} Z`;

  // Find breach / fail events to mark
  const markers = points
    .map((p, i) => ({ ...p, i }))
    .filter(
      (p) =>
        p.kind === "ContractBreached" ||
        p.kind === "SignatureFailed" ||
        p.kind === "VcExpired" ||
        p.kind === "VcRevoked",
    );

  return (
    <svg width={width} height={height} className="block">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line
            x1={padding.left}
            x2={padding.left + chartW}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--color-line)"
            strokeWidth={0.5}
          />
          <text
            x={padding.left - 6}
            y={y(v) + 3}
            textAnchor="end"
            fontSize={9}
            fill="var(--color-dim)"
            fontFamily="monospace"
          >
            {v.toFixed(2)}
          </text>
        </g>
      ))}

      {/* Ceiling reference */}
      <line
        x1={padding.left}
        x2={padding.left + chartW}
        y1={y(0.6)}
        y2={y(0.6)}
        stroke="var(--color-amber, #ffb800)"
        strokeWidth={0.5}
        strokeDasharray="2 3"
        opacity={0.5}
      />

      {/* Area fill */}
      <path d={areaD} fill="var(--color-phosphor, #00ff9c)" opacity={0.08} />

      {/* Main line */}
      <path
        d={pathD}
        fill="none"
        stroke="var(--color-phosphor, #00ff9c)"
        strokeWidth={1.5}
      />

      {/* Event markers */}
      {markers.map((m) => (
        <g key={m.i}>
          <circle
            cx={x(m.i)}
            cy={y(m.score)}
            r={3.5}
            fill="var(--color-magenta, #ff2d8a)"
            stroke="var(--color-void, #06060a)"
            strokeWidth={1}
          />
          <line
            x1={x(m.i)}
            x2={x(m.i)}
            y1={y(m.score)}
            y2={padding.top + chartH}
            stroke="var(--color-magenta, #ff2d8a)"
            strokeWidth={0.5}
            strokeDasharray="1 2"
            opacity={0.4}
          />
        </g>
      ))}

      {/* Highlight cursor */}
      {highlight !== undefined && highlight >= 0 && highlight < n && (
        <g>
          <line
            x1={x(highlight)}
            x2={x(highlight)}
            y1={padding.top}
            y2={padding.top + chartH}
            stroke="var(--color-cyan, #00d4ff)"
            strokeWidth={0.5}
            opacity={0.6}
          />
          <circle
            cx={x(highlight)}
            cy={y(points[highlight].score)}
            r={4}
            fill="var(--color-cyan, #00d4ff)"
          />
        </g>
      )}

      {/* X axis */}
      <line
        x1={padding.left}
        x2={padding.left + chartW}
        y1={padding.top + chartH}
        y2={padding.top + chartH}
        stroke="var(--color-line)"
      />
    </svg>
  );
}

function BarRow({ label, value, max, color = "var(--color-phosphor, #00ff9c)" }: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="text-[10px] tracking-[0.1em] text-[var(--color-dim)] w-48 truncate">
        {label}
      </div>
      <div className="flex-1 h-2 bg-[var(--color-line)] relative">
        <div
          className="absolute top-0 left-0 h-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="text-[10px] tabular-nums text-[var(--color-bone)] w-14 text-right">
        {value.toFixed(3)}
      </div>
    </div>
  );
}

// ─── Payment Allocation Simulator ────────────────────────────────────

interface SimAgent {
  name: string;
  bidSol: number;
  reputationScore: number;
}

function PaymentAllocationSimulator() {
  const [budget, setBudget] = useState(0.6);
  const [fairnessFloor, setFairnessFloor] = useState(0.7);
  const [agents, setAgents] = useState<SimAgent[]>([
    { name: "Veteran (0.9)", bidSol: 0.1, reputationScore: 0.9 },
    { name: "Regular (0.6)", bidSol: 0.1, reputationScore: 0.6 },
    { name: "Newcomer (0.3)", bidSol: 0.1, reputationScore: 0.3 },
  ]);
  const [result, setResult] = useState<PaymentBreakdown | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/reputation-model/allocate-payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bids: agents.map((a, i) => ({ agentPubkey: `sim-${i}`, bidSol: a.bidSol })),
        reputationScores: Object.fromEntries(
          agents.map((a, i) => [`sim-${i}`, a.reputationScore]),
        ),
        maxBudgetSol: budget,
        fairnessFloor,
      }),
    })
      .then((r) => r.json())
      .then(setResult)
      .catch(() => {});
  }, [agents, budget, fairnessFloor]);

  const updateAgent = (i: number, patch: Partial<SimAgent>) => {
    setAgents((prev) => prev.map((a, j) => (i === j ? { ...a, ...patch } : a)));
  };

  const maxPayment = result
    ? Math.max(...result.payments.map((p) => p.totalSol), budget)
    : budget;

  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-graphite)] p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-[10px] tracking-[0.18em] uppercase text-[var(--color-ash)]">
            REWARD DISTRIBUTION ▸ SIMULATOR
          </div>
          <div className="editorial text-[12px] text-[var(--color-dim)] mt-0.5">
            /surplus split by softened weight:{" "}
            <span className="font-mono">w_i = α + (1−α) × rep_i</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-[10px] tracking-[0.1em] text-[var(--color-dim)]">
              α (FAIRNESS FLOOR)
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={fairnessFloor}
              onChange={(e) => setFairnessFloor(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-[11px] tabular-nums text-[var(--color-phosphor,#00ff9c)] w-10">
              {fairnessFloor.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] tracking-[0.1em] text-[var(--color-dim)]">
              BUDGET
            </label>
            <input
              type="number"
              step="0.05"
              min="0"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="bg-[var(--color-void,#06060a)] border border-[var(--color-line)] px-2 py-1 text-[11px] tabular-nums text-[var(--color-bone)] w-20 font-mono"
            />
            <span className="text-[10px] text-[var(--color-dim)]">SOL</span>
          </div>
        </div>
      </div>

      <table className="w-full text-[10px] mb-4">
        <thead>
          <tr className="text-[var(--color-dim)] tracking-[0.1em]">
            <th className="text-left font-normal pb-2">AGENT</th>
            <th className="text-right font-normal pb-2">BID (SOL)</th>
            <th className="text-right font-normal pb-2">REP</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a, i) => (
            <tr key={i} className="border-t border-[var(--color-line)]">
              <td className="py-2 text-[var(--color-bone)]">{a.name}</td>
              <td className="py-2 text-right">
                <input
                  type="number"
                  step="0.01"
                  value={a.bidSol}
                  onChange={(e) => updateAgent(i, { bidSol: Number(e.target.value) })}
                  className="bg-transparent border border-[var(--color-line)] px-2 py-0.5 text-right tabular-nums w-20"
                />
              </td>
              <td className="py-2 text-right">
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={a.reputationScore}
                  onChange={(e) =>
                    updateAgent(i, { reputationScore: Number(e.target.value) })
                  }
                  className="bg-transparent border border-[var(--color-line)] px-2 py-0.5 text-right tabular-nums w-20"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {result && (
        <div>
          <div className="grid grid-cols-4 gap-2 mb-3 text-[10px]">
            <div>
              <div className="text-[var(--color-dim)] tracking-[0.1em]">BIDS SUM</div>
              <div className="text-[var(--color-bone)] tabular-nums">
                {result.totalBidSol.toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-[var(--color-dim)] tracking-[0.1em]">SURPLUS</div>
              <div className="text-[var(--color-amber,#ffb800)] tabular-nums">
                {result.surplusSol.toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-[var(--color-dim)] tracking-[0.1em]">PAID OUT</div>
              <div className="text-[var(--color-phosphor,#00ff9c)] tabular-nums">
                {result.totalPaidSol.toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-[var(--color-dim)] tracking-[0.1em]">BUDGET</div>
              <div className="text-[var(--color-bone)] tabular-nums">
                {result.maxBudgetSol.toFixed(3)}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            {result.payments.map((p, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-[10px] mb-0.5">
                  <span className="text-[var(--color-bone)]">{agents[i]?.name}</span>
                  <span className="tabular-nums text-[var(--color-phosphor,#00ff9c)]">
                    {p.totalSol.toFixed(4)} = {p.bidSol.toFixed(3)} + {p.bonusSol.toFixed(4)} bonus
                  </span>
                </div>
                <div className="flex h-2 border border-[var(--color-line)]">
                  <div
                    style={{
                      width: `${(p.bidSol / maxPayment) * 100}%`,
                      background: "var(--color-cyan, #00d4ff)",
                    }}
                  />
                  <div
                    style={{
                      width: `${(p.bonusSol / maxPayment) * 100}%`,
                      background: "var(--color-phosphor, #00ff9c)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 text-[9px] tracking-[0.1em] text-[var(--color-dim)]">
            <span className="inline-block w-2 h-2 bg-[var(--color-cyan,#00d4ff)] mr-1" />
            BASE BID
            <span className="inline-block w-2 h-2 bg-[var(--color-phosphor,#00ff9c)] ml-4 mr-1" />
            REPUTATION BONUS
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Formation Nudge Explainer ───────────────────────────────────────

function FormationNudgePanel() {
  const [gamma, setGamma] = useState(0.08);
  const [rawCost, setRawCost] = useState(1.0);

  const reps = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0];
  const rows = reps.map((r) => ({
    rep: r,
    effective: rawCost * (1 - gamma * (r - 0.5)),
    pct: (1 - gamma * (r - 0.5) - 1) * 100,
  }));
  const minE = Math.min(...rows.map((r) => r.effective));
  const maxE = Math.max(...rows.map((r) => r.effective));

  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-graphite)] p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="text-[10px] tracking-[0.18em] uppercase text-[var(--color-ash)]">
            SWARM FORMATION ▸ NUDGE
          </div>
          <div className="editorial text-[12px] text-[var(--color-dim)] mt-0.5">
            /effective cost for chain comparison:{" "}
            <span className="font-mono">c_eff = c_raw × (1 − γ × (r̄ − 0.5))</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-[10px] tracking-[0.1em] text-[var(--color-dim)]">
              γ (NUDGE STRENGTH)
            </label>
            <input
              type="range"
              min="0"
              max="0.2"
              step="0.01"
              value={gamma}
              onChange={(e) => setGamma(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-[11px] tabular-nums text-[var(--color-cyan,#00d4ff)] w-12">
              {gamma.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] tracking-[0.1em] text-[var(--color-dim)]">
              RAW COST
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={rawCost}
              onChange={(e) => setRawCost(Number(e.target.value))}
              className="bg-[var(--color-void,#06060a)] border border-[var(--color-line)] px-2 py-1 text-[11px] tabular-nums text-[var(--color-bone)] w-20 font-mono"
            />
            <span className="text-[10px] text-[var(--color-dim)]">SOL</span>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        {rows.map((r) => {
          const width = ((r.effective - minE) / Math.max(maxE - minE, 1e-9)) * 100;
          return (
            <div key={r.rep} className="flex items-center gap-3 text-[10px]">
              <div className="tabular-nums text-[var(--color-dim)] w-24">
                avg rep = {r.rep.toFixed(1)}
              </div>
              <div className="flex-1 relative h-4 bg-[var(--color-void,#06060a)] border border-[var(--color-line)]">
                <div
                  className="absolute top-0 h-full"
                  style={{
                    width: `${100 - width}%`,
                    left: 0,
                    background:
                      r.rep >= 0.5
                        ? "var(--color-phosphor, #00ff9c)"
                        : "var(--color-magenta, #ff2d8a)",
                    opacity: 0.5,
                  }}
                />
              </div>
              <div className="tabular-nums w-24 text-right text-[var(--color-bone)]">
                {r.effective.toFixed(4)} SOL
              </div>
              <div
                className={`tabular-nums w-16 text-right ${
                  r.pct < 0
                    ? "text-[var(--color-phosphor,#00ff9c)]"
                    : r.pct > 0
                      ? "text-[var(--color-magenta,#ff2d8a)]"
                      : "text-[var(--color-dim)]"
                }`}
              >
                {r.pct >= 0 ? "+" : ""}
                {r.pct.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-[var(--color-line)] text-[11px] editorial text-[var(--color-ash)]">
        Total swing across the full reputation range: max{" "}
        <span className="text-[var(--color-bone)] tabular-nums">
          {(gamma * 100).toFixed(1)}%
        </span>{" "}
        of raw cost. Cost remains dominant — a meaningfully cheaper chain of
        low-rep agents still wins.
      </div>
    </div>
  );
}

// ─── Main view ───────────────────────────────────────────────────────

export function ReputationModelView() {
  const { config, events, scenarios, asymmetry, selfEstimate } = useModelData();
  const [activeScenario, setActiveScenario] = useState<string>("good-citizen");

  const currentScenario = useMemo(
    () => scenarios.find((s) => s.id === activeScenario),
    [scenarios, activeScenario],
  );

  if (!config) {
    return (
      <div className="text-[var(--color-dim)] text-[11px] tracking-[0.1em] uppercase p-8">
        Loading reputation model…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border border-[var(--color-line)] bg-[var(--color-graphite)] p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-[var(--color-phosphor,#00ff9c)]">
              RFB-01 ▸ REPUTATION MODEL
            </div>
            <div className="editorial text-[22px] text-[var(--color-bone)] mt-1">
              SwarmHaul Reputation Engine
            </div>
            <div className="editorial text-[13px] text-[var(--color-ash)] mt-0.5 max-w-3xl">
              /peer-to-peer scoring with skewed ramps — gaining is hard, losing is fast.
              Reputation nudges both swarm formation and reward distribution
              with small, bounded, auditable effects.
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-right">
            <div>
              <div className="text-[9px] tracking-[0.15em] text-[var(--color-dim)]">BASE</div>
              <div className="text-[18px] tabular-nums text-[var(--color-bone)]">
                {config.baseScore.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[9px] tracking-[0.15em] text-[var(--color-dim)]">CEILING</div>
              <div className="text-[18px] tabular-nums text-[var(--color-amber,#ffb800)]">
                {config.firstMeetingCeiling.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[9px] tracking-[0.15em] text-[var(--color-dim)]">GAIN FACTOR</div>
              <div className="text-[18px] tabular-nums text-[var(--color-bone)]">
                {config.gainFactor.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: scenarios + event taxonomy */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Scenarios */}
        <div className="lg:col-span-2 border border-[var(--color-line)] bg-[var(--color-graphite)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[10px] tracking-[0.18em] uppercase text-[var(--color-ash)]">
                SCENARIO PROJECTION
              </div>
              <div className="editorial text-[12px] text-[var(--color-dim)] mt-0.5">
                /trajectories replayed from the event log
              </div>
            </div>
            <div className="flex gap-1">
              {scenarios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveScenario(s.id)}
                  className={`px-2.5 py-1 text-[9px] tracking-[0.15em] uppercase border ${
                    activeScenario === s.id
                      ? "border-[var(--color-phosphor,#00ff9c)] text-[var(--color-phosphor,#00ff9c)]"
                      : "border-[var(--color-line)] text-[var(--color-dim)] hover:text-[var(--color-bone)]"
                  }`}
                >
                  {s.id.replace(/-/g, " ")}
                </button>
              ))}
            </div>
          </div>

          {currentScenario && (
            <div>
              <div className="mb-3">
                <div className="text-[13px] text-[var(--color-bone)] mb-1">
                  {currentScenario.title}
                </div>
                <div className="text-[11px] text-[var(--color-ash)] editorial">
                  {currentScenario.description}
                </div>
              </div>

              <div className="bg-[var(--color-void,#06060a)] border border-[var(--color-line)] p-2">
                <TrajectoryChart points={currentScenario.points} width={560} height={180} />
              </div>

              <div className="grid grid-cols-3 gap-3 mt-3 text-[10px]">
                <div>
                  <div className="text-[var(--color-dim)] tracking-[0.1em]">START</div>
                  <div className="text-[var(--color-bone)] tabular-nums text-[14px]">
                    {currentScenario.points[0]?.score.toFixed(3)}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--color-dim)] tracking-[0.1em]">PEAK</div>
                  <div className="text-[var(--color-phosphor,#00ff9c)] tabular-nums text-[14px]">
                    {Math.max(...currentScenario.points.map((p) => p.score)).toFixed(3)}
                  </div>
                </div>
                <div>
                  <div className="text-[var(--color-dim)] tracking-[0.1em]">FINAL</div>
                  <div className="text-[var(--color-bone)] tabular-nums text-[14px]">
                    {currentScenario.points[currentScenario.points.length - 1]?.score.toFixed(3)}
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-[var(--color-line)]">
                <div className="text-[9px] tracking-[0.18em] uppercase text-[var(--color-dim)] mb-1">
                  INSIGHT
                </div>
                <div className="text-[11px] editorial text-[var(--color-ash)]">
                  {currentScenario.insight}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Event taxonomy */}
        <div className="border border-[var(--color-line)] bg-[var(--color-graphite)] p-4">
          <div className="text-[10px] tracking-[0.18em] uppercase text-[var(--color-ash)] mb-1">
            EVENT TAXONOMY
          </div>
          <div className="editorial text-[12px] text-[var(--color-dim)] mb-4">
            /signed deltas applied to the score
          </div>

          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.kind} className="flex items-center justify-between text-[10px]">
                <span
                  className={
                    e.direction === "positive"
                      ? "text-[var(--color-phosphor,#00ff9c)]"
                      : "text-[var(--color-magenta,#ff2d8a)]"
                  }
                >
                  {e.direction === "positive" ? "▲" : "▼"} {e.kind}
                </span>
                <span className="tabular-nums text-[var(--color-bone)]">
                  {e.delta > 0 ? "+" : ""}
                  {e.delta.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Asymmetry + Self-estimate */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Asymmetry */}
        <div className="border border-[var(--color-line)] bg-[var(--color-graphite)] p-4">
          <div className="text-[10px] tracking-[0.18em] uppercase text-[var(--color-ash)] mb-1">
            GAIN vs LOSS ASYMMETRY
          </div>
          <div className="editorial text-[12px] text-[var(--color-dim)] mb-4">
            /how much harder it is to gain than to lose, at each score level
          </div>

          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-[var(--color-dim)] tracking-[0.1em]">
                <th className="text-left font-normal pb-2">SCORE</th>
                <th className="text-right font-normal pb-2">+ GAIN</th>
                <th className="text-right font-normal pb-2">− LOSS</th>
                <th className="text-right font-normal pb-2">RATIO</th>
              </tr>
            </thead>
            <tbody>
              {asymmetry.map((r) => (
                <tr key={r.score} className="border-t border-[var(--color-line)]">
                  <td className="py-2 text-[var(--color-bone)] tabular-nums">
                    {r.score.toFixed(2)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-[var(--color-phosphor,#00ff9c)]">
                    +{r.gainPerCompleted.toFixed(4)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-[var(--color-magenta,#ff2d8a)]">
                    −{r.lossPerBreach.toFixed(4)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-[var(--color-amber,#ffb800)]">
                    {r.ratio.toFixed(0)}×
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 text-[11px] editorial text-[var(--color-ash)]">
            At score 0.9, a single breach costs what 320 successful deliveries would build.
            Sybil-resistant by construction.
          </div>
        </div>

        {/* Self-estimate */}
        {selfEstimate && (
          <div className="border border-[var(--color-line)] bg-[var(--color-graphite)] p-4">
            <div className="text-[10px] tracking-[0.18em] uppercase text-[var(--color-ash)] mb-1">
              FIRST-MEETING SELF-ESTIMATE
            </div>
            <div className="editorial text-[12px] text-[var(--color-dim)] mb-4">
              /score assigned to unknown actors — hard cap at {selfEstimate.ceiling.toFixed(2)}
            </div>

            <div className="space-y-2">
              {selfEstimate.rows.map((r, i) => (
                <BarRow
                  key={i}
                  label={r.label}
                  value={r.score}
                  max={1}
                  color={
                    r.score >= selfEstimate.ceiling - 0.001
                      ? "var(--color-amber, #ffb800)"
                      : "var(--color-cyan, #00d4ff)"
                  }
                />
              ))}
            </div>

            <div className="mt-3 text-[11px] editorial text-[var(--color-ash)]">
              No amount of credentials or referrals bypasses direct observation —
              reputation must be earned, not imported.
            </div>
          </div>
        )}
      </div>

      {/* Formation nudge explainer */}
      <FormationNudgePanel />

      {/* Payment allocation simulator */}
      <PaymentAllocationSimulator />

      {/* Footer note */}
      <div className="text-[10px] tracking-[0.12em] uppercase text-[var(--color-dim)] px-2">
        MODEL LIVES AT apps/api/src/services/reputation-engine.ts ▸ SOURCED FROM /reputation-model/*
      </div>
    </div>
  );
}
