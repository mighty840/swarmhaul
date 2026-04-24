import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  buildListDigitalTaskIx,
  buildCancelDigitalTaskIx,
  digitalTaskPda,
  digitalVaultPda,
  coordinatorFormAndAssignTaskSwarm,
  coordinatorConfirmTaskLeg,
  coordinatorSettleTask,
  taskSwarmPda,
  taskLegPda,
  uuidToBytes,
} from "@swarmhaul/sdk";
import { Transaction } from "@solana/web3.js";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/client.js";
import { broadcast } from "../services/ws-broadcaster.js";
import { broadcastMcpNotification } from "../services/mcp-broadcaster.js";
import { updateReputationOnDigitalLegComplete } from "../services/reputation.js";
import { getSolana, explorerTxUrl } from "../services/solana.js";

/** Exponential-backoff retry for coordinator RPC calls. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}

const CreateBody = z.object({
  shipperPubkey: z.string(),
  title: z.string().min(1),
  description: z.string().optional().default(""),
  maxBudgetSol: z.number().positive(),
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
    // fallback
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

const BuildTxBody = z.object({
  shipperPubkey: z.string(),
  title: z.string().min(1),
  description: z.string().optional().default(""),
  maxBudgetSol: z.number().positive(),
});

const ConfirmBody = z.object({
  shipperPubkey: z.string(),
  title: z.string().min(1),
  description: z.string().optional().default(""),
  maxBudgetSol: z.number().positive(),
  signature: z.string(),
  taskId: z.string().uuid(),
  onChainTask: z.string(),
  onChainVault: z.string(),
  legs: z.array(z.object({ instruction: z.string() })),
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

  // ─── Step 1: Build the list_digital_task Anchor instruction ───────
  // Plans legs via LLM and returns a serialised unsigned transaction for the
  // shipper's wallet to sign. Uses the Anchor escrow vault, not a plain
  // coordinator transfer.
  app.post(
    "/build-tx",
    { schema: { body: BuildTxBody } },
    async (req) => {
      const body = req.body as z.infer<typeof BuildTxBody>;
      const { sdk, coordinator } = getSolana();

      const taskId = randomUUID();
      const taskIdBytes = uuidToBytes(taskId);
      const [taskPda] = digitalTaskPda(taskIdBytes);

      const [legs, { blockhash, lastValidBlockHeight }, ixResult] = await Promise.all([
        planLegs(body.title, body.description),
        sdk.connection.getLatestBlockhash(),
        buildListDigitalTaskIx(sdk, {
          shipper: new PublicKey(body.shipperPubkey),
          taskId: taskIdBytes,
          maxBudgetLamports: BigInt(Math.floor(body.maxBudgetSol * LAMPORTS_PER_SOL)),
          coordinator: coordinator.publicKey,
        }),
      ]);

      const tx = new Transaction().add(ixResult.ix);
      tx.recentBlockhash = blockhash;
      tx.feePayer = new PublicKey(body.shipperPubkey);

      return {
        taskId,
        legs,
        transaction: tx.serialize({ requireAllSignatures: false }).toString("base64"),
        blockhash,
        lastValidBlockHeight,
        onChainTask: ixResult.task.toBase58(),
        onChainVault: ixResult.vault.toBase58(),
      };
    },
  );

  // ─── Step 2: Persist after on-chain confirmation ──────────────────
  // Receives the confirmed signature + pre-planned legs. The task is now
  // in Listed status on-chain with budget locked in the vault PDA.
  app.post(
    "/confirm",
    { schema: { body: ConfirmBody } },
    async (req) => {
      const body = req.body as z.infer<typeof ConfirmBody>;

      const task = await prisma.digitalTask.create({
        data: {
          id: body.taskId,
          shipperPubkey: body.shipperPubkey,
          title: body.title,
          description: body.description,
          maxBudgetSol: body.maxBudgetSol,
          listSignature: body.signature,
          onChainTask: body.onChainTask,
          onChainVault: body.onChainVault,
          legs: {
            create: body.legs.map((l, i) => ({
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

      return {
        ...task,
        links: { listTx: explorerTxUrl(body.signature) },
      };
    },
  );

  // ─── MCP / legacy path (no wallet signature) ─────────────────────
  // Created by agents via MCP. No on-chain escrow — coordinator pays out
  // from its own wallet when legs complete (same as before).
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
            create: legs.map((l, i) => ({ sequence: i, instruction: l.instruction })),
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

  // ─── Bid on a leg ─────────────────────────────────────────────────
  app.post(
    "/:id/legs/:legId/bid",
    { schema: { params: LegParam, body: BidBody } },
    async (req, reply) => {
      const { id: taskId, legId } = req.params as z.infer<typeof LegParam>;
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

      // Atomic conditional update — only succeeds if the row is still "open",
      // preventing two concurrent bids from both winning the same leg.
      const { count } = await prisma.digitalLeg.updateMany({
        where: { id: legId, status: "open" },
        data: { agentPubkey, bidSol, status: "assigned" },
      });
      if (count === 0) return reply.code(409).send({ error: "Leg already assigned" });

      const updated = await prisma.digitalLeg.findUnique({ where: { id: legId } });

      // Flip task DB status on first assignment
      await prisma.digitalTask.update({
        where: { id: leg.taskId, status: "listed" },
        data: { status: "in_progress" },
      }).catch(() => {});

      broadcast({ type: "DIGITAL_LEG_ASSIGNED", taskId: leg.taskId, leg: updated as never });

      // When ALL legs are now assigned, form the on-chain swarm in one tx
      const task = await prisma.digitalTask.findUnique({
        where: { id: taskId },
        include: { legs: { orderBy: { sequence: "asc" } } },
      });

      if (task?.onChainTask) {
        const allAssigned = task.legs.every(
          (l) => l.status === "assigned" || l.status === "in_progress" || l.status === "completed",
        );

        if (allAssigned) {
          try {
            const { sdk, coordinator } = getSolana();
            const totalBudgetLamports = BigInt(Math.floor(task.maxBudgetSol * LAMPORTS_PER_SOL));
            const perLegLamports = totalBudgetLamports / BigInt(task.legs.length);

            const agents = task.legs.map((l) => ({
              agent: new PublicKey(l.agentPubkey!),
              paymentLamports: perLegLamports,
            }));

            const { taskSwarm, signature: formSig } = await withRetry(() =>
              coordinatorFormAndAssignTaskSwarm(
                sdk,
                coordinator,
                new PublicKey(task.onChainTask!),
                perLegLamports * BigInt(task.legs.length),
                agents,
              ),
            );

            // Derive per-leg PDAs and persist on-chain addresses
            const legUpdates = task.legs.map((l, i) => {
              const [legPda] = taskLegPda(taskSwarm, i);
              return prisma.digitalLeg.update({
                where: { id: l.id },
                data: {
                  onChainLeg: legPda.toBase58(),
                  paymentLamports: perLegLamports,
                },
              });
            });

            await Promise.all([
              prisma.digitalTask.update({
                where: { id: taskId },
                data: { onChainSwarm: taskSwarm.toBase58() },
              }),
              ...legUpdates,
            ]);

            app.log.info(`[digital] task swarm formed on-chain — ${taskSwarm.toBase58()} tx ${formSig}`);
          } catch (err) {
            app.log.error({ err }, "[digital] form_task_swarm failed");
          }
        }
      }

      await broadcastMcpNotification(
        `Leg ${updated.sequence + 1} of task "${taskId}" assigned to ${agentPubkey.slice(0, 8)}…`,
      );

      return updated;
    },
  );

  // ─── Agent signals start ──────────────────────────────────────────
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

  // ─── Agent submits completed result ──────────────────────────────
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

      // Fetch task + all legs for payout logic
      const task = await prisma.digitalTask.findUnique({
        where: { id: taskId },
        include: { legs: { orderBy: { sequence: "asc" } } },
      });

      if (!task) {
        return completed;
      }

      if (task.onChainTask && task.onChainSwarm && leg.onChainLeg) {
        // ── On-chain path: confirm_task_leg pays from vault PDA ──
        try {
          const { sdk, coordinator } = getSolana();
          const confirmSig = await withRetry(() =>
            coordinatorConfirmTaskLeg(
              sdk,
              coordinator,
              new PublicKey(task.onChainTask!),
              new PublicKey(task.onChainSwarm!),
              new PublicKey(leg.onChainLeg!),
              new PublicKey(agentPubkey),
            ),
          );
          app.log.info(`[digital] confirm_task_leg tx ${confirmSig} — leg ${leg.sequence} paid`);
        } catch (err) {
          app.log.error({ err }, "[digital] confirm_task_leg failed");
        }
      } else if (!task.onChainTask) {
        // ── Off-chain path (MCP-created tasks): coordinator wallet pays ──
        try {
          const { sdk, coordinator } = getSolana();
          const payLamports = Math.floor((task.maxBudgetSol / task.legs.length) * LAMPORTS_PER_SOL);
          const { blockhash } = await sdk.connection.getLatestBlockhash();
          const payTx = new (await import("@solana/web3.js")).Transaction().add(
            (await import("@solana/web3.js")).SystemProgram.transfer({
              fromPubkey: coordinator.publicKey,
              toPubkey: new PublicKey(agentPubkey),
              lamports: payLamports,
            }),
          );
          payTx.recentBlockhash = blockhash;
          payTx.feePayer = coordinator.publicKey;
          payTx.sign(coordinator);
          const paySig = await sdk.connection.sendRawTransaction(payTx.serialize());
          app.log.info(`[digital] off-chain paid ${payLamports} lamps to ${agentPubkey.slice(0, 8)} tx ${paySig}`);
        } catch (err) {
          app.log.error({ err }, "[digital] off-chain payout failed");
        }
      }

      const allLegs = task.legs.map((l) => (l.id === legId ? { ...l, status: "completed" } : l));

      if (allLegs.every((l) => l.status === "completed")) {
        const finalTask = await prisma.digitalTask.update({
          where: { id: taskId },
          data: { status: "completed", completedAt: new Date() },
          include: { legs: { orderBy: { sequence: "asc" } } },
        });
        broadcast({ type: "DIGITAL_TASK_COMPLETED", task: finalTask as never });

        // ── On-chain settle: return surplus to shipper ──
        if (task.onChainTask && task.onChainSwarm) {
          try {
            const { sdk, coordinator } = getSolana();
            const settleSig = await withRetry(() =>
              coordinatorSettleTask(
                sdk,
                coordinator,
                new PublicKey(task.onChainTask!),
                new PublicKey(task.onChainSwarm!),
                new PublicKey(task.shipperPubkey),
                0, // feeBps — 0 now, add platform wallet + non-zero bps when converting to commercial
              ),
            );
            app.log.info(`[digital] settle_task tx ${settleSig} — surplus returned to shipper`);
          } catch (err) {
            app.log.error({ err }, "[digital] settle_task failed");
          }
        }

        await broadcastMcpNotification(
          `Task "${task.title}" completed by swarm. All ${task.legs.length} legs settled.`,
        );
      } else {
        const nextLeg = allLegs
          .filter((l) => l.status === "open")
          .sort((a, b) => a.sequence - b.sequence)[0];
        if (nextLeg) {
          await broadcastMcpNotification(
            `Leg ${nextLeg.sequence + 1} of "${task.title}" is now open. Call swarmhaul_bid_digital_leg to claim it.`,
          );
        }
      }

      return completed;
    },
  );

  // ─── Cancel a task (shipper, Listed status only) ──────────────────
  // Returns a serialised unsigned cancel_digital_task tx for the shipper to sign.
  // On-chain: vault fully refunded, task account closed.
  // Off-chain: task record deleted from DB after confirmation.
  app.delete(
    "/:id",
    { schema: { params: IdParam, body: z.object({ shipperPubkey: z.string() }) } },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof IdParam>;
      const { shipperPubkey } = req.body as { shipperPubkey: string };

      const task = await prisma.digitalTask.findUnique({ where: { id } });
      if (!task) return reply.code(404).send({ error: "Task not found" });
      if (task.shipperPubkey !== shipperPubkey) return reply.code(403).send({ error: "Not your task" });
      if (task.status !== "listed") return reply.code(409).send({ error: "Only listed tasks can be cancelled" });

      // No on-chain escrow (MCP-created task) — just delete from DB
      if (!task.onChainTask) {
        await prisma.digitalTask.delete({ where: { id } });
        broadcast({ type: "DIGITAL_TASK_CANCELLED", taskId: id } as never);
        return { cancelled: true };
      }

      // Build unsigned cancel_digital_task tx for shipper to sign
      const { sdk } = getSolana();
      const taskPda = new PublicKey(task.onChainTask);
      const [vaultPda] = digitalVaultPda(taskPda);
      const { blockhash, lastValidBlockHeight } = await sdk.connection.getLatestBlockhash();

      const ix = await buildCancelDigitalTaskIx(sdk, {
        shipper: new PublicKey(shipperPubkey),
        taskAccount: taskPda,
      });

      const tx = new Transaction().add(ix);
      tx.recentBlockhash = blockhash;
      tx.feePayer = new PublicKey(shipperPubkey);

      return {
        transaction: tx.serialize({ requireAllSignatures: false }).toString("base64"),
        blockhash,
        lastValidBlockHeight,
        taskId: id,
      };
    },
  );

  // ─── Confirm cancel (after shipper signs) ─────────────────────────
  app.post(
    "/:id/cancel-confirm",
    { schema: { params: IdParam, body: z.object({ shipperPubkey: z.string(), signature: z.string() }) } },
    async (req, reply) => {
      const { id } = req.params as z.infer<typeof IdParam>;
      const { shipperPubkey, signature } = req.body as { shipperPubkey: string; signature: string };

      const task = await prisma.digitalTask.findUnique({ where: { id } });
      if (!task) return reply.code(404).send({ error: "Task not found" });
      if (task.shipperPubkey !== shipperPubkey) return reply.code(403).send({ error: "Not your task" });
      if (task.status !== "listed") return reply.code(409).send({ error: "Task is no longer listed — an agent may have already bid" });

      await prisma.digitalTask.delete({ where: { id } });
      broadcast({ type: "DIGITAL_TASK_CANCELLED", taskId: id, signature } as never);
      return { cancelled: true, signature };
    },
  );
}
