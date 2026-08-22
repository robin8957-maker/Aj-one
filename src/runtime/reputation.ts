/**
 * Multidimensional performance — never a single vanity score.
 * Commander routes workers and models from profiles + budget + risk.
 */
import type {
  AgentPerformanceProfile,
  AgentRole,
  ModelPerformanceProfile,
} from "../protocol/index.ts";
import { makeId, nowIso } from "../protocol/index.ts";

export type RiskBand = "low" | "medium" | "high" | "critical";
export type ComputeBand = "tiny" | "normal" | "heavy";

export interface TaskClass {
  domain: string;
  language: string;
  risk: RiskBand;
  compute: ComputeBand;
  capability: "planning" | "coding" | "reasoning" | "vision" | "judge" | "memory-extraction";
}

export interface Sample {
  role: AgentRole;
  domain: string;
  language: string;
  provider: string;
  capability: TaskClass["capability"];
  success: boolean;
  firstPass: boolean;
  verifierReject: boolean;
  retries: number;
  latencyMs: number;
  cost: number;
  rollback: boolean;
  policyDenials: number;
  toolFailures: number;
  toolCalls: number;
  failureKind?: string;
}

export function classifyTask(objective: string, featureKey: string, runtime = "node"): TaskClass {
  const hay = `${objective} ${featureKey}`.toLowerCase();
  let domain = "general";
  let risk: RiskBand = "medium";
  let compute: ComputeBand = "normal";
  let capability: TaskClass["capability"] = "coding";
  if (featureKey === "ui-login" || /frontend|react|css|html|login console/.test(hay)) {
    domain = "frontend";
    capability = /visual|screenshot|a11y/.test(hay) ? "vision" : "coding";
  } else if (featureKey === "audit" || /security|audit/.test(hay)) {
    domain = "security";
    risk = "high";
    capability = "reasoning";
  } else if (featureKey === "auth-race" || /auth|race|session/.test(hay)) {
    domain = "auth";
    risk = "high";
  } else if (featureKey === "health") {
    domain = "backend";
    risk = "low";
    compute = "tiny";
  } else if (featureKey === "rate-limit") {
    domain = "backend";
    risk = "medium";
  } else if (/test suite|build|compile/.test(hay)) {
    domain = "backend";
    compute = "heavy";
  } else if (/plan|architect/.test(hay)) {
    domain = "architecture";
    capability = "planning";
  }
  if (/production|critical|pager|sev-?1/.test(hay)) risk = "critical";
  if (/refactor|docs|comment/.test(hay) && risk !== "critical") risk = "low";
  const language = /python/.test(hay) ? "python" : /rust/.test(hay) ? "rust" : runtime === "node" ? "javascript" : runtime;
  return { domain, language, risk, compute, capability };
}

export function profileKey(role: string, domain: string, language: string): string {
  return `${role}::${domain}::${language}`;
}

export function modelKey(provider: string, capability: string, domain: string): string {
  return `${provider}::${capability}::${domain}`;
}

export function emptyAgentProfile(role: AgentRole, domain: string, language: string): AgentPerformanceProfile {
  return {
    profileId: makeId("prf"),
    role,
    taskDomain: domain,
    language,
    successRate: 0,
    firstPassSuccess: 0,
    verifierRejectRate: 0,
    avgRetries: 0,
    avgLatencyMs: 0,
    avgCost: 0,
    rollbackRate: 0,
    policyDenials: 0,
    toolFailureRate: 0,
    sampleSize: 0,
    updatedAt: nowIso(),
  };
}

export function emptyModelProfile(
  provider: string,
  capability: string,
  domain: string,
): ModelPerformanceProfile {
  return {
    profileId: makeId("mprf"),
    provider,
    capability,
    taskDomain: domain,
    successRate: 0,
    avgCost: 0,
    avgLatencyMs: 0,
    sampleSize: 0,
    updatedAt: nowIso(),
  };
}

function blend(prev: number, next: number, n: number): number {
  return (prev * (n - 1) + next) / n;
}

