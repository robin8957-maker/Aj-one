/**
 * Read-only battle-map from WorkspaceIndexer + ledger.
 * The radar never emits write/policy commands.
 */
import type { WorkspaceIndex } from "./indexer.ts";
import type { AjEvent } from "../protocol/index.ts";

export type NodeGlow = "idle" | "touched" | "rejected" | "consensus";

export interface TopologyNode {
  id: string;
  file: string;
  glow: NodeGlow;
  exports: number;
}

export interface TopologyEdge {
  from: string;
  to: string;
}

export interface TopologyMap {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  readOnly: true;
}

function glowFromEvents(file: string, events: AjEvent[]): NodeGlow {
  let glow: NodeGlow = "idle";
  for (const ev of events) {
    const hay = `${ev.type} ${JSON.stringify(ev.payload)}`;
    if (!hay.includes(file)) continue;
    if (ev.type === "ConsensusReached" || ev.type === "VerificationFinished") glow = "consensus";
    else if (ev.type === "ConsensusDenied" || ev.type === "FailureRecorded" || ev.type === "WatchdogDenied") {
      if (glow !== "consensus") glow = "rejected";
    } else if (ev.type === "SourceWritten" || ev.type === "ToolExecuted" || ev.type === "WatchdogProposed") {
      if (glow === "idle") glow = "touched";
    }
  }
  return glow;
}

export function buildTopology(index: WorkspaceIndex, events: AjEvent[] = []): TopologyMap {
  const nodes: TopologyNode[] = Object.values(index.files).map((card) => ({
    id: card.file,
    file: card.file,
    glow: glowFromEvents(card.file, events),
    exports: card.exports.length,
  }));
  const edges: TopologyEdge[] = [];
  for (const card of Object.values(index.files)) {
    for (const caller of card.callers) {
      edges.push({ from: caller, to: card.file });
    }
  }
  return { nodes, edges, readOnly: true };
}

export function topologyIsReadOnly(map: TopologyMap): boolean {
  return map.readOnly === true;
}
