/**
 * Agent-driven rewind. Ledger is append-only.
 * Failed path is pruned in the DAG, never deleted from the audit trail.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { operatorDir } from "../daemon/store.ts";
import { sanitizeReason } from "./negotiate.ts";

export const MAX_SELF_REWINDS = 3;

export interface RewindAuthz {
  targetSeq: number;
  currentSeq: number;
  rewindCount: number;
  missionCreatedSeq: number;
}

export function authorizeRewindSelf(
  input: RewindAuthz,
): { ok: true } | { ok: false; reason: string; escalate?: boolean } {
  if (!Number.isInteger(input.targetSeq) || input.targetSeq < 1) {
    return { ok: false, reason: "zero-boundary: cannot rewind before seq 1" };
  }
  if (input.targetSeq < input.missionCreatedSeq) {
    return { ok: false, reason: "zero-boundary: cannot erase the operator's original intent" };
  }
  if (input.targetSeq >= input.currentSeq) {
    return { ok: false, reason: "target seq is not in the past" };
  }
  if (input.rewindCount >= MAX_SELF_REWINDS) {
    return { ok: false, reason: `time-loop limit: ${MAX_SELF_REWINDS} self-rewinds used`, escalate: true };
  }
  return { ok: true };
}

export function rewindPrompt(reason: string): string {
  const clean = sanitizeReason(reason);
  return `You traveled back in time to this point because the previous path failed: ${clean}. Do not repeat the same steps.`;
}

export function checkpointDir(operatorId: string, missionId: string, seq: number): string {
  return join(operatorDir(operatorId), "checkpoints", missionId, String(seq));
}

export function saveCheckpoint(operatorId: string, missionId: string, seq: number, worktreePath: string): string {
  const dest = checkpointDir(operatorId, missionId, seq);
  mkdirSync(dest, { recursive: true });
  if (existsSync(worktreePath)) copyTree(worktreePath, dest);
  return dest;
}

export function restoreCheckpoint(operatorId: string, missionId: string, targetSeq: number, worktreePath: string): {
  ok: boolean;
  fromSeq: number | null;
} {
  const root = join(operatorDir(operatorId), "checkpoints", missionId);
  if (!existsSync(root)) return { ok: false, fromSeq: null };
  const seqs = readdirSync(root)
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => b - a);
  const from = seqs.find((n) => n <= targetSeq) ?? seqs[seqs.length - 1];
  if (from == null) return { ok: false, fromSeq: null };
  const src = checkpointDir(operatorId, missionId, from);
  if (!existsSync(src)) return { ok: false, fromSeq: null };
  mkdirSync(worktreePath, { recursive: true });
  for (const name of readdirSync(worktreePath)) {
    rmSync(join(worktreePath, name), { recursive: true, force: true });
  }
  copyTree(src, worktreePath);
  return { ok: true, fromSeq: from };
}

function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    const dst = join(to, name);
    const st = statSync(src);
    if (st.isDirectory()) copyTree(src, dst);
    else cpSync(src, dst);
  }
}

export function missionCreatedSeq(events: Array<{ seq: number; type: string; missionId?: string }>, missionId: string): number {
  const hit = events.find((e) => e.type === "MissionCreated" && e.missionId === missionId);
  return hit?.seq ?? 1;
}
