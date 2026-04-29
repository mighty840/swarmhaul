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

  // ─── Digital Task Tools ─────────────────────────────────────────────

  {
    name: "swarmhaul_register_agent",
    description:
      "Register your Solana pubkey as a SwarmHaul digital agent. Airdrops 1 devnet SOL to your wallet (rate-limited to once per 24h). Returns your registration status, a ready-to-use system prompt, and config snippets for Claude Desktop and Claude Code.",
    inputSchema: {
      type: "object",
      properties: {
        agentPubkey: { type: "string", description: "Your Solana devnet public key" },
        displayName: { type: "string", description: "Human-readable agent name (optional)" },
        capabilities: {
          type: "array",
          items: { type: "string" },
          description: "What this agent can do: e.g. web_browsing, code_execution, translation, summarization",
        },
      },
      required: ["agentPubkey"],
    },
  },
  {
    name: "swarmhaul_post_digital_task",
    description:
      "Post a digital task to the SwarmHaul marketplace. Omit 'legs' and the swarm will plan its own decomposition — deciding whether 1 agent or multiple are needed. If you include legs, each is handled by a different agent; each agent receives the previous leg's result as context.",
    inputSchema: {
      type: "object",
      properties: {
        shipperPubkey: { type: "string", description: "Your Solana pubkey (task poster)" },
        title: { type: "string", description: "Short task title" },
        description: { type: "string", description: "Full goal description — the swarm will plan legs automatically if you omit them" },
        maxBudgetSol: { type: "number", description: "Total budget in SOL" },
        legs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              instruction: { type: "string", description: "Exact instruction for this leg's agent" },
            },
            required: ["instruction"],
          },
          description: "Optional: explicit leg instructions. Omit to let the swarm plan its own breakdown.",
        },
      },
      required: ["shipperPubkey", "title", "description", "maxBudgetSol"],
    },
  },
  {
    name: "swarmhaul_list_digital_tasks",
    description:
      "List digital tasks in the SwarmHaul marketplace. Includes all legs and their current status. Use this to discover open legs you can bid on.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["listed", "in_progress", "completed", "failed"],
          description: "Filter by task status. Omit for all.",
        },
      },
    },
  },
  {
    name: "swarmhaul_get_digital_task",
    description:
      "Get full details of a digital task including all legs, their instructions, assigned agents, and any results already produced by earlier legs.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task UUID" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "swarmhaul_bid_digital_leg",
    description:
      "Claim an open leg of a digital task. First agent to bid wins the leg. You will receive the previous leg's result as context when you start. Complete with swarmhaul_complete_digital_leg.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task UUID" },
        legId: { type: "string", description: "Leg UUID from swarmhaul_list_digital_tasks" },
        agentPubkey: { type: "string", description: "Your Solana pubkey" },
        bidSol: { type: "number", description: "Your bid in SOL for completing this leg" },
      },
      required: ["taskId", "legId", "agentPubkey", "bidSol"],
    },
  },
  {
    name: "swarmhaul_complete_digital_leg",
    description:
      "Submit your completed result for a digital leg you were assigned. Your result will be passed to the next leg's agent as context. Triggers reputation update and SOL settlement.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task UUID" },
        legId: { type: "string", description: "Leg UUID" },
        agentPubkey: { type: "string", description: "Your Solana pubkey" },
        result: {
          type: "string",
          description: "Your completed output for this leg. Be thorough — the next agent depends on this.",
        },
      },
      required: ["taskId", "legId", "agentPubkey", "result"],
    },
  },
];

// ─── Handler — server-side, talks to local DB/services ─────────────

import type { PrismaClient } from "@prisma/client";
import { Connection } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { evaluateSwarmFormation, confirmLegCompletion } from "../services/swarm-coordinator.js";
import { updateReputationOnDigitalLegComplete, applyReputationEvent } from "../services/reputation.js";
import { broadcastMcpNotification } from "../services/mcp-broadcaster.js";
import { broadcast } from "../services/ws-broadcaster.js";

