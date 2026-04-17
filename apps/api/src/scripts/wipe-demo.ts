import { prisma } from "../db/client.js";

await prisma.leg.deleteMany();
await prisma.swarm.deleteMany();
await prisma.bid.deleteMany();
await prisma.package.deleteMany();
await prisma.agentReputation.deleteMany();
await prisma.negotiationMessage.deleteMany();
console.log("wiped all domain tables");
await prisma.$disconnect();
