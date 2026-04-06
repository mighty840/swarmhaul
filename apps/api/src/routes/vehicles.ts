import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";

export async function vehicleRoutes(app: FastifyInstance) {
  app.get<{ Params: { pubkey: string } }>("/:pubkey", async (req, reply) => {
    const vehicle = await prisma.vehicleProfile.findUnique({
      where: { agentPubkey: req.params.pubkey },
    });
    if (!vehicle) return reply.code(404).send({ error: "Vehicle not found" });
    return vehicle;
  });

  app.post("/", async (req, reply) => {
    const body = req.body as {
      agentPubkey: string;
      ownerName: string;
      carMake: string;
      carModel: string;
      bootVolumeLitres: number;
      fuelConsumptionL100: number;
      fuelCostEurPerLitre: number;
      hourlyRateEur: number;
      isAutonomous?: boolean;
    };

    const vehicle = await prisma.vehicleProfile.upsert({
      where: { agentPubkey: body.agentPubkey },
      update: body,
      create: body,
    });
    return reply.code(201).send(vehicle);
  });
}
