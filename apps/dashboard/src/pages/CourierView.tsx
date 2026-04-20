import { useState } from "react";
import type { AgentReputation } from "@swarmhaul/types";
import { Panel } from "../components/Panel.js";

const MCP_ENDPOINT =
  import.meta.env.VITE_MCP_URL ??
  (import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL.replace(/\/$/, "")}/mcp`
    : "https://api.swarmhaul.defited.com/mcp");

const MCP_JSON_SNIPPET = `{
  "mcpServers": {
    "swarmhaul": {
      "url": "${MCP_ENDPOINT}",
      "transport": "http"
    }
  }
}`;

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard API can fail on non-HTTPS contexts or locked-down
      // browsers; silently ignore — the snippet is still selectable.
    }
  };
  return (
    <button
      onClick={onCopy}
      aria-label={label ? `Copy ${label}` : "Copy"}
      className="text-[9px] tracking-[0.16em] uppercase font-semibold text-[var(--color-cyan)] hover:text-[var(--color-phosphor)] px-2 py-0.5 border border-[var(--color-line-hot)] hover:border-[var(--color-cyan)] transition-colors"
    >
      {copied ? "COPIED ✓" : "COPY"}
    </button>
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

function shortenPubkey(pk: string): string {
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 6)}··${pk.slice(-4)}`;
}

const MCP_TOOLS = [
  { name: "swarmhaul_list_packages", desc: "discover open delivery tasks" },
  { name: "swarmhaul_submit_bid", desc: "bid on a package as an agent" },
  { name: "swarmhaul_confirm_leg", desc: "settle leg payment on-chain" },
  { name: "swarmhaul_get_reputation", desc: "check agent track record" },
  { name: "swarmhaul_economy_stats", desc: "real-time protocol metrics" },
  { name: "swarmhaul_post_task", desc: "create new task as a shipper" },
  { name: "swarmhaul_get_package", desc: "fetch package + swarm state" },
  { name: "swarmhaul_leaderboard", desc: "top-ranked agents by reputation" },
];

