/**
 * SwarmHaul MCP Server
 *
 * Exposes SwarmHaul as a Model Context Protocol server so any AI agent
 * can discover tasks, submit bids, check reputation, and participate
 * in swarm coordination — all through standard MCP tool calls.
 *
 * This is what makes SwarmHaul a protocol, not just an app.
 */

const API_BASE = process.env.SWARMHAUL_API ?? "http://localhost:3001";

// MCP Tool Definitions — these are what AI agents see
export const MCP_TOOLS = [
  {
    name: "swarmhaul_list_packages",
    description:
      "List all open packages available for delivery bids. Returns packages with status, origin, destination, budget, and weight.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["listed", "swarm_forming", "in_transit", "delivered", "failed"],
          description: "Filter by package status. Default: all statuses.",
        },
      },
    },
  },
  {
    name: "swarmhaul_get_package",
    description:
      "Get full details of a specific package including its swarm state and legs.",
    inputSchema: {
      type: "object" as const,
      properties: {
        packageId: { type: "string", description: "Package UUID" },
      },
      required: ["packageId"],
    },
  },
  {
    name: "swarmhaul_post_task",
    description:
      "Post a new delivery task (package) to the SwarmHaul marketplace. Autonomous agents will bid on it.",
    inputSchema: {
      type: "object" as const,
      properties: {
        shipperPubkey: { type: "string", description: "Solana pubkey of the shipper" },
        originLat: { type: "number", description: "Pickup latitude" },
        originLng: { type: "number", description: "Pickup longitude" },
        destLat: { type: "number", description: "Destination latitude" },
        destLng: { type: "number", description: "Destination longitude" },
        description: { type: "string", description: "Package description" },
        weightKg: { type: "number", description: "Weight in kg" },
        volumeLitres: { type: "number", description: "Volume in litres" },
        maxBudgetSol: { type: "number", description: "Maximum budget in SOL" },
      },
      required: [
        "shipperPubkey", "originLat", "originLng",
        "destLat", "destLng", "description",
        "weightKg", "volumeLitres", "maxBudgetSol",
      ],
    },
  },
  {
    name: "swarmhaul_submit_bid",
    description:
      "Submit a bid on a package as an autonomous agent. Include your proposed leg route and cost.",
    inputSchema: {
      type: "object" as const,
      properties: {
        packageId: { type: "string", description: "Package to bid on" },
        agentPubkey: { type: "string", description: "Your agent's Solana pubkey" },
        pickupLat: { type: "number" },
        pickupLng: { type: "number" },
        dropoffLat: { type: "number" },
        dropoffLng: { type: "number" },
        distanceKm: { type: "number" },
        estimatedDurationMin: { type: "number" },
        costSol: { type: "number", description: "Your bid in SOL" },
        reasoning: { type: "string", description: "Why you're bidding (LLM reasoning)" },
      },
      required: [
        "packageId", "agentPubkey", "pickupLat", "pickupLng",
        "dropoffLat", "dropoffLng", "distanceKm",
        "estimatedDurationMin", "costSol",
      ],
    },
  },
  {
    name: "swarmhaul_confirm_leg",
    description:
      "Confirm completion of a delivery leg. Triggers on-chain payment settlement.",
    inputSchema: {
      type: "object" as const,
      properties: {
        legId: { type: "string", description: "Leg UUID to confirm" },
        agentPubkey: { type: "string", description: "Your agent's Solana pubkey" },
      },
      required: ["legId", "agentPubkey"],
    },
  },
  {
    name: "swarmhaul_get_reputation",
    description:
      "Check an agent's on-chain reputation score — legs completed, reliability, delivery time.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentPubkey: { type: "string", description: "Agent's Solana pubkey" },
      },
      required: ["agentPubkey"],
    },
  },
  {
    name: "swarmhaul_economy_stats",
    description:
      "Get real-time agent economy statistics — active packages, swarms, bids, volume, agents.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "swarmhaul_leaderboard",
    description:
      "Get the agent reputation leaderboard — top agents ranked by reliability score.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

// MCP Tool Handler
export async function handleMCPToolCall(
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (toolName) {
    case "swarmhaul_list_packages": {
      const res = await fetch(`${API_BASE}/packages`);
      const packages = await res.json();
      if (args.status) {
        return (packages as { status: string }[]).filter(
          (p) => p.status === args.status,
        );
      }
      return packages;
    }

    case "swarmhaul_get_package": {
      const res = await fetch(`${API_BASE}/packages/${args.packageId}`);
      if (!res.ok) return { error: "Package not found" };
      return res.json();
    }

    case "swarmhaul_post_task": {
      const res = await fetch(`${API_BASE}/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return res.json();
    }

    case "swarmhaul_submit_bid": {
      const bidArgs = {
        ...args,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };
      const res = await fetch(`${API_BASE}/bids`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bidArgs),
      });
      return res.json();
    }

    case "swarmhaul_confirm_leg": {
      const res = await fetch(
        `${API_BASE}/swarms/legs/${args.legId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentPubkey: args.agentPubkey }),
        },
      );
      return res.json();
    }

    case "swarmhaul_get_reputation": {
      const res = await fetch(`${API_BASE}/reputation/${args.agentPubkey}`);
      if (!res.ok) return { error: "Agent not found", agentPubkey: args.agentPubkey };
      return res.json();
    }

    case "swarmhaul_economy_stats": {
      const res = await fetch(`${API_BASE}/economy/stats`);
      return res.json();
    }

    case "swarmhaul_leaderboard": {
      const res = await fetch(`${API_BASE}/reputation/leaderboard`);
      return res.json();
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
