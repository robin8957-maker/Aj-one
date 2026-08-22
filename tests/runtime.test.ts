import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { childMayAct, DEFAULT_PERMISSIONS, emptyWorld, makeId } from "../src/protocol/index.ts";
import { applyEvent, reconstruct } from "../src/daemon/store.ts";
import { AjDaemon } from "../src/daemon/ajd.ts";
import { resolveFeature } from "../src/runtime/catalog.ts";
import { matchScope } from "../src/runtime/workspace.ts";

function tempProject(dir: string): string {
  const project = join(dir, "northstar");
  cpSync(join(process.cwd(), "fixtures", "northstar"), project, { recursive: true });
  return project;
}

test("child cannot exceed parent autonomy", () => {
  const parent = {
    autonomy: 70,
    permissions: { ...DEFAULT_PERMISSIONS["architecture-lead"] },
  };
  const child = {
    autonomy: 90,
    permissions: { ...DEFAULT_PERMISSIONS.commander },
  };
  const result = childMayAct(parent, child);
  assert.equal(result.ok, false);
});

test("unknown scope globs stay closed", () => {
  assert.equal(matchScope("src/auth.js", "src/**"), true);
  assert.equal(matchScope("infra/terraform.tf", "src/**"), false);
  assert.equal(matchScope(".env", "src/**"), false);
});

test("factory selects minimum crew for a tiny change", () => {
  const health = resolveFeature("Add GET /health that returns ok");
  assert.ok(health.crew.length <= 3);
  const rate = resolveFeature("Add a token-bucket rate limiter");
  assert.ok(rate.crew.length >= 4);
});

test("ledger reconstructs a mission after process death", () => {
  const dir = mkdtempSync(join(tmpdir(), "ajd-"));
  process.env.AJ_DATA_DIR = dir;
  const op = "test-op";
  try {
    const project = tempProject(dir);
    const a = new AjDaemon();
    const mission = a.startMission(op, "Add GET /health to the Northstar service", project);
    for (let i = 0; i < 24; i += 1) a.advance(op, Date.now() + i * 2000);
    const first = a.view(op);
    assert.equal(first.missions.length, 1);
    assert.ok(first.agents.length >= 2, "commander plus at least one specialist");
    assert.ok(first.events.some((e) => e.type === "AgentSpawned"));

    const b = new AjDaemon();
    const again = b.view(op);
    assert.equal(again.missions[0]?.missionId, mission.missionId);
    assert.ok(again.daemon.seq >= first.daemon.seq - 8);
    assert.ok(again.agents.some((ag) => ag.role === "commander"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
  }
});

test("health mission reaches independent verification", () => {
  const dir = mkdtempSync(join(tmpdir(), "ajd-"));
  process.env.AJ_DATA_DIR = dir;
  const op = "test-health";
  try {
    const project = tempProject(dir);
    const ajd = new AjDaemon();
    ajd.startMission(
      op,
      "Add GET /health that returns { ok: true, service: 'northstar' }",
      project,
    );
    let state = "";
    for (let i = 0; i < 40; i += 1) {
      const world = ajd.advance(op, Date.now() + i * 2000);
      const m = Object.values(world.missions)[0];
      state = m?.state ?? "";
      if (state === "COMPLETE" || state === "FAILED") break;
    }
    const view = ajd.view(op);
    const mission = view.missions[0];
    assert.ok(mission, `missing mission (last state ${state})`);
    assert.ok(view.agents.some((a) => a.role === "final-verifier"));
    assert.ok(view.agents.some((a) => a.role === "backend-engineer"));
    assert.equal(mission.state, "COMPLETE", `mission ended ${mission.state}`);
    assert.equal(mission.verification?.result, "PASS");
    assert.ok(view.evidence.some((e) => e.passed));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
  }
});

test("incomplete implementation is rejected by the verifier", () => {
  const dir = mkdtempSync(join(tmpdir(), "ajd-"));
  process.env.AJ_DATA_DIR = dir;
  try {
    const project = tempProject(dir);
    const feature = resolveFeature("Add GET /health that returns ok");
    assert.ok(feature.files.length >= 2);
    const world = emptyWorld("x");
    applyEvent(world, {
      eventId: makeId("evt"),
      seq: 1,
      type: "MissionCreated",
      operatorId: "x",
      missionId: "m1",
      at: new Date().toISOString(),
      payload: {
        mission: {
          missionId: "m1",
          operatorId: "x",
          title: "t",
          objective: "o",
          projectPath: project,
          state: "CREATED",
          requirements: [],
          constraints: [],
          tasks: [],
          budget: { tokens: 1, tokensUsed: 0, moneyUsd: 1, moneyUsed: 0, timeMs: 1, parallelAgents: 1 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    });
    assert.equal(world.missions.m1?.title, "t");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
  }
});

test("reconstruct empty operator is empty world", () => {
  const dir = mkdtempSync(join(tmpdir(), "ajd-empty-"));
  process.env.AJ_DATA_DIR = dir;
  try {
    const world = reconstruct("nobody");
    assert.equal(world.seq, 0);
    assert.equal(Object.keys(world.missions).length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
  }
});
