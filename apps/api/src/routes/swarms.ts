import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";

export async function swarmRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const swarm = await prisma.swarm.findUnique({
      where: { id: req.params.id },
      include: { legs: true, package: true },
    });
    if (!swarm) return reply.code(404).send({ error: "Swarm not found" });
    return swarm;
  });

  app.get<{ Params: { id: string } }>(
    "/:id/legs",
    async (req, reply) => {
      const legs = await prisma.leg.findMany({
        where: { swarmId: req.params.id },
        orderBy: { id: "asc" },
      });
      return legs;
    },
  );
}
