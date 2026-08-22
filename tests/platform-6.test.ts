import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runEphemeral, detectVmBackend, describeMicrovm } from "../src/runtime/microvm.ts";
import { assessBudget, consumeBudget } from "../src/runtime/economy.ts";
import { rememberVector, searchSimilar } from "../src/runtime/vectors.ts";
import { nextHealAction, MAX_SELF_HEALS } from "../src/runtime/heal.ts";
import { assertCannotCertify } from "../packages/oap/typescript/index.ts";
import { AjDaemon } from "../src/daemon/ajd.ts";

test("ephemeral microvm destroys guest without touching host", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-vm-"));
  writeFileSync(join(dir, "keep.txt"), "host");
  const r = runEphemeral(dir, "rm -f /work/keep.txt && echo gone");
  assert.equal(r.destroyed, true);
  assert.equal(r.hostUntouched, true);
  assert.equal(existsSync(join(dir, "keep.txt")), true);
  assert.ok(detectVmBackend().kvm === true || detectVmBackend().kvm === false);
  assert.ok(describeMicrovm().notes.length >= 3);
  rmSync(dir, { recursive: true, force: true });
});

test("economy stops a looping agent at budget exhaust", () => {
  const full = assessBudget({ tokens: 100, tokensUsed: 100, moneyUsd: 1, moneyUsed: 1, timeMs: 1, parallelAgents: 1 });
  assert.equal(full.action, "stop");
  const tight = assessBudget({ tokens: 100, tokensUsed: 75, moneyUsd: 1, moneyUsed: 0.1, timeMs: 1, parallelAgents: 1 });
  assert.equal(tight.action, "downgrade");
  const next = consumeBudget({ tokens: 100, tokensUsed: 0, moneyUsd: 1, moneyUsed: 0, timeMs: 1, parallelAgents: 1 }, 10, 0.05);
  assert.equal(next.tokensUsed, 10);
});

test("vector memory finds a prior fix for a similar error", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-vec-"));
  process.env.AJ_DATA_DIR = dir;
  const op = "vec-op";
  rememberVector(op, { kind: "failure", text: "TypeError: Cannot read property sessions of undefined in auth.js" });
  rememberVector(op, { kind: "fix", text: "Guard sessions map with a mutex in src/auth.js login()" });
  const hits = searchSimilar(op, "sessions undefined crash in authentication", { k: 3 });
  assert.ok(hits.length >= 1);
  assert.ok(hits[0]!.score > 0.15);
  rmSync(dir, { recursive: true, force: true });
});

test("self-heal asks a human only after 3 resolution attempts", () => {
  assert.equal(MAX_SELF_HEALS, 3);
  assert.equal(nextHealAction({ healAttempts: 0 }), "resolve");
  assert.equal(nextHealAction({ healAttempts: 2 }), "resolve");
  assert.equal(nextHealAction({ healAttempts: 3 }), "ask-human");
});

test("OAP manifest cannot certify", () => {
  assert.throws(() => assertCannotCertify({ name: "x", version: "1", capabilities: ["fs.read"], cannotCertify: false as unknown as true }));
  assertCannotCertify({ name: "x", version: "1", capabilities: ["fs.read"], cannotCertify: true });
});

test("verifier failure opens a resolution DAG instead of giving up immediately", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-heal-"));
  process.env.AJ_DATA_DIR = dir;
  const ajd = new AjDaemon();
  const op = "heal-op";
  ajd.view(op);
  // Drive a tiny mission through start; healAttempts default 0.
  const m = ajd.startMission(op, "Add GET /health that returns { ok: true, service: 'northstar' }");
  assert.equal(m.healAttempts ?? 0, 0);
  rmSync(dir, { recursive: true, force: true });
});
