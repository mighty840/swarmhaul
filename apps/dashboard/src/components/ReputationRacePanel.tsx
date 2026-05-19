import type { AgentReputation } from "@swarmhaul/types";
import { Panel } from "./Panel.js";

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

function shortenPubkey(pk: string): string {
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 6)}··${pk.slice(-4)}`;
}

export function ReputationRacePanel({
  leaderboard,
  className = "",
}: {
  leaderboard: AgentReputation[];
  className?: string;
}) {
  // Already sorted by API, but sort defensively by reliabilityScore desc, then legs.
  const ranked = [...leaderboard]
    .sort((a, b) => {
      if (b.reliabilityScore !== a.reliabilityScore) {
        return b.reliabilityScore - a.reliabilityScore;
      }
      return b.legsCompleted - a.legsCompleted;
    })
    .slice(0, 10);

  const leaderScore = ranked[0]?.reliabilityScore ?? 100;
  // Bar fill is relative to the leader so the race is visually competitive,
  // but never goes below an absolute baseline at 6% so even a 0-score agent
  // shows a sliver and the row remains legible.
  const barPctFor = (score: number) => {
    if (leaderScore <= 0) return 6;
    const rel = (score / leaderScore) * 100;
    return Math.max(6, Math.min(100, rel));
  };

  return (
    <Panel
      title="REPUTATION RACE ▸ LIVE STANDINGS"
      meta={
        ranked.length === 0
          ? "AWAITING AGENTS"
          : `TOP ${ranked.length} · LEADER ${leaderScore.toFixed(0)}`
      }
      accent="phosphor"
      className={className}
    >
      <div className="p-4">
        {ranked.length === 0 ? (
          <div className="text-[var(--color-ash)] text-[11px] py-6 text-center tracking-[0.14em] uppercase font-semibold">
            ░░ NO AGENTS IN THE RACE ░░
          </div>
        ) : (
          <div className="space-y-2">
            {ranked.map((agent, i) => {
              const color = agentColorFor(agent.agentPubkey);
              const pct = barPctFor(agent.reliabilityScore);
              const rank = i + 1;
              const isLeader = rank === 1;
              return (
                <div
                  key={agent.agentPubkey}
                  className="flex items-center gap-3 group"
                >
                  {/* Rank pill */}
                  <div className="w-9 flex-none text-right">
                    <span
                      className="text-[18px] font-light tabular-nums"
                      style={{
                        color: rank <= 3 ? color : "var(--color-steel)",
                      }}
                    >
                      {String(rank).padStart(2, "0")}
                    </span>
                  </div>

                  {/* Bar with overlaid pubkey */}
                  <div className="relative flex-1 h-7 bg-[var(--color-graphite)] border border-[var(--color-line)] overflow-hidden">
                    {/* Track grid markers at 25/50/75% */}
                    <div
                      className="absolute inset-y-0 left-1/4 w-px"
                      style={{ background: "var(--color-line)" }}
                    />
                    <div
                      className="absolute inset-y-0 left-1/2 w-px"
                      style={{ background: "var(--color-line)" }}
                    />
                    <div
                      className="absolute inset-y-0 left-3/4 w-px"
                      style={{ background: "var(--color-line)" }}
                    />
                    {/* Bar fill */}
                    <div
                      className="absolute inset-y-0 left-0 transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${color}33 0%, ${color}cc 100%)`,
                        boxShadow: isLeader ? `0 0 12px ${color}80` : undefined,
                      }}
                    />
                    {/* Leader marker — checker on the leading edge */}
                    <div
                      className="absolute inset-y-0"
                      style={{
                        left: `calc(${pct}% - 2px)`,
                        width: 2,
                        background: color,
                        boxShadow: `0 0 6px ${color}`,
                      }}
                    />
                    {/* Pubkey overlay */}
                    <div className="absolute inset-0 flex items-center px-3 gap-2">
                      {isLeader && (
                        <span
                          className="text-[8px] font-bold tracking-[0.14em] px-1 py-0.5"
                          style={{
                            color: "var(--color-void)",
                            background: color,
                          }}
                        >
                          LEAD
                        </span>
                      )}
                      <span
                        className="text-[11px] font-bold tracking-[0.04em] font-mono"
                        style={{
                          color: "var(--color-bone)",
                          textShadow: "0 0 6px var(--color-void)",
                        }}
                      >
                        {shortenPubkey(agent.agentPubkey)}
                      </span>
                      {agent.mode && (
                        <span
                          className="text-[8px] font-bold tracking-[0.12em] px-1 py-0.5 opacity-80"
                          style={{
                            color:
                              agent.mode === "courier"
                                ? "var(--color-amber)"
                                : agent.mode === "digital"
                                  ? "var(--color-cyan)"
                                  : "var(--color-magenta)",
                            border: `1px solid ${
                              agent.mode === "courier"
                                ? "var(--color-amber)"
                                : agent.mode === "digital"
                                  ? "var(--color-cyan)"
                                  : "var(--color-magenta)"
                            }`,
                            background: "var(--color-void)",
                          }}
                        >
                          {agent.mode.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Score */}
                  <div className="flex-none w-12 text-right">
                    <div
                      className="text-[14px] font-bold tabular-nums leading-none"
                      style={{ color }}
                    >
                      {agent.reliabilityScore}
                    </div>
                    <div className="text-[8px] text-[var(--color-ash)] tracking-[0.14em] uppercase font-semibold mt-0.5">
                      SCORE
                    </div>
                  </div>

                  {/* Legs */}
                  <div className="flex-none w-14 text-right">
                    <div className="text-[12px] tabular-nums text-[var(--color-bone)] font-semibold leading-none">
                      {agent.legsCompleted}
                      <span className="text-[var(--color-ash)] text-[10px] font-semibold">
                        /{agent.legsAccepted}
                      </span>
                    </div>
                    <div className="text-[8px] text-[var(--color-ash)] tracking-[0.14em] uppercase font-semibold mt-0.5">
                      LEGS
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}
