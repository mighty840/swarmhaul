import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";

export async function packageRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const packages = await prisma.package.findMany({
      orderBy: { listedAt: "desc" },
      include: { swarm: true },
    });
    return packages;
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const pkg = await prisma.package.findUnique({
      where: { id: req.params.id },
      include: { swarm: { include: { legs: true } } },
    });
    if (!pkg) return reply.code(404).send({ error: "Package not found" });
    return pkg;
  });

  app.post("/", async (req, reply) => {
    const body = req.body as {
      shipperPubkey: string;
      originLat: number;
      originLng: number;
      destLat: number;
      destLng: number;
      description: string;
      weightKg: number;
      volumeLitres: number;
      maxBudgetSol: number;
    };

    const pkg = await prisma.package.create({ data: body });
    // TODO: broadcast PACKAGE_LISTED via WS
    return reply.code(201).send(pkg);
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const pkg = await prisma.package.findUnique({
      where: { id: req.params.id },
    });
    if (!pkg) return reply.code(404).send({ error: "Package not found" });
    if (pkg.status !== "listed")
      return reply.code(400).send({ error: "Can only cancel listed packages" });

    await prisma.package.update({
      where: { id: req.params.id },
      data: { status: "failed" },
    });
    return { success: true };
  });
}
