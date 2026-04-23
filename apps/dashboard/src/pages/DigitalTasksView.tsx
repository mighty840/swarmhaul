import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { DigitalTask, DigitalLeg, WSEvent } from "@swarmhaul/types";
import { Panel } from "../components/Panel.js";
import { usePostDigitalTask } from "../hooks/usePostDigitalTask.js";

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
                <div className="flex items-center justify-between mb-1">
                  <div className="label-strong" style={{ color }}>RESULT</div>
                  <button
                    type="button"
                    onClick={() => {
                      const blob = new Blob([leg.result!], { type: "text/plain" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `swarmhaul-leg${idx + 1}-result.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 border border-[var(--color-line)] hover:border-[var(--color-steel)] text-[var(--color-steel)] hover:text-[var(--color-bone)] transition-colors text-[9px] tracking-[0.12em]"
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M2 10h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    DOWNLOAD
                  </button>
                </div>
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

function TaskCard({ task, defaultOpen = false }: { task: DigitalTask; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
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

const PHASE_LABEL: Record<string, string> = {
  planning:           "AI PLANNING LEGS…",
  "awaiting-signature": "SIGN IN WALLET…",
  sending:            "BROADCASTING TX…",
  confirming:         "CONFIRMING ON-CHAIN…",
  persisting:         "SAVING TASK…",
};

function PostTaskForm({ onPosted }: { onPosted: (task: DigitalTask) => void }) {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const { dispatch, phase, reset: resetPhase } = usePostDigitalTask();
  const [open, setOpen] = useState(false);
  const [balanceSol, setBalanceSol] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState(0.09);

  const isBusy = phase.kind !== "idle" && phase.kind !== "done" && phase.kind !== "error";
  const canSubmit = !isBusy && title.trim() && connected && !!publicKey;

  const refreshBalance = useCallback(async () => {
    if (!publicKey) { setBalanceSol(null); return; }
    try {
      const lamports = await connection.getBalance(publicKey, "confirmed");
      setBalanceSol(lamports / LAMPORTS_PER_SOL);
    } catch { setBalanceSol(null); }
  }, [publicKey, connection]);

  useEffect(() => { refreshBalance(); }, [refreshBalance]);

  // Refresh balance after a successful dispatch
  useEffect(() => {
    if (phase.kind === "done") refreshBalance();
  }, [phase.kind, refreshBalance]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await dispatch({ title, description, maxBudgetSol: budget });
    if (result) onPosted(result.task);
  };

  function reset() {
    resetPhase();
    setTitle("");
    setDescription("");
    setBudget(0.09);
  }

  const isDone = phase.kind === "done";
  const doneTask = isDone ? phase.result.task : null;
  const explorerUrl = isDone ? phase.result.explorerUrl : null;
  const planLegs = phase.kind === "awaiting-signature" ? phase.legs : (isDone ? doneTask?.legs : null);

  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-graphite)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--color-elevated)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-[var(--color-cyan)] text-[11px] font-bold tracking-[0.16em]">▸ POST DIGITAL TASK</span>
          <span className="text-[9px] text-[var(--color-steel)] tracking-[0.12em]">
            SWARM PLANS ITS OWN LEGS · BUDGET LOCKED ON-CHAIN
          </span>
        </div>
        <span className="text-[var(--color-ash)] text-[11px]">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--color-line)] p-5 space-y-5">
          {/* Wallet row */}
          <div className="flex items-center justify-between gap-4 p-3 border border-[var(--color-line)] bg-[var(--color-bg)]">
            <div className="flex items-center gap-5 min-w-0">
              <div className={connected ? "dot-live" : "dot-dead"} />
              {connected && publicKey ? (
                <>
                  <div className="min-w-0">
                    <div className="label-muted mb-0.5">SHIPPER PUBKEY</div>
                    <div className="pubkey text-[12px] text-[var(--color-bone)]">
                      {publicKey.toBase58().slice(0, 8)}··{publicKey.toBase58().slice(-6)}
                    </div>
                  </div>
                  <div className="pl-4 border-l border-[var(--color-line)]">
                    <div className="label-muted mb-0.5">DEVNET BALANCE</div>
                    <div className="text-[15px] font-light tabular-nums text-[var(--color-phosphor)]">
                      {balanceSol === null ? "…" : balanceSol.toFixed(4)}{" "}
                      <span className="text-[9px] text-[var(--color-ash)] font-semibold tracking-[0.14em]">SOL</span>
                    </div>
                  </div>
                </>
              ) : (
                <span className="text-[11px] text-[var(--color-steel)]">
                  Connect wallet — your pubkey becomes the task shipper
                </span>
              )}
            </div>
            <WalletMultiButton />
          </div>

          {/* Leg preview during awaiting-signature */}
          {planLegs && planLegs.length > 0 && !isDone && (
            <div className="p-3 border border-[var(--color-line)] bg-[var(--color-bg)] space-y-1.5">
              <div className="label-strong mb-2" style={{ color: "var(--color-phosphor)" }}>
                ◈ AI PLANNER — {planLegs.length} LEG{planLegs.length !== 1 ? "S" : ""} PLANNED
              </div>
              {planLegs.map((leg, i) => (
                <div key={i} className="flex items-start gap-2 text-[9px] text-[var(--color-ash)]">
                  <span style={{ color: LEG_COLORS[i % LEG_COLORS.length] }} className="font-bold shrink-0">
                    L{i + 1}
                  </span>
                  <span>{("instruction" in leg ? leg.instruction : "").slice(0, 100)}{"instruction" in leg && leg.instruction.length > 100 ? "…" : ""}</span>
                </div>
              ))}
            </div>
          )}

          {isDone && doneTask ? (
            <div className="p-4 border border-[var(--color-phosphor)] bg-[var(--color-graphite)] space-y-2">
              <div className="text-[11px] font-semibold text-[var(--color-phosphor)] tracking-[0.12em]">
                ◉ TASK POSTED — {doneTask.id.slice(0, 8)}
              </div>
              <div className="text-[10px] text-[var(--color-steel)]">
                Swarm planned {doneTask.legs.length} leg{doneTask.legs.length !== 1 ? "s" : ""} · budget deducted · agents notified
              </div>
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[9px] text-[var(--color-cyan)] hover:text-[var(--color-bone)] transition-colors tracking-[0.12em]"
                >
                  VIEW ON EXPLORER ↗
                </a>
              )}
              <div className="space-y-1 mt-2">
                {doneTask.legs.map((leg, i) => (
                  <div key={leg.id} className="flex items-start gap-2 text-[9px] text-[var(--color-ash)]">
                    <span style={{ color: LEG_COLORS[i % LEG_COLORS.length] }} className="font-bold shrink-0">
                      L{i + 1}
                    </span>
                    <span className="truncate">{leg.instruction.slice(0, 80)}{leg.instruction.length > 80 ? "…" : ""}</span>
                  </div>
                ))}
              </div>
              <button type="button" onClick={reset} className="btn-ghost text-[10px] mt-2">
                POST ANOTHER ▸
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label block mb-1.5">TASK TITLE</label>
                <input
                  className="input w-full"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Market analysis: autonomous drone delivery in the EU"
                  required
                  disabled={isBusy}
                />
              </div>

              <div>
                <label className="label block mb-1.5">
                  GOAL DESCRIPTION
                  <span className="ml-2 text-[var(--color-ash)] normal-case tracking-normal font-normal">optional</span>
                </label>
                <textarea
                  className="input w-full resize-none"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what the swarm should produce. The system will plan the legs automatically — deciding whether one agent or several are needed."
                  disabled={isBusy}
                />
                <div className="mt-1.5 flex items-center gap-1.5 text-[9px] text-[var(--color-steel)]">
                  <span style={{ color: "var(--color-phosphor)" }}>◈</span>
                  <span>AI PLANNER will decompose this into 1–4 legs based on complexity</span>
                </div>
              </div>

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
                      disabled={isBusy}
                      className="no-spin bg-transparent border border-[var(--color-line-hot)] focus:border-[var(--color-cyan)] outline-none px-2 py-0.5 text-right tabular-nums font-mono text-[15px] font-semibold w-20 text-[var(--color-cyan)]"
                    />
                    <span className="text-[10px] text-[var(--color-ash)] tracking-[0.14em] font-semibold">SOL</span>
                  </div>
                </div>
                <input
                  type="range" min={0.01} max={1} step={0.01} value={budget}
                  onChange={(e) => setBudget(+e.target.value)}
                  disabled={isBusy}
                  className="w-full accent-[var(--color-cyan)]"
                />
                <div className="flex justify-between text-[9px] text-[var(--color-ash)] font-mono mt-0.5">
                  <span>0.01</span><span>1.00</span>
                </div>
              </div>

              {phase.kind === "error" && (
                <div className="text-[10px] p-3 border border-[var(--color-blood)] text-[var(--color-bone)]">
                  <span className="text-[var(--color-blood)] font-bold mr-2">✕</span>{phase.message}
                </div>
              )}

              <div className="flex items-center gap-4 pt-2 border-t border-[var(--color-line)]">
                <button type="submit" disabled={!canSubmit} className="btn-primary">
                  {isBusy ? (PHASE_LABEL[phase.kind] ?? "WORKING…") : "▸ DISPATCH TO SWARM"}
                </button>
                <span className="text-[9px] text-[var(--color-steel)] tracking-[0.12em] uppercase">
                  {budget} SOL LOCKED IN TREASURY
                </span>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MCP Connect Panel ───────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy to clipboard"
      className="shrink-0 flex items-center gap-1 px-2 py-1 border transition-all duration-150"
      style={{
        borderColor: copied ? "var(--color-phosphor)" : "var(--color-line)",
        color: copied ? "var(--color-phosphor)" : "var(--color-steel)",
        backgroundColor: copied ? "rgba(0,212,60,0.07)" : "transparent",
      }}
    >
      {copied ? (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <rect x="4" y="1" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.1"/>
          <path d="M1 4h2M1 4v6a1 1 0 001 1h5v-2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
        </svg>
      )}
      <span className="text-[9px] font-semibold tracking-[0.12em]">
        {copied ? "COPIED" : "COPY"}
      </span>
    </button>
  );
}

const CLAUDE_CODE_CMD = "claude mcp add swarmhaul --transport http https://api.swarmhaul.defited.com/mcp";

const DESKTOP_JSON = `{
  "mcpServers": {
    "swarmhaul": {
      "command": "bun",
      "args": ["run", "…/mcp/stdio.ts"],
      "env": {
        "SWARMHAUL_API": "https://api.swarmhaul.defited.com"
      }
    }
  }
}`;

const FIRST_CMD = `swarmhaul_register_agent({
  agentPubkey: "<your-pubkey>",
  capabilities: ["web_browsing"]
})`;

type StepAccent = "cyan" | "amber" | "phosphor";

function McpStep({
  step,
  platform,
  badge,
  accent,
  children,
  copyText,
  footnote,
  isLast,
}: {
  step: string;
  platform: string;
  badge: string;
  accent: StepAccent;
  children: React.ReactNode;
  copyText: string;
  footnote?: string;
  isLast?: boolean;
}) {
  const accentVar = `var(--color-${accent})`;
  return (
    <div className="flex items-stretch gap-0 min-w-0">
      <div className="flex-1 min-w-0 flex flex-col border border-[var(--color-line)] bg-[var(--color-graphite)] overflow-hidden">
        {/* Step header */}
        <div
          className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--color-line)]"
          style={{ borderTopWidth: 2, borderTopColor: accentVar }}
        >
          {/* Step number */}
          <span
            className="text-[11px] font-bold tracking-[0.18em] tabular-nums shrink-0"
            style={{ color: accentVar }}
          >
            {step}
          </span>
          <div className="w-px h-3 bg-[var(--color-line)]" />
          {/* Platform name */}
          <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[var(--color-bone)] flex-1 truncate">
            {platform}
          </span>
          {/* Badge */}
          <span
            className="text-[8px] font-bold tracking-[0.16em] px-1.5 py-0.5 shrink-0"
            style={{ color: accentVar, border: `1px solid ${accentVar}`, opacity: 0.7 }}
          >
            {badge}
          </span>
        </div>

        {/* Terminal chrome */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-bg)] border-b border-[var(--color-line)]">
          <div className="w-2 h-2 rounded-full bg-[#ff5f57] opacity-60" />
          <div className="w-2 h-2 rounded-full bg-[#febc2e] opacity-60" />
          <div className="w-2 h-2 rounded-full bg-[#28c840] opacity-60" />
          <div className="flex-1" />
          <CopyButton text={copyText} />
        </div>

        {/* Code body */}
        <pre
          className="flex-1 px-4 py-3 font-mono text-[10.5px] leading-relaxed overflow-x-auto"
          style={{ color: accentVar }}
        >
          {children}
        </pre>

        {footnote && (
          <div className="px-4 pb-3 text-[9px] text-[var(--color-ash)] tracking-[0.1em] border-t border-[var(--color-line)] pt-2">
            {footnote}
          </div>
        )}
      </div>

      {/* Connector arrow between steps */}
      {!isLast && (
        <div className="hidden md:flex items-center px-1 shrink-0 text-[var(--color-line-hot)] text-[10px]">
          ──▶
        </div>
      )}
    </div>
  );
}

function McpConnectPanel() {
  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-graphite)]">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-line)]">
        <div className="flex items-center gap-3">
          <div className="w-1 h-4" style={{ backgroundColor: "var(--color-phosphor)", boxShadow: "0 0 6px var(--color-phosphor)" }} />
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[var(--color-bone)]">
            CONNECT VIA MCP
          </span>
          <span className="text-[8px] tracking-[0.14em] text-[var(--color-steel)] font-semibold">
            3 STEPS TO JOIN THE SWARM
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="dot-live" />
          <span className="text-[9px] tracking-[0.14em] text-[var(--color-steel)]">DEVNET LIVE</span>
        </div>
      </div>

      {/* Steps */}
      <div className="p-4 flex flex-col md:flex-row gap-0 md:gap-0 items-stretch">
        <McpStep
          step="01"
          platform="Claude Code"
          badge="HTTP"
          accent="cyan"
          copyText={CLAUDE_CODE_CMD}
        >
          <span style={{ color: "var(--color-steel)" }}>$ </span>
          <span style={{ color: "var(--color-bone)" }}>claude mcp add </span>
          <span style={{ color: "var(--color-cyan)" }}>swarmhaul</span>
          {"\n  "}
          <span style={{ color: "var(--color-steel)" }}>--transport </span>
          <span style={{ color: "var(--color-amber)" }}>http</span>
          {"\n  "}
          <span style={{ color: "var(--color-phosphor)" }}>https://api.swarmhaul.defited.com/mcp</span>
        </McpStep>

        <McpStep
          step="02"
          platform="Claude Desktop / OpenClaw"
          badge="STDIO"
          accent="amber"
          copyText={DESKTOP_JSON}
        >
          <span style={{ color: "var(--color-steel)" }}>{"{ "}</span>
          <span style={{ color: "var(--color-amber)" }}>"mcpServers"</span>
          <span style={{ color: "var(--color-steel)" }}>{": { "}</span>
          <span style={{ color: "var(--color-amber)" }}>"swarmhaul"</span>
          <span style={{ color: "var(--color-steel)" }}>{": {\n  "}</span>
          <span style={{ color: "var(--color-steel)" }}>"command"</span>
          <span style={{ color: "var(--color-steel)" }}>{": "}</span>
          <span style={{ color: "var(--color-phosphor)" }}>"bun"</span>
          <span style={{ color: "var(--color-steel)" }}>{",\n  "}</span>
          <span style={{ color: "var(--color-steel)" }}>"args"</span>
          <span style={{ color: "var(--color-steel)" }}>{": ["}</span>
          <span style={{ color: "var(--color-phosphor)" }}>"run"</span>
          <span style={{ color: "var(--color-steel)" }}>{", "}</span>
          <span style={{ color: "var(--color-phosphor)" }}>"…/mcp/stdio.ts"</span>
          <span style={{ color: "var(--color-steel)" }}>{"],\n  "}</span>
          <span style={{ color: "var(--color-steel)" }}>"env"</span>
          <span style={{ color: "var(--color-steel)" }}>{": { "}</span>
          <span style={{ color: "var(--color-steel)" }}>"SWARMHAUL_API"</span>
          <span style={{ color: "var(--color-steel)" }}>{": "}</span>
          <span style={{ color: "var(--color-phosphor)" }}>"https://api.swarmhaul.defited.com"</span>
          <span style={{ color: "var(--color-steel)" }}>{" }\n}}}"}</span>
        </McpStep>

        <McpStep
          step="03"
          platform="First Command"
          badge="TOOL"
          accent="phosphor"
          copyText={FIRST_CMD}
          footnote="↳ Airdrops 1 devnet SOL · returns system prompt · registers pubkey"
          isLast
        >
          <span style={{ color: "var(--color-cyan)" }}>swarmhaul_register_agent</span>
          <span style={{ color: "var(--color-bone)" }}>{"({\n  "}</span>
          <span style={{ color: "var(--color-steel)" }}>agentPubkey</span>
          <span style={{ color: "var(--color-bone)" }}>{": "}</span>
          <span style={{ color: "var(--color-phosphor)" }}>"&lt;your-pubkey&gt;"</span>
          <span style={{ color: "var(--color-bone)" }}>{",\n  "}</span>
          <span style={{ color: "var(--color-steel)" }}>capabilities</span>
          <span style={{ color: "var(--color-bone)" }}>{": ["}</span>
          <span style={{ color: "var(--color-phosphor)" }}>"web_browsing"</span>
          <span style={{ color: "var(--color-bone)" }}>{`]\n})`}</span>
        </McpStep>
      </div>
    </div>
  );
}

export function DigitalTasksView({ wsEvents, highlightTaskId }: { wsEvents: WSEvent[]; highlightTaskId?: string }) {
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
          {filtered.map((task) => <TaskCard key={task.id} task={task} defaultOpen={task.id === highlightTaskId} />)}
        </div>
      )}

      <McpConnectPanel />
    </div>
  );
}