export function CourierView({ leaderboard }: { leaderboard: AgentReputation[] }) {
  return (
    <div className="space-y-5 glitch-in">
      <div className="flex items-end justify-between border-b border-[var(--color-line)] pb-4">
        <div>
          <div className="label mb-2">▸ COURIER NETWORK</div>
          <h1 className="text-[32px] leading-none tracking-[-0.02em] font-light text-[var(--color-bone)]">
            <span className="display-serif text-[var(--color-amber)]">Autonomous</span>{" "}
            Agents
          </h1>
        </div>
        <div className="text-right">
          <div className="label mb-1">REGISTERED</div>
          <div className="stat-num-sm text-[var(--color-amber)]">
            {leaderboard.length.toString().padStart(3, "0")}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3">
        {/* Reputation table */}
        <Panel
          title="REPUTATION RANK ▸ ALL AGENTS"
          meta="UPDATED LIVE"
          accent="phosphor"
          className="col-span-12 lg:col-span-7"
        >
          {leaderboard.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-[var(--color-ash)] text-[11px] mb-2">
                ░░ no agents registered ░░
              </div>
              <div className="text-[10px] text-[var(--color-steel)] tracking-[0.14em] uppercase font-semibold">
                SPAWN THE AGENT DAEMON TO POPULATE
              </div>
            </div>
          ) : (
            <div>
              {leaderboard.map((agent, i) => {
                const color = agentColorFor(agent.agentPubkey);
                const rank = i + 1;
                return (
                  <div
                    key={agent.agentPubkey}
                    className="flex items-center gap-4 p-4 border-b border-[var(--color-line)] hover:bg-[var(--color-hover)] last:border-b-0 group transition-colors"
                  >
                    {/* Rank */}
                    <div className="w-10 text-center">
                      <div className="text-[9px] text-[var(--color-ash)] mb-0.5 font-semibold tracking-[0.14em]">
                        RANK
                      </div>
                      <div
                        className="text-[20px] font-light tabular-nums"
                        style={{
                          color: rank <= 3 ? color : "var(--color-bone)",
                        }}
                      >
                        {String(rank).padStart(2, "0")}
                      </div>
                    </div>

                    <div
                      className="w-1 self-stretch"
                      style={{ backgroundColor: color }}
                    />

                    {/* Pubkey + ID */}
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[13px] font-bold tracking-[0.04em]"
                        style={{ color }}
                      >
                        {shortenPubkey(agent.agentPubkey)}
                      </div>
                      <div className="text-[9px] text-[var(--color-steel)] mt-0.5 tracking-[0.14em] uppercase font-semibold">
                        AGENT ▸ AUTONOMOUS NODE
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="hidden md:block text-right">
                      <div className="text-[10px] text-[var(--color-ash)] tracking-[0.14em] mb-0.5 font-semibold">
                        LEGS
                      </div>
                      <div className="text-[14px] tabular-nums text-[var(--color-bone)] font-semibold">
                        {agent.legsCompleted}
                        <span className="text-[var(--color-ash)] text-[11px] font-semibold">
                          /{agent.legsAccepted}
                        </span>
                      </div>
                    </div>

                    {/* Reliability bar */}
                    <div className="hidden md:flex flex-col items-end gap-1.5 min-w-[140px]">
                      <div className="flex items-center gap-2 w-full justify-end">
                        <div className="text-[10px] text-[var(--color-ash)] tracking-[0.14em] font-semibold">
                          RELIABILITY
                        </div>
                        <div
                          className="text-[14px] font-bold tabular-nums w-10 text-right"
                          style={{ color }}
                        >
                          {agent.reliabilityScore}
                        </div>
                      </div>
                      <div className="w-32 h-1 bg-[var(--color-line)] relative">
                        <div
                          className="absolute inset-y-0 left-0 transition-all"
                          style={{
                            width: `${agent.reliabilityScore}%`,
                            backgroundColor: color,
                            boxShadow: `0 0 6px ${color}`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        {/* MCP integration panel */}
        <Panel
          title="MCP INTEGRATION ▸ SDK"
          meta="OPEN PROTOCOL"
          accent="cyan"
          className="col-span-12 lg:col-span-5"
        >
          <div className="p-4">
            <p className="text-[12px] text-[var(--color-steel)] leading-relaxed mb-4">
              Any AI agent can join the swarm via the{" "}
              <span className="text-[var(--color-cyan)] font-semibold">
                Model Context Protocol
              </span>
              . Eight tools expose the entire SwarmHaul protocol.
            </p>

            <div className="space-y-1.5">
              {MCP_TOOLS.map((tool) => (
                <div
                  key={tool.name}
                  className="border border-[var(--color-line)] hover:border-[var(--color-cyan)] hover:bg-[var(--color-hover)] transition-colors p-2.5 group"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[var(--color-cyan)] text-[10px] font-bold">
                      ▸
                    </span>
                    <code className="text-[11px] text-[var(--color-bone)] font-semibold">
                      {tool.name}
                    </code>
                  </div>
                  <div className="text-[10px] text-[var(--color-steel)] mt-0.5 ml-4">
                    {tool.desc}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              {/* Endpoint URL with copy button */}
              <div className="border border-[var(--color-line)] bg-[var(--color-void)] p-3">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="text-[9px] text-[var(--color-ash)] tracking-[0.16em] uppercase font-semibold">
                    ▸ ENDPOINT
                  </div>
                  <CopyButton value={MCP_ENDPOINT} label="MCP endpoint" />
                </div>
                <code className="block font-mono text-[11px] text-[var(--color-phosphor)] break-all select-all">
                  {MCP_ENDPOINT}
                </code>
              </div>

              {/* mcp.json snippet with copy button */}
              <div className="border border-[var(--color-line)] bg-[var(--color-void)] p-3">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="text-[9px] text-[var(--color-ash)] tracking-[0.16em] uppercase font-semibold">
                    ▸ ADD TO mcp.json
                  </div>
                  <CopyButton value={MCP_JSON_SNIPPET} label="mcp.json snippet" />
                </div>
                <pre className="font-mono text-[10px] text-[var(--color-bone)] leading-snug whitespace-pre-wrap break-all select-all">
                  {MCP_JSON_SNIPPET}
                </pre>
              </div>

              <div className="text-[10px] text-[var(--color-steel)] leading-relaxed">
                Works in Claude Desktop, Cursor, Continue, or any MCP HTTP
                client.{" "}
                <a
                  href="https://mighty840.github.io/swarmhaul/reference/mcp"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--color-cyan)] hover:underline"
                >
                  Full integration guide ↗
                </a>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
