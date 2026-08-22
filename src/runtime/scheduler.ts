import type { PlanNode, PlanNodeState } from "./mission-planner.ts";

export function readyNodes(nodes: PlanNode[]): PlanNode[] {
  const done = new Set(nodes.filter((n) => n.state === "completed").map((n) => n.id));
  return nodes.filter((n) => {
    if (n.state === "completed" || n.state === "failed" || n.state === "cancelled" || n.state === "running") return false;
    return n.dependsOn.every((d) => done.has(d));
  });
}

export function mark(nodes: PlanNode[], id: string, state: PlanNodeState): PlanNode[] {
  return nodes.map((n) => (n.id === id ? { ...n, state } : n));
}

export function afterFailure(nodes: PlanNode[], failedId: string): PlanNode[] {
  const blocked = new Set<string>([failedId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (blocked.has(n.id)) continue;
      if (n.dependsOn.some((d) => blocked.has(d))) {
        blocked.add(n.id);
        grew = true;
      }
    }
  }
  return nodes.map((n) => {
    if (n.id === failedId) return { ...n, state: "failed" as const };
    if (blocked.has(n.id) && n.state !== "completed") return { ...n, state: "blocked" as const };
    return n;
  });
}

export function schedulerView(nodes: PlanNode[]): Record<PlanNodeState, string[]> {
  const out: Record<PlanNodeState, string[]> = {
    ready: [],
    running: [],
    blocked: [],
    failed: [],
    completed: [],
    cancelled: [],
  };
  for (const n of readyNodes(nodes)) out.ready.push(n.id);
  for (const n of nodes) {
    if (n.state !== "ready") out[n.state].push(n.id);
  }
  return out;
}
