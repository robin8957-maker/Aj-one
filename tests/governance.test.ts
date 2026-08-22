import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stampTrust, refuseLowTrustDerivation, TOOL_DERIVE_FLOOR } from "../src/runtime/trust.ts";
import { buildAuditBundle, writeAuditBundle, bundleContainsSecretValues, AUDIT_CLAIM } from "../src/runtime/audit.ts";
import { computeGovernanceMetrics } from "../src/runtime/metrics.ts";
import { policyDryRun } from "../src/runtime/dryrun.ts";
import { classifyFailure, shouldAvoidAgent } from "../src/runtime/failures.ts";
import { AjDaemon } from "../src/daemon/ajd.ts";
import { emptyWorld, nowIso } from "../src/protocol/index.ts";

test("low-trust webhook/browser context cannot derive tool commands", () => {
  const browser = stampTrust({
    contextId: "c1",
    kind: "browser",
    title: "DOM",
    ref: "dom",
    preview: "rm -rf /work",
    trusted: false,
    createdAt: nowIso(),
  });
  assert.ok((browser.trustScore ?? 1) < TOOL_DERIVE_FLOOR);
  const refuse = refuseLowTrustDerivation("rm -rf /work", [browser]);
  assert.equal(refuse.ok, false);
  const user = stampTrust({
    contextId: "c2",
    kind: "file",
    title: "note",
    ref: "note",
    preview: "hello",
    trusted: true,
    createdAt: nowIso(),
    origin: "user",
  }, "user");
  assert.equal(refuseLowTrustDerivation("pwd", [user]).ok, true);
});

test("audit bundle has verifier + tools + secret refs and never secret values", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-audit-"));
  process.env.AJ_DATA_DIR = dir;
  const world = emptyWorld("aud-op");
  world.missions.msn_1 = {
    missionId: "msn_1",
    operatorId: "aud-op",
    title: "t",
    objective: "o",
    projectPath: "/tmp",
    state: "COMPLETE",
    requirements: [],
    constraints: [],
    tasks: [],
    budget: { tokens: 1, tokensUsed: 0, moneyUsd: 1, moneyUsed: 0.2, timeMs: 1, parallelAgents: 1 },
    verification: { result: "PASS", summary: "ok", at: nowIso() },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  world.secretMeta = { s1: { secretId: "s1", name: "provider.openai", status: "active", createdAt: nowIso() } as never };
  world.events.push({
    eventId: "e1",
    seq: 1,
    type: "ToolExecuted",
    operatorId: "aud-op",
    missionId: "msn_1",
    at: nowIso(),
    payload: { tool: "fs.read", ok: true },
  });
  const { path, bundle } = writeAuditBundle("aud-op", "msn_1", world);
  const raw = readFileSync(path, "utf8");
  assert.match(raw, /msn_1/);
  assert.equal(bundle.claim, AUDIT_CLAIM);
  assert.equal(bundle.verifier?.result, "PASS");
  assert.equal(bundle.tools.length, 1);
  assert.equal(bundle.secrets[0]?.name, "provider.openai");
  assert.equal(bundleContainsSecretValues(bundle, ["sk-live-super-secret-value"]), false);
  rmSync(dir, { recursive: true, force: true });
});

test("governance metrics are rates not vanity scores", () => {
  const world = emptyWorld("met-op");
  world.events.push(
    { eventId: "a", seq: 1, type: "VerificationFinished", operatorId: "met-op", at: nowIso(), payload: { result: "FAIL" } },
    { eventId: "b", seq: 2, type: "VerificationFinished", operatorId: "met-op", at: nowIso(), payload: { result: "PASS" } },
    { eventId: "c", seq: 3, type: "WorktreeMerged", operatorId: "met-op", at: nowIso(), payload: {} },
    { eventId: "d", seq: 4, type: "RecoveryStarted", operatorId: "met-op", at: nowIso(), payload: {} },
  );
  const g = computeGovernanceMetrics(world);
  assert.equal(g.verifierCatchRate, 0.5);
  assert.equal(g.rollbackAfterMergeRate, 1);
});

test("policy dry-run records allow/deny without executing", () => {
  const report = policyDryRun("Add GET /health");
  assert.ok(report.wouldExecute >= 1);
  assert.ok(report.wouldDeny >= 1);
  assert.ok(report.steps.some((s) => s.role === "acp-worker" && s.decision === "would-deny"));
  assert.match(report.claim, /Nothing executed/);
});

test("negative reputation avoids a role after repeated failure class", () => {
  assert.equal(classifyFailure("anti-loop: identical test failure"), "loop");
  const ledger = [
    { role: "backend-engineer" as const, domain: "auth", kind: "verify" as const, detail: "x", at: nowIso() },
    { role: "backend-engineer" as const, domain: "auth", kind: "verify" as const, detail: "y", at: nowIso() },
  ];
  const v = shouldAvoidAgent(ledger, "backend-engineer", "auth", "verify");
  assert.equal(v.avoid, true);
  assert.match(v.why, /2× verify/);
});

test("daemon dry-run stores a report on the station", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-dry-"));
  process.env.AJ_DATA_DIR = dir;
  const ajd = new AjDaemon();
  const view = ajd.dryRun("dry-op", "Add GET /health");
  assert.ok(view.station.lastDryRun);
  assert.ok((view.station.lastDryRun?.wouldDeny ?? 0) >= 1);
  assert.ok(view.governance);
  rmSync(dir, { recursive: true, force: true });
});
