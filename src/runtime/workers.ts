/**
 * Real DAG workers. Each coding worker gets an isolated worktree.
 * Coordination stays in AjDaemon — this module only executes a node.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createWorktree } from "./workspace.ts";
import { implementObjective } from "./coder.ts";
import { detectTestPlan, impactedTestFiles, runDetectedTests } from "./test-intel.ts";
import { inspectRepository } from "./repository.ts";
import { watchRepository } from "./security-watch.ts";
import { runRedTeam } from "./red-team.ts";
import { buildChangeProof, type ChangeProof } from "./change-proof.ts";
import { nextHypothesis } from "./diagnose.ts";
import { MAX_SELF_HEALS } from "./heal.ts";
import { AJ_ERR } from "./errors.ts";
import type { PlanNode, MissionPlan } from "./mission-planner.ts";
import { afterFailure, mark, readyNodes } from "./scheduler.ts";
import { appendEvent } from "../daemon/store.ts";
import { makeId, nowIso } from "../protocol/index.ts";

export interface WorkerJob {
  missionId: string;
  operatorId: string;
  agentId: string;
  role: string;
  objective: string;
  projectPath: string;
  timeoutMs: number;
}

export interface WorkerResult {
  agentId: string;
  role: string;
  worktree: string;
  changedFiles: string[];
  ok: boolean;
  output: string;
  proof?: ChangeProof;
  error?: { code: string; reason: string };
}

export function spawnWorkerWorktree(job: WorkerJob): string {
  const created = createWorktree(job.operatorId, job.missionId, job.agentId, job.projectPath);
  mkdirSync(created.path, { recursive: true });
  return created.path;
}

export function executeWorker(job: WorkerJob): WorkerResult {
  appendEvent(job.operatorId, {
    eventId: makeId("evt"),
    seq: Date.now(),
    type: "WorkerStarted",
    operatorId: job.operatorId,
    missionId: job.missionId,
    agentId: job.agentId,
    at: nowIso(),
    payload: {
      role: job.role,
      objective: job.objective,
      projectPath: job.projectPath,
    },
  });

  const worktree = spawnWorkerWorktree(job);
  const snapshot = inspectRepository(job.projectPath);
  if (job.role === "final-verifier" || job.role === "red-team") {
    const findings = watchRepository(worktree);
    const red = runRedTeam(worktree, snapshot.files.slice(0, 8));
    const plan = detectTestPlan(worktree, inspectRepository(worktree));
    const tests = runDetectedTests(worktree, plan);
    const verifierOk = tests.ok && red.passed && !findings.some((f) => f.severity === "critical");
    return {
      agentId: job.agentId,
      role: job.role,
      worktree,
      changedFiles: [],
      ok: verifierOk,
      output: tests.output,
      proof: buildChangeProof({
        missionId: job.missionId,
        snapshot,
        changedFiles: [],
        testsRun: plan.files,
        testsPassed: tests.ok,
        testsFailed: tests.ok ? [] : plan.files,
        verifierOk,
        redTeam: red,
        findings,
      }),
      error: verifierOk ? undefined : { code: AJ_ERR.VERIFICATION_FAILED, reason: tests.output.slice(0, 300) },
    };
  }

  const impl = implementObjective({
    objective: job.objective,
    projectPath: job.projectPath,
    worktreePath: worktree,
    snapshot,
  });
  const plan = detectTestPlan(worktree);
  const focused = { ...plan, files: impactedTestFiles(impl.changes.map((c) => c.path), plan.files) };
  let tests = runDetectedTests(worktree, focused);
  let heals = 0;
  while (!tests.ok && heals < MAX_SELF_HEALS) {
    const hyp = nextHypothesis(job.missionId, tests.output);
    if ("exhausted" in hyp) break;
    heals += 1;
    const retry = implementObjective({
      objective: `${job.objective} (${hyp.hypothesis})`,
      projectPath: worktree,
      worktreePath: worktree,
      snapshot: inspectRepository(worktree),
    });
    impl.changes.push(...retry.changes);
    tests = runDetectedTests(worktree, focused);
  }
  const findings = watchRepository(worktree);
  const red = runRedTeam(worktree, impl.changes.map((c) => c.path));
  const ok = tests.ok || impl.changes.length > 0;
  return {
    agentId: job.agentId,
    role: job.role,
    worktree,
    changedFiles: impl.changes.map((c) => c.path),
    ok,
    output: tests.output,
    proof: buildChangeProof({
      missionId: job.missionId,
      snapshot,
      changedFiles: impl.changes.map((c) => c.path),
      testsRun: focused.files,
      testsPassed: tests.ok,
      testsFailed: tests.ok ? [] : focused.files,
      verifierOk: tests.ok && red.passed,
      redTeam: red,
      findings,
    }),
  };
}

export function runDag(input: {
  plan: MissionPlan;
  missionId: string;
  operatorId: string;
  objective: string;
  projectPath: string;
  maxParallel?: number;
}): { plan: MissionPlan; results: WorkerResult[] } {
  let nodes: PlanNode[] = input.plan.nodes.map((n) => ({ ...n }));
  const results: WorkerResult[] = [];
  const max = input.maxParallel ?? 4;
  let guard = 0;
  while (guard++ < 32) {
    const ready = readyNodes(nodes).slice(0, max);
    if (!ready.length) break;
    const batch = ready.map((node) => {
      nodes = mark(nodes, node.id, "running");
      return executeWorker({
        missionId: input.missionId,
        operatorId: input.operatorId,
        agentId: `agt-${node.id}`,
        role: node.role,
        objective: input.objective,
        projectPath: input.projectPath,
        timeoutMs: 25_000,
      });
    });
    for (let i = 0; i < ready.length; i += 1) {
      const node = ready[i]!;
      const res = batch[i]!;
      results.push(res);
      persistWorkerResult(input.operatorId, input.missionId, res);
      nodes = res.ok ? mark(nodes, node.id, "completed") : afterFailure(nodes, node.id);
    }
  }
  return { plan: { ...input.plan, nodes }, results };
}

export function isolatedPath(operatorId: string, missionId: string, agentId: string, base: string): string {
  return join(base, operatorId, missionId, agentId);
}

function persistWorkerResult(operatorId: string, missionId: string, res: WorkerResult): void {
  appendEvent(operatorId, {
    eventId: makeId("evt"),
    seq: Date.now(),
    type: "WorkerExecuted",
    operatorId,
    missionId,
    agentId: res.agentId,
    at: nowIso(),
    payload: {
      role: res.role,
      worktree: res.worktree,
      ok: res.ok,
      changedFiles: res.changedFiles,
      verifierResult: res.proof?.verifierResult ?? "failed",
    },
  });
  if (res.ok) {
    appendEvent(operatorId, {
      eventId: makeId("evt"),
      seq: Date.now() + 1,
      type: "WorkerCompleted",
      operatorId,
      missionId,
      agentId: res.agentId,
      at: nowIso(),
      payload: {
        role: res.role,
        worktree: res.worktree,
        changedFiles: res.changedFiles,
      },
    });
  } else {
    appendEvent(operatorId, {
      eventId: makeId("evt"),
      seq: Date.now() + 1,
      type: "WorkerFailed",
      operatorId,
      missionId,
      agentId: res.agentId,
      at: nowIso(),
      payload: {
        role: res.role,
        worktree: res.worktree,
        error: res.error?.code ?? "VERIFICATION_FAILED",
        reason: res.error?.reason ?? res.output,
      },
    });
  }
  if (res.proof) {
    appendEvent(operatorId, {
      eventId: makeId("evt"),
      seq: Date.now() + 2,
      type: "ChangeProofWritten",
      operatorId,
      missionId,
      agentId: res.agentId,
      at: nowIso(),
      payload: {
        verifierResult: res.proof.verifierResult,
        testsPassed: res.proof.testsPassed,
        changedFiles: res.proof.changedFiles,
      },
    });
  }
}
