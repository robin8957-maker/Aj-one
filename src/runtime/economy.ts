import type { Mission, MissionBudget } from "../protocol/index.ts";

export type EconomyAction = "continue" | "downgrade" | "renegotiate" | "ask-human" | "stop";

export interface EconomyVerdict {
  action: EconomyAction;
  remainingTokens: number;
  remainingUsd: number;
  usedRatio: number;
  reason: string;
}

export function assessBudget(budget: MissionBudget): EconomyVerdict {
  const tokenRatio = budget.tokens <= 0 ? 1 : budget.tokensUsed / budget.tokens;
  const moneyRatio = budget.moneyUsd <= 0 ? 1 : budget.moneyUsed / budget.moneyUsd;
  const usedRatio = Math.max(tokenRatio, moneyRatio);
  const remainingTokens = Math.max(0, budget.tokens - budget.tokensUsed);
  const remainingUsd = Math.max(0, budget.moneyUsd - budget.moneyUsed);
  if (usedRatio >= 1) {
    return {
      action: "stop",
      remainingTokens,
      remainingUsd,
      usedRatio,
      reason: "Budget exhausted — Commander stops the loop.",
    };
  }
  if (usedRatio >= 0.9) {
    if ((budget.extensionsGranted ?? 0) >= 1) {
      return {
        action: "stop",
        remainingTokens,
        remainingUsd,
        usedRatio,
        reason: "Budget critical after the one-time extension — Commander ends the mission.",
      };
    }
    return {
      action: "renegotiate",
      remainingTokens,
      remainingUsd,
      usedRatio,
      reason: "Budget critical — Commander may renegotiate once with aj-local.",
    };
  }
  if (usedRatio >= 0.7) {
    return {
      action: "downgrade",
      remainingTokens,
      remainingUsd,
      usedRatio,
      reason: "Budget tight — route remaining work to a cheaper local engine.",
    };
  }
  return {
    action: "continue",
    remainingTokens,
    remainingUsd,
    usedRatio,
    reason: "Budget healthy.",
  };
}

export function consumeBudget(budget: MissionBudget, tokens: number, usd: number): MissionBudget {
  return {
    ...budget,
    tokensUsed: budget.tokensUsed + tokens,
    moneyUsed: Number((budget.moneyUsed + usd).toFixed(6)),
  };
}

export function missionEconomy(mission: Pick<Mission, "budget">): EconomyVerdict {
  return assessBudget(mission.budget);
}

export function budgetSystemNote(verdict: EconomyVerdict): string {
  const pct = Math.round((1 - verdict.usedRatio) * 100);
  if (verdict.action === "stop") return "Budget remaining 0%. Stop. Do not call more tools.";
  if (verdict.action === "renegotiate") return `Budget remaining ${pct}%. Request a one-time extension with evidence, or stop.`;
  if (verdict.action === "ask-human") return `Budget remaining ${pct}%. Ask the human before more spend.`;
  if (verdict.action === "downgrade") {
    return `Budget remaining ${pct}%. Use fewer tools, shorter reasoning, prefer aj-local.`;
  }
  return `Budget remaining ${pct}%. Stay proportional.`;
}
