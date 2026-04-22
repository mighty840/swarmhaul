import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { getClientCount } from "../services/ws-broadcaster.js";

export async function economyRoutes(app: FastifyInstance) {
  // Agent Economy Observatory — real-time stats
  app.get("/stats", async () => {
    const [
      totalPackages,
      activePackages,
      totalSwarms,
      activeSwarms,
      totalBids,
      totalAgents,
      totalLegsCompleted,
      deliveredPackages,
      totalDigitalTasks,
      inProgressDigitalTasks,
      completedDigitalTasks,
      openDigitalLegs,
      completedDigitalLegs,
    ] = await Promise.all([
      prisma.package.count(),
      prisma.package.count({ where: { status: { in: ["listed", "swarm_forming", "in_transit"] } } }),
      prisma.swarm.count(),
      prisma.swarm.count({ where: { status: { in: ["forming", "active"] } } }),
      prisma.bid.count(),
      prisma.agentReputation.count(),
      prisma.leg.count({ where: { status: "completed" } }),
      prisma.package.count({ where: { status: "delivered" } }),
      prisma.digitalTask.count(),
      prisma.digitalTask.count({ where: { status: "in_progress" } }),
      prisma.digitalTask.count({ where: { status: "completed" } }),
      prisma.digitalLeg.count({ where: { status: "open" } }),
      prisma.digitalLeg.count({ where: { status: "completed" } }),
    ]);

    const totalVolumeSol = await prisma.swarm.aggregate({
      _sum: { totalCostSol: true },
      where: { status: "settled" },
    });

    return {
      packages: { total: totalPackages, active: activePackages, delivered: deliveredPackages },
      swarms: { total: totalSwarms, active: activeSwarms },
      bids: { total: totalBids },
      agents: { total: totalAgents },
      legs: { completed: totalLegsCompleted },
      volume: { totalSol: totalVolumeSol._sum.totalCostSol ?? 0 },
      wsClients: getClientCount(),
      digitalTasks: {
        total: totalDigitalTasks,
        inProgress: inProgressDigitalTasks,
        completed: completedDigitalTasks,
        openLegs: openDigitalLegs,
        legsCompleted: completedDigitalLegs,
      },
    };
  });

  // Recent activity feed
  app.get("/activity", async () => {
    const [recentBids, recentLegs, recentPackages, recentDigitalTasks] = await Promise.all([
      prisma.bid.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          packageId: true,
          agentPubkey: true,
          costSol: true,
          reasoning: true,
          createdAt: true,
        },
      }),
      prisma.leg.findMany({
        where: { status: "completed" },
        orderBy: { completedAt: "desc" },
        take: 10,
        select: {
          id: true,
          agentPubkey: true,
          agreedPaymentSol: true,
          completedAt: true,
          swarm: { select: { packageId: true } },
        },
      }),
      prisma.package.findMany({
        orderBy: { listedAt: "desc" },
        take: 10,
        select: {
          id: true,
          description: true,
          status: true,
          maxBudgetSol: true,
          listedAt: true,
        },
      }),
      prisma.digitalTask.findMany({
        orderBy: { listedAt: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          status: true,
          maxBudgetSol: true,
          listedAt: true,
          legs: { select: { status: true } },
        },
      }),
    ]);

    return { recentBids, recentLegs, recentPackages, recentDigitalTasks };
  });
}
