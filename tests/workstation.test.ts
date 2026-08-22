import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseComposer } from "../src/protocol/station.ts";
import { AjDaemon } from "../src/daemon/ajd.ts";
import { draftUnderstanding, previewPermissions, runTerminal, writeSource } from "../src/runtime/station.ts";
import { DEFAULT_POLICY, emptyStation } from "../src/protocol/station.ts";

function tempProject(dir: string): string {
  const project = join(dir, "northstar");
  cpSync(join(process.cwd(), "fixtures", "northstar"), project, { recursive: true });
  return project;
}

test("composer parses slash commands, flags, and mentions", () => {
  const p = parseComposer("/plan --strict @file/src/auth.js @agent/frontend Fix billing");
  assert.equal(p.command, "plan");
  assert.equal(p.flags.strict, true);
  assert.equal(p.mentions.length, 2);
  assert.equal(p.mentions[0]?.kind, "file");
  assert.match(p.text, /Fix billing/);
});

test("spec draft is real project analysis, not a prompt", () => {
  const spec = draftUnderstanding("Add GET /health that returns ok", join(process.cwd(), "fixtures", "northstar"));
  assert.ok(spec.requirements.length >= 1);
  assert.ok(spec.definitionOfDone.some((d) => /verifier/i.test(d)));
  assert.equal(spec.status, "draft");
});

test("policy refuses writes to .env", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-pol-"));
  try {
    const denied = writeSource(dir, ".env", "SECRET=1", DEFAULT_POLICY);
    assert.equal(denied.ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("terminal refuses a destructive command", () => {
  const session = {
    sessionId: "t1",
    computerId: "c1",
    title: "User",
    cwd: process.cwd(),
    owner: "user" as const,
    running: false,
    output: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const next = runTerminal(session, "rm -rf /", DEFAULT_POLICY);
  assert.equal(next.exitCode, 126);
  assert.match(next.output, /refused/);
});

test("permission preview distinguishes can and cannot", () => {
  const p = previewPermissions(DEFAULT_POLICY);
  assert.ok(p.can.length > 0);
  assert.ok(p.cannot.length > 0);
});

test("chat request produces a spec and does not start a mission until approved", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-ws-"));
  process.env.AJ_DATA_DIR = dir;
  try {
    const project = tempProject(dir);
    const ajd = new AjDaemon();
    const op = "ws-op";
    ajd.view(op);
    const before = ajd.view(op);
    assert.equal(before.missions.length, 0);
    const after = ajd.submitComposer(op, {
      text: "/plan Add GET /health that returns { ok: true, service: 'northstar' }",
    });
    assert.equal(after.missions.length, 0);
    assert.ok(Object.keys(after.station.specs).length >= 1);
    assert.ok(Object.keys(after.station.plans).length >= 1);
    const planId = Object.keys(after.station.plans)[0]!;
    const approved = ajd.approvePlan(op, { planId });
    assert.equal(approved.missions.length, 1);
    void project;
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
  }
});

test("sandbox computer can snapshot and fork", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-pc-"));
  process.env.AJ_DATA_DIR = dir;
  try {
    const ajd = new AjDaemon();
    const op = "pc-op";
    ajd.view(op);
    const created = ajd.provisionComputer(op, "node-fullstack");
    const pcs = Object.values(created.station.computers).filter((c) => c.kind === "sandbox");
    assert.ok(pcs.length >= 1);
    const id = pcs[0]!.computerId;
    const snapped = ajd.snapshotNow(op, id, "before");
    assert.ok(Object.keys(snapped.station.snapshots).length >= 1);
    const forked = ajd.forkNow(op, id);
    assert.ok(Object.values(forked.station.computers).filter((c) => c.parentId === id).length >= 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
  }
});

test("empty station is serializable", () => {
  const s = emptyStation();
  assert.equal(s.autonomy, "assisted");
  JSON.stringify(s);
});
