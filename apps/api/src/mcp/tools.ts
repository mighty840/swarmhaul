/**
 * MCP tool definitions and handlers — server-side, called from both
 * the HTTP transport (apps/api) and the stdio transport (separate process).
 *
 * The HTTP transport calls these directly with a Prisma client. The stdio
 * transport calls them via the API's HTTP routes (so it can run as a
 * standalone binary). This file is the source of truth for the tool surface.
 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: "swarmhaul_list_packages",
    description:
      "List all open delivery packages in the SwarmHaul marketplace. Returns packages with status, origin, destination, budget, weight, and on-chain PDA addresses. Use this to discover work as an autonomous agent.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["listed", "swarm_forming", "in_transit", "delivered", "failed"],
          description: "Filter by package status. Omit for all statuses.",
        },
      },
    },
  },
  {
    name: "swarmhaul_get_package",
    description:
      "Get full details of a specific package including its swarm state, all legs, and Solana explorer links.",
    inputSchema: {
      type: "object",
      properties: {
        packageId: { type: "string", description: "Package UUID" },
      },
      required: ["packageId"],
    },
  },
  {
    name: "swarmhaul_post_task",
    description:
      "Post a new delivery task to the SwarmHaul marketplace. Triggers an on-chain list_package transaction. Autonomous agents will bid on it within seconds.",
    inputSchema: {
      type: "object",
      properties: {
        shipperPubkey: { type: "string", description: "Solana pubkey of the shipper" },
        originLat: { type: "number", description: "Pickup latitude (-90 to 90)" },
        originLng: { type: "number", description: "Pickup longitude (-180 to 180)" },
        destLat: { type: "number", description: "Destination latitude" },
        destLng: { type: "number", description: "Destination longitude" },
        description: { type: "string", description: "Human-readable description" },
        weightKg: { type: "number", description: "Package weight in kilograms" },
        volumeLitres: { type: "number", description: "Package volume in litres" },
        maxBudgetSol: { type: "number", description: "Maximum budget in SOL — locked in escrow" },
      },
      required: [
        "shipperPubkey",
        "originLat",
        "originLng",
        "destLat",
        "destLng",
        "description",
        "weightKg",
        "volumeLitres",
        "maxBudgetSol",
      ],
    },
  },
  {
    name: "swarmhaul_submit_bid",
    description:
      "Submit a bid on a package as an autonomous agent. Include your proposed leg route, distance, duration, cost, and reasoning. The swarm coordinator will evaluate bids and form an optimal relay chain.",
    inputSchema: {
      type: "object",
      properties: {
        packageId: { type: "string" },
        agentPubkey: { type: "string", description: "Your Solana pubkey" },
        pickupLat: { type: "number" },
        pickupLng: { type: "number" },
        dropoffLat: { type: "number" },
        dropoffLng: { type: "number" },
        distanceKm: { type: "number" },
        estimatedDurationMin: { type: "number" },
        costSol: { type: "number", description: "Your bid in SOL" },
        reasoning: {
          type: "string",
          description: "Why you're bidding (LLM reasoning, optional but encouraged)",
        },
      },
      required: [
        "packageId",
        "agentPubkey",
        "pickupLat",
        "pickupLng",
        "dropoffLat",
        "dropoffLng",
        "distanceKm",
        "estimatedDurationMin",
        "costSol",
      ],
    },
  },
  {
    name: "swarmhaul_confirm_leg",
    description:
      "Confirm completion of a delivery leg you were assigned. Notifies the API that you've delivered. The courier must sign the on-chain confirm_leg transaction separately via wallet adapter.",
    inputSchema: {
      type: "object",
      properties: {
        legId: { type: "string", description: "Leg UUID" },
        agentPubkey: { type: "string", description: "Your agent pubkey" },
      },
      required: ["legId", "agentPubkey"],
    },
  },
  {
    name: "swarmhaul_get_reputation",
    description:
      "Check an agent's on-chain reputation — legs completed, legs accepted, reliability score (0-100).",
    inputSchema: {
      type: "object",
      properties: {
        agentPubkey: { type: "string" },
      },
      required: ["agentPubkey"],
    },
  },
  {
    name: "swarmhaul_economy_stats",
    description:
      "Get real-time agent economy statistics — active packages, swarms, bids, total volume, registered agents.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "swarmhaul_leaderboard",
    description:
      "Get the agent reputation leaderboard — top 20 agents ranked by reliability score.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// ─── Handler — server-side, talks to local DB/services ─────────────

import type { PrismaClient } from "@prisma/client";
import { evaluateSwarmFormation, confirmLegCompletion } from "../services/swarm-coordinator.js";

export async function handleMcpToolCall(
  prisma: PrismaClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (toolName) {
    case "swarmhaul_list_packages": {
      const where: { status?: string } = {};
      if (args.status) where.status = args.status as string;
      return prisma.package.findMany({
        where,
        orderBy: { listedAt: "desc" },
        take: 50,
      });
    }

    case "swarmhaul_get_package": {
      const pkg = await prisma.package.findUnique({
        where: { id: args.packageId as string },
        include: { swarm: { include: { legs: true } } },
      });
      if (!pkg) return { error: "Package not found" };
      return pkg;
    }

    case "swarmhaul_post_task": {
      // Delegate to the HTTP route which knows how to call the on-chain
      // list_package. Done via local fetch to avoid duplicating tx logic.
      const res = await fetch("http://localhost:3001/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      return res.json();
    }

    case "swarmhaul_submit_bid": {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const bid = await prisma.bid.create({
        data: {
          packageId: args.packageId as string,
          agentPubkey: args.agentPubkey as string,
          pickupLat: args.pickupLat as number,
          pickupLng: args.pickupLng as number,
          dropoffLat: args.dropoffLat as number,
          dropoffLng: args.dropoffLng as number,
          distanceKm: args.distanceKm as number,
          estimatedDurationMin: args.estimatedDurationMin as number,
          costSol: args.costSol as number,
          reasoning: (args.reasoning as string | undefined) ?? null,
          expiresAt: new Date(expiresAt),
        },
      });
      // Trigger swarm formation evaluation
      evaluateSwarmFormation(bid.packageId).catch(() => {});
      return bid;
    }

    case "swarmhaul_confirm_leg": {
      const leg = await prisma.leg.findUnique({
        where: { id: args.legId as string },
      });
      if (!leg) return { error: "Leg not found" };
      if (leg.agentPubkey !== args.agentPubkey)
        return { error: "Not your leg" };
      await confirmLegCompletion(leg.id, leg.agentPubkey);
      return { success: true };
    }

    case "swarmhaul_get_reputation": {
      const rep = await prisma.agentReputation.findUnique({
        where: { agentPubkey: args.agentPubkey as string },
      });
      return rep ?? { error: "Agent not found", agentPubkey: args.agentPubkey };
    }

    case "swarmhaul_economy_stats": {
      const [packages, swarms, bids, agents, legsCompleted, delivered, volumeAgg] =
        await Promise.all([
          prisma.package.count(),
          prisma.swarm.count(),
          prisma.bid.count(),
          prisma.agentReputation.count(),
          prisma.leg.count({ where: { status: "completed" } }),
          prisma.package.count({ where: { status: "delivered" } }),
          prisma.swarm.aggregate({
            _sum: { totalCostSol: true },
            where: { status: "settled" },
          }),
        ]);
      return {
        packages: { total: packages, delivered },
        swarms: { total: swarms },
        bids: { total: bids },
        agents: { total: agents },
        legs: { completed: legsCompleted },
        volume: { totalSol: volumeAgg._sum.totalCostSol ?? 0 },
      };
    }

    case "swarmhaul_leaderboard": {
      return prisma.agentReputation.findMany({
        orderBy: { reliabilityScore: "desc" },
        take: 20,
      });
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
