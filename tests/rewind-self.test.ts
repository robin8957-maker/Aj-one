import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authorizeRewindSelf, MAX_SELF_REWINDS, rewindPrompt, saveCheckpoint } from "../src/runtime/rewind-self.ts";
import { authorizeTool } from "../src/runtime/policy.ts";
import { AjDaemon } from "../src/daemon/ajd.ts";
import { createWorktree } from "../src/runtime/workspace.ts";
import { writeAuditBundle } from "../src/runtime/audit.ts";
import { nowIso, emptyBudget, DEFAULT_PERMISSIONS } from "../src/protocol/index.ts";
import type { AgentInstance } from "../src/protocol/index.ts";

test("zero-boundary and time-loop rules", () => {
  assert.equal(authorizeRewindSelf({ targetSeq: 0, currentSeq: 10, rewindCount: 0, missionCreatedSeq: 2 }).ok, false);
  assert.equal(authorizeRewindSelf({ targetSeq: 1, currentSeq: 10, rewindCount: 0, missionCreatedSeq: 2 }).ok, false);
  assert.equal(authorizeRewindSelf({ targetSeq: 10, currentSeq: 10, rewindCount: 0, missionCreatedSeq: 2 }).ok, false);
  const loop = authorizeRewindSelf({ targetSeq: 4, currentSeq: 10, rewindCount: MAX_SELF_REWINDS, missionCreatedSeq: 2 });
  assert.equal(loop.ok, false);
  if (!loop.ok) assert.equal(loop.escalate, true);
  assert.equal(authorizeRewindSelf({ targetSeq: 4, currentSeq: 10, rewindCount: 0, missionCreatedSeq: 2 }).ok, true);
});

test("ACP cannot call rewind.self", () => {
  const acp = {
    agentId: "acp",
    role: "researcher" as const,
    missionId: "m",
    autonomy: 50,
    permissions: { ...DEFAULT_PERMISSIONS.researcher, filesystem: "read" as const },
  };
  const denied = authorizeTool(acp as never, "rewind.self");
  assert.equal(denied.ok, false);
});

test("agent can destroy a file then rewind; ledger keeps the failure", () => {
  const data = mkdtempSync(join(tmpdir(), "aj-rws-data-"));
  const proj = mkdtempSync(join(tmpdir(), "aj-rws-proj-"));
  process.env.AJ_DATA_DIR = data;
  writeFileSync(join(proj, "keep.txt"), "good");
  const ajd = new AjDaemon();
  const op = "rws-op";
  const mission = ajd.startMission(op, "Add GET /health that returns { ok: true, service: 'northstar' }", proj);
  const world = ajd.load(op);
  const created = createWorktree(op, mission.missionId, "ag_rws", proj);
  const createdSeq = world.events.find((e) => e.type === "MissionCreated")!.seq;
  saveCheckpoint(op, mission.missionId, createdSeq, created.path);
  writeFileSync(join(created.path, "keep.txt"), "destroyed");
  const agent: AgentInstance = {
    agentId: "ag_rws",
    missionId: mission.missionId,
    parentAgentId: mission.commanderId ?? null,
    role: "backend-engineer",
    title: "BE",
    objective: "fix",
    contractId: "c",
    capabilities: [],
    permissions: DEFAULT_PERMISSIONS["backend-engineer"],
    model: "aj-local",
    contextIds: [],
    memoryScope: "mission",
    worktreeId: "wt_rws",
    executionEnvironment: "sandbox",
    budget: emptyBudget(),
    state: "RUNNING",
    artifacts: [],
    failures: ["deleted the wrong folder"],
    autonomy: 40,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  world.agents[agent.agentId] = agent;
  world.worktrees.wt_rws = {
    worktreeId: "wt_rws",
    missionId: mission.missionId,
    agentId: agent.agentId,
    branch: "aj/rws",
    path: created.path,
    baseRevision: "workspace",
    changedFiles: ["keep.txt"],
    mergeStatus: "open",
  };
  const result = ajd.executeRewindSelf(op, mission.missionId, agent.agentId, createdSeq, "I deleted the wrong folder and broke the environment");
  assert.equal(result.ok, true);
  assert.match(result.hint ?? "", /Do not repeat the same steps/);
  assert.equal(readFileSync(join(created.path, "keep.txt"), "utf8"), "good");
  const live = ajd.load(op);
  assert.ok(live.events.some((e) => e.type === "RewindSelfRequested"));
  assert.ok(live.events.some((e) => e.type === "BranchPruned"));
  assert.ok(live.events.some((e) => e.type === "RewindBranched"));
  assert.ok((live.missions[mission.missionId]?.rewindCount ?? 0) >= 1);
  const bundle = writeAuditBundle(op, mission.missionId, live).bundle;
  assert.ok(bundle.rewinds.some((r) => r.type === "RewindSelfRequested"));
  assert.doesNotMatch(JSON.stringify(bundle), /sk-live/);
  const fourth = ajd.executeRewindSelf(op, mission.missionId, agent.agentId, createdSeq, "again");
  ajd.executeRewindSelf(op, mission.missionId, agent.agentId, createdSeq, "again");
  const last = ajd.executeRewindSelf(op, mission.missionId, agent.agentId, createdSeq, "loop");
  assert.equal(last.ok, false);
  assert.equal(ajd.load(op).missions[mission.missionId]?.state, "WAITING_APPROVAL");
  void fourth;
  rmSync(data, { recursive: true, force: true });
  rmSync(proj, { recursive: true, force: true });
});

test("rewind prompt never includes raw secrets", () => {
  const text = rewindPrompt("broke env using Bearer sk-live-SUPERSECRETVALUE99");
  assert.doesNotMatch(text, /SUPERSECRET/);
  assert.match(text, /Do not repeat/);
});
