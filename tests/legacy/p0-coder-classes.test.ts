/**
 * @deprecated OBSOLETE LEGACY TEST SUITE - PHASE 1
 * Reason: Tested legacy regex-based file mutations in coder.ts, which were eliminated in Phase 1
 * in favor of real ModelProvider tool-calling agent loop and unified diff patch engine.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { implementObjective } from "../src/runtime/coder.ts";
import { detectTestPlan, runDetectedTests } from "../src/runtime/test-intel.ts";
import { diagnoseOutput, nextHypothesis, resetHypotheses } from "../src/runtime/diagnose.ts";
import { runEngineeringLoop } from "../src/runtime/engineering-agent.ts";
import { inspectRepository } from "../src/runtime/repository.ts";
import { analyzeProject, typescriptAvailable } from "../src/runtime/lsp.ts";
import { AJ_ERR } from "../src/runtime/errors.ts";

test("P0-1: missing import / ReferenceError is resolved and verified", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p0-ref-"));
  const wt = mkdtempSync(join(tmpdir(), "aj-p0-ref-wt-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "ref-error-fixture", type: "module" }));
    writeFileSync(
      join(dir, "src", "utils.js"),
      `export function formatUser(user) {
  return "user:" + (user?.name || "anonymous");
}
`,
    );
    // Note: formatUser is used below, but NOT imported in service.js
    writeFileSync(
      join(dir, "src", "service.js"),
      `export function renderGreeting(user) {
  return "Hello, " + formatUser(user);
}
`,
    );
    writeFileSync(
      join(dir, "tests", "service.test.js"),
      `import test from "node:test";
import assert from "node:assert/strict";
import { renderGreeting } from "../src/service.js";

test("renderGreeting", () => {
  assert.equal(renderGreeting({ name: "Alice" }), "Hello, user:Alice");
});
`,
    );

    // Baseline: unpatched repo fails with ReferenceError
    const basePlan = detectTestPlan(dir);
    const baseRun = runDetectedTests(dir, basePlan);
    assert.equal(baseRun.ok, false, "Baseline test must fail due to missing import");
    assert.equal(diagnoseOutput(baseRun.output), "runtime");

    // Repair via engineering loop
    const result = runEngineeringLoop({
      missionId: "msn-p0-ref",
      objective: "Fix missing import formatUser in service.js so ReferenceError is resolved",
      projectPath: dir,
      worktreePath: wt,
    });

    assert.equal(result.ok, true, `Engineering loop should succeed: ${result.error?.reason}`);
    const patchedService = readFileSync(join(wt, "src", "service.js"), "utf8");
    assert.match(patchedService, /import\s*\{\s*formatUser\s*\}\s*from\s*["']\.\/utils\.js["']/);

    const testPlan = detectTestPlan(wt);
    const run = runDetectedTests(wt, testPlan);
    assert.equal(run.ok, true, `Patched tests must pass: ${run.output}`);
    assert.equal(result.proof?.verifierResult, "ok");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("P0-2: wrong operator / failing unit test is repaired", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p0-op-"));
  const wt = mkdtempSync(join(tmpdir(), "aj-p0-op-wt-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "wrong-operator-fixture", type: "module" }));
    writeFileSync(
      join(dir, "src", "calc.js"),
      `export function multiply(a, b) {
  return a - b;
}
`,
    );
    writeFileSync(
      join(dir, "tests", "calc.test.js"),
      `import test from "node:test";
import assert from "node:assert/strict";
import { multiply } from "../src/calc.js";

test("multiply", () => {
  assert.equal(multiply(2, 3), 6);
  assert.equal(multiply(4, 5), 20);
});
`,
    );

    // Baseline: unpatched repo fails
    const basePlan = detectTestPlan(dir);
    const baseRun = runDetectedTests(dir, basePlan);
    assert.equal(baseRun.ok, false, "Baseline test must fail due to subtraction instead of multiplication");

    const result = runEngineeringLoop({
      missionId: "msn-p0-op",
      objective: "Fix multiply() to compute product using multiplication operator",
      projectPath: dir,
      worktreePath: wt,
    });

    assert.equal(result.ok, true, `Repair must succeed: ${result.error?.reason}`);
    const patchedCalc = readFileSync(join(wt, "src", "calc.js"), "utf8");
    assert.match(patchedCalc, /return a \* b/);

    const testPlan = detectTestPlan(wt);
    const run = runDetectedTests(wt, testPlan);
    assert.equal(run.ok, true, `Patched tests must pass: ${run.output}`);
    assert.equal(result.proof?.verifierResult, "ok");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("P0-3: broken/missing export used by another file is repaired", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p0-exp-"));
  const wt = mkdtempSync(join(tmpdir(), "aj-p0-exp-wt-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "missing-export-fixture", type: "module" }));
    // Note: calculateTotal is defined without 'export' keyword
    writeFileSync(
      join(dir, "src", "helpers.js"),
      `function calculateTotal(items) {
  return items.reduce((sum, x) => sum + x, 0);
}
`,
    );
    writeFileSync(
      join(dir, "src", "app.js"),
      `import { calculateTotal } from "./helpers.js";

export function checkout(prices) {
  return calculateTotal(prices);
}
`,
    );
    writeFileSync(
      join(dir, "tests", "app.test.js"),
      `import test from "node:test";
import assert from "node:assert/strict";
import { checkout } from "../src/app.js";

test("checkout", () => {
  assert.equal(checkout([10, 20, 30]), 60);
});
`,
    );

    // Baseline: fails because calculateTotal is not exported
    const basePlan = detectTestPlan(dir);
    const baseRun = runDetectedTests(dir, basePlan);
    assert.equal(baseRun.ok, false, "Baseline test must fail because calculateTotal is not exported");

    const result = runEngineeringLoop({
      missionId: "msn-p0-exp",
      objective: "Fix missing export for calculateTotal in helpers.js used by app.js",
      projectPath: dir,
      worktreePath: wt,
    });

    assert.equal(result.ok, true, `Repair must succeed: ${result.error?.reason}`);
    const patchedHelpers = readFileSync(join(wt, "src", "helpers.js"), "utf8");
    assert.match(patchedHelpers, /export\s+function\s+calculateTotal/);

    const testPlan = detectTestPlan(wt);
    const run = runDetectedTests(wt, testPlan);
    assert.equal(run.ok, true, `Cross-file tests must pass: ${run.output}`);
    assert.equal(result.proof?.verifierResult, "ok");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("P0-4: missing regression test is created and executed", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p0-reg-"));
  const wt = mkdtempSync(join(tmpdir(), "aj-p0-reg-wt-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "untested-fixture", type: "module" }));
    writeFileSync(
      join(dir, "src", "user.js"),
      `export function isAdult(age) {
  return age >= 18;
}
`,
    );

    const snap = inspectRepository(dir);
    assert.equal(snap.files.some((f) => f.includes("test")), false, "Repository starts with zero tests");

    const impl = implementObjective({
      objective: "Verify isAdult age threshold validation with a regression test",
      projectPath: dir,
      worktreePath: wt,
      snapshot: snap,
    });

    assert.ok(impl.changes.some((c) => c.path.includes("tests/") && c.path.endsWith(".test.js")), "Regression test file created");
    const testPlan = detectTestPlan(wt);
    assert.equal(testPlan.framework, "node:test");
    assert.ok(testPlan.files.length >= 1);

    const run = runDetectedTests(wt, testPlan);
    assert.equal(run.ran, true, "Synthesized regression test must run");
    assert.equal(run.ok, true, `Synthesized regression test must pass: ${run.output}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("P0-5: repeated identical hypothesis stops at REPAIR_EXHAUSTED", () => {
  const missionId = "msn-p0-exhaust";
  resetHypotheses(missionId);

  const out1 = "AssertionError: Expected 5 to strictly equal 10";
  const hyp1 = nextHypothesis(missionId, out1);
  assert.ok(!("exhausted" in hyp1), "First hypothesis is returned");
  assert.equal(hyp1.klass, "test");

  // Same output and hypothesis repeated for the same mission
  const hyp2 = nextHypothesis(missionId, out1);
  assert.ok("exhausted" in hyp2, "Second identical hypothesis must be exhausted");
  assert.equal(hyp2.code, AJ_ERR.REPAIR_EXHAUSTED);
});

test("P0-6: language service uses TypeScript when available or falls back to parser-only", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p0-ls-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "math.ts"),
      `export function add(a: number, b: number): number { return a + b; }\nexport const PI = 3.14159;\n`,
    );
    const analysis = analyzeProject(dir);
    assert.ok(analysis.files.length >= 1);
    const mathFile = analysis.files.find((f) => f.file.includes("math"));
    assert.ok(mathFile);
    assert.ok(mathFile.exports.includes("add"));
    assert.ok(mathFile.exports.includes("PI"));

    if (typescriptAvailable()) {
      assert.equal(analysis.service, "typescript-language-service");
    } else {
      assert.equal(analysis.service, "parser-only");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
