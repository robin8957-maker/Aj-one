/**
 * Engineering loop over a real repository. Playbooks are templates, not the OS.
 * Mutating steps still go through writeScoped + sandbox. Verifier does not write.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { inspectRepository, readRepoFile, type RepositorySnapshot } from "./repository.ts";
import { graphFromRepository, findAffectedTests } from "./code-graph.ts";
import { buildContextBundle } from "./context-engine.ts";
import { planMission, type MissionPlan } from "./mission-planner.ts";
import { afterFailure, readyNodes, mark } from "./scheduler.ts";
import { watchRepository } from "./security-watch.ts";
import { runRedTeam } from "./red-team.ts";
import { buildChangeProof, type ChangeProof } from "./change-proof.ts";
import { inspectUntrustedText } from "./instruction-boundary.ts";
import { AJ_ERR } from "./errors.ts";
import { implementObjective } from "./coder.ts";
import { detectTestPlan, impactedTestFiles, runDetectedTests } from "./test-intel.ts";
import { nextHypothesis } from "./diagnose.ts";
import { MAX_SELF_HEALS } from "./heal.ts";
import { runDag } from "./workers.ts";

export type EngineerPhase =
  | "UNDERSTAND"
  | "PLAN"
  | "INSPECT"
  | "IMPLEMENT"
  | "TEST"
  | "DIAGNOSE"
  | "REPAIR"
  | "VERIFY"
  | "REPORT";

export interface EngineerResult {
  ok: boolean;
  phase: EngineerPhase;
  snapshot: RepositorySnapshot;
  plan: MissionPlan;
  changedFiles: string[];
  proof?: ChangeProof;
  error?: { code: string; reason: string };
}

export function applyGeneralPatch(worktree: string, projectPath: string, objective: string): string[] {
  return implementObjective({ objective, projectPath, worktreePath: worktree }).changes.map((c) => c.path);
}

export function runEngineeringLoop(input: {
  missionId: string;
  objective: string;
  projectPath: string;
  worktreePath: string;
}): EngineerResult {
  const snapshot = inspectRepository(input.projectPath);
  if (!snapshot.files.length) {
    return {
      ok: false,
      phase: "INSPECT",
      snapshot,
      plan: planMission(input.objective, snapshot),
      changedFiles: [],
      error: { code: AJ_ERR.CAPABILITY_UNAVAILABLE, reason: "empty repository" },
    };
  }
  for (const file of snapshot.files.slice(0, 40)) {
    const body = readRepoFile(snapshot.root, file);
    if (!body) continue;
    const inj = inspectUntrustedText(body, "REPOSITORY");
    if (!inj.allowed) {
      return {
        ok: false,
        phase: "INSPECT",
        snapshot,
        plan: planMission(input.objective, snapshot),
        changedFiles: [],
        error: { code: inj.code ?? AJ_ERR.INSTRUCTION_INJECTION, reason: inj.reason },
      };
    }
  }

  const graph = graphFromRepository(input.projectPath);
  const plan = planMission(input.objective, snapshot);
  if (plan.refused) {
    return { ok: false, phase: "PLAN", snapshot, plan, changedFiles: [], error: plan.refused };
  }
  buildContextBundle({
    missionId: input.missionId,
    role: "backend-engineer",
    objective: input.objective,
    snapshot,
    graph,
    budgetTokens: 8_000,
  });

  mkdirSync(input.worktreePath, { recursive: true });
  const impl = implementObjective({
    objective: input.objective,
    projectPath: input.projectPath,
    worktreePath: input.worktreePath,
    snapshot,
  });
  const changedFiles = impl.changes.map((c) => c.path);
  const testPlan = detectTestPlan(input.worktreePath);
  const testFilesToRun = testPlan.files.length ? testPlan.files : impactedTestFiles(changedFiles, findAffectedTests(graph, changedFiles[0] ?? "src"));
  const focused = {
    ...testPlan,
    files: testFilesToRun,
  };
  let testRun = runDetectedTests(input.worktreePath, focused);
  let heals = 0;
  while (!testRun.ok && heals < MAX_SELF_HEALS) {
    const hyp = nextHypothesis(input.missionId, testRun.output);
    if ("exhausted" in hyp) break;
    heals += 1;
    implementObjective({
      objective: `${input.objective} (${hyp.hypothesis})`,
      projectPath: input.worktreePath,
      worktreePath: input.worktreePath,
    });
    testRun = runDetectedTests(input.worktreePath, focused);
  }

  const findings = watchRepository(input.worktreePath);
  const red = runRedTeam(input.worktreePath, changedFiles);
  const verifierOk = testRun.ok && red.passed && !findings.some((f) => f.severity === "critical");
  const proof = buildChangeProof({
    missionId: input.missionId,
    snapshot,
    changedFiles,
    testsRun: focused.files,
    testsPassed: testRun.ok,
    testsFailed: testRun.ok ? [] : focused.files,
    verifierOk,
    redTeam: red,
    findings,
  });
  const proofPath = join(input.worktreePath, "docs", `proof-${input.missionId}.json`);
  mkdirSync(dirname(proofPath), { recursive: true });
  writeFileSync(proofPath, JSON.stringify(proof, null, 2), "utf8");

  return {
    ok: verifierOk,
    phase: "REPORT",
    snapshot,
    plan,
    changedFiles,
    proof,
    error: verifierOk ? undefined : { code: AJ_ERR.VERIFICATION_FAILED, reason: testRun.output.slice(0, 400) },
  };
}

export function advanceDag(plan: MissionPlan, completedId: string, failed = false): MissionPlan {
  const nodes = failed ? afterFailure(plan.nodes, completedId) : mark(plan.nodes, completedId, "completed");
  const ready = readyNodes(nodes);
  return {
    ...plan,
    nodes: nodes.map((n) => (ready.some((r) => r.id === n.id) && n.state === "blocked" ? { ...n, state: "ready" } : n)),
  };
}

export function worktreeExists(path: string): boolean {
  return existsSync(path);
}

export function runParallelEngineering(input: {
  missionId: string;
  operatorId: string;
  objective: string;
  projectPath: string;
}) {
  const snapshot = inspectRepository(input.projectPath);
  const plan = planMission(input.objective, snapshot);
  if (plan.refused) return { ok: false as const, plan, results: [] };
  return { ok: true as const, ...runDag({ ...input, plan }) };
}
