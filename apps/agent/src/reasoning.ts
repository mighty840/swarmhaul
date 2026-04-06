import type { AgentConfig } from "./config.js";

interface BidDecision {
  shouldBid: boolean;
  reasoning: string;
}

export async function reasonAboutBid(
  pkg: { id: string; description: string; maxBudgetSol: number; weightKg: number },
  leg: { distanceKm: number; estimatedDurationMin: number; detourKm: number },
  costSol: number,
  config: AgentConfig,
): Promise<BidDecision> {
  if (!config.llm.enabled) {
    // Fallback to rule-based reasoning
    const withinBudget = costSol <= pkg.maxBudgetSol;
    return {
      shouldBid: withinBudget,
      reasoning: withinBudget
        ? `Cost ${costSol} SOL within budget ${pkg.maxBudgetSol} SOL. Detour ${leg.detourKm.toFixed(1)}km acceptable.`
        : `Cost ${costSol} SOL exceeds budget ${pkg.maxBudgetSol} SOL.`,
    };
  }

  try {
    const prompt = `You are an autonomous delivery agent deciding whether to bid on a package delivery.

Package: "${pkg.description}" (${pkg.weightKg}kg)
Max budget: ${pkg.maxBudgetSol} SOL
Leg distance: ${leg.distanceKm.toFixed(1)}km, est. ${leg.estimatedDurationMin.toFixed(0)}min
Detour from my route: ${leg.detourKm.toFixed(1)}km
My calculated cost: ${costSol} SOL
My vehicle: ${config.vehicle.carMake} ${config.vehicle.carModel} (boot: ${config.vehicle.bootVolumeLitres}L)
My hourly rate: ${config.vehicle.hourlyRateEur} EUR/hr
Profit margin if I bid: ${(((pkg.maxBudgetSol - costSol) / costSol) * 100).toFixed(1)}%

Should I bid? Consider: profitability, detour impact on my schedule, package fit for my vehicle, and reputation building.
Respond in JSON: {"shouldBid": true/false, "reasoning": "one sentence explanation"}`;

    const res = await fetch(`${config.llm.endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.llm.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
        temperature: 0.3,
      }),
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content);
    return {
      shouldBid: Boolean(parsed.shouldBid),
      reasoning: String(parsed.reasoning),
    };
  } catch (err) {
    // Fallback to rule-based if LLM fails
    console.warn("[Agent] LLM reasoning failed, using rule-based fallback:", err);
    const withinBudget = costSol <= pkg.maxBudgetSol;
    return {
      shouldBid: withinBudget,
      reasoning: `[fallback] Cost ${costSol} SOL ${withinBudget ? "within" : "exceeds"} budget ${pkg.maxBudgetSol} SOL.`,
    };
  }
}
