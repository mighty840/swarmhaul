import { useCallback, useEffect, useState } from "react";
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

  return (
    <div className="space-y-4">
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
              claude mcp add swarmhaul --transport sse https://api.swarmhaul.defited.com/mcp/sse
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