export function applyAgentSample(profile: AgentPerformanceProfile, sample: Sample): AgentPerformanceProfile {
  const n = profile.sampleSize + 1;
  return {
    ...profile,
    successRate: blend(profile.successRate, sample.success ? 1 : 0, n),
    firstPassSuccess: blend(profile.firstPassSuccess, sample.firstPass ? 1 : 0, n),
    verifierRejectRate: blend(profile.verifierRejectRate, sample.verifierReject ? 1 : 0, n),
    avgRetries: blend(profile.avgRetries, sample.retries, n),
    avgLatencyMs: blend(profile.avgLatencyMs, sample.latencyMs, n),
    avgCost: blend(profile.avgCost, sample.cost, n),
    rollbackRate: blend(profile.rollbackRate, sample.rollback ? 1 : 0, n),
    policyDenials: profile.policyDenials + sample.policyDenials,
    toolFailureRate: blend(
      profile.toolFailureRate,
      sample.toolCalls ? sample.toolFailures / sample.toolCalls : 0,
      n,
    ),
    sampleSize: n,
    failureKinds: sample.failureKind
      ? { ...profile.failureKinds, [sample.failureKind]: (profile.failureKinds?.[sample.failureKind] ?? 0) + 1 }
      : profile.failureKinds,
    updatedAt: nowIso(),
  };
}

export function applyModelSample(profile: ModelPerformanceProfile, sample: Sample): ModelPerformanceProfile {
  const n = profile.sampleSize + 1;
  return {
    ...profile,
    successRate: blend(profile.successRate, sample.success ? 1 : 0, n),
    avgCost: blend(profile.avgCost, sample.cost, n),
    avgLatencyMs: blend(profile.avgLatencyMs, sample.latencyMs, n),
    sampleSize: n,
    updatedAt: nowIso(),
  };
}

/** Fitness for a mission — not a single published score. */
export function fitness(
  profile: AgentPerformanceProfile,
  risk: RiskBand,
  budgetUsd: number,
): { value: number; why: string[] } {
  const why: string[] = [];
  let value = 0;
  if (risk === "critical" || risk === "high") {
    value += profile.firstPassSuccess * 0.4;
    value += (1 - profile.verifierRejectRate) * 0.3;
    value += profile.successRate * 0.2;
    value += (1 - Math.min(1, profile.rollbackRate)) * 0.1;
    why.push("critical/high: first-pass and verifier reject dominate");
  } else {
    const costFit = profile.avgCost === 0 ? 0.7 : Math.max(0, 1 - profile.avgCost / Math.max(budgetUsd, 0.01));
    value += costFit * 0.4;
    value += profile.successRate * 0.3;
    value += profile.firstPassSuccess * 0.2;
    value += (1 - Math.min(1, profile.avgRetries / 3)) * 0.1;
    why.push("low/medium: cost and success dominate");
  }
  if (profile.sampleSize < 3) {
    value *= 0.7;
    why.push("small sample — damped");
  }
  return { value, why };
}

export function pickAgentProfile(
  profiles: AgentPerformanceProfile[],
  role: AgentRole,
  domain: string,
  language: string,
  risk: RiskBand,
  budgetUsd: number,
): { profile: AgentPerformanceProfile | null; why: string[] } {
  const pool = profiles.filter((p) => p.role === role && (p.taskDomain === domain || p.language === language));
  if (pool.length === 0) return { profile: null, why: [`no history for ${role}/${domain}`] };
  let best = pool[0]!;
  let bestFit = fitness(best, risk, budgetUsd);
  for (const p of pool.slice(1)) {
    const f = fitness(p, risk, budgetUsd);
    if (f.value > bestFit.value) {
      best = p;
      bestFit = f;
    }
  }
  return { profile: best, why: bestFit.why };
}

export function pickModelProvider(
  profiles: ModelPerformanceProfile[],
  capability: string,
  domain: string,
  preferGrok: boolean,
): { provider: string; why: string } {
  if (preferGrok) return { provider: "xai-grok", why: "explicit Grok preference under flag" };
  const pool = profiles.filter((p) => p.capability === capability && p.taskDomain === domain && p.sampleSize > 0);
  const local = pool.find((p) => p.provider === "aj-local");
  if (local) {
    return {
      provider: "aj-local",
      why: `aj-local is the governor. ${domain}/${capability} success ${(local.successRate * 100).toFixed(0)}% over ${local.sampleSize} samples.`,
    };
  }
  return { provider: "aj-local", why: "AJ local governor — models are engines, not the OS." };
}
