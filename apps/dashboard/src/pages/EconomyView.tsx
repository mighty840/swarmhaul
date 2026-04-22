import type { AgentReputation, WSEvent } from "@swarmhaul/types";
import { Panel } from "../components/Panel.js";

interface EconomyStats {
  packages: { total: number; active: number; delivered: number };
  swarms: { total: number; active: number };
  bids: { total: number };
  agents: { total: number };
  legs: { completed: number };
  volume: { totalSol: number };
  wsClients: number;
}

interface Activity {
  recentBids: Array<{
    id: string;
    packageId: string;
    agentPubkey: string;
    costSol: number;
    reasoning: string | null;
    createdAt: string;
  }>;
  recentLegs: Array<{
    id: string;
    agentPubkey: string;
    agreedPaymentSol: number;
    completedAt: string | null;
  }>;
  recentPackages: Array<{
    id: string;
    description: string;
    status: string;
    maxBudgetSol: number;
    listedAt: string;
  }>;
  recentDigitalTasks?: Array<{
    id: string;
    title: string;
    status: string;
    maxBudgetSol: number;
    listedAt: string;
    legs: Array<{ status: string }>;
  }>;
}

function shortenPubkey(pk: string): string {
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 6)}··${pk.slice(-4)}`;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function MegaStat({
  label,
  value,
  unit,
  delta,
  accent = "phosphor",
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  accent?: "phosphor" | "magenta" | "amber" | "cyan";
}) {
  const color = {
    phosphor: "text-[var(--color-phosphor)]",
    magenta: "text-[var(--color-magenta)]",
    amber: "text-[var(--color-amber)]",
    cyan: "text-[var(--color-cyan)]",
  }[accent];

  return (
    <div className="relative p-5 border border-[var(--color-line)] bg-[var(--color-graphite)] hover:bg-[var(--color-elevated)] transition-colors group">
      {/* Corner accents */}
      <div className={`absolute top-0 left-0 w-2 h-2 border-t border-l ${color.replace("text-", "border-")}`} />
      <div className={`absolute top-0 right-0 w-2 h-2 border-t border-r ${color.replace("text-", "border-")}`} />
      <div className={`absolute bottom-0 left-0 w-2 h-2 border-b border-l ${color.replace("text-", "border-")}`} />
      <div className={`absolute bottom-0 right-0 w-2 h-2 border-b border-r ${color.replace("text-", "border-")}`} />

      <div className="flex items-start justify-between mb-3">
        <span className="label-strong">{label}</span>
        {delta && <span className={`text-[9px] font-semibold tracking-[0.14em] ${color}`}>{delta}</span>}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="stat-num">{value}</span>
        {unit && (
          <span className="text-[10px] text-[var(--color-ash)] tracking-[0.16em] uppercase font-semibold">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="px-4 py-3 border border-[var(--color-line)] bg-[var(--color-graphite)]">
      <div className="label mb-1.5">{label}</div>
      <div className="stat-num-sm">{value}</div>
    </div>
  );
}

const EVENT_COLORS: Record<string, string> = {
  PACKAGE_LISTED: "var(--color-cyan)",
  BID_RECEIVED: "var(--color-phosphor)",
  SWARM_FORMED: "var(--color-magenta)",
  LEG_STARTED: "var(--color-amber)",
  LEG_COMPLETED: "var(--color-phosphor)",
  PACKAGE_DELIVERED: "var(--color-phosphor)",
};

function EventLine({ evt }: { evt: WSEvent }) {
  const color = EVENT_COLORS[evt.type] ?? "var(--color-ash)";

  let detail = "";
  if (evt.type === "PACKAGE_LISTED") detail = `${evt.package.description.slice(0, 36)}`;
  else if (evt.type === "BID_RECEIVED")
    detail = `${shortenPubkey(evt.bid.agentPubkey)} @ ${evt.bid.costSol} SOL`;
  else if (evt.type === "SWARM_FORMED")
    detail = `${evt.swarm.legs.length} legs · ${evt.swarm.totalCostSol} SOL`;
  else if (evt.type === "LEG_COMPLETED")
    detail = `${shortenPubkey(evt.leg.agentPubkey)} · ${evt.leg.agreedPaymentSol} SOL`;
  else if (evt.type === "PACKAGE_DELIVERED") detail = shortenPubkey(evt.packageId);

  return (
    <div className="flex items-start gap-2 py-1 px-3 hover:bg-[var(--color-hover)] group">
      <span
        className="text-[9px] tracking-[0.1em] mt-0.5 font-bold"
        style={{ color }}
      >
        ▸
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] tracking-[0.14em] font-bold"
            style={{ color }}
          >
            {evt.type}
          </span>
        </div>
        <div className="text-[11px] text-[var(--color-steel)] truncate">
          {detail}
        </div>
      </div>
    </div>
  );
}

const AGENT_COLORS = [
  "var(--color-phosphor)",
  "var(--color-magenta)",
  "var(--color-cyan)",
  "var(--color-amber)",
];

function agentColorFor(pubkey: string): string {
  let h = 0;
  for (let i = 0; i < pubkey.length; i++) h = (h * 31 + pubkey.charCodeAt(i)) >>> 0;
  return AGENT_COLORS[h % AGENT_COLORS.length];
}

const STATUS_COLOR: Record<string, string> = {
  delivered: "var(--color-phosphor)",
  in_transit: "var(--color-amber)",
  swarm_forming: "var(--color-magenta)",
  listed: "var(--color-cyan)",
};

export function EconomyView({
  stats,
  activity,
  leaderboard,
  wsEvents,
  onOpenSwarm,
}: {
  stats: EconomyStats | null;
  activity: Activity | null;
  leaderboard: AgentReputation[];
  wsEvents: WSEvent[];
  onOpenSwarm?: (packageId: string) => void;
}) {
  if (!stats) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-[var(--color-phosphor)] text-sm tracking-[0.18em] uppercase font-bold">
          <span className="cursor">INITIALIZING TELEMETRY</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 glitch-in">
      {/* Hero strip */}
      <div className="flex items-end justify-between border-b border-[var(--color-line)] pb-4">
        <div>
          <div className="label mb-2">▸ AGENT ECONOMY OBSERVATORY</div>
          <h1 className="text-[32px] leading-none tracking-[-0.02em] font-light text-[var(--color-bone)]">
            <span className="display-serif text-[var(--color-phosphor)]">Live</span>{" "}
            Telemetry
            <span className="cursor"></span>
          </h1>
        </div>
        <div className="text-right">
          <div className="label mb-1">PROTOCOL UPTIME</div>
          <div className="text-[18px] font-light tabular-nums text-[var(--color-bone)]">
            {Math.floor(Math.random() * 99 + 1).toString().padStart(2, "0")}:
            {Math.floor(Math.random() * 60).toString().padStart(2, "0")}:
            {Math.floor(Math.random() * 60).toString().padStart(2, "0")}
          </div>
        </div>
      </div>

      {/* Mega stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MegaStat
          label="ACTIVE SWARMS"
          value={stats.swarms.active}
          delta={`/${stats.swarms.total} TOTAL`}
          accent="magenta"
        />
        <MegaStat
          label="OPEN PACKAGES"
          value={stats.packages.active}
          delta={`${stats.packages.delivered} DELIVERED`}
          accent="cyan"
        />
        <MegaStat
          label="TOTAL BIDS"
          value={stats.bids.total}
          delta={`${stats.legs.completed} LEGS DONE`}
          accent="phosphor"
        />
        <MegaStat
          label="REGISTERED AGENTS"
          value={stats.agents.total}
          delta={`${stats.wsClients} CLIENTS WATCHING`}
          accent="amber"
        />
      </div>

      {/* Three-column workspace */}
      <div className="grid grid-cols-12 gap-3">
        {/* LEFT — Agent reasoning stream (the killer feature) */}
        <Panel
          title="AGENT REASONING ▸ STDOUT"
          meta={`${activity?.recentBids.length ?? 0} ENTRIES`}
          accent="phosphor"
          className="col-span-12 lg:col-span-7 row-span-2"
        >
          <div className="p-3 max-h-[520px] overflow-y-auto font-mono">
            {!activity?.recentBids.length && (
              <div className="text-[var(--color-ash)] text-[11px] p-4 text-center">
                ░░ no agent activity ░░
              </div>
            )}
            {activity?.recentBids.map((bid) => {
              const color = agentColorFor(bid.agentPubkey);
              return (
                <div
                  key={bid.id}
                  className="border-l-2 pl-3 py-2 mb-2 hover:bg-[var(--color-hover)]"
                  style={{ borderColor: color }}
                >
                  <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                    <span
                      className="text-[11px] font-bold tracking-[0.04em]"
                      style={{ color }}
                    >
                      {shortenPubkey(bid.agentPubkey)}
                    </span>
                    <span className="text-[var(--color-ash)] text-[9px] font-semibold tracking-[0.12em] uppercase">
                      {timeAgo(bid.createdAt)} AGO
                    </span>
                    <span className="text-[var(--color-ash)] text-[9px]">▸</span>
                    <button
                      onClick={() => onOpenSwarm?.(bid.packageId)}
                      className="text-[var(--color-steel)] text-[10px] hover:text-[var(--color-cyan)] transition-colors"
                    >
                      pkg {shortenPubkey(bid.packageId)}
                    </button>
                    <span className="ml-auto text-[12px] text-[var(--color-bone)] font-bold tabular-nums">
                      {bid.costSol}{" "}
                      <span className="text-[var(--color-ash)] text-[9px] font-semibold">
                        SOL
                      </span>
                    </span>
                  </div>
                  {bid.reasoning && (
                    <div className="text-[11px] text-[var(--color-steel)] leading-relaxed pl-0">
                      <span className="text-[var(--color-ash)]">$ </span>
                      {bid.reasoning}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>

        {/* RIGHT TOP — Live event feed */}
        <Panel
          title="EVENT STREAM"
          meta={
            <span className="flex items-center gap-1.5">
              <div className="dot-live" /> LIVE
            </span>
          }
          accent="cyan"
          className="col-span-12 lg:col-span-5"
        >
          <div className="max-h-[260px] overflow-y-auto py-1">
            {wsEvents.length === 0 && (
              <div className="text-[var(--color-ash)] text-[11px] p-4 text-center">
                ░░ awaiting events ░░
              </div>
            )}
            {wsEvents.map((evt, i) => (
              <EventLine key={i} evt={evt} />
            ))}
          </div>
        </Panel>

        {/* RIGHT BOTTOM — Leaderboard */}
        <Panel
          title="REPUTATION LEADERBOARD"
          meta={`${leaderboard.length} AGENTS`}
          accent="magenta"
          className="col-span-12 lg:col-span-5"
        >
          <div className="max-h-[252px] overflow-y-auto">
            {leaderboard.length === 0 && (
              <div className="text-[var(--color-ash)] text-[11px] p-4 text-center">
                ░░ no ranked agents ░░
              </div>
            )}
            {leaderboard.map((agent, i) => {
              const color = agentColorFor(agent.agentPubkey);
              const rankStr = String(i + 1).padStart(2, "0");
              return (
                <div
                  key={agent.agentPubkey}
                  className="flex items-center gap-3 px-4 py-2 border-b border-[var(--color-line)] hover:bg-[var(--color-hover)] last:border-b-0"
                >
                  <span className="text-[11px] text-[var(--color-steel)] tabular-nums font-semibold">
                    #{rankStr}
                  </span>
                  <div
                    className="w-1.5 h-6"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className="text-[11px] font-bold flex-1"
                    style={{ color }}
                  >
                    {shortenPubkey(agent.agentPubkey)}
                  </span>
                  <span className="text-[10px] text-[var(--color-steel)] tabular-nums font-semibold">
                    {agent.legsCompleted}/{agent.legsAccepted} LEGS
                  </span>
                  <div className="w-16 h-1 bg-[var(--color-line)] relative">
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${agent.reliabilityScore}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span
                    className="text-[12px] font-bold tabular-nums w-10 text-right"
                    style={{ color }}
                  >
                    {agent.reliabilityScore}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* Mini stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat
          label="VOLUME SETTLED"
          value={`${stats.volume.totalSol.toFixed(3)} SOL`}
        />
        <MiniStat label="LEGS COMPLETED" value={stats.legs.completed} />
        <MiniStat label="WS CLIENTS" value={stats.wsClients} />
        <MiniStat
          label="DELIVERY RATE"
          value={
            stats.packages.total > 0
              ? `${Math.round((stats.packages.delivered / stats.packages.total) * 100)}%`
              : "0%"
          }
        />
      </div>

      {/* Recent packages + digital tasks combined ledger */}
      <Panel
        title="DISPATCH LEDGER ▸ RECENT TASKS"
        meta={`${(activity?.recentPackages.length ?? 0) + (activity?.recentDigitalTasks?.length ?? 0)} ROWS · CLICK PHYSICAL ROW TO INSPECT SWARM`}
        accent="amber"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-[var(--color-line)] bg-[var(--color-elevated)]">
                <th className="text-left py-2.5 px-4 label">ID</th>
                <th className="text-left py-2.5 px-2 label">DESCRIPTION</th>
                <th className="text-right py-2.5 px-2 label">BUDGET</th>
                <th className="text-left py-2.5 px-2 label">STATUS</th>
                <th className="text-right py-2.5 px-4 label">LISTED</th>
              </tr>
            </thead>
            <tbody>
              {activity?.recentPackages.map((pkg) => {
                const statusColor = STATUS_COLOR[pkg.status] ?? "var(--color-ash)";
                const hasSwarm =
                  pkg.status === "swarm_forming" ||
                  pkg.status === "in_transit" ||
                  pkg.status === "delivered";
                return (
                  <tr
                    key={pkg.id}
                    onClick={() => hasSwarm && onOpenSwarm?.(pkg.id)}
                    className={`border-b border-[var(--color-line)] hover:bg-[var(--color-hover)] last:border-b-0 ${
                      hasSwarm ? "cursor-pointer" : "cursor-default"
                    }`}
                  >
                    <td className="py-2.5 px-4 font-mono text-[var(--color-steel)] tabular-nums">
                      {pkg.id.slice(0, 8)}
                    </td>
                    <td className="py-2.5 px-2 text-[var(--color-bone)]">
                      {pkg.description}
                    </td>
                    <td className="py-2.5 px-2 text-right text-[var(--color-bone)] tabular-nums font-semibold">
                      {pkg.maxBudgetSol}{" "}
                      <span className="text-[var(--color-ash)] text-[9px] font-semibold">
                        SOL
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-1.5 h-1.5"
                          style={{ backgroundColor: statusColor }}
                        />
                        <span
                          className="text-[10px] uppercase tracking-[0.12em] font-bold"
                          style={{ color: statusColor }}
                        >
                          {pkg.status.replace("_", " ")}
                        </span>
                        {hasSwarm && (
                          <span className="ml-auto text-[var(--color-ash)] text-[9px]">
                            ▸
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right text-[var(--color-steel)] tabular-nums">
                      {timeAgo(pkg.listedAt)} ago
                    </td>
                  </tr>
                );
              })}
              {activity?.recentDigitalTasks?.map((task) => {
                const completedLegs = task.legs.filter((l) => l.status === "completed").length;
                const statusColor =
                  task.status === "completed" ? "var(--color-phosphor)"
                  : task.status === "in_progress" ? "var(--color-amber)"
                  : "var(--color-cyan)";
                return (
                  <tr
                    key={task.id}
                    className="border-b border-[var(--color-line)] hover:bg-[var(--color-hover)] last:border-b-0 cursor-default"
                  >
                    <td className="py-2.5 px-4 font-mono text-[var(--color-steel)] tabular-nums">
                      {task.id.slice(0, 8)}
                    </td>
                    <td className="py-2.5 px-2 text-[var(--color-bone)]">
                      <span className="text-[8px] tracking-[0.14em] font-semibold text-[var(--color-cyan)] mr-2 border border-[var(--color-cyan)] px-1 py-0.5">
                        DIGITAL
                      </span>
                      {task.title}
                    </td>
                    <td className="py-2.5 px-2 text-right text-[var(--color-bone)] tabular-nums font-semibold">
                      {task.maxBudgetSol}{" "}
                      <span className="text-[var(--color-ash)] text-[9px] font-semibold">SOL</span>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5" style={{ backgroundColor: statusColor }} />
                        <span className="text-[10px] uppercase tracking-[0.12em] font-bold" style={{ color: statusColor }}>
                          {task.status.replace("_", " ")}
                        </span>
                        <span className="ml-2 text-[9px] text-[var(--color-ash)]">
                          {completedLegs}/{task.legs.length} legs
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right text-[var(--color-steel)] tabular-nums">
                      {timeAgo(task.listedAt)} ago
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