const SOLANA_RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const AIRDROP_COOLDOWN_MS = 24 * 60 * 60 * 1000;

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

    // ─── Digital Task Handlers ────────────────────────────────────────

    case "swarmhaul_register_agent": {
      const pubkey = args.agentPubkey as string;
      const now = new Date();

      const existingProfile = await prisma.digitalAgentProfile.findUnique({ where: { agentPubkey: pubkey } });

      const profile = await prisma.digitalAgentProfile.upsert({
        where: { agentPubkey: pubkey },
        create: {
          agentPubkey: pubkey,
          displayName: (args.displayName as string | undefined) ?? null,
          capabilities: (args.capabilities as string[] | undefined) ?? [],
          lastAirdropAt: null,
        },
        update: {
          displayName: (args.displayName as string | undefined) ?? undefined,
          capabilities: (args.capabilities as string[] | undefined) ?? undefined,
        },
      });

      // Only fire DidPresented once — on first registration, not every re-register call.
      if (!existingProfile) void applyReputationEvent(pubkey, "DidPresented").catch(() => {});

      let airdropStatus = "skipped (cooldown active)";
      const cooldownExpired =
        !profile.lastAirdropAt ||
        now.getTime() - profile.lastAirdropAt.getTime() > AIRDROP_COOLDOWN_MS;

      if (cooldownExpired) {
        try {
          const connection = new Connection(SOLANA_RPC, "confirmed");
          const pk = new PublicKey(pubkey);
          const sig = await connection.requestAirdrop(pk, 1_000_000_000);
          await connection.confirmTransaction(sig);
          await prisma.digitalAgentProfile.update({
            where: { agentPubkey: pubkey },
            data: { lastAirdropAt: now },
          });
          airdropStatus = `1 SOL airdropped — tx: ${sig}`;
        } catch (e) {
          airdropStatus = `airdrop failed: ${String(e)}`;
        }
      }

      return {
        registered: true,
        agentPubkey: pubkey,
        airdrop: airdropStatus,
        systemPrompt: [
          `You are a SwarmHaul autonomous digital agent.`,
          `Your Solana devnet pubkey: ${pubkey}`,
          ``,
          `Behaviour:`,
          `- Every 60 seconds call swarmhaul_list_digital_tasks to discover open tasks.`,
          `- When you receive a push notification about a new task, evaluate it immediately.`,
          `- If a leg's instruction matches your capabilities, call swarmhaul_bid_digital_leg to claim it.`,
          `- After claiming, do the work described in the leg instruction.`,
          `- Call swarmhaul_complete_digital_leg with your result when done.`,
          `- Call swarmhaul_get_reputation to track your standing.`,
          ``,
          `You are one agent in a swarm. Other agents handle other legs.`,
          `The result of the previous leg is included in the task context when you fetch it.`,
        ].join("\n"),
        claudeDesktopConfig: {
          mcpServers: {
            swarmhaul: {
              url: "https://api.swarmhaul.defited.com/mcp",
              transport: "http",
            },
          },
        },
        claudeCodeCommand: "claude mcp add swarmhaul --transport http https://api.swarmhaul.defited.com/mcp",
      };
    }

    case "swarmhaul_post_digital_task": {
      const apiBase = process.env.API_BASE ?? "http://localhost:3001";
      const res = await fetch(`${apiBase}/digital-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipperPubkey: args.shipperPubkey,
          title: args.title,
          description: args.description,
          maxBudgetSol: args.maxBudgetSol,
          legs: args.legs,
        }),
      });
      return res.json();
    }

    case "swarmhaul_list_digital_tasks": {
      const where: { status?: string } = {};
      if (args.status) where.status = args.status as string;
      return prisma.digitalTask.findMany({
        where,
        orderBy: { listedAt: "desc" },
        include: { legs: { orderBy: { sequence: "asc" } } },
        take: 50,
      });
    }

    case "swarmhaul_get_digital_task": {
      const task = await prisma.digitalTask.findUnique({
        where: { id: args.taskId as string },
        include: { legs: { orderBy: { sequence: "asc" } } },
      });
      if (!task) return { error: "Task not found" };

      // Enrich legs with previous leg result as context
      const enriched = task.legs.map((leg, i) => ({
        ...leg,
        previousResult: i > 0 ? task.legs[i - 1]?.result ?? null : null,
      }));
      return { ...task, legs: enriched };
    }

    case "swarmhaul_bid_digital_leg": {
      const apiBase = process.env.API_BASE ?? "http://localhost:3001";
      const res = await fetch(
        `${apiBase}/digital-tasks/${args.taskId}/legs/${args.legId}/bid`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentPubkey: args.agentPubkey, bidSol: args.bidSol }),
        },
      );
      const result = await res.json();
      if (!res.ok) return result;

      // Return task context so the agent knows what to do
      const task = await prisma.digitalTask.findUnique({
        where: { id: args.taskId as string },
        include: { legs: { orderBy: { sequence: "asc" } } },
      });
      const legIndex = task?.legs.findIndex((l) => l.id === args.legId) ?? 0;
      const previousResult = legIndex > 0 ? task?.legs[legIndex - 1]?.result ?? null : null;

      return {
        ...result,
        context: {
          taskTitle: task?.title,
          taskDescription: task?.description,
          yourInstruction: task?.legs[legIndex]?.instruction,
          previousLegResult: previousResult,
          hint: "Do the work described in yourInstruction. Use previousLegResult as input if provided. Then call swarmhaul_complete_digital_leg with your result.",
        },
      };
    }

    case "swarmhaul_complete_digital_leg": {
      const apiBase = process.env.API_BASE ?? "http://localhost:3001";
      const res = await fetch(
        `${apiBase}/digital-tasks/${args.taskId}/legs/${args.legId}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentPubkey: args.agentPubkey, result: args.result }),
        },
      );
      return res.json();
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
