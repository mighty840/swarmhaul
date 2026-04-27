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
      activeDigitalTasks,
      completedDigitalTasks,
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
      prisma.digitalTask.count({ where: { status: { in: ["listed", "in_progress"] } } }),
      prisma.digitalTask.count({ where: { status: "completed" } }),
      prisma.digitalLeg.count({ where: { status: "completed" } }),
    ]);

    const [totalVolumeSol, digitalVolumeResult] = await Promise.all([
      prisma.swarm.aggregate({
        _sum: { totalCostSol: true },
        where: { status: "settled" },
      }),
      prisma.digitalLeg.aggregate({
        _sum: { paymentLamports: true },
        where: { status: "completed", paymentLamports: { not: null } },
      }),
    ]);

    const digitalVolumeSol =
      Number(digitalVolumeResult._sum.paymentLamports ?? 0n) / 1_000_000_000;

    return {
      packages: {
        total: totalPackages + totalDigitalTasks,
        active: activePackages + activeDigitalTasks,
        delivered: deliveredPackages + completedDigitalTasks,
      },
      swarms: {
        total: totalSwarms + totalDigitalTasks,
        active: activeSwarms + activeDigitalTasks,
      },
      bids: { total: totalBids },
      agents: { total: totalAgents },
      legs: { completed: totalLegsCompleted + completedDigitalLegs },
      volume: { totalSol: (totalVolumeSol._sum.totalCostSol ?? 0) + digitalVolumeSol },
      wsClients: getClientCount(),
    };
  });

  // Recent activity feed
  app.get("/activity", async () => {
    const [recentBids, recentLegs, recentPackages, recentDigitalTasks, recentDigitalLegs] = await Promise.all([
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
      prisma.digitalLeg.findMany({
        where: { status: "completed", result: { not: null } },
        orderBy: { completedAt: "desc" },
        take: 20,
        select: {
          id: true,
          taskId: true,
          sequence: true,
          legType: true,
          agentPubkey: true,
          result: true,
          completedAt: true,
          task: { select: { title: true } },
        },
      }),
    ]);

    return { recentBids, recentLegs, recentPackages, recentDigitalTasks, recentDigitalLegs };
  });
}
