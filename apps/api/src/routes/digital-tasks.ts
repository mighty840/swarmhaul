import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { broadcast } from "../services/ws-broadcaster.js";
import { broadcastMcpNotification } from "../services/mcp-broadcaster.js";
import { updateReputationOnDigitalLegComplete } from "../services/reputation.js";

const CreateBody = z.object({
  shipperPubkey: z.string(),
  title: z.string().min(1),
  description: z.string().min(1),
  maxBudgetSol: z.number().positive(),
  // Legs are optional — if omitted the API plans them via LLM
  legs: z.array(z.object({ instruction: z.string() })).max(10).optional(),
});

async function planLegs(title: string, description: string): Promise<Array<{ instruction: string }>> {
  const llmEndpoint = process.env.LITELLM_ENDPOINT ?? "https://llm-dev.meghsakha.com";
  const llmModel = process.env.LITELLM_MODEL ?? "gpt-oss-120b";
  const apiKey = process.env.LITELLM_API_KEY ?? process.env.LLM_API_KEY;

  const prompt = `You are a task planner for a multi-agent AI swarm. Decompose the following goal into 1–4 sequential legs, where each leg is handled by a different AI agent that can only read text and reason — no live internet access.

Task: "${title}"
Goal: "${description}"

Rules:
- Use 1 leg if the task is simple and self-contained
- Use 2–4 legs if sequential specialisation adds value (research → analysis → synthesis, etc.)
- Each leg instruction must be fully self-contained; later legs should say "building on the previous agent's output"
- Be specific: tell the agent exactly what to produce and in what format

Respond ONLY with valid JSON, no markdown: {"legs": [{"instruction": "..."}]}`;

  try {
    const res = await fetch(`${llmEndpoint}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: llmModel,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4000,
        temperature: 0.4,
      }),
    });
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const raw = data.choices[0]?.message?.content ?? "";
    const json = JSON.parse(raw.replace(/```json|```/g, "").trim()) as { legs: Array<{ instruction: string }> };
    if (Array.isArray(json.legs) && json.legs.length > 0) return json.legs.slice(0, 4);
  } catch {
    // fallback: single leg with the full description
  }
  return [{ instruction: `${title}: ${description}` }];
}

const IdParam = z.object({ id: z.string().uuid() });
const LegParam = z.object({ id: z.string().uuid(), legId: z.string().uuid() });

const BidBody = z.object({
  agentPubkey: z.string(),
  bidSol: z.number().positive(),
});

const CompleteBody = z.object({
  agentPubkey: z.string(),
  result: z.string().min(1),
});

export async function digitalTaskRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    return prisma.digitalTask.findMany({
      orderBy: { listedAt: "desc" },
      include: { legs: { orderBy: { sequence: "asc" } } },
      take: 100,
    });
  });

  app.get(
    "/:id",
    { schema: { params: IdParam } },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof IdParam>;
      const task = await prisma.digitalTask.findUnique({
        where: { id },
        include: { legs: { orderBy: { sequence: "asc" } } },
      });
      if (!task) return reply.code(404).send({ error: "Task not found" });
      return task;
    },
  );

  app.post(
    "/",
    { schema: { body: CreateBody } },
    async (req) => {
      const body = req.body as z.infer<typeof CreateBody>;
      const legs = (body.legs && body.legs.length > 0)
        ? body.legs
        : await planLegs(body.title, body.description);

      const task = await prisma.digitalTask.create({
        data: {
          shipperPubkey: body.shipperPubkey,
          title: body.title,
          description: body.description,
          maxBudgetSol: body.maxBudgetSol,
          legs: {
            create: legs.map((l, i) => ({
              sequence: i,
              instruction: l.instruction,
            })),
          },
        },
        include: { legs: { orderBy: { sequence: "asc" } } },
      });

      broadcast({ type: "DIGITAL_TASK_LISTED", task: task as never });
      await broadcastMcpNotification(
        `New digital task: "${task.title}" — ${task.legs.length} leg(s), budget ${task.maxBudgetSol} SOL. Call swarmhaul_list_digital_tasks to bid.`,
      );

      return task;
    },
  );

  // Bid on a specific leg (first agent to call wins)
  app.post(
    "/:id/legs/:legId/bid",
    { schema: { params: LegParam, body: BidBody } },
    async (req, reply) => {
      const { legId } = req.params as z.infer<typeof LegParam>;
      const { agentPubkey, bidSol } = req.body as z.infer<typeof BidBody>;

      const leg = await prisma.digitalLeg.findUnique({ where: { id: legId } });
      if (!leg) return reply.code(404).send({ error: "Leg not found" });
      if (leg.status !== "open") return reply.code(409).send({ error: "Leg already assigned" });

      // Enforce one leg per agent per task
      const alreadyHolding = await prisma.digitalLeg.findFirst({
        where: { taskId: leg.taskId, agentPubkey, status: { in: ["assigned", "in_progress"] } },
      });
      if (alreadyHolding) {
        return reply.code(409).send({ error: "You already hold a leg in this task" });
      }

      const updated = await prisma.digitalLeg.update({
        where: { id: legId },
        data: { agentPubkey, bidSol, status: "assigned" },
      });

      // Flip task to in_progress on first assignment
      await prisma.digitalTask.update({
        where: { id: leg.taskId, status: "listed" },
        data: { status: "in_progress" },
      }).catch(() => {});

      broadcast({ type: "DIGITAL_LEG_ASSIGNED", taskId: leg.taskId, leg: updated as never });
      await broadcastMcpNotification(
        `Leg ${updated.sequence + 1} of task "${leg.taskId}" assigned to ${agentPubkey.slice(0, 8)}…`,
      );

      return updated;
    },
  );

  // Agent signals it has started working on a leg
  app.post(
    "/:id/legs/:legId/start",
    { schema: { params: LegParam, body: z.object({ agentPubkey: z.string() }) } },
    async (req, reply) => {
      const { legId } = req.params as z.infer<typeof LegParam>;
      const { agentPubkey } = req.body as { agentPubkey: string };

      const leg = await prisma.digitalLeg.findUnique({ where: { id: legId } });
      if (!leg) return reply.code(404).send({ error: "Leg not found" });
      if (leg.agentPubkey !== agentPubkey) return reply.code(403).send({ error: "Not your leg" });
      if (leg.status !== "assigned") return reply.code(409).send({ error: `Leg status is ${leg.status}` });

      return prisma.digitalLeg.update({
        where: { id: legId },
        data: { status: "in_progress", startedAt: new Date() },
      });
    },
  );

  // Agent submits completed result
  app.post(
    "/:id/legs/:legId/complete",
    { schema: { params: LegParam, body: CompleteBody } },
    async (req, reply) => {
      const { id: taskId, legId } = req.params as z.infer<typeof LegParam>;
      const { agentPubkey, result } = req.body as z.infer<typeof CompleteBody>;

      const leg = await prisma.digitalLeg.findUnique({ where: { id: legId } });
      if (!leg) return reply.code(404).send({ error: "Leg not found" });
      if (leg.agentPubkey !== agentPubkey) return reply.code(403).send({ error: "Not your leg" });
      if (!["assigned", "in_progress"].includes(leg.status)) {
        return reply.code(409).send({ error: `Leg already ${leg.status}` });
      }

      const completed = await prisma.digitalLeg.update({
        where: { id: legId },
        data: { status: "completed", result, completedAt: new Date() },
      });

      broadcast({ type: "DIGITAL_LEG_COMPLETED", taskId, leg: completed as never });
      await updateReputationOnDigitalLegComplete(agentPubkey);

      // Check if all legs are done
      const allLegs = await prisma.digitalLeg.findMany({ where: { taskId } });
      if (allLegs.every((l) => l.status === "completed")) {
        const task = await prisma.digitalTask.update({
          where: { id: taskId },
          data: { status: "completed", completedAt: new Date() },
          include: { legs: { orderBy: { sequence: "asc" } } },
        });
        broadcast({ type: "DIGITAL_TASK_COMPLETED", task: task as never });
        await broadcastMcpNotification(
          `Task "${task.title}" completed by swarm. All ${task.legs.length} legs settled.`,
        );
      } else {
        // Notify next open leg's potential agents
        const nextLeg = allLegs
          .filter((l) => l.status === "open")
          .sort((a, b) => a.sequence - b.sequence)[0];
        if (nextLeg) {
          const task = await prisma.digitalTask.findUnique({ where: { id: taskId } });
          await broadcastMcpNotification(
            `Leg ${nextLeg.sequence + 1} of "${task?.title}" is now open. Previous result available. Call swarmhaul_bid_digital_leg to claim it.`,
          );
        }
      }

      return completed;
    },
  );
}
