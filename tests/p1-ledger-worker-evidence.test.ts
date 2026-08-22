import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeWorker, runDag } from "../src/runtime/workers.ts";
import { planMission } from "../src/runtime/mission-planner.ts";
import { inspectRepository } from "../src/runtime/repository.ts";
import { readLedger, reconstruct, ledgerPath } from "../src/daemon/store.ts";

test("P1-1: worker lifecycle and ChangeProof are recorded as first-class JSONL ledger events", () => {
  const operatorId = `op-p1-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const dir = mkdtempSync(join(tmpdir(), "aj-p1-repo-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "p1-fixture", type: "module" }));
    writeFileSync(join(dir, "src", "math.js"), "export function add(a, b) { return a - b; }\n");
    writeFileSync(
      join(dir, "tests", "math.test.js"),
      `import test from "node:test";
import assert from "node:assert/strict";
import { add } from "../src/math.js";
test("add", () => assert.equal(add(2, 3), 5));
`,
    );

    const snapshot = inspectRepository(dir);
    const plan = planMission("Fix add() to return sum", snapshot);
    const missionId = `msn-p1-${Date.now()}`;

    const workerResult = executeWorker({
      missionId,
      operatorId,
      agentId: "agt-worker-1",
      role: "backend-engineer",
      objective: "Fix add() to return sum",
      projectPath: dir,
      timeoutMs: 15_000,
    });

    assert.equal(workerResult.ok, true);

    // Read the raw ledger file directly from disk
    const path = ledgerPath(operatorId);
    const rawLedger = readFileSync(path, "utf8");
    const rawLines = rawLedger.trim().split("\n").map((l) => JSON.parse(l));

    // Verify WorkerStarted event
    const startEv = rawLines.find((e) => e.type === "WorkerStarted" && e.agentId === "agt-worker-1");
    assert.ok(startEv, "WorkerStarted event must exist in ledger");
    assert.equal(startEv.missionId, missionId);
    assert.equal(startEv.payload.role, "backend-engineer");

    // Execute runDag for full DAG execution
    runDag({
      plan,
      missionId,
      operatorId,
      objective: "Fix add() to return sum",
      projectPath: dir,
    });

    const events = readLedger(operatorId);
    assert.ok(events.length >= 3, `Expected multiple ledger events, got ${events.length}`);

    // Verify WorkerExecuted / WorkerCompleted
    const execEv = events.find((e) => e.type === "WorkerExecuted" || e.type === "WorkerCompleted");
    assert.ok(execEv, "Worker execution event must exist in ledger");
    assert.equal(execEv.missionId, missionId);

    // Verify ChangeProofWritten
    const proofEv = events.find((e) => e.type === "ChangeProofWritten");
    assert.ok(proofEv, "ChangeProofWritten event must exist in ledger");
    assert.equal(proofEv.missionId, missionId);
    assert.equal(proofEv.payload.verifierResult, "ok");
    assert.equal(proofEv.payload.testsPassed, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("P1-2: corrupt/truncated ledger lines do not poison reconstruction", () => {
  const operatorId = `op-p1-corrupt-${Date.now()}`;
  const dir = mkdtempSync(join(tmpdir(), "aj-p1-corrupt-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "p1-corrupt", type: "module" }));
    writeFileSync(join(dir, "src", "math.js"), "export function add(a, b) { return a + b; }\n");

    const missionId = `msn-p1-corrupt`;
    executeWorker({
      missionId,
      operatorId,
      agentId: "agt-corrupt-1",
      role: "backend-engineer",
      objective: "Check math",
      projectPath: dir,
      timeoutMs: 15_000,
    });

    const path = ledgerPath(operatorId);
    const validCountBefore = readLedger(operatorId).length;
    assert.ok(validCountBefore >= 1);

    // Inject corrupt & truncated lines
    appendFileSync(path, '{"eventId": "corrupt-1", "seq": 999999, "type": "WorkerStarted"\n'); // truncated JSON
    appendFileSync(path, 'NOT_VALID_JSON_GARBAGE\n'); // garbage line
    appendFileSync(path, '{"eventId": "corrupt-2", "seq": 9999999, "type": \n'); // truncated syntax

    // Reading ledger should skip corrupt lines and return valid events only
    const eventsAfter = readLedger(operatorId);
    assert.equal(eventsAfter.length, validCountBefore, "Corrupt lines must be cleanly ignored");

    // Reconstruction must succeed without throwing
    const world = reconstruct(operatorId);
    assert.ok(world);
    assert.equal(world.operatorId, operatorId);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
