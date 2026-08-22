import type { AgentRole } from "../protocol/index.ts";

export type FailureKind = "policy" | "test" | "timeout" | "loop" | "verify" | "tool" | "budget" | "semantic";

export interface FailureLedgerEntry {
  role: AgentRole;
  domain: string;
  kind: FailureKind;
  missionId?: string;
  detail: string;
  at: string;
}

export function classifyFailure(text: string): FailureKind {
  const t = text.toLowerCase();
  if (/budget|exhaust/.test(t)) return "budget";
  if (/loop|fingerprint|identical/.test(t)) return "loop";
  if (/timeout|timed out/.test(t)) return "timeout";
  if (/denied|policy|not granted/.test(t)) return "policy";
  if (/semantic|conflict/.test(t)) return "semantic";
  if (/verify|verifier|fail/.test(t) && /test|assert/.test(t)) return "test";
  if (/verify|verifier/.test(t)) return "verify";
  if (/tool|mcp/.test(t)) return "tool";
  return "verify";
}

export function shouldAvoidAgent(
  ledger: Array<{ role: AgentRole; domain: string; kind: string }>,
  role: AgentRole,
  domain: string,
  kind: FailureKind,
  threshold = 2,
): { avoid: boolean; count: number; why: string } {
  const count = ledger.filter((e) => e.role === role && e.domain === domain && e.kind === kind).length;
  if (count >= threshold) {
    return {
      avoid: true,
      count,
      why: `avoid ${role} on ${domain}: ${count}× ${kind} failures`,
    };
  }
  return { avoid: false, count, why: "no repeated failure class" };
}
