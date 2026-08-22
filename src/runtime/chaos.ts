/**
 * Chaos + zombie resume. We sell state consistency, not uptime.
 */
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { healLedger, reconstruct, writeSnapshot } from "../daemon/store.ts";

export const ORPHAN_PREFIXES = ["aj-microvm", "aj-jail"];

export function sweepOrphans(root = tmpdir()): { removed: string[]; kept: string[] } {
  const removed: string[] = [];
  const kept: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(root);
  } catch {
    return { removed, kept };
  }
  for (const name of names) {
    if (!ORPHAN_PREFIXES.some((p) => name.startsWith(p) || name.includes(p))) continue;
    const full = join(root, name);
    try {
      const st = statSync(full);
      if (!st.isDirectory() && !name.includes("aj-")) continue;
      rmSync(full, { recursive: true, force: true });
      removed.push(full);
    } catch {
      kept.push(full);
    }
  }
  return { removed, kept };
}

export function resumeFromLedger(operatorId: string): {
  seq: number;
  inFlight: number;
  orphans: string[];
} {
  const healed = healLedger(operatorId);
  void healed;
  const world = reconstruct(operatorId);
  const orphans = sweepOrphans();
  const inFlight = Object.values(world.missions).filter((m) =>
    ["CREATED", "PLANNING", "RUNNING", "VERIFYING", "WAITING_APPROVAL"].includes(m.state),
  ).length;
  writeSnapshot(world);
  return { seq: world.seq, inFlight, orphans: orphans.removed };
}

export function lastAtomicSeq(events: Array<{ seq: number }>): number {
  return events.reduce((m, e) => Math.max(m, e.seq), 0);
}
