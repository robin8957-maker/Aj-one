/**
 * aj-local resource manager. Commander asks; the implementer cannot grant itself.
 * One extension, evidence-backed, no secret values, no trust elevation.
 */
import type { AgentPerformanceProfile, AgentRole, Mission, TaskNode } from "../protocol/index.ts";

export const MAX_ASK_RATIO = 0.15;
export const NEGOTIATE_AT = 0.9;

export interface NegotiationEvidence {
  wastedCalls: number;
  dagComplete: number;
  dagTotal: number;
  dagRatio: number;
  lastError?: string;
}

export interface NegotiationRequest {
  missionId: string;
  agentId: string;
  role: AgentRole;
  reason: string;
  askedRatio: number;
  evidence: NegotiationEvidence;
}

export interface NegotiationDecision {
  granted: boolean;
  once: true;
  extraTokens: number;
  extraUsd: number;
  reason: string;
}

export function dagProgress(tasks: TaskNode[]): { complete: number; total: number; ratio: number } {
  const total = tasks.length;
  const complete = tasks.filter((t) => t.state === "COMPLETE").length;
  return { complete, total, ratio: total === 0 ? 0 : complete / total };
}

export function buildNegotiationRequest(input: {
  mission: Pick<Mission, "missionId" | "tasks">;
  agentId: string;
  role: AgentRole;
  wastedCalls: number;
  lastError?: string;
}): NegotiationRequest {
  const dag = dagProgress(input.mission.tasks);
  const cause = sanitizeReason(input.lastError ?? "unexpected spend near the finish line");
  return {
    missionId: input.mission.missionId,
    agentId: input.agentId,
    role: input.role,
    askedRatio: MAX_ASK_RATIO,
    reason: `Need ${Math.round(MAX_ASK_RATIO * 100)}% more to finish. ${cause}. DAG ${dag.complete}/${dag.total}.`,
    evidence: {
      wastedCalls: Math.max(0, input.wastedCalls),
      dagComplete: dag.complete,
      dagTotal: dag.total,
      dagRatio: dag.ratio,
      lastError: cause,
    },
  };
}

export function sanitizeReason(text: string): string {
  return text
    .replace(/Bearer\s+\S{6,}/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|pk|ghp|xai)[-_][A-Za-z0-9/_+=.-]{6,}/gi, "[redacted]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted]")
    .replace(/-----BEGIN[\s\S]+?PRIVATE KEY-----/g, "[redacted]")
    .slice(0, 240);
}

export function evaluateNegotiation(
  request: NegotiationRequest,
  profile: AgentPerformanceProfile | null,
  alreadyExtended: boolean,
  budget: { tokens: number; moneyUsd: number },
): NegotiationDecision {
  const asked = Math.min(MAX_ASK_RATIO, Math.max(0, request.askedRatio));
  const extraTokens = Math.ceil(budget.tokens * asked);
  const extraUsd = Number((budget.moneyUsd * asked).toFixed(4));
  if (alreadyExtended) {
    return deny(extraTokens, extraUsd, "already extended once — aj-local refuses a second grant");
  }
  if (request.evidence.dagRatio < 0.5) {
    return deny(extraTokens, extraUsd, `DAG only ${Math.round(request.evidence.dagRatio * 100)}% complete — not near done`);
  }
  if (profile) {
    if (profile.verifierRejectRate >= 0.7 && profile.sampleSize >= 3) {
      return deny(extraTokens, extraUsd, "reputation: verifier reject rate too high");
    }
    if (profile.rollbackRate >= 0.5 && profile.sampleSize >= 3) {
      return deny(extraTokens, extraUsd, "reputation: rollback rate too high");
    }
    if (profile.successRate < 0.35 && profile.sampleSize >= 5) {
      return deny(extraTokens, extraUsd, "reputation: success rate too low for an extension");
    }
  }
  return {
    granted: true,
    once: true,
    extraTokens,
    extraUsd,
    reason: `aj-local grants a one-time ${Math.round(asked * 100)}% extension (DAG ${Math.round(request.evidence.dagRatio * 100)}%, reputation acceptable).`,
  };
}

function deny(extraTokens: number, extraUsd: number, reason: string): NegotiationDecision {
  return { granted: false, once: true, extraTokens: 0, extraUsd: 0, reason };
}
