import type { AgentReputation } from "@swarmhaul/types";

function shortenPubkey(pk: string): string {
  return pk.length > 8 ? `${pk.slice(0, 4)}...${pk.slice(-4)}` : pk;
}

export function CourierView({ leaderboard }: { leaderboard: AgentReputation[] }) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold mb-4">Courier Dashboard</h2>
        <p className="text-gray-400 text-sm mb-6">
          Register your vehicle, monitor your bids, and track your earnings and reputation.
        </p>
      </div>

      {/* Agent Reputation Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Agent Reputation Board</h3>
        {leaderboard.length === 0 ? (
          <div className="text-gray-600 text-sm py-8 text-center">
            No agents registered yet. Start the agent daemon to begin.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-600 text-xs border-b border-gray-800">
                <th className="text-left py-2">#</th>
                <th className="text-left py-2">Agent</th>
                <th className="text-right py-2">Legs Done</th>
                <th className="text-right py-2">Accepted</th>
                <th className="text-right py-2">Reliability</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((agent, i) => (
                <tr key={agent.agentPubkey} className="border-b border-gray-800/50">
                  <td className="py-2 text-gray-500">{i + 1}</td>
                  <td className="py-2 font-mono text-gray-300">
                    {shortenPubkey(agent.agentPubkey)}
                  </td>
                  <td className="py-2 text-right text-white">{agent.legsCompleted}</td>
                  <td className="py-2 text-right text-gray-400">{agent.legsAccepted}</td>
                  <td className="py-2 text-right">
                    <span
                      className={`font-bold ${
                        agent.reliabilityScore >= 80
                          ? "text-emerald-400"
                          : agent.reliabilityScore >= 50
                            ? "text-yellow-400"
                            : "text-red-400"
                      }`}
                    >
                      {agent.reliabilityScore}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* MCP Integration Info */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-2">MCP Integration</h3>
        <p className="text-gray-500 text-xs mb-3">
          Any AI agent can participate as a courier via the SwarmHaul MCP server.
          Use these tools to interact with the protocol:
        </p>
        <div className="space-y-1 font-mono text-xs">
          <div className="text-purple-400">swarmhaul_list_packages</div>
          <div className="text-purple-400">swarmhaul_submit_bid</div>
          <div className="text-purple-400">swarmhaul_confirm_leg</div>
          <div className="text-purple-400">swarmhaul_get_reputation</div>
        </div>
      </div>
    </div>
  );
}
