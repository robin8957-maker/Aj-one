import type { AgentRole } from "../protocol/index.ts";
import type { FeatureSpec } from "./catalog-types.ts";
import { resolveFeature } from "./catalog.ts";
import type { RepositorySnapshot } from "./repository.ts";
import { AJ_ERR } from "./errors.ts";

export type PlanNodeState = "ready" | "running" | "blocked" | "failed" | "completed" | "cancelled";

export interface PlanNode {
  id: string;
  title: string;
  role: AgentRole;
  dependsOn: string[];
  parallelGroup: number;
  state: PlanNodeState;
}

export interface MissionPlan {
  objective: string;
  assumptions: string[];
  snapshotId: string;
  playbookKey: string;
  requiredCapabilities: string[];
  nodes: PlanNode[];
  budget: { tokens: number; moneyUsd: number; timeMs: number };
  risk: "low" | "medium" | "high" | "critical";
  verification: string[];
  rollback: string[];
  refused?: { code: string; reason: string };
}

export function planMission(objective: string, snapshot: RepositorySnapshot, feature?: FeatureSpec): MissionPlan {
  const playbook = feature ?? resolveFeature(objective);
  if (!snapshot.files.length) {
    return {
      objective,
      assumptions: [],
      snapshotId: snapshot.snapshotId,
      playbookKey: playbook.key,
      requiredCapabilities: [],
      nodes: [],
      budget: { tokens: 0, moneyUsd: 0, timeMs: 0 },
      risk: "critical",
      verification: [],
      rollback: [],
      refused: { code: AJ_ERR.CAPABILITY_UNAVAILABLE, reason: "repository snapshot is empty — refuse to invent a tree" },
    };
  }
  const nodes: PlanNode[] = [];
  const crew = playbook.crew;
  crew.forEach((role, i) => {
    const dependsOn: string[] = [];
    if (role === "backend-engineer" && crew.includes("architecture-lead")) dependsOn.push("architecture-lead");
    if (role === "frontend-engineer" && crew.includes("backend-engineer")) dependsOn.push("backend-engineer");
    if (role === "test-engineer") {
      if (crew.includes("backend-engineer")) dependsOn.push("backend-engineer");
      if (crew.includes("frontend-engineer")) dependsOn.push("frontend-engineer");
    }
    if (role === "final-verifier") {
      dependsOn.push(...crew.filter((r) => r !== "final-verifier"));
    }
    if ((role as string) === "red-team") {
      dependsOn.push(...crew.filter((r) => (r as string) !== "red-team" && r !== "final-verifier"));
    }
    nodes.push({
      id: role,
      title: role,
      role,
      dependsOn,
      parallelGroup: dependsOn.length === 0 ? 0 : i,
      state: dependsOn.length === 0 ? "ready" : "blocked",
    });
  });
  const risk: MissionPlan["risk"] = /secret|auth|prod|deploy/i.test(objective) ? "high" : "medium";
  return {
    objective,
    assumptions: [
      `languages: ${snapshot.languages.join(",") || "unknown"}`,
      `package managers: ${snapshot.packageManagers.join(",") || "none"}`,
      "Northstar is not assumed unless its files exist in the snapshot",
    ],
    snapshotId: snapshot.snapshotId,
    playbookKey: playbook.key,
    requiredCapabilities: ["FILE_READ", "FILE_WRITE", "TERMINAL_EXEC"],
    nodes,
    budget: { tokens: 180_000, moneyUsd: 6, timeMs: 20 * 60_000 },
    risk,
    verification: ["impacted tests", "independent final-verifier", "red-team if security-sensitive"],
    rollback: ["restore worktree from checkpoint", "do not merge on verifier failure"],
  };
}
