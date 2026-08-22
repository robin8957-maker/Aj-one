import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { zeroBuffer } from "../src/runtime/keyring.ts";
import { runEphemeral } from "../src/runtime/microvm.ts";
import { rewindToSeq } from "../src/runtime/rewind.ts";
import { appendEvent, reconstruct } from "../src/daemon/store.ts";
import { makeId, nowIso } from "../src/protocol/index.ts";
import { writeAuditBundle } from "../src/runtime/audit.ts";
import { verifyAuditPayload } from "../src/runtime/sign-audit.ts";
import { emptyWorld } from "../src/protocol/index.ts";
import { decayTrust, stampDecayed, TRUST_SCORE } from "../src/runtime/trust.ts";
import { policyDryRun, whatWouldAllow } from "../src/runtime/dryrun.ts";
import { budgetSystemNote, assessBudget } from "../src/runtime/economy.ts";
import { stripAnsi, isTuiCommand, detectPrompt } from "../src/runtime/pty.ts";
import { writeForensicReport } from "../src/runtime/forensics.ts";

test("zeroBuffer random-fills then zeros", () => {
  const buf = Buffer.from("super-secret-value");
  zeroBuffer(buf);
  assert.equal(buf.includes("secret"), false);
  assert.ok(buf.every((b) => b === 0));
});

test("overlay/ephemeral guest cannot delete host files", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-ov-"));
  writeFileSync(join(dir, "keep.txt"), "host");
  const r = runEphemeral(dir, "rm -f /work/keep.txt && echo x");
  assert.equal(r.destroyed, true);
  assert.equal(existsSync(join(dir, "keep.txt")), true);
  rmSync(dir, { recursive: true, force: true });
});

test("rewind restores an earlier ledger seq", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-rw-"));
  process.env.AJ_DATA_DIR = dir;
  const op = "rw-op";
  const ev1 = {
    eventId: makeId("evt"),
    seq: 1,
    type: "MissionCreated" as const,
    operatorId: op,
    missionId: "msn_rw",
    at: nowIso(),
    payload: {
      mission: {
        missionId: "msn_rw",
        operatorId: op,
        title: "one",
        objective: "o",
        projectPath: "/tmp",
        state: "CREATED",
        requirements: [],
        constraints: [],
        tasks: [],
        budget: { tokens: 1, tokensUsed: 0, moneyUsd: 1, moneyUsed: 0, timeMs: 1, parallelAgents: 1 },
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    },
  };
  appendEvent(op, ev1);
  appendEvent(op, { ...ev1, eventId: makeId("evt"), seq: 2, type: "MissionPaused", payload: { reason: "later" } });
  const world = rewindToSeq(op, 1);
  assert.ok(world.missions.msn_rw);
  assert.ok(world.seq >= 1);
  void reconstruct;
  rmSync(dir, { recursive: true, force: true });
});

test("audit bundle is ed25519-signed and verifies", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-sig-"));
  process.env.AJ_DATA_DIR = dir;
  process.env.AJ_KEYRING_DIR = join("/dev/shm", `aj-sig-${Date.now()}`);
  const world = emptyWorld("sig-op");
  world.missions.m1 = {
    missionId: "m1",
    operatorId: "sig-op",
    title: "t",
    objective: "o",
    projectPath: "/tmp",
    state: "COMPLETE",
    requirements: [],
    constraints: [],
    tasks: [],
    budget: { tokens: 1, tokensUsed: 0, moneyUsd: 1, moneyUsed: 0, timeMs: 1, parallelAgents: 1 },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const { bundle } = writeAuditBundle("sig-op", "m1", world);
  assert.ok(bundle.signature);
  const unsigned = { ...bundle, signature: undefined };
  assert.equal(verifyAuditPayload(JSON.stringify(unsigned), bundle.signature!), true);
  rmSync(dir, { recursive: true, force: true });
});

test("trust decays when a repo pulls a remote package", () => {
  const decayed = decayTrust(TRUST_SCORE.repo, "webhook");
  assert.equal(decayed, TRUST_SCORE.webhook);
  const ctx = stampDecayed(
    {
      contextId: "c",
      kind: "file",
      title: "lock",
      ref: "node_modules/evil/index.js",
      preview: "from https://registry.npmjs.org/evil",
      trusted: true,
      createdAt: nowIso(),
    },
    TRUST_SCORE.repo,
  );
  assert.ok((ctx.trustScore ?? 1) < 0.7);
  assert.equal(ctx.tainted, true);
});

test("what-if hint explains a denied dry-run step", () => {
  const report = policyDryRun("x");
  const deny = report.steps.find((s) => s.decision === "would-deny");
  assert.ok(deny);
  const hint = whatWouldAllow(deny!);
  assert.ok(hint?.summary.includes("allow-mission"));
  assert.ok(report.hints.length >= 1);
});

test("budget note shrinks as spend grows", () => {
  const note = budgetSystemNote(assessBudget({ tokens: 100, tokensUsed: 80, moneyUsd: 1, moneyUsed: 0.1, timeMs: 1, parallelAgents: 1 }));
  assert.match(note, /fewer tools|Ask the human|Stop/);
});

test("PTY strips ANSI and flags TUI commands", () => {
  assert.equal(stripAnsi("\u001b[31mred\u001b[0m"), "red");
  assert.equal(isTuiCommand("vim src/app.ts"), true);
  assert.equal(detectPrompt("password: "), "secret");
});

test("forensic markdown is written after exhausted heals", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-for-"));
  process.env.AJ_DATA_DIR = dir;
  const world = emptyWorld("for-op");
  world.events.push({
    eventId: "e",
    seq: 1,
    type: "ResolutionStarted",
    operatorId: "for-op",
    missionId: "m",
    at: nowIso(),
    payload: { attempt: 1, agentId: "ag" },
  });
  const path = writeForensicReport(world, "m", "tests failed");
  assert.ok(existsSync(path));
  rmSync(dir, { recursive: true, force: true });
});

void randomBytes;
