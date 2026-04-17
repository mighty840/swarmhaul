import { prisma } from "../db/client.js";

const agents = [
  { agentPubkey: "7FBqQRTgCgCrvavzxXRAnug8xiX9NmjaqJXc59KiQFyu", reliabilityScore: 20, legsCompleted: 3,  legsAccepted: 15 },
  { agentPubkey: "961WAsZTgPo8WGUfLum6fW4UqKbjYjUHLJ4SyuGyVvZy", reliabilityScore: 55, legsCompleted: 22, legsAccepted: 26 },
  { agentPubkey: "8ba9B9MouLb9QbAzvxcu3ob91zPy5eGA8y21QrraWHHw", reliabilityScore: 85, legsCompleted: 94, legsAccepted: 97 },
];

for (const a of agents) {
  await prisma.agentReputation.upsert({
    where: { agentPubkey: a.agentPubkey },
    create: a,
    update: a,
  });
}

const rows = await prisma.agentReputation.findMany({
  where: { agentPubkey: { in: agents.map((a) => a.agentPubkey) } },
});
console.log("seeded reputations:");
for (const r of rows) {
  console.log(`  ${r.agentPubkey} → ${r.reliabilityScore}/100  (${r.legsCompleted}/${r.legsAccepted} legs)`);
}
await prisma.$disconnect();
