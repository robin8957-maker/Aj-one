import type { DecisionRecord } from "../protocol/index.ts";

export function decisionAffects(question: string, choice: string): string[] {
  const text = `${question} ${choice}`.toLowerCase();
  const hits: string[] = [];
  if (/\bauth|login|session\b/.test(text)) hits.push("auth", "src/auth.js");
  if (/\bhealth\b/.test(text)) hits.push("health", "src/health.js", "src/server.js");
  if (/\brate|bucket|throttl\b/.test(text)) hits.push("rate-limit", "src/rate-limit.js", "src/server.js");
  if (/\bpostgres|mysql|mongo\b/.test(text)) hits.push("database", "migrations");
  if (/\blogin|console|ui|button\b/.test(text)) hits.push("web/index.html");
  return [...new Set(hits)];
}

export function detectDecisionConflict(
  decisions: DecisionRecord[],
  proposed: { file?: string; content?: string; symbol?: string; choice?: string },
): { conflict: true; decision: DecisionRecord; reason: string } | { conflict: false } {
  const active = decisions.filter((d) => d.status === "accepted");
  for (const d of active) {
    const affects = d.affects?.length ? d.affects : decisionAffects(d.question, d.choice);
    const fileHit = proposed.file && affects.some((a) => proposed.file!.includes(a) || a.includes(proposed.file!));
    if (!fileHit && !proposed.choice && !proposed.symbol) continue;

    if (proposed.content) {
      const choice = d.choice.toLowerCase();
      const body = proposed.content.toLowerCase();
      if (choice.includes("token bucket") && /fixed window|sliding window/.test(body) && !/token/.test(body)) {
        return { conflict: true, decision: d, reason: `Proposed change contradicts accepted '${d.choice}'` };
      }
      if (choice.includes("single-flight") && /sessions\.get\(userid\)/.test(body) && !/inflight/.test(body)) {
        return { conflict: true, decision: d, reason: "Reintroduces check-then-set against single-flight decision" };
      }
      if (choice.includes("dedicated module") && proposed.file?.includes("server.js") && /function health\(/.test(body)) {
        return { conflict: true, decision: d, reason: "Inlines health into server, violating dedicated-module decision" };
      }
    }
    if (proposed.choice && proposed.choice !== d.choice && fileHit) {
      return {
        conflict: true,
        decision: d,
        reason: `New choice '${proposed.choice}' supersedes '${d.choice}' without explicit supersede`,
      };
    }
  }
  return { conflict: false };
}
