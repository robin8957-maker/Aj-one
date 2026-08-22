import { createHash } from "node:crypto";
import type { KnowledgeGraph } from "../protocol/index.ts";
import type { RepositorySnapshot } from "./repository.ts";
import { contextForTask } from "./graph.ts";
import { readRepoFile } from "./repository.ts";

export interface ContextItem {
  source: string;
  reason: string;
  tokenEstimate: number;
  priority: number;
  hash: string;
}

export interface ContextBundle {
  missionId: string;
  role: string;
  items: ContextItem[];
  tokenEstimate: number;
}

export function buildContextBundle(input: {
  missionId: string;
  role: string;
  objective: string;
  snapshot: RepositorySnapshot;
  graph: KnowledgeGraph;
  budgetTokens: number;
}): ContextBundle {
  const scored = contextForTask(input.graph, input.objective, 12);
  const items: ContextItem[] = [];
  let used = 0;
  for (const hit of scored) {
    const file = hit.id.startsWith("file:") ? hit.id.slice(5) : input.graph.nodes.find((n) => n.id === hit.id)?.file;
    if (!file) continue;
    const body = readRepoFile(input.snapshot.root, file) ?? "";
    const tokenEstimate = Math.ceil(body.length / 4);
    if (used + tokenEstimate > input.budgetTokens) continue;
    used += tokenEstimate;
    items.push({
      source: file,
      reason: hit.reason,
      tokenEstimate,
      priority: hit.score,
      hash: createHash("sha256").update(body).digest("hex").slice(0, 16),
    });
  }
  for (const extra of ["README.md", "package.json"].filter((f) => input.snapshot.files.includes(f))) {
    if (items.some((i) => i.source === extra)) continue;
    const body = readRepoFile(input.snapshot.root, extra) ?? "";
    items.push({
      source: extra,
      reason: "repository manifest",
      tokenEstimate: Math.ceil(body.length / 4),
      priority: 1,
      hash: createHash("sha256").update(body).digest("hex").slice(0, 16),
    });
  }
  return {
    missionId: input.missionId,
    role: input.role,
    items,
    tokenEstimate: items.reduce((s, i) => s + i.tokenEstimate, 0),
  };
}

export function buildEnforcedContext(input: {
  missionId: string;
  role: string;
  objective: string;
  snapshot: RepositorySnapshot;
  graph: KnowledgeGraph;
  budgetTokens: number;
  minRequiredTokens?: number;
}): { ok: true; bundle: ContextBundle } | { ok: false; code: string; reason: string; requiredEstimate: number } {
  const minRequired = input.minRequiredTokens ?? 100;
  if (input.budgetTokens < minRequired) {
    return {
      ok: false,
      code: "TOKEN_BUDGET_EXCEEDED",
      reason: `Context token budget (${input.budgetTokens}) is insufficient for minimum required prompt (${minRequired} tokens). Refused before LLM request.`,
      requiredEstimate: minRequired,
    };
  }

  const bundle = buildContextBundle(input);
  if (bundle.tokenEstimate > input.budgetTokens) {
    return {
      ok: false,
      code: "TOKEN_BUDGET_EXCEEDED",
      reason: `Compiled context bundle (${bundle.tokenEstimate} tokens) exceeds pre-request budget limit (${input.budgetTokens} tokens). Refused before LLM request.`,
      requiredEstimate: bundle.tokenEstimate,
    };
  }

  return { ok: true, bundle };
}

