import test from "node:test";
import assert from "node:assert/strict";
import { appendEvent, reconstruct, ledgerPath, readLedger, writeSnapshot } from "../src/daemon/store.ts";
import { makeId, nowIso, type Mission, type AgentInstance } from "../src/protocol/index.ts";

test("P4-1: kill and restart daemon during active mission preserves state, replay without false COMPLETED", () => {
  const operatorId = `op-p4-${Date.now()}`;
  const missionId = `msn-p4-${Date.now()}`;

  // 1. Initial mission creation
  const mission: Mission = {
    missionId,
    operatorId,
    title: "Active recovery mission",
    objective: "Verify ledger replay on unexpected daemon restart",
    intent: "engineering",
    state: "CREATED",
    budget: {
      tokens: 10000,
      tokensUsed: 100,
      moneyUsd: 10,
      moneyUsed: 0.1,
      timeMs: 60000,
      timeUsedMs: 1000,
      toolCalls: 50,
      toolCallsUsed: 2,
      retries: 3,
      retriesUsed: 0,
      browserActions: 0,
      browserActionsUsed: 0,
    },
    requirements: [
      { requirementId: "req-1", key: "audit", text: "Maintain audit integrity", mandatory: true, status: "open" },
    ],
    tasks: [],
    artifacts: [],
    decisions: [],
    memories: [],
    agents: [],
    conflicts: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  appendEvent(operatorId, {
    eventId: makeId("evt"),
    seq: 1,
    type: "MissionCreated",
    operatorId,
    missionId,
    at: nowIso(),
    payload: { mission },
  });

  // 2. Mission transitions to PLANNING then RUNNING with agent spawned
  appendEvent(operatorId, {
    eventId: makeId("evt"),
    seq: 2,
    type: "PlanCreated",
    operatorId,
    missionId,
    at: nowIso(),
    payload: { summary: "3-step plan" },
  });

  const agent: AgentInstance = {
    agentId: "agt-p4-1",
    missionId,
    parentAgentId: null,
    role: "backend-engineer",
    title: "Backend Engineer",
    objective: "Implement patch",
    contractId: "ctr-1",
    capabilities: ["code-edit", "test-run"],
    permissions: {
      filesystem: "scoped-write",
      terminal: "sandbox",
      browser: "none",
      network: "none",
      git: "worktree",
      secrets: "none",
      spawnAgents: false,
      maxChildAutonomy: 0,
    },
    model: "aj-local",
    contextIds: [],
    memoryScope: "session",
    executionEnvironment: "local",
    budget: mission.budget,
    state: "RUNNING",
    artifacts: [],
    failures: [],
    autonomy: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  appendEvent(operatorId, {
    eventId: makeId("evt"),
    seq: 3,
    type: "AgentSpawned",
    operatorId,
    missionId,
    agentId: "agt-p4-1",
    at: nowIso(),
    payload: { agent },
  });

  appendEvent(operatorId, {
    eventId: makeId("evt"),
    seq: 4,
    type: "PlanApproved",
    operatorId,
    missionId,
    at: nowIso(),
    payload: {},
  });

  appendEvent(operatorId, {
    eventId: makeId("evt"),
    seq: 5,
    type: "WorkerStarted",
    operatorId,
    missionId,
    agentId: "agt-p4-1",
    at: nowIso(),
    payload: { role: "backend-engineer", objective: "Implement patch" },
  });

  // Take a checkpoint snapshot at seq 5
  const worldAt5 = reconstruct(operatorId);
  writeSnapshot(worldAt5);

  // More events occur after snapshot
  appendEvent(operatorId, {
    eventId: makeId("evt"),
    seq: 6,
    type: "WorkerExecuted",
    operatorId,
    missionId,
    agentId: "agt-p4-1",
    at: nowIso(),
    payload: { role: "backend-engineer", ok: true, changedFiles: ["src/math.js"], verifierResult: "ok" },
  });

  // 3. SIMULATE DAEMON KILL / CRASH
  // The process terminates while mission is in RUNNING / active state.
  // We restart daemon by reconstructing from ledger and snapshot.
  const recoveredWorld = reconstruct(operatorId);

  // Assertions:
  // a) Mission is recovered in RUNNING state, NOT falsely COMPLETED
  assert.ok(recoveredWorld.missions[missionId]);
  assert.equal(recoveredWorld.missions[missionId].state, "RUNNING");
  assert.notEqual(recoveredWorld.missions[missionId].state, "COMPLETE");

  // b) Agent is recovered with correct state
  assert.ok(recoveredWorld.agents["agt-p4-1"]);
  assert.equal(recoveredWorld.agents["agt-p4-1"].state, "COMPLETE");

  // c) Audit continuity: seq is monotonic and events are complete
  assert.equal(recoveredWorld.seq, 6);
  assert.equal(recoveredWorld.events.length, 6);

  // 4. Continue mission operations after recovery
  appendEvent(operatorId, {
    eventId: makeId("evt"),
    seq: 7,
    type: "ChangeProofWritten",
    operatorId,
    missionId,
    agentId: "agt-p4-1",
    at: nowIso(),
    payload: { verifierResult: "ok", testsPassed: true, changedFiles: ["src/math.js"] },
  });

  appendEvent(operatorId, {
    eventId: makeId("evt"),
    seq: 8,
    type: "MissionCompleted",
    operatorId,
    missionId,
    at: nowIso(),
    payload: { result: "SUCCESS" },
  });

  const finalWorld = reconstruct(operatorId);
  assert.equal(finalWorld.missions[missionId].state, "COMPLETE");
  assert.equal(finalWorld.seq, 8);
  assert.equal(finalWorld.events.length, 8);
});
