import type { AgentConfig } from "./config.js";
import type { DigitalTask, DigitalLeg } from "@swarmhaul/types";

const BID_SOL = 0.01; // flat bid for now; future: proportional to task budget

// Tracks leg IDs this agent has already bid on to avoid duplicate bids.
const bidAttempted = new Set<string>();
// Tracks leg IDs currently being executed so we don't double-dispatch.
const executing = new Set<string>();

async function callLlm(
  instruction: string,
  previousResult: string | null | undefined,
  config: AgentConfig,
  isVerify = false,
): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];

  if (isVerify) {
    messages.push({
      role: "system",
      content:
        "You are an independent quality-assurance agent in a multi-agent swarm. " +
        "Your only job is to verify the output produced by the previous agent. " +
        "Do NOT produce new content. " +
        (previousResult
          ? `The work agent produced:\n\n${previousResult}\n\n`
          : "No prior output was found — treat this as a failed verification. ") +
        "Respond ONLY with one of:\n" +
        "VERIFIED: <one sentence summarising what was confirmed>\n" +
        "FAILED: <specific reason the output is inadequate>",
    });
  } else if (previousResult) {
    messages.push({
      role: "system",
      content: `You are one agent in a multi-agent swarm. A previous agent produced this result:\n\n${previousResult}\n\nBuild on it in your response.`,
    });
  } else {
    messages.push({
      role: "system",
      content: "You are an autonomous AI agent completing one leg of a multi-agent task pipeline. Be concise and structured in your output.",
    });
  }

  messages.push({ role: "user", content: instruction });

  const apiKey = process.env.LITELLM_API_KEY ?? process.env.LLM_API_KEY;
  const res = await fetch(`${config.llm.endpoint}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages,
      max_tokens: 4000,
      temperature: 0.5,
    }),
  });

  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content?.trim() ?? "(no response)";
}

async function executeLeg(
  task: DigitalTask,
  leg: DigitalLeg,
  agentPubkey: string,
  config: AgentConfig,
): Promise<void> {
  executing.add(leg.id);
  console.log(`[Digital] Executing leg ${leg.sequence + 1}/${task.legs.length} of "${task.title}"`);

  try {
    const isVerify = leg.legType === "verify";

    // For verify legs, find the work leg immediately preceding this one.
    // For work legs, find the most recent completed leg to build on.
    const prevLeg = isVerify
      ? task.legs.find((l) => l.sequence === leg.sequence - 1 && l.status === "completed")
      : task.legs
          .filter((l) => l.sequence < leg.sequence && l.status === "completed")
          .sort((a, b) => b.sequence - a.sequence)[0];

    // Signal in_progress — abort if rejected (e.g. leg taken by another agent)
    const startRes = await fetch(`${config.apiEndpoint}/digital-tasks/${task.id}/legs/${leg.id}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentPubkey }),
    });
    if (!startRes.ok) {
      console.error(`[Digital] /start rejected (${startRes.status}) for leg ${leg.sequence + 1} of "${task.title}"`);
      return;
    }

    const result = await callLlm(leg.instruction, prevLeg?.result, config, isVerify);

    const completeRes = await fetch(
      `${config.apiEndpoint}/digital-tasks/${task.id}/legs/${leg.id}/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentPubkey, result }),
      },
    );

    if (completeRes.ok) {
      console.log(`[Digital] Leg ${leg.sequence + 1} completed for "${task.title}"`);
    } else {
      console.error(`[Digital] Complete failed (${completeRes.status}):`, await completeRes.text());
    }
  } catch (err) {
    console.error(`[Digital] Leg execution error:`, err);
  } finally {
    executing.delete(leg.id);
  }
}

export async function runDigitalWorkerPass(
  agentPubkey: string,
  config: AgentConfig,
): Promise<void> {
  if (!config.llm.enabled) return;

  const res = await fetch(`${config.apiEndpoint}/digital-tasks`);
  if (!res.ok) return;

  const tasks = await res.json() as DigitalTask[];

  for (const task of tasks) {
    if (task.status === "completed" || task.status === "failed") continue;

    const myLegs = task.legs.filter(
      (l) => l.agentPubkey === agentPubkey && ["assigned", "in_progress"].includes(l.status),
    );

    // Execute any assigned leg not already running
    for (const leg of myLegs) {
      if (!executing.has(leg.id)) {
        void executeLeg(task, leg, agentPubkey, config);
      }
    }

    // Only bid if we hold no legs in this task already
    if (myLegs.length > 0) continue;

    // Find the next eligible open leg — sequential: only bid if previous leg is done.
    // Skip verify legs whose preceding work leg was completed by this agent.
    const nextLeg = task.legs
      .filter((l) => l.status === "open" && !bidAttempted.has(l.id))
      .sort((a, b) => a.sequence - b.sequence)
      .find((l) => {
        if (l.sequence === 0) return true;
        const prev = task.legs.find((p) => p.sequence === l.sequence - 1);
        if (prev?.status !== "completed") return false;
        // Don't self-verify
        if (l.legType === "verify" && prev.agentPubkey === agentPubkey) return false;
        return true;
      });

    if (!nextLeg) continue;

    bidAttempted.add(nextLeg.id);

    const bidRes = await fetch(
      `${config.apiEndpoint}/digital-tasks/${task.id}/legs/${nextLeg.id}/bid`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentPubkey, bidSol: BID_SOL }),
      },
    );

    if (bidRes.ok) {
      console.log(`[Digital] Won leg ${nextLeg.sequence + 1}/${task.legs.length} of "${task.title}"`);
    } else {
      const msg = await bidRes.text();
      if (!msg.includes("already assigned") && !msg.includes("already hold")) {
        console.error(`[Digital] Bid rejected (${bidRes.status}):`, msg.slice(0, 120));
        // Allow retry on next poll for non-conflict errors
        bidAttempted.delete(nextLeg.id);
      }
    }
  }
}
