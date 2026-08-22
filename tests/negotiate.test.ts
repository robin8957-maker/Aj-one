import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildNegotiationRequest,
  evaluateNegotiation,
  sanitizeReason,
  MAX_ASK_RATIO,
  dagProgress,
} from "../src/runtime/negotiate.ts";
import { assessBudget } from "../src/runtime/economy.ts";
import { emptyAgentProfile } from "../src/runtime/reputation.ts";
import { AjDaemon } from "../src/daemon/ajd.ts";
import { nowIso, emptyBudget, DEFAULT_PERMISSIONS } from "../src/protocol/index.ts";
import type { AgentInstance, Mission, TaskNode } from "../src/protocol/index.ts";

function tasks(complete: number, total: number): TaskNode[] {
  return Array.from({ length: total }, (_, i) => ({
    taskId: `t${i}`,
    missionId: "msn",
    title: `t${i}`,
    description: "",
    role: "backend-engineer",
    dependencies: [],
    inputs: [],
    outputs: [],
    state: i < complete ? "COMPLETE" : "READY",
    priority: 1,
    risk: "low",
    budgetTokens: 100,
  }));
}

function missionWith(complete: number, total: number): Mission {
  return {
    missionId: "msn",
    operatorId: "op",
    title: "t",
    objective: "finish merge",
    projectPath: "/tmp",
    state: "RUNNING",
    requirements: [],
    constraints: [],
    tasks: tasks(complete, total),
    budget: { tokens: 1000, tokensUsed: 910, moneyUsd: 1, moneyUsed: 0.91, timeMs: 1, parallelAgents: 1 },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

test("90% spend asks to renegotiate instead of waking a human", () => {
  const v = assessBudget({ tokens: 100, tokensUsed: 91, moneyUsd: 1, moneyUsed: 0.1, timeMs: 1, parallelAgents: 1 });
  assert.equal(v.action, "renegotiate");
});

test("after one extension, 90% ends the mission", () => {
  const v = assessBudget({
    tokens: 115,
    tokensUsed: 110,
    moneyUsd: 1,
    moneyUsed: 0.95,
    timeMs: 1,
    parallelAgents: 1,
    extensionsGranted: 1,
  });
  assert.equal(v.action, "stop");
});

test("grant when DAG is mostly done and reputation is acceptable", () => {
  const m = missionWith(4, 5);
  const req = buildNegotiationRequest({
    mission: m,
    agentId: "ag1",
    role: "backend-engineer",
    wastedCalls: 5,
    lastError: "unexpected network error consumed 5 calls",
  });
  assert.equal(req.askedRatio, MAX_ASK_RATIO);
  assert.match(req.reason, /15%/);
  const profile = emptyAgentProfile("backend-engineer", "auth", "javascript");
  profile.sampleSize = 4;
  profile.successRate = 0.8;
  profile.verifierRejectRate = 0.1;
  profile.rollbackRate = 0;
  const d = evaluateNegotiation(req, profile, false, m.budget);
  assert.equal(d.granted, true);
  assert.equal(d.once, true);
  assert.equal(d.extraTokens, Math.ceil(1000 * 0.15));
});

test("refuse when DAG is barely started", () => {
  const m = missionWith(1, 8);
  const req = buildNegotiationRequest({ mission: m, agentId: "ag1", role: "backend-engineer", wastedCalls: 2 });
  const d = evaluateNegotiation(req, null, false, m.budget);
  assert.equal(d.granted, false);
  assert.match(d.reason, /DAG only/);
});

test("refuse a second extension even with a perfect DAG", () => {
  const m = missionWith(5, 5);
  const req = buildNegotiationRequest({ mission: m, agentId: "ag1", role: "backend-engineer", wastedCalls: 1 });
  const d = evaluateNegotiation(req, null, true, m.budget);
  assert.equal(d.granted, false);
  assert.match(d.reason, /already extended/);
});

test("refuse a high verifier-reject reputation", () => {
  const m = missionWith(4, 5);
  const req = buildNegotiationRequest({ mission: m, agentId: "ag1", role: "backend-engineer", wastedCalls: 1 });
  const profile = emptyAgentProfile("backend-engineer", "auth", "javascript");
  profile.sampleSize = 8;
  profile.verifierRejectRate = 0.85;
  profile.successRate = 0.2;
  const d = evaluateNegotiation(req, profile, false, m.budget);
  assert.equal(d.granted, false);
  assert.match(d.reason, /verifier reject|success rate/);
});

test("asked ratio cannot exceed 15% and secrets are stripped from the reason", () => {
  const dag = dagProgress(tasks(3, 4));
  assert.equal(dag.ratio, 0.75);
  const dirty = sanitizeReason("need more; Bearer sk-live-SUPERSECRETVALUE99 leaked");
  assert.doesNotMatch(dirty, /SUPERSECRET/);
  assert.match(dirty, /\[redacted\]/);
  const d = evaluateNegotiation(
    {
      missionId: "msn",
      agentId: "ag",
      role: "backend-engineer",
      reason: dirty,
      askedRatio: 0.8,
      evidence: { wastedCalls: 1, dagComplete: 3, dagTotal: 4, dagRatio: 0.75 },
    },
    null,
    false,
    { tokens: 100, moneyUsd: 1 },
  );
  assert.equal(d.granted, true);
  assert.equal(d.extraTokens, 15);
});

test("daemon grants once then fails the mission on the next ask", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-neg-"));
  process.env.AJ_DATA_DIR = dir;
  const ajd = new AjDaemon();
  const op = "neg-op";
  const started = ajd.startMission(op, "Add GET /health that returns { ok: true, service: 'northstar' }");
  const world = ajd.load(op);
  const mission = world.missions[started.missionId]!;
  mission.tasks = tasks(3, 4).map((t) => ({ ...t, missionId: mission.missionId }));
  mission.budget.tokensUsed = Math.ceil(mission.budget.tokens * 0.91);
  const agent: AgentInstance = {
    agentId: "ag_neg",
    missionId: mission.missionId,
    parentAgentId: mission.commanderId ?? null,
    role: "backend-engineer",
    title: "BE",
    objective: "merge",
    contractId: "c",
    capabilities: [],
    permissions: DEFAULT_PERMISSIONS["backend-engineer"],
    model: "aj-local",
    contextIds: [],
    memoryScope: "mission",
    executionEnvironment: "sandbox",
    budget: emptyBudget(),
    state: "RUNNING",
    artifacts: [],
    failures: [],
    autonomy: 40,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  world.agents[agent.agentId] = agent;
  const first = ajd.renegotiateBudget(world, mission, agent, "unexpected network error consumed 5 calls");
  assert.equal(first, true);
  assert.equal(mission.budget.extensionsGranted, 1);
  assert.ok(world.events.some((e) => e.type === "BudgetRenegotiated"));
  const second = ajd.renegotiateBudget(world, mission, agent, "need more");
  assert.equal(second, false);
  assert.equal(mission.state, "FAILED");
  assert.ok(world.events.some((e) => e.type === "BudgetNegotiationDenied"));
  const leaked = JSON.stringify(world.events);
  assert.doesNotMatch(leaked, /sk-live/);
  rmSync(dir, { recursive: true, force: true });
});
