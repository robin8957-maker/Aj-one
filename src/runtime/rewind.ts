import type { AjEvent, WorldSnapshot } from "../protocol/index.ts";
import { emptyWorld } from "../protocol/index.ts";
import { applyEvent, readLedger, writeSnapshot } from "../daemon/store.ts";

export function rewindToSeq(operatorId: string, seq: number): WorldSnapshot {
  const events = readLedger(operatorId).filter((e) => e.seq <= seq);
  const world = emptyWorld(operatorId);
  for (const ev of events) applyEvent(world, ev);
  writeSnapshot(world);
  return world;
}

export function lastSeqBefore(events: AjEvent[], type: string): number | null {
  const hit = [...events].reverse().find((e) => e.type === type);
  return hit ? hit.seq : null;
}
