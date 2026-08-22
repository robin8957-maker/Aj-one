/**
 * One-file proof: mission, plan, evidence, verifier, tools, secret refs.
 * Values of secrets are never included.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { WorldSnapshot } from "../protocol/index.ts";
import { operatorDir } from "../daemon/store.ts";
import { nowIso } from "../protocol/index.ts";
import { signAuditPayload, type AuditSignature } from "./sign-audit.ts";

export const AUDIT_CLAIM = "Everything the agent did is provable, replayable, and rejectable.";

export interface AuditBundle {
  version: 1;
  claim: typeof AUDIT_CLAIM;
  exportedAt: string;
  missionId: string;
  mission: Record<string, string | number | boolean | null> | null;
  plan: unknown;
  evidence: { evidenceId: string; kind: string; hash: string }[];
  verifier: { result?: string; summary?: string; at?: string } | null;
  tools: { at: string; tool: unknown; ok?: unknown; agentId?: string }[];
  secrets: { secretId: string; name: string; status?: string }[];
  decisions: { decisionId: string; choice: string; status: string }[];
  artifacts: { artifactId: string; title: string; kind: string }[];
  events: { seq: number; type: string; at: string }[];
  rewinds: { seq: number; targetSeq: unknown; reason: unknown; type: string }[];
  signature?: { alg: string; publicKey: string; signature: string };
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function buildAuditBundle(world: WorldSnapshot, missionId: string): AuditBundle {
  const mission = world.missions[missionId] ?? null;
  const plan = world.station?.plans
    ? Object.values(world.station.plans).find((p) => p.missionId === missionId) ?? Object.values(world.station.plans).at(-1)
    : undefined;
  const evs = world.events.filter((e) => e.missionId === missionId || !e.missionId);
  return {
    version: 1,
    claim: AUDIT_CLAIM,
    exportedAt: nowIso(),
    missionId,
    mission: mission
      ? {
          missionId: mission.missionId,
          title: mission.title,
          objective: mission.objective,
          state: mission.state,
          tokensUsed: mission.budget.tokensUsed,
          moneyUsed: mission.budget.moneyUsed,
        }
      : null,
    plan: plan ?? mission?.planSummary ?? null,
    evidence: Object.values(world.evidence)
      .filter((e) => e.missionId === missionId)
      .map((e) => ({ evidenceId: e.evidenceId, kind: e.kind, hash: hashText(e.detail || e.claim) })),
    verifier: mission?.verification ?? null,
    tools: evs
      .filter((e) => e.type === "ToolExecuted" || e.type === "ToolDenied" || e.type === "ToolRequested" || e.type === "ToolDryRun")
      .map((e) => ({ at: e.at, tool: e.payload.tool, ok: e.payload.ok, agentId: e.agentId })),
    secrets: Object.values(world.secretMeta ?? {}).map((s) => ({
      secretId: s.secretId,
      name: s.name,
      status: s.status,
    })),
    decisions: Object.values(world.decisions)
      .filter((d) => d.missionId === missionId)
      .map((d) => ({ decisionId: d.decisionId, choice: d.choice, status: d.status })),
    artifacts: Object.values(world.artifacts)
      .filter((a) => a.missionId === missionId)
      .map((a) => ({ artifactId: a.artifactId, title: a.title, kind: a.kind })),
    events: evs.slice(-200).map((e) => ({ seq: e.seq, type: e.type, at: e.at })),
    rewinds: evs
      .filter((e) =>
        e.type === "RewindSelfRequested" ||
        e.type === "RewindBranched" ||
        e.type === "BranchPruned" ||
        e.type === "RewindSelfDenied" ||
        e.type === "RewindEscalated",
      )
      .map((e) => ({ seq: e.seq, targetSeq: e.payload.targetSeq, reason: e.payload.reason, type: e.type })),
  };
}

export function writeAuditBundle(operatorId: string, missionId: string, world: WorldSnapshot): { path: string; bundle: AuditBundle } {
  const unsigned = buildAuditBundle(world, missionId);
  const canonical = JSON.stringify({ ...unsigned, signature: undefined });
  const signature: AuditSignature = signAuditPayload(operatorId, canonical);
  const bundle: AuditBundle = {
    ...unsigned,
    signature: { alg: signature.alg, publicKey: signature.publicKey, signature: signature.signature },
  };
  const dir = join(operatorDir(operatorId), "audits");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${missionId}.audit.json`);
  writeFileSync(path, JSON.stringify(bundle, null, 2), "utf8");
  return { path, bundle };
}

export function bundleContainsSecretValues(bundle: AuditBundle, values: string[]): boolean {
  const raw = JSON.stringify(bundle);
  return values.some((v) => v.length >= 6 && raw.includes(v));
}
