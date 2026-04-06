import type { AgentReputation, WSEvent } from "@swarmhaul/types";

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
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-gray-600 text-xs mt-1">{sub}</div>}
    </div>
  );
}

function shortenPubkey(pk: string): string {
  return pk.length > 8 ? `${pk.slice(0, 4)}...${pk.slice(-4)}` : pk;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

export function EconomyView({
  stats,
  activity,
  leaderboard,
  wsEvents,
}: {
  stats: EconomyStats | null;
  activity: Activity | null;
  leaderboard: AgentReputation[];
  wsEvents: WSEvent[];
}) {
  if (!stats)
    return <div className="text-gray-500 text-center py-20">Loading economy data...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
          Agent Economy Observatory
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <StatCard label="Packages" value={stats.packages.total} sub={`${stats.packages.active} active`} />
          <StatCard label="Delivered" value={stats.packages.delivered} />
          <StatCard label="Swarms" value={stats.swarms.total} sub={`${stats.swarms.active} active`} />
          <StatCard label="Bids" value={stats.bids.total} />
          <StatCard label="Agents" value={stats.agents.total} />
          <StatCard label="Legs Done" value={stats.legs.completed} />
          <StatCard label="Volume" value={`${stats.volume.totalSol.toFixed(2)} SOL`} />
          <StatCard label="WS Clients" value={stats.wsClients} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Live Event Feed */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Live Events</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {wsEvents.length === 0 && (
              <div className="text-gray-600 text-xs">Waiting for events...</div>
            )}
            {wsEvents.map((evt, i) => (
              <div key={i} className="text-xs border-l-2 border-gray-700 pl-2 py-1">
                <span className="text-emerald-400 font-mono">{evt.type}</span>
                <div className="text-gray-500 mt-0.5">
                  {"package" in evt && evt.package && `${evt.package.description}`}
                  {"bid" in evt && evt.bid && `${shortenPubkey(evt.bid.agentPubkey)} bid ${evt.bid.costSol} SOL`}
                  {"swarm" in evt && evt.swarm && `${evt.swarm.legs.length} legs, ${evt.swarm.totalCostSol} SOL`}
                  {"leg" in evt && evt.leg && `${shortenPubkey(evt.leg.agentPubkey)} — ${evt.leg.agreedPaymentSol} SOL`}
                  {"packageId" in evt && evt.type === "PACKAGE_DELIVERED" && `Package ${shortenPubkey(evt.packageId)}`}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Bids with Agent Reasoning */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Agent Reasoning</h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {activity?.recentBids.map((bid) => (
              <div key={bid.id} className="border-l-2 border-purple-500/50 pl-2">
                <div className="flex justify-between text-xs">
                  <span className="text-purple-400 font-mono">{shortenPubkey(bid.agentPubkey)}</span>
                  <span className="text-gray-600">{timeAgo(bid.createdAt)}</span>
                </div>
                <div className="text-white text-xs mt-0.5">{bid.costSol} SOL</div>
                {bid.reasoning && (
                  <div className="text-gray-500 text-[11px] mt-1 italic">
                    "{bid.reasoning}"
                  </div>
                )}
              </div>
            ))}
            {!activity?.recentBids.length && (
              <div className="text-gray-600 text-xs">No bids yet</div>
            )}
          </div>
        </div>

        {/* Agent Leaderboard */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Agent Leaderboard</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {leaderboard.map((agent, i) => (
              <div key={agent.agentPubkey} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 w-4 text-right">{i + 1}</span>
                  <span className="font-mono text-gray-300">
                    {shortenPubkey(agent.agentPubkey)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500">{agent.legsCompleted} legs</span>
                  <span
                    className={`font-medium ${
                      agent.reliabilityScore >= 80
                        ? "text-emerald-400"
                        : agent.reliabilityScore >= 50
                          ? "text-yellow-400"
                          : "text-red-400"
                    }`}
                  >
                    {agent.reliabilityScore}%
                  </span>
                </div>
              </div>
            ))}
            {leaderboard.length === 0 && (
              <div className="text-gray-600 text-xs">No agents yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Packages */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Recent Packages</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-600 border-b border-gray-800">
                <th className="text-left py-2 pr-4">ID</th>
                <th className="text-left py-2 pr-4">Description</th>
                <th className="text-left py-2 pr-4">Budget</th>
                <th className="text-left py-2 pr-4">Status</th>
                <th className="text-left py-2">Listed</th>
              </tr>
            </thead>
            <tbody>
              {activity?.recentPackages.map((pkg) => (
                <tr key={pkg.id} className="border-b border-gray-800/50">
                  <td className="py-2 pr-4 font-mono text-gray-400">
                    {shortenPubkey(pkg.id)}
                  </td>
                  <td className="py-2 pr-4 text-gray-300">{pkg.description}</td>
                  <td className="py-2 pr-4 text-white">{pkg.maxBudgetSol} SOL</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        pkg.status === "delivered"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : pkg.status === "listed"
                            ? "bg-blue-500/20 text-blue-400"
                            : pkg.status === "in_transit"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-gray-500/20 text-gray-400"
                      }`}
                    >
                      {pkg.status}
                    </span>
                  </td>
                  <td className="py-2 text-gray-600">{timeAgo(pkg.listedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
