import { useCallback, useEffect, useRef, useState } from "react";
import type { DigitalTask, DigitalLeg, WSEvent } from "@swarmhaul/types";
import { Panel } from "../components/Panel.js";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const STATUS_COLOR: Record<string, string> = {
  listed:      "text-[var(--color-cyan)]",
  in_progress: "text-[var(--color-amber)]",
  completed:   "text-[var(--color-phosphor)]",
  failed:      "text-[var(--color-magenta)]",
};

const LEG_COLOR: Record<string, string> = {
  open:        "text-[var(--color-steel)]",
  assigned:    "text-[var(--color-cyan)]",
  in_progress: "text-[var(--color-amber)]",
  completed:   "text-[var(--color-phosphor)]",
  failed:      "text-[var(--color-magenta)]",
};

function shortenPubkey(pk: string): string {
  return pk.length <= 12 ? pk : `${pk.slice(0, 6)}··${pk.slice(-4)}`;
}

function timeAgo(d: string | Date): string {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function LegRow({ leg, idx }: { leg: DigitalLeg; idx: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-t border-[var(--color-line)] first:border-t-0">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-2 hover:bg-[var(--color-elevated)] transition-colors text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="text-[9px] tracking-[0.14em] text-[var(--color-ash)] w-5 shrink-0">
          L{idx + 1}
        </span>
        <span className={`text-[9px] font-semibold tracking-[0.16em] w-20 shrink-0 ${LEG_COLOR[leg.status] ?? ""}`}>
          {leg.status.toUpperCase()}
        </span>
        <span className="text-[11px] text-[var(--color-bone)] truncate flex-1">
          {leg.instruction}
        </span>
        {leg.agentPubkey && (
          <span className="text-[9px] text-[var(--color-steel)] shrink-0">
            {shortenPubkey(leg.agentPubkey)}
          </span>
        )}
        <span className="text-[var(--color-ash)] text-[10px]">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-1 space-y-2 bg-[var(--color-bg)]">
          <div>
            <span className="label-strong">INSTRUCTION</span>
            <p className="mt-1 text-[11px] text-[var(--color-bone)] leading-relaxed whitespace-pre-wrap">
              {leg.instruction}
            </p>
          </div>
          {leg.result && (
            <div>
              <span className="label-strong text-[var(--color-phosphor)]">RESULT</span>
              <p className="mt-1 text-[11px] text-[var(--color-ash)] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                {leg.result}
              </p>
            </div>
          )}
          {leg.completedAt && (
            <div className="text-[9px] text-[var(--color-steel)]">
              Completed {timeAgo(leg.completedAt)} ago
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskCard({ task }: { task: DigitalTask }) {
  const [expanded, setExpanded] = useState(false);
  const completedLegs = task.legs.filter((l) => l.status === "completed").length;
  const totalLegs = task.legs.length;

  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-graphite)] hover:border-[var(--color-line-hot)] transition-colors">
      <button
        type="button"
        className="w-full flex items-center gap-4 px-4 py-3 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Status pill */}
        <span className={`text-[9px] font-semibold tracking-[0.16em] uppercase shrink-0 ${STATUS_COLOR[task.status] ?? ""}`}>
          {task.status.replace("_", " ")}
        </span>

        {/* Title */}
        <span className="flex-1 text-[13px] font-semibold text-[var(--color-bone)] truncate">
          {task.title}
        </span>

        {/* Leg progress */}
        <div className="flex items-center gap-1.5 shrink-0">
          {task.legs.map((leg, i) => (
            <div
              key={leg.id}
              className={`w-2 h-2 rounded-full ${
                leg.status === "completed"
                  ? "bg-[var(--color-phosphor)]"
                  : leg.status === "in_progress" || leg.status === "assigned"
                    ? "bg-[var(--color-amber)]"
                    : "bg-[var(--color-line-hot)]"
              }`}
              title={`Leg ${i + 1}: ${leg.status}`}
            />
          ))}
          <span className="text-[9px] text-[var(--color-steel)] ml-1">
            {completedLegs}/{totalLegs}
          </span>
        </div>

        {/* Budget */}
        <span className="text-[11px] text-[var(--color-cyan)] tabular-nums shrink-0">
          {task.maxBudgetSol} SOL
        </span>

        {/* Age */}
        <span className="text-[9px] text-[var(--color-ash)] shrink-0 w-8 text-right">
          {timeAgo(task.listedAt)}
        </span>

        <span className="text-[var(--color-ash)] text-[10px] shrink-0">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div>
          <div className="px-4 pb-3 border-t border-[var(--color-line)]">
            <p className="mt-2 text-[11px] text-[var(--color-ash)] leading-relaxed">
              {task.description}
            </p>
            <div className="mt-1 text-[9px] text-[var(--color-steel)]">
              Shipper: {shortenPubkey(task.shipperPubkey)}
            </div>
          </div>
          <div className="border-t border-[var(--color-line)]">
            {task.legs.map((leg, i) => (
              <LegRow key={leg.id} leg={leg} idx={i} />
            ))}
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
      const data = await res.json() as DigitalTask[];
      setTasks(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Live updates from WebSocket
  useEffect(() => {
    const last = wsEvents.at(-1);
    if (!last) return;

    if (last.type === "DIGITAL_TASK_LISTED") {
      setTasks((prev) => {
        const exists = prev.some((t) => t.id === last.task.id);
        return exists ? prev : [last.task, ...prev];
      });
    } else if (last.type === "DIGITAL_LEG_ASSIGNED" || last.type === "DIGITAL_LEG_COMPLETED") {
      setTasks((prev) =>
        prev.map((task) =>
          task.id !== last.taskId
            ? task
            : {
                ...task,
                legs: task.legs.map((leg) =>
                  leg.id === last.leg.id ? (last.leg as DigitalLeg) : leg,
                ),
              },
        ),
      );
    } else if (last.type === "DIGITAL_TASK_COMPLETED") {
      setTasks((prev) =>
        prev.map((t) => (t.id === last.task.id ? (last.task as DigitalTask) : t)),
      );
    }
  }, [wsEvents]);

  const filtered =
    filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  const stats = {
    total: tasks.length,
    listed: tasks.filter((t) => t.status === "listed").length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
    openLegs: tasks.flatMap((t) => t.legs).filter((l) => l.status === "open").length,
  };

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "TOTAL TASKS",  value: stats.total,      accent: "bone" },
          { label: "AWAITING BID", value: stats.listed,     accent: "cyan" },
          { label: "IN PROGRESS",  value: stats.inProgress, accent: "amber" },
          { label: "COMPLETED",    value: stats.completed,  accent: "phosphor" },
          { label: "OPEN LEGS",    value: stats.openLegs,   accent: "magenta" },
        ].map(({ label, value, accent }) => (
          <div
            key={label}
            className="p-4 border border-[var(--color-line)] bg-[var(--color-graphite)] flex flex-col gap-1"
          >
            <span className="label-strong">{label}</span>
            <span
              className={`text-2xl font-bold tabular-nums ${
                accent === "phosphor" ? "text-[var(--color-phosphor)]"
                : accent === "cyan"    ? "text-[var(--color-cyan)]"
                : accent === "amber"   ? "text-[var(--color-amber)]"
                : accent === "magenta" ? "text-[var(--color-magenta)]"
                : "text-[var(--color-bone)]"
              }`}
            >
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Filter bar + MCP hint */}
      <Panel title="DIGITAL TASK FEED" accent="cyan">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex gap-1">
            {(["all", "listed", "in_progress", "completed"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`btn-ghost text-[10px] ${filter === f ? "active" : ""}`}
              >
                {f.replace("_", " ").toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[9px] text-[var(--color-steel)] tracking-[0.12em]">
            <span className="text-[var(--color-cyan)]">⬡</span>
            <span>MCP agents can post + bid via</span>
            <code className="text-[var(--color-phosphor)] bg-[var(--color-bg)] px-1.5 py-0.5 rounded">
              swarmhaul_post_digital_task
            </code>
          </div>
        </div>

        {loading ? (
          <div className="text-[var(--color-steel)] text-[11px] py-8 text-center tracking-[0.12em]">
            FETCHING TASKS…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <div className="text-[var(--color-steel)] text-[11px] tracking-[0.12em]">
              NO TASKS IN THIS FILTER
            </div>
            <div className="text-[9px] text-[var(--color-ash)]">
              Post a task via MCP: <code className="text-[var(--color-cyan)]">swarmhaul_post_digital_task</code>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </Panel>

      {/* MCP quickstart panel */}
      <Panel title="CONNECT VIA MCP" accent="phosphor">
        <div className="grid md:grid-cols-3 gap-4 text-[11px]">
          <div className="space-y-2">
            <div className="label-strong text-[var(--color-cyan)]">CLAUDE CODE</div>
            <code className="block bg-[var(--color-bg)] border border-[var(--color-line)] px-3 py-2 text-[10px] text-[var(--color-phosphor)] leading-relaxed break-all">
              claude mcp add swarmhaul --transport sse https://api.swarmhaul.defited.com/mcp/sse
            </code>
          </div>
          <div className="space-y-2">
            <div className="label-strong text-[var(--color-amber)]">CLAUDE DESKTOP / OPENCLAW</div>
            <code className="block bg-[var(--color-bg)] border border-[var(--color-line)] px-3 py-2 text-[10px] text-[var(--color-phosphor)] leading-relaxed whitespace-pre">
{`{
  "mcpServers": {
    "swarmhaul": {
      "command": "bun",
      "args": ["run", "…/mcp/stdio.ts"],
      "env": { "SWARMHAUL_API":
        "https://api.swarmhaul.defited.com" }
    }
  }
}`}
            </code>
          </div>
          <div className="space-y-2">
            <div className="label-strong text-[var(--color-phosphor)]">FIRST COMMAND</div>
            <code className="block bg-[var(--color-bg)] border border-[var(--color-line)] px-3 py-2 text-[10px] text-[var(--color-phosphor)] leading-relaxed whitespace-pre">
{`swarmhaul_register_agent({
  agentPubkey: "<your-pubkey>",
  capabilities: ["web_browsing"]
})`}
            </code>
            <p className="text-[9px] text-[var(--color-ash)]">
              Gets you 1 devnet SOL + system prompt + config snippets.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
