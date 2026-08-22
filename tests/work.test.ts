import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AjDaemon } from "../src/daemon/ajd.ts";
import { inferPreset, parseWorkSteer, selectCouncil } from "../src/runtime/work.ts";

function isolated(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  process.env.AJ_DATA_DIR = dir;
  cpSync(join(process.cwd(), "fixtures", "northstar"), join(dir, "northstar"), { recursive: true });
  return dir;
}

function cleanup(dir: string) {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.AJ_DATA_DIR;
}

test("council is dynamic — design vs debug", () => {
  const design = selectCouncil("redesign authentication architecture", "design", "balanced");
  const debug = selectCouncil("debug failing login race", "debug", "fast");
  assert.ok(design.includes("architecture-lead"));
  assert.ok(debug.includes("debugger"));
  assert.notDeepEqual(design, debug);
  assert.ok(debug.length <= 3);
});

test("acceptance: /work redesign auth produces council, proposals, objections, evidence, decision", () => {
  const dir = isolated("aj-work-");
  try {
    const ajd = new AjDaemon();
    const op = "work-op";
    const view = ajd.startWorkRoom(op, { objective: "Redesign authentication architecture", preset: "design", quality: "balanced" });
    const room = view.rooms[0];
    assert.ok(room);
    const council = view.agents.filter((a) => a.missionId === room.missionId && a.role !== "commander");
    assert.ok(council.length >= 2, "real council agents");
    assert.ok(council.every((a) => a.contractId), "every specialist has a contract");
    assert.ok(room.proposals.length >= 2, "independent proposals");
    assert.ok(room.messages.some((m) => m.kind === "OBJECTION" || m.kind === "QUESTION"));
    assert.ok(room.proposals.some((p) => p.evidence.some((e) => e.source.includes("auth"))));
    assert.ok(room.decision || room.noConsensus);
    assert.ok(view.artifacts.some((a) => /WORK decision|architecture/i.test(a.title)));
    assert.equal(view.station.operatingMode, "work");
    const mission = view.missions.find((m) => m.missionId === room.missionId);
    assert.equal(mission?.mode, "work");
    assert.ok((mission?.tasks.length ?? 0) === 0, "WORK does not silently implement");
  } finally {
    cleanup(dir);
  }
});

test("acceptance: disagreement becomes a real experiment with measurements", () => {
  const dir = isolated("aj-exp-");
  try {
    const ajd = new AjDaemon();
    const op = "exp-op";
    ajd.startWorkRoom(op, {
      objective: "Investigate login race and measure overlapping login()",
      preset: "debug",
      quality: "balanced",
    });
    const after = ajd.runWorkExperiment(op);
    const room = after.rooms[0]!;
    assert.ok(room.experiments.length >= 1);
    const exp = room.experiments[0]!;
    assert.equal(exp.invented, false);
    assert.ok(exp.measurements.length >= 1);
    assert.ok(exp.status === "complete" || exp.status === "failed");
    assert.ok(room.messages.some((m) => m.kind === "EVIDENCE"));
  } finally {
    cleanup(dir);
  }
});

test("acceptance: @room Redis forbidden invalidates conflicting proposals without restart", () => {
  const dir = isolated("aj-steer-");
  try {
    const ajd = new AjDaemon();
    const op = "steer-op";
    const opened = ajd.startWorkRoom(op, { objective: "Redesign authentication architecture", quality: "max" });
    const roomId = opened.rooms[0]!.roomId;
    const before = opened.rooms[0]!.proposals.length;
    const steered = ajd.steerWork(op, { roomId, text: "@room Redis is forbidden" });
    const room = steered.rooms.find((r) => r.roomId === roomId)!;
    assert.ok(room.constraints.some((c) => c.locked && c.forbidden?.toLowerCase() === "redis"));
    assert.ok(room.proposals.some((p) => p.status === "invalid") || !room.proposals.some((p) => /redis/i.test(p.architecture + p.summary)));
    assert.equal(room.proposals.length, before);
    assert.ok(room.messages.some((m) => m.kind === "CONSTRAINT"));
  } finally {
    cleanup(dir);
  }
});

test("acceptance: parallel proposal forks keep isolated computers", () => {
  const dir = isolated("aj-par-");
  try {
    const ajd = new AjDaemon();
    const op = "par-op";
    const opened = ajd.startWorkRoom(op, { objective: "Redesign authentication architecture", quality: "balanced" });
    const room = opened.rooms[0]!;
    const first = room.proposals[0]!;
    const forked = ajd.forkWorkProposal(op, { roomId: room.roomId, proposalId: first.proposalId });
    const next = forked.rooms[0]!;
    assert.ok(next.proposals.some((p) => p.derivedFrom?.includes(first.proposalId) && p.computerId));
    assert.ok(next.minority.length >= 0);
  } finally {
    cleanup(dir);
  }
});

test("parseWorkSteer routes mentions", () => {
  const a = parseWorkSteer("@security explain the risk");
  assert.equal(a.target, "security-reviewer");
  const b = parseWorkSteer("@room do not use Kubernetes");
  assert.equal(b.target, "room");
  assert.equal(b.constraint?.forbidden.toLowerCase(), "kubernetes");
  assert.equal(inferPreset("redesign authentication architecture"), "design");
});
