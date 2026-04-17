import { prisma } from "../db/client.js";

const demos = [
  { originLat: 48.14, originLng: 11.56, destLat: 48.165, destLng: 11.60, description: "E2E pkg 1 — short hop", weightKg: 1,  volumeLitres: 3,  maxBudgetSol: 1.0 },
  { originLat: 48.137, originLng: 11.575, destLat: 48.155, destLng: 11.6, description: "E2E pkg 2 — mid run", weightKg: 5,  volumeLitres: 12, maxBudgetSol: 1.5 },
  { originLat: 48.15,  originLng: 11.55,  destLat: 48.115, destLng: 11.595, description: "E2E pkg 3 — long haul", weightKg: 12, volumeLitres: 40, maxBudgetSol: 2.2 },
];

for (const d of demos) {
  const pkg = await prisma.package.create({
    data: {
      shipperPubkey: `demo-shipper-${demos.indexOf(d) + 1}`,
      ...d,
    },
  });
  console.log(`  listed ${pkg.id}  budget=${pkg.maxBudgetSol} SOL  "${pkg.description}"`);
}

await prisma.$disconnect();
