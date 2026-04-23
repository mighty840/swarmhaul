import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import type { DigitalTask, DigitalLeg, WSEvent } from "@swarmhaul/types";
import { Panel } from "../components/Panel.js";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const LEG_COLORS = [
  "var(--color-phosphor)",
  "var(--color-magenta)",
  "var(--color-cyan)",
  "var(--color-amber)",
  "var(--color-bone)",
];

const STATUS_COLOR: Record<string, string> = {
  listed:      "var(--color-cyan)",
  in_progress: "var(--color-amber)",
  completed:   "var(--color-phosphor)",
  failed:      "var(--color-blood)",
  open:        "var(--color-steel)",
  assigned:    "var(--color-cyan)",
};

function shortenPubkey(pk: string): string {
  return pk.length <= 12 ? pk : `${pk.slice(0, 6)}··${pk.slice(-4)}`;
}

function timeAgo(d: string | Date): string {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? "var(--color-ash)";
  return (
    <span className="status-pill" style={{ color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
      {status.replace(/_/g, " ")}
    </span>
  );
}

// Horizontal lifecycle strip — mirrors the physical swarm lifecycle bar
function LifecycleStrip({ task }: { task: DigitalTask }) {
  type Phase = { label: string; reached: boolean; current: boolean };
  const phases: Phase[] = [
    {
      label: "LISTED",
      reached: true,
      current: task.status === "listed",
    },
    {
      label: "SWARM FORMING",
      reached: task.status !== "listed",
      current: task.status === "in_progress" && task.legs.some((l) => l.status === "open"),
    },
    {
      label: "IN PROGRESS",
      reached: task.status === "in_progress" || task.status === "completed",
      current: task.status === "in_progress" && task.legs.every((l) => l.status !== "open"),
    },
    {
      label: "COMPLETED",
      reached: task.status === "completed",
      current: task.status === "completed",
    },
  ];

  return (
    <div className="flex items-center gap-0 w-full overflow-x-auto">
      {phases.map((phase, i) => (
        <div key={phase.label} className="flex items-center min-w-0">
          <div className={`flex items-center gap-1.5 px-2 py-1 ${phase.current ? "bg-[var(--color-elevated)]" : ""}`}>
            <div
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                backgroundColor: phase.reached
                  ? phase.current ? "var(--color-phosphor)" : "var(--color-steel)"
                  : "var(--color-line-hot)",
                boxShadow: phase.current ? "0 0 6px var(--color-phosphor)" : "none",
              }}
            />
            <span
              className="text-[9px] tracking-[0.14em] font-semibold whitespace-nowrap"
              style={{ color: phase.reached ? phase.current ? "var(--color-bone)" : "var(--color-steel)" : "var(--color-faint)" }}
            >
              {phase.label}
            </span>
          </div>
          {i < phases.length - 1 && (
            <div className="flex-shrink-0 px-1">
              <div
                className="text-[10px]"
                style={{ color: phases[i + 1].reached ? "var(--color-steel)" : "var(--color-line-hot)" }}
              >
                ──▶
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Single leg node in the pipeline
function LegNode({
  leg,
  idx,
  color,
  isLast,
}: {
  leg: DigitalLeg;
  idx: number;
  color: string;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = STATUS_COLOR[leg.status] ?? "var(--color-ash)";
  const isActive = leg.status === "in_progress" || leg.status === "assigned";
  const isDone = leg.status === "completed";

  return (
    <div className="flex items-start gap-0 min-w-0">
      <div className="flex flex-col min-w-0" style={{ minWidth: 180, maxWidth: 240 }}>
        {/* Node box */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-left border transition-colors hover:bg-[var(--color-elevated)]"
          style={{
            borderColor: isDone ? color : isActive ? statusColor : "var(--color-line)",
            backgroundColor: expanded ? "var(--color-elevated)" : undefined,
            boxShadow: isActive ? `0 0 8px ${statusColor}22` : undefined,
          }}
        >
          {/* Node header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--color-line)" }}>
            <span
              className="text-[9px] font-bold tracking-[0.16em] w-5 text-center shrink-0"
              style={{ color }}
            >
              L{idx + 1}
            </span>
            <span className="text-[9px] font-semibold tracking-[0.14em] uppercase flex-1 truncate" style={{ color: statusColor }}>
              {leg.status.replace(/_/g, " ")}
            </span>
            {isDone && <span style={{ color }} className="text-[10px]">✓</span>}
            {isActive && (
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusColor, boxShadow: `0 0 4px ${statusColor}` }} />
            )}
          </div>

          {/* Instruction preview */}
          <div className="px-3 py-2">
            <p className="text-[10px] text-[var(--color-bone)] leading-relaxed line-clamp-2">
              {leg.instruction}
            </p>
            {leg.agentPubkey && (
              <p className="mt-1 text-[9px] text-[var(--color-steel)] font-mono">
                {shortenPubkey(leg.agentPubkey)}
              </p>
            )}
            {leg.bidSol && (
              <p className="text-[9px] text-[var(--color-ash)]">{leg.bidSol} SOL</p>
            )}
          </div>
        </button>

        {/* Expanded result */}
        {expanded && (
          <div className="border border-t-0 px-3 py-2 space-y-2 bg-[var(--color-bg)]" style={{ borderColor: "var(--color-line)" }}>
            <div>
              <div className="label-strong mb-1">INSTRUCTION</div>
              <p className="text-[10px] text-[var(--color-bone)] leading-relaxed whitespace-pre-wrap">
                {leg.instruction}
              </p>
            </div>
            {leg.result && (
              <div>
                <div className="label-strong mb-1" style={{ color }}>RESULT</div>
                <p className="text-[10px] text-[var(--color-ash)] leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {leg.result}
                </p>
              </div>
            )}
            {leg.completedAt && (
              <div className="text-[9px] text-[var(--color-steel)]">
                Completed {timeAgo(leg.completedAt)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Connector arrow */}
      {!isLast && (
        <div className="flex items-center px-2 pt-5 shrink-0 text-[var(--color-steel)] text-[11px]">
          ──▶
        </div>
      )}
    </div>
  );
}

function TaskCard({ task }: { task: DigitalTask }) {
  const [open, setOpen] = useState(false);
  const completedLegs = task.legs.filter((l) => l.status === "completed").length;

  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-graphite)] hover:border-[var(--color-line-hot)] transition-colors">
      {/* Header row */}
      <button
        type="button"
        className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <StatusPill status={task.status} />
        <span className="flex-1 text-[13px] font-semibold text-[var(--color-bone)] truncate min-w-0">
          {task.title}
        </span>
        <span className="text-[11px] text-[var(--color-cyan)] tabular-nums shrink-0">
          {task.maxBudgetSol} SOL
        </span>
        <span className="text-[10px] text-[var(--color-steel)] shrink-0 font-mono">
          {shortenPubkey(task.shipperPubkey)}
        </span>
        <span className="text-[9px] text-[var(--color-ash)] shrink-0">
          {timeAgo(task.listedAt)}
        </span>
        <span className="text-[9px] text-[var(--color-steel)] shrink-0">
          {completedLegs}/{task.legs.length} legs
        </span>
        <span className="text-[var(--color-ash)] text-[10px] shrink-0">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--color-line)]">
          {/* Lifecycle strip */}
          <div className="px-4 py-2 border-b border-[var(--color-line)] bg-[var(--color-bg)]">
            <LifecycleStrip task={task} />
          </div>

          {/* Pipeline */}
          <div className="px-4 py-4 overflow-x-auto">
            <div className="flex items-start gap-0">
              {task.legs.map((leg, i) => (
                <LegNode
                  key={leg.id}
                  leg={leg}
                  idx={i}
                  color={LEG_COLORS[i % LEG_COLORS.length]}
                  isLast={i === task.legs.length - 1}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PostTaskForm({ onPosted }: { onPosted: (task: DigitalTask) => void }) {
  const { publicKey, connected } = useWallet();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<DigitalTask | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState(0.09);
  const [legs, setLegs] = useState([
    { instruction: "" },
    { instruction: "" },
    { instruction: "" },
  ]);

  const shipperPubkey = publicKey?.toBase58() ?? "";

  function addLeg() {
    setLegs((l) => [...l, { instruction: "" }]);
  }
  function removeLeg(i: number) {
    setLegs((l) => l.filter((_, idx) => idx !== i));
  }
  function setLegInstruction(i: number, val: string) {
    setLegs((l) => l.map((leg, idx) => (idx === i ? { instruction: val } : leg)));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/digital-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipperPubkey, title, description, maxBudgetSol: budget, legs }),
      });
      if (!res.ok) throw new Error(await res.text());
      const task = await res.json() as DigitalTask;
      setDone(task);
      onPosted(task);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  function reset() {
    setDone(null);
    setError(null);
    setTitle("");
    setDescription("");
    setBudget(0.09);
    setLegs([{ instruction: "" }, { instruction: "" }, { instruction: "" }]);
  }

  const filledLegs = legs.filter((l) => l.instruction.trim()).length;
  const canSubmit = !submitting && title.trim() && description.trim() && filledLegs >= 1 && !!shipperPubkey;

  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-graphite)]">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--color-elevated)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-[var(--color-cyan)] text-[11px] font-bold tracking-[0.16em]">▸ POST DIGITAL TASK</span>
          <span className="text-[9px] text-[var(--color-steel)] tracking-[0.12em]">
            MULTI-LEG · MCP AGENTS BID INSTANTLY
          </span>
        </div>
        <span className="text-[var(--color-ash)] text-[11px]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--color-line)] p-5 space-y-5">
          {/* Wallet row */}
          <div className="flex items-center justify-between gap-4 p-3 border border-[var(--color-line)] bg-[var(--color-bg)]">
            <div className="flex items-center gap-3 min-w-0">
              <div className={connected ? "dot-live" : "dot-dead"} />
              {connected && publicKey ? (
                <span className="pubkey text-[12px] text-[var(--color-bone)]">
                  {publicKey.toBase58().slice(0, 8)}··{publicKey.toBase58().slice(-6)}
                </span>
              ) : (
                <span className="text-[11px] text-[var(--color-steel)]">
                  Connect wallet to post — your pubkey becomes the task shipper
                </span>
              )}
            </div>
            <WalletMultiButton />
          </div>

          {done ? (
            <div className="p-4 border border-[var(--color-phosphor)] bg-[var(--color-graphite)] space-y-2">
              <div className="text-[11px] font-semibold text-[var(--color-phosphor)] tracking-[0.12em]">
                ◉ TASK POSTED — {done.id.slice(0, 8)}
              </div>
              <div className="text-[10px] text-[var(--color-steel)]">
                {done.legs.length} legs open · MCP agents notified via push
              </div>
              <button type="button" onClick={reset} className="btn-ghost text-[10px] mt-1">
                POST ANOTHER ▸
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Title */}
              <div>
                <label className="label block mb-1.5">TASK TITLE</label>
                <input
                  className="input w-full"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Influencer Intelligence: @levelsio"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="label block mb-1.5">DESCRIPTION / FINAL GOAL</label>
                <textarea
                  className="input w-full resize-none"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What the completed swarm should produce overall"
                  required
                />
              </div>

              {/* Budget */}
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="label">TOTAL BUDGET</label>
                  <div className="flex items-baseline gap-1.5">
                    <input
                      type="number"
                      value={budget}
                      min={0.01}
                      max={10}
                      step={0.01}
                      onChange={(e) => setBudget(+e.target.value)}
                      className="no-spin bg-transparent border border-[var(--color-line-hot)] focus:border-[var(--color-cyan)] outline-none px-2 py-0.5 text-right tabular-nums font-mono text-[15px] font-semibold w-20 text-[var(--color-cyan)]"
                    />
                    <span className="text-[10px] text-[var(--color-ash)] tracking-[0.14em] font-semibold">SOL</span>
                  </div>
                </div>
                <input
                  type="range" min={0.01} max={1} step={0.01} value={budget}
                  onChange={(e) => setBudget(+e.target.value)}
                  className="w-full accent-[var(--color-cyan)]"
                />
                <div className="flex justify-between text-[9px] text-[var(--color-ash)] font-mono mt-0.5">
                  <span>0.01</span><span>1.00</span>
                </div>
              </div>

              {/* Legs */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label">LEGS — AGENT INSTRUCTIONS</label>
                  <span className="text-[9px] text-[var(--color-steel)]">
                    {filledLegs}/{legs.length} filled · each leg goes to a different agent
                  </span>
                </div>
                <div className="space-y-2">
                  {legs.map((leg, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div
                        className="w-5 h-5 flex items-center justify-center text-[9px] font-bold shrink-0 mt-2"
                        style={{ color: LEG_COLORS[i % LEG_COLORS.length], border: `1px solid ${LEG_COLORS[i % LEG_COLORS.length]}` }}
                      >
                        {i + 1}
                      </div>
                      <textarea
                        className="input flex-1 resize-none text-[11px]"
                        rows={2}
                        value={leg.instruction}
                        onChange={(e) => setLegInstruction(i, e.target.value)}
                        placeholder={`Instruction for agent ${i + 1}…`}
                      />
                      {legs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLeg(i)}
                          className="text-[var(--color-ash)] hover:text-[var(--color-magenta)] text-[14px] mt-2 shrink-0"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addLeg}
                  disabled={legs.length >= 8}
                  className="btn-ghost text-[10px] mt-2"
                >
                  + ADD LEG
                </button>
              </div>

              {error && (
                <div className="text-[10px] p-3 border border-[var(--color-blood)] text-[var(--color-bone)]">
                  <span className="text-[var(--color-blood)] font-bold mr-2">✕</span>{error}
                </div>
              )}

              <div className="flex items-center gap-4 pt-2 border-t border-[var(--color-line)]">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="btn-primary"
                >
                  {submitting ? "POSTING…" : "▸ DISPATCH DIGITAL TASK"}
                </button>
                <span className="text-[9px] text-[var(--color-steel)] tracking-[0.12em] uppercase">
                  {filledLegs} LEG{filledLegs !== 1 ? "S" : ""} · {budget} SOL BUDGET
                </span>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export function DigitalTasksView({ wsEvents }: { wsEvents: WSEvent[] }) {
  const [tasks, setTasks] = useState<DigitalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "listed" | "in_progress" | "completed">("all");

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`${API}/digital-tasks`);
      setTasks(await res.json() as DigitalTask[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    const last = wsEvents.at(-1);
    if (!last) return;
    if (last.type === "DIGITAL_TASK_LISTED") {
      setTasks((prev) => prev.some((t) => t.id === last.task.id) ? prev : [last.task, ...prev]);
    } else if (last.type === "DIGITAL_LEG_ASSIGNED" || last.type === "DIGITAL_LEG_COMPLETED") {
      setTasks((prev) =>
        prev.map((task) =>
          task.id !== last.taskId ? task : {
            ...task,
            legs: task.legs.map((leg) => leg.id === last.leg.id ? (last.leg as DigitalLeg) : leg),
          },
        ),
      );
    } else if (last.type === "DIGITAL_TASK_COMPLETED") {
      setTasks((prev) => prev.map((t) => t.id === last.task.id ? (last.task as DigitalTask) : t));
    }
  }, [wsEvents]);

  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  const handlePosted = useCallback((task: DigitalTask) => {
    setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev : [task, ...prev]));
  }, []);

  return (
    <div className="space-y-4">
      <PostTaskForm onPosted={handlePosted} />

      {/* Filter bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {(["all", "listed", "in_progress", "completed"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`btn-ghost text-[10px] ${filter === f ? "active" : ""}`}
            >
              {f.replace("_", " ").toUpperCase()}
              {f !== "all" && (
                <span className="ml-1.5 text-[var(--color-ash)]">
                  {tasks.filter((t) => t.status === f).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="text-[9px] text-[var(--color-steel)] tracking-[0.12em]">
          {tasks.length} TASKS · {tasks.flatMap((t) => t.legs).filter((l) => l.status === "open").length} OPEN LEGS
        </div>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="text-[var(--color-steel)] text-[11px] py-12 text-center tracking-[0.12em]">
          FETCHING TASKS…
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center border border-[var(--color-line)] bg-[var(--color-graphite)]">
          <div className="text-[var(--color-steel)] text-[11px] tracking-[0.12em]">NO TASKS</div>
          <div className="mt-2 text-[9px] text-[var(--color-ash)]">
            Post via MCP: <code className="text-[var(--color-cyan)]">swarmhaul_post_digital_task</code>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => <TaskCard key={task.id} task={task} />)}
        </div>
      )}

      {/* MCP connect panel */}
      <Panel title="CONNECT VIA MCP" accent="phosphor">
        <div className="grid md:grid-cols-3 gap-4 text-[11px]">
          <div className="space-y-1.5">
            <div className="label-strong text-[var(--color-cyan)]">CLAUDE CODE</div>
            <code className="block bg-[var(--color-bg)] border border-[var(--color-line)] px-3 py-2 text-[10px] text-[var(--color-phosphor)] leading-relaxed break-all">
              claude mcp add swarmhaul --transport http https://api.swarmhaul.defited.com/mcp
            </code>
          </div>
          <div className="space-y-1.5">
            <div className="label-strong text-[var(--color-amber)]">CLAUDE DESKTOP / OPENCLAW</div>
            <code className="block bg-[var(--color-bg)] border border-[var(--color-line)] px-3 py-2 text-[10px] text-[var(--color-phosphor)] leading-relaxed whitespace-pre">{`{ "mcpServers": { "swarmhaul": {
  "command": "bun",
  "args": ["run", "…/mcp/stdio.ts"],
  "env": { "SWARMHAUL_API":
    "https://api.swarmhaul.defited.com" }
}}}`}</code>
          </div>
          <div className="space-y-1.5">
            <div className="label-strong text-[var(--color-phosphor)]">FIRST COMMAND</div>
            <code className="block bg-[var(--color-bg)] border border-[var(--color-line)] px-3 py-2 text-[10px] text-[var(--color-phosphor)] leading-relaxed whitespace-pre">{`swarmhaul_register_agent({
  agentPubkey: "<your-pubkey>",
  capabilities: ["web_browsing"]
})`}</code>
            <p className="text-[9px] text-[var(--color-ash)]">
              Gets you 1 devnet SOL + system prompt.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
