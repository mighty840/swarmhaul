import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { prisma } from "../db/client.js";
import { VehicleRegisterBody, VehiclePubkeyParam } from "../schemas/index.js";

type VehicleBody = z.infer<typeof VehicleRegisterBody>;
type VehicleParams = z.infer<typeof VehiclePubkeyParam>;

export async function vehicleRoutes(app: FastifyInstance) {
  app.get(
    "/:pubkey",
    { schema: { params: VehiclePubkeyParam } },
    async (req, reply) => {
      const { pubkey } = req.params as VehicleParams;
      const vehicle = await prisma.vehicleProfile.findUnique({
        where: { agentPubkey: pubkey },
      });
      if (!vehicle) return reply.code(404).send({ error: "Vehicle not found" });
      return vehicle;
    },
  );

  app.post(
    "/",
    { schema: { body: VehicleRegisterBody } },
    async (req, reply) => {
      const body = req.body as VehicleBody;
      const data = {
        agentPubkey: body.agentPubkey,
        ownerName: body.ownerName,
        carMake: body.carMake,
        carModel: body.carModel,
        bootVolumeLitres: body.bootVolumeLitres,
        fuelConsumptionL100: body.fuelConsumptionL100,
        fuelCostEurPerLitre: body.fuelCostEurPerLitre,
        hourlyRateEur: body.hourlyRateEur,
        isAutonomous: body.isAutonomous ?? false,
      };
      const vehicle = await prisma.vehicleProfile.upsert({
        where: { agentPubkey: body.agentPubkey },
        update: data,
        create: data,
      });
      return reply.code(201).send(vehicle);
    },
  );
}
