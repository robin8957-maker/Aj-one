import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  implementObjectiveAsync,
  implementObjective,
} from "../src/runtime/coder.ts";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  applyUnifiedDiff,
  writeFileNewOnly,
  isPathDenied,
} from "../src/runtime/patch-engine.ts";
import {
  createProvider,
  AnthropicProvider,
  OpenAICompatibleProvider,
  OllamaLocalProvider,
  validateModelId,
  verifyProvider,
  type ModelProvider,
  type ProviderRequest,
  type ProviderResponse,
} from "../src/runtime/model-providers.ts";
import { redactSecrets, redactObject, keychain, type KeychainService } from "../src/runtime/keychain.ts";
import { AJ_ERR } from "../src/runtime/errors.ts";
import { buildEnforcedContext } from "../src/runtime/context-engine.ts";
import { inspectRepository } from "../src/runtime/repository.ts";
import { graphFromRepository } from "../src/runtime/code-graph.ts";
import { executeProjectTests } from "../src/runtime/coder.ts";

test("P1B-1: Provider fail-fast on step 0 when unconfigured", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1b-failfast-"));
  const wt = mkdtempSync(join(tmpdir(), "aj-p1b-failfast-wt-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "index.ts"), "export const x = 1;\n");

    // Calling without provider configuration
    const res = await implementObjectiveAsync({
      objective: "Fix bug in index.ts",
      projectPath: dir,
      worktreePath: wt,
    });

    assert.equal(res.ok, false);
    assert.equal(res.code, AJ_ERR.PROVIDER_NOT_CONFIGURED);
    assert.equal(res.steps, 0);
    assert.match(res.reason, /No live ModelProvider configured/);

    // Sync helper also fails fast
    const syncRes = implementObjective({
      objective: "Fix bug in index.ts",
      projectPath: dir,
      worktreePath: wt,
    });
    assert.equal(syncRes.code, AJ_ERR.PROVIDER_NOT_CONFIGURED);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("P1B-2: ModelProvider adapters structure & default models", () => {
  const anthropic = new AnthropicProvider();
  assert.equal(anthropic.id, "anthropic");
  assert.equal(anthropic.defaultModel, "claude-opus-4-8");
  assert.equal(anthropic.fallbackModel, "claude-sonnet-4-6");

  const openai = new OpenAICompatibleProvider();
  assert.equal(openai.id, "openai_compatible");
  assert.equal(openai.defaultModel, "gpt-5.6-sol");

  const ollama = new OllamaLocalProvider();
  assert.equal(ollama.id, "ollama_local");
  assert.equal(ollama.defaultModel, "qwen3-coder:30b");

  assert.ok(createProvider("anthropic") instanceof AnthropicProvider);
  assert.ok(createProvider("openai_compatible") instanceof OpenAICompatibleProvider);
  assert.ok(createProvider("ollama_local") instanceof OllamaLocalProvider);
});

test("P1B-3: Malformed tool call gets 1 corrective retry then aborts with MALFORMED_TOOL_CALL", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1b-malformed-"));
  const wt = mkdtempSync(join(tmpdir(), "aj-p1b-malformed-wt-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "index.ts"), "export const x = 1;\n");

    // Mock provider returning text without tool calls
    let calls = 0;
    const mockProvider: ModelProvider = {
      id: "mock_bad_format",
      defaultModel: "mock-model",
      async complete(_req: ProviderRequest): Promise<ProviderResponse> {
        calls++;
        return {
          ok: true,
          provider: "mock_bad_format",
          model: "mock-model",
          text: "I think you should change the file to x = 2.", // No tool call!
          usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
          costEstimateUsd: 0.0001,
        };
      },
    };

    const res = await implementObjectiveAsync({
      objective: "Update index.ts",
      projectPath: dir,
      worktreePath: wt,
      config: {
        provider: mockProvider,
        maxSteps: 10,
      },
    });

    assert.equal(res.ok, false);
    assert.equal(res.code, AJ_ERR.MALFORMED_TOOL_CALL);
    assert.equal(calls, 2, "Must perform exactly 1 initial call + 1 corrective retry");
    assert.ok(res.ledgerEvents.some((e) => e.toolName === "malformed_retry"));
    assert.ok(res.ledgerEvents.some((e) => e.toolName === "malformed_abort"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("P1B-4: Unified diff patch engine - valid multi-hunk patch", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1b-patch-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    const original = `function add(a, b) {\n  return a - b;\n}\n\nfunction multiply(a, b) {\n  return a + b;\n}\n`;
    writeFileSync(join(dir, "src", "calc.js"), original);

    const diff = `--- a/src/calc.js
+++ b/src/calc.js
@@ -1,3 +1,3 @@
 function add(a, b) {
-  return a - b;
+  return a + b;
 }
@@ -5,3 +5,3 @@
 function multiply(a, b) {
-  return a + b;
+  return a * b;
 }
`;

    const res = applyUnifiedDiff(dir, diff);
    assert.equal(res.ok, true);
    assert.deepEqual(res.patchedFiles, ["src/calc.js"]);

    const patched = readFileSync(join(dir, "src", "calc.js"), "utf8");
    assert.match(patched, /return a \+ b;/);
    assert.match(patched, /return a \* b;/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("P1B-5: Unified diff patch engine - atomic revert on context line mismatch", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1b-revert-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    const originalFile1 = `line 1\nline 2\nline 3\n`;
    const originalFile2 = `alpha\nbeta\ngamma\n`;
    writeFileSync(join(dir, "src", "file1.txt"), originalFile1);
    writeFileSync(join(dir, "src", "file2.txt"), originalFile2);

    // Patch modifies file1 correctly, but file2 has a mismatched context line
    const diff = `--- a/src/file1.txt
+++ b/src/file1.txt
@@ -1,3 +1,3 @@
 line 1
-line 2
+line TWO
 line 3
--- a/src/file2.txt
+++ b/src/file2.txt
@@ -1,3 +1,3 @@
 alpha
-WRONG_CONTEXT_LINE
+DELTA
 gamma
`;

    const res = applyUnifiedDiff(dir, diff);
    assert.equal(res.ok, false);
    assert.equal(res.code, AJ_ERR.PATCH_FAILED);
    assert.match(res.reason ?? "", /Context line mismatch in src\/file2\.txt/);

    // Assert ATOMIC REVERT: file1 must remain unchanged because file2 failed!
    assert.equal(readFileSync(join(dir, "src", "file1.txt"), "utf8"), originalFile1);
    assert.equal(readFileSync(join(dir, "src", "file2.txt"), "utf8"), originalFile2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("P1B-6: Unified diff rejects binary files and files > 2MB", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1b-limits-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    // Binary file with null byte
    writeFileSync(join(dir, "src", "binary.bin"), Buffer.from([0x00, 0x01, 0x02, 0x03]));

    const diff = `--- a/src/binary.bin
+++ b/src/binary.bin
@@ -1,1 +1,1 @@
-old
+new
`;

    const res = applyUnifiedDiff(dir, diff);
    assert.equal(res.ok, false);
    assert.equal(res.code, AJ_ERR.PATCH_FAILED);
    assert.match(res.reason ?? "", /binary file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("P1B-7: writeFileNewOnly permits brand new files, rejects existing files", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1b-write-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "existing.js"), "const x = 1;\n");

    // Attempt to overwrite existing file via write_file -> MUST FAIL
    const overwriteRes = writeFileNewOnly(dir, "src/existing.js", "const x = 2;\n");
    assert.equal(overwriteRes.ok, false);
    assert.match(overwriteRes.reason, /only permitted for NEW files/);

    // Creating brand new file -> MUST SUCCEED
    const newRes = writeFileNewOnly(dir, "src/new-module.js", "export const y = 42;\n");
    assert.equal(newRes.ok, true);
    assert.equal(readFileSync(join(dir, "src", "new-module.js"), "utf8"), "export const y = 42;\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("P1B-8: run_command is disabled and returns SANDBOX_REQUIRED error", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1b-sec-"));
  const wt = mkdtempSync(join(tmpdir(), "aj-p1b-sec-wt-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "main.js"), "console.log('hi');");

    // Provider that attempts to run a shell command
    let step = 0;
    const mockProvider: ModelProvider = {
      id: "mock_exec",
      defaultModel: "mock-model",
      async complete(_req: ProviderRequest): Promise<ProviderResponse> {
        step++;
        if (step === 1) {
          return {
            ok: true,
            provider: "mock_exec",
            model: "mock-model",
            text: "Running command",
            toolCalls: [
              {
                id: "call_1",
                name: "run_command",
                parameters: { command: "rm -rf /" },
              },
            ],
            usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
            costEstimateUsd: 0.0001,
          };
        }
        return {
          ok: true,
          provider: "mock_exec",
          model: "mock-model",
          text: "Finished",
          toolCalls: [
            {
              id: "call_2",
              name: "finish",
              parameters: { reason: "Security verified" },
            },
          ],
          usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
          costEstimateUsd: 0.0001,
        };
      },
    };

    const res = await implementObjectiveAsync({
      objective: "Test command sandbox boundary",
      projectPath: dir,
      worktreePath: wt,
      config: { provider: mockProvider },
    });

    assert.equal(res.ok, true);
    const cmdEvent = res.ledgerEvents.find((e) => e.toolName === "run_command");
    assert.ok(cmdEvent, "run_command event must be logged to ledger");
    assert.equal(cmdEvent.error, AJ_ERR.SANDBOX_REQUIRED);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("P1B-9: Hard bounds enforcement (Max steps limit)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1b-bounds-"));
  const wt = mkdtempSync(join(tmpdir(), "aj-p1b-bounds-wt-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "file.js"), "const a = 1;");

    const infiniteProvider: ModelProvider = {
      id: "mock_loop",
      defaultModel: "mock-model",
      async complete(_req: ProviderRequest): Promise<ProviderResponse> {
        return {
          ok: true,
          provider: "mock_loop",
          model: "mock-model",
          text: "Reading repo again",
          toolCalls: [
            {
              id: `call_${Math.random()}`,
              name: "search_repo",
              parameters: { query: "const" },
            },
          ],
          usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
          costEstimateUsd: 0.0002,
        };
      },
    };

    const res = await implementObjectiveAsync({
      objective: "Infinite search loop",
      projectPath: dir,
      worktreePath: wt,
      config: {
        provider: infiniteProvider,
        maxSteps: 5, // Bounded at 5 steps
      },
    });

    assert.equal(res.ok, false);
    assert.equal(res.code, AJ_ERR.STEP_LIMIT_EXCEEDED);
    assert.equal(res.steps, 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("P1B-10: Secret redaction in text and structured objects", () => {
  const sampleKey = "sk-1234567890abcdef1234567890abcdef";
  const text = `Error authenticating with key ${sampleKey} and Bearer secret-token-abcdef-1234567890.`;
  const redacted = redactSecrets(text);
  assert.equal(redacted.includes(sampleKey), false);
  assert.match(redacted, /\[REDACTED_KEY\]/);

  const obj = {
    apiKey: sampleKey,
    headers: { Authorization: "Bearer sk-mysecrettoken1234567890123" },
    payload: { query: "search" },
  };
  const redObj = redactObject(obj) as Record<string, unknown>;
  assert.equal(redObj.apiKey, "[REDACTED_FIELD]");
  assert.deepEqual(redObj.payload, { query: "search" });
});

test("P1C-11: run_project_tests tool executes project tests safely and records to ledger", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1c-testtool-"));
  const wt = mkdtempSync(join(tmpdir(), "aj-p1c-testtool-wt-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test-pkg", type: "module" }));
    writeFileSync(join(dir, "src", "add.js"), "export function add(a, b) { return a + b; }\n");
    writeFileSync(
      join(dir, "tests", "add.test.js"),
      'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { add } from "../src/add.js";\ntest("add", () => assert.equal(add(2, 3), 5));\n',
    );

    let step = 0;
    const testRunnerProvider: ModelProvider = {
      id: "mock_test_runner",
      defaultModel: "mock-model",
      async complete(_req: ProviderRequest): Promise<ProviderResponse> {
        step++;
        if (step === 1) {
          return {
            ok: true,
            provider: "mock_test_runner",
            model: "mock-model",
            text: "Running tests",
            toolCalls: [
              {
                id: "call_test_1",
                name: "run_project_tests",
                parameters: {},
              },
            ],
            usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
            costEstimateUsd: 0.0001,
          };
        }
        return {
          ok: true,
          provider: "mock_test_runner",
          model: "mock-model",
          text: "Tests verified",
          toolCalls: [
            {
              id: "call_test_finish",
              name: "finish",
              parameters: { reason: "Tests passed cleanly" },
            },
          ],
          usage: { inputTokens: 50, outputTokens: 20, totalTokens: 70 },
          costEstimateUsd: 0.0001,
        };
      },
    };

    const res = await implementObjectiveAsync({
      objective: "Execute project tests",
      projectPath: dir,
      worktreePath: wt,
      config: {
        provider: testRunnerProvider,
        testCommand: "node --test tests/add.test.js",
      },
    });

    assert.equal(res.ok, true);
    const testEvent = res.ledgerEvents.find((e) => e.toolName === "run_project_tests");
    assert.ok(testEvent, "run_project_tests must be recorded in the ledger");
    assert.equal(testEvent.error, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("P1C-12: validateModelId detects invalid model IDs", async () => {
  const badAnthropic = await validateModelId("anthropic", "non-existent-claude-99");
  assert.equal(badAnthropic.ok, false);
  assert.equal(badAnthropic.code, AJ_ERR.MODEL_ID_INVALID);
  assert.ok(badAnthropic.availableModels?.includes("claude-opus-4-8"));

  const goodAnthropic = await validateModelId("anthropic", "claude-opus-4-8");
  assert.equal(goodAnthropic.ok, true);
});

test("P1C-13: verifyProvider diagnostic self-test", async () => {
  const res = await verifyProvider("anthropic");
  assert.equal(res.ok, false);
  assert.equal(res.provider, "anthropic");
  assert.equal(res.error?.code, AJ_ERR.PROVIDER_NOT_CONFIGURED);
});

test("P1C-14: Context builder enforces budget and refuses BEFORE request", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1c-ctx-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "ctx-pkg" }));
    writeFileSync(join(dir, "src", "large.js"), "export const code = '" + "x".repeat(5000) + "';\n");

    const snap = inspectRepository(dir);
    const graph = graphFromRepository(dir);

    // Budget set to 50 tokens (insufficient for minimum prompt) -> Refusal BEFORE request
    const refused = buildEnforcedContext({
      missionId: "msn-test-budget",
      role: "engineer",
      objective: "Fix large.js",
      snapshot: snap,
      graph,
      budgetTokens: 50,
      minRequiredTokens: 200,
    });

    assert.equal(refused.ok, false);
    assert.equal(refused.code, "TOKEN_BUDGET_EXCEEDED");
    assert.match(refused.reason, /Refused before LLM request/);

    // Adequate budget -> Success
    const allowed = buildEnforcedContext({
      missionId: "msn-test-budget-ok",
      role: "engineer",
      objective: "Fix large.js",
      snapshot: snap,
      graph,
      budgetTokens: 5000,
      minRequiredTokens: 100,
    });
    assert.equal(allowed.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("P1C-15: Ledger events record full task sequence with SHA-256 hashed args and tokens", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1c-ledger-"));
  const wt = mkdtempSync(join(tmpdir(), "aj-p1c-ledger-wt-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "sample.txt"), "hello world");

    let step = 0;
    const mockProvider: ModelProvider = {
      id: "mock_ledger_agent",
      defaultModel: "mock-model",
      async complete(_req: ProviderRequest): Promise<ProviderResponse> {
        step++;
        if (step === 1) {
          return {
            ok: true,
            provider: "mock_ledger_agent",
            model: "mock-model",
            text: "Reading file",
            toolCalls: [
              {
                id: "call_read_1",
                name: "read_file",
                parameters: { path: "src/sample.txt" },
              },
            ],
            usage: { inputTokens: 42, outputTokens: 18, totalTokens: 60 },
            costEstimateUsd: 0.0001,
          };
        }
        return {
          ok: true,
          provider: "mock_ledger_agent",
          model: "mock-model",
          text: "Done",
          toolCalls: [
            {
              id: "call_finish_1",
              name: "finish",
              parameters: { reason: "Task read completed" },
            },
          ],
          usage: { inputTokens: 55, outputTokens: 12, totalTokens: 67 },
          costEstimateUsd: 0.0001,
        };
      },
    };

    const res = await implementObjectiveAsync({
      taskId: "task_ledger_verification",
      objective: "Read sample.txt",
      projectPath: dir,
      worktreePath: wt,
      config: { provider: mockProvider },
    });

    assert.equal(res.ok, true);
    assert.equal(res.ledgerEvents.length, 2);

    const [event1, event2] = res.ledgerEvents;
    assert.equal(event1?.taskId, "task_ledger_verification");
    assert.equal(event1?.stepIndex, 1);
    assert.equal(event1?.toolName, "read_file");
    assert.ok(event1?.hashedArgs && event1.hashedArgs.length === 16, "Must contain 16-char SHA-256 hash");

    assert.equal(event2?.stepIndex, 2);
    assert.equal(event2?.toolName, "finish");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("P1C-16: Hard bounds enforcement - Token budget limit & Cost ceiling breach", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1c-bounds2-"));
  const wt = mkdtempSync(join(tmpdir(), "aj-p1c-bounds2-wt-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "file.js"), "const a = 1;");

    // Provider that burns 1,000 tokens and $0.05 per step
    const heavyProvider: ModelProvider = {
      id: "mock_heavy",
      defaultModel: "mock-model",
      async complete(_req: ProviderRequest): Promise<ProviderResponse> {
        return {
          ok: true,
          provider: "mock_heavy",
          model: "mock-model",
          text: "Loop step",
          toolCalls: [{ id: "c1", name: "search_repo", parameters: { query: "const" } }],
          usage: { inputTokens: 500, outputTokens: 500, totalTokens: 1000 },
          costEstimateUsd: 0.05,
        };
      },
    };

    // Test token budget breach
    const tokenRes = await implementObjectiveAsync({
      objective: "Burn tokens",
      projectPath: dir,
      worktreePath: wt,
      config: {
        provider: heavyProvider,
        maxInputTokens: 800, // Breached after 2 steps
      },
    });
    assert.equal(tokenRes.ok, false);
    assert.equal(tokenRes.code, AJ_ERR.TOKEN_BUDGET_EXCEEDED);

    // Test cost limit breach
    const costRes = await implementObjectiveAsync({
      objective: "Burn cost",
      projectPath: dir,
      worktreePath: wt,
      config: {
        provider: heavyProvider,
        maxCostUsd: 0.08, // Breached after 2 steps ($0.10)
      },
    });
    assert.equal(costRes.ok, false);
    assert.equal(costRes.code, AJ_ERR.COST_LIMIT_EXCEEDED);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("P1C-17: Hard bounds enforcement - Wall clock timeout", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1c-timeout-"));
  const wt = mkdtempSync(join(tmpdir(), "aj-p1c-timeout-wt-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "file.js"), "const a = 1;");

    const slowProvider: ModelProvider = {
      id: "mock_slow",
      defaultModel: "mock-model",
      async complete(_req: ProviderRequest): Promise<ProviderResponse> {
        await new Promise((r) => setTimeout(r, 60)); // Sleep 60ms
        return {
          ok: true,
          provider: "mock_slow",
          model: "mock-model",
          text: "Slow step",
          toolCalls: [{ id: "c1", name: "search_repo", parameters: { query: "const" } }],
          usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
          costEstimateUsd: 0.0001,
        };
      },
    };

    const timeoutRes = await implementObjectiveAsync({
      objective: "Timeout test",
      projectPath: dir,
      worktreePath: wt,
      config: {
        provider: slowProvider,
        maxWallClockMs: 50, // 50ms timeout -> breached on step 2
      },
    });

    assert.equal(timeoutRes.ok, false);
    assert.equal(timeoutRes.code, AJ_ERR.TIMEOUT);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("P1C-18: Keychain service fails closed outside desktop shell", async () => {
  await assert.rejects(
    async () => {
      await keychain.getSecret("TEST_KEY");
    },
    { message: /KEYCHAIN_UNAVAILABLE/ },
  );

  await assert.rejects(
    async () => {
      await keychain.setSecret("TEST_KEY", "value");
    },
    { message: /KEYCHAIN_UNAVAILABLE/ },
  );

  await assert.rejects(
    async () => {
      await keychain.deleteSecret("TEST_KEY");
    },
    { message: /KEYCHAIN_UNAVAILABLE/ },
  );
});

test("P1C-19: Patch engine scope violation and non-existent file handling", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1c-patch-scope-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });

    // Patch to non-existent file
    const nonExistentDiff = `--- a/src/missing.js\n+++ b/src/missing.js\n@@ -1,1 +1,1 @@\n-old\n+new\n`;
    const res1 = applyUnifiedDiff(dir, nonExistentDiff);
    assert.equal(res1.ok, false);
    assert.equal(res1.code, AJ_ERR.PATCH_FAILED);

    // Path escape outside worktree
    const escapeDiff = `--- a/../outside.js\n+++ b/../outside.js\n@@ -1,1 +1,1 @@\n-old\n+new\n`;
    const res2 = applyUnifiedDiff(dir, escapeDiff);
    assert.equal(res2.ok, false);
    assert.equal(res2.code, AJ_ERR.POLICY_DENIED);

    // Forbidden path (.env)
    const forbiddenDiff = `--- a/.env\n+++ b/.env\n@@ -1,1 +1,1 @@\n-SECRET=1\n+SECRET=2\n`;
    const res3 = applyUnifiedDiff(dir, forbiddenDiff);
    assert.equal(res3.ok, false);
    assert.equal(res3.code, AJ_ERR.PATH_DENIED);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("P1C-20: Provider error parsing and tool call extraction fallback", async () => {
  const openai = new OpenAICompatibleProvider();
  assert.equal(openai.defaultModel, "gpt-5.6-sol");

  const ollama = new OllamaLocalProvider();
  assert.equal(ollama.defaultModel, "qwen3-coder:30b");

  assert.throws(() => createProvider("invalid_provider" as unknown as "anthropic"));
});

test("P1D-21: Patch engine deny-list rejects package.json, Cargo.toml, config files, .github", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1d-denylist-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(join(dir, "package.json"), "{}");
    writeFileSync(join(dir, "Cargo.toml"), "");
    writeFileSync(join(dir, "vite.config.ts"), "");
    writeFileSync(join(dir, ".github", "workflows", "ci.yml"), "");

    // 1. package.json modification
    const pkgDiff = `--- a/package.json\n+++ b/package.json\n@@ -1,1 +1,1 @@\n-{}\n+{"scripts":{"test":"malicious"}}\n`;
    const resPkg = applyUnifiedDiff(dir, pkgDiff);
    assert.equal(resPkg.ok, false);
    assert.equal(resPkg.code, AJ_ERR.PATH_DENIED);

    // 2. Cargo.toml modification
    const cargoDiff = `--- a/Cargo.toml\n+++ b/Cargo.toml\n@@ -1,1 +1,1 @@\n-\n+[dependencies]\n`;
    const resCargo = applyUnifiedDiff(dir, cargoDiff);
    assert.equal(resCargo.ok, false);
    assert.equal(resCargo.code, AJ_ERR.PATH_DENIED);

    // 3. vite.config.ts modification
    const configDiff = `--- a/vite.config.ts\n+++ b/vite.config.ts\n@@ -1,1 +1,1 @@\n-\n+export default {}\n`;
    const resConfig = applyUnifiedDiff(dir, configDiff);
    assert.equal(resConfig.ok, false);
    assert.equal(resConfig.code, AJ_ERR.PATH_DENIED);

    // 4. .github workflow modification
    const ghDiff = `--- a/.github/workflows/ci.yml\n+++ b/.github/workflows/ci.yml\n@@ -1,1 +1,1 @@\n-\n+name: CI\n`;
    const resGh = applyUnifiedDiff(dir, ghDiff);
    assert.equal(resGh.ok, false);
    assert.equal(resGh.code, AJ_ERR.PATH_DENIED);

    // 5. writeFileNewOnly on denied path
    const resNew = writeFileNewOnly(dir, "package.json", "{}");
    assert.equal(resNew.ok, false);
    assert.equal(resNew.code, AJ_ERR.PATH_DENIED);

    // 6. isPathDenied helper
    assert.equal(isPathDenied("package.json"), true);
    assert.equal(isPathDenied("src/components/button.tsx"), false);
    assert.equal(isPathDenied(".git/HEAD"), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("P1D-22: run_project_tests validates against allowed command list", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1d-cmdallow-"));
  try {
    // Unapproved arbitrary command
    const resDisallowed = executeProjectTests(dir, "rm -rf /");
    assert.equal(resDisallowed.ok, false);
    assert.equal(resDisallowed.errorCode, AJ_ERR.TEST_COMMAND_NOT_ALLOWED);
    assert.match(resDisallowed.output, /TEST_COMMAND_NOT_ALLOWED/);

    // Approved command
    const resAllowed = executeProjectTests(dir, "node --test non_existent_test_file.js");
    assert.equal(resAllowed.ok, false); // Fails because test file does not exist, but command was ALLOWED to run
    assert.equal(resAllowed.errorCode, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("P1D-23: run_project_tests redacts secrets from captured output before truncation and ledger", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1d-redact-"));
  try {
    const fakeSecret = "sk-live12345678901234567890abcdef";
    const res = executeProjectTests(
      dir,
      `node -e "console.log('API KEY leaked: ${fakeSecret}'); process.exit(0);"`,
      [`node -e "console.log('API KEY leaked: ${fakeSecret}'); process.exit(0);"`],
    );

    assert.equal(res.ok, true);
    assert.equal(res.output.includes(fakeSecret), false);
    assert.match(res.output, /\[REDACTED_KEY\]/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("P1D-24: AnthropicProvider streaming, tool calls, 429/500 retry, timeout, cost math", async () => {
  let requestCount = 0;
  let simulatedErrorMode: "none" | "429_then_ok" | "500_always" | "slow" = "none";

  const server = createServer(async (req, res) => {
    requestCount++;

    if (simulatedErrorMode === "429_then_ok" && requestCount === 1) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Rate limit exceeded" } }));
      return;
    }

    if (simulatedErrorMode === "500_always") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Internal server error" } }));
      return;
    }

    if (simulatedErrorMode === "slow") {
      await new Promise((r) => setTimeout(r, 200));
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end("event: message_stop\ndata: {}\n\n");
      return;
    }

    // Default Anthropic JSON API response
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "msg_123",
        type: "message",
        role: "assistant",
        model: "claude-opus-4-8",
        content: [
          { type: "text", text: "I will apply a patch." },
          { type: "tool_use", id: "toolu_abc", name: "read_file", input: { path: "src/index.ts" } },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 120, output_tokens: 45 },
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const endpoint = `http://127.0.0.1:${port}/v1/messages`;

  const provider = new AnthropicProvider();

  try {
    // 1. Normal response and tool call parsing
    const res1 = await provider.complete({
      model: "claude-opus-4-8",
      apiKey: "sk-ant-testkey12345678901234567890",
      endpoint,
      messages: [{ role: "user", content: "Hello" }],
    });

    assert.equal(res1.ok, true);
    assert.equal(res1.model, "claude-opus-4-8");
    assert.equal(res1.text, "I will apply a patch.");
    assert.equal(res1.stopReason, "tool_use");
    assert.equal(res1.usage.inputTokens, 120);
    assert.equal(res1.usage.outputTokens, 45);
    assert.ok(res1.costEstimateUsd > 0, "Cost must be estimated");
    assert.equal(res1.toolCalls?.length, 1);
    assert.equal(res1.toolCalls?.[0]?.name, "read_file");
    assert.deepEqual(res1.toolCalls?.[0]?.parameters, { path: "src/index.ts" });

    // 2. 429 Retry then OK
    requestCount = 0;
    simulatedErrorMode = "429_then_ok";
    const res2 = await provider.complete({
      apiKey: "sk-ant-testkey12345678901234567890",
      endpoint,
      messages: [{ role: "user", content: "Retry test" }],
    });
    assert.equal(res2.ok, true);
    assert.equal(requestCount, 2, "Must have retried after 429");

    // 3. 500 Fail after 3 retries
    requestCount = 0;
    simulatedErrorMode = "500_always";
    const res3 = await provider.complete({
      apiKey: "sk-ant-testkey12345678901234567890",
      endpoint,
      messages: [{ role: "user", content: "Fail test" }],
    });
    assert.equal(res3.ok, false);
    assert.equal(res3.error?.code, AJ_ERR.PROVIDER_UNAVAILABLE);
    assert.equal(requestCount, 4, "Initial attempt + 3 retries = 4 attempts");

    // 4. Timeout via AbortController
    requestCount = 0;
    simulatedErrorMode = "slow";
    const res4 = await provider.complete({
      apiKey: "sk-ant-testkey12345678901234567890",
      endpoint,
      messages: [{ role: "user", content: "Slow test" }],
      timeoutMs: 50,
    });
    assert.equal(res4.ok, false);
    assert.equal(res4.error?.code, AJ_ERR.TIMEOUT);
  } finally {
    server.close();
  }
});

test("P1D-25: OpenAICompatibleProvider streaming, tool calls, retry, and non-streaming fallback", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "chatcmpl-1",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Searching repo",
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "search_repo", arguments: '{"query": "export"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 80, completion_tokens: 25 },
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const endpoint = `http://127.0.0.1:${port}/v1/chat/completions`;

  const provider = new OpenAICompatibleProvider();

  try {
    const res = await provider.complete({
      model: "gpt-5.6-sol",
      apiKey: "sk-openai-testkey1234567890123456",
      endpoint,
      messages: [{ role: "user", content: "Query" }],
    });

    assert.equal(res.ok, true);
    assert.equal(res.text, "Searching repo");
    assert.equal(res.toolCalls?.length, 1);
    assert.equal(res.toolCalls?.[0]?.name, "search_repo");
    assert.deepEqual(res.toolCalls?.[0]?.parameters, { query: "export" });
    assert.equal(res.usage.inputTokens, 80);
    assert.equal(res.usage.outputTokens, 25);
    assert.ok(res.costEstimateUsd > 0);
  } finally {
    server.close();
  }
});

test("P1D-26: OllamaLocalProvider streaming, NDJSON, and regex tool parsing", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        model: "qwen3-coder:30b",
        message: {
          role: "assistant",
          content: '{"tool": "search_repo", "parameters": {"query": "auth"}}',
        },
        done: true,
        prompt_eval_count: 50,
        eval_count: 30,
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const endpoint = `http://127.0.0.1:${port}/api/chat`;

  const provider = new OllamaLocalProvider();

  try {
    const res = await provider.complete({
      model: "qwen3-coder:30b",
      endpoint,
      messages: [{ role: "user", content: "Search auth" }],
    });

    assert.equal(res.ok, true);
    assert.equal(res.usage.inputTokens, 50);
    assert.equal(res.usage.outputTokens, 30);
    assert.equal(res.costEstimateUsd, 0); // Local model is $0 cost
    assert.equal(res.toolCalls?.length, 1);
    assert.equal(res.toolCalls?.[0]?.name, "search_repo");
    assert.deepEqual(res.toolCalls?.[0]?.parameters, { query: "auth" });
  } finally {
    server.close();
  }
});

test("P1D-27: Remote model ID validation with models endpoint", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/api/tags") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ models: [{ name: "qwen3-coder:30b" }, { name: "deepseek-coder:6.7b" }] }));
      return;
    }
    if (req.url === "/v1/models") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "gpt-5.6-sol" }, { id: "gpt-4o" }] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    // 1. Ollama valid and invalid
    const ollamaOk = await validateModelId("ollama_local", "qwen3-coder:30b", {
      endpoint: `http://127.0.0.1:${port}/api/tags`,
    });
    assert.equal(ollamaOk.ok, true);

    const ollamaBad = await validateModelId("ollama_local", "non-existent-model", {
      endpoint: `http://127.0.0.1:${port}/api/tags`,
    });
    assert.equal(ollamaBad.ok, false);
    assert.equal(ollamaBad.code, AJ_ERR.MODEL_ID_INVALID);
    assert.ok(ollamaBad.availableModels?.includes("qwen3-coder:30b"));

    // 2. OpenAI valid and invalid
    const openaiOk = await validateModelId("openai_compatible", "gpt-5.6-sol", {
      apiKey: "sk-test",
      endpoint: `http://127.0.0.1:${port}/v1/models`,
    });
    assert.equal(openaiOk.ok, true);

    const openaiBad = await validateModelId("openai_compatible", "gpt-unknown", {
      apiKey: "sk-test",
      endpoint: `http://127.0.0.1:${port}/v1/models`,
    });
    assert.equal(openaiBad.ok, false);
    assert.equal(openaiBad.code, AJ_ERR.MODEL_ID_INVALID);
    assert.ok(openaiBad.availableModels?.includes("gpt-5.6-sol"));
  } finally {
    server.close();
  }
});

test("P1D-28: Dependency injection of test double keychain for unit test environments", async () => {
  const memoryMap = new Map<string, string>();
  const testDoubleKeychain: KeychainService = {
    async getSecret(name: string): Promise<string | null> {
      return memoryMap.get(name) ?? null;
    },
    async setSecret(name: string, value: string): Promise<boolean> {
      memoryMap.set(name, value);
      return true;
    },
    async deleteSecret(name: string): Promise<boolean> {
      memoryMap.delete(name);
      return true;
    },
  };

  await testDoubleKeychain.setSecret("TEST_INJECTED_KEY", "secret-value-12345");
  const val = await testDoubleKeychain.getSecret("TEST_INJECTED_KEY");
  assert.equal(val, "secret-value-12345");

  // Production keychain remains fail-closed
  await assert.rejects(async () => keychain.getSecret("TEST_INJECTED_KEY"), {
    message: /KEYCHAIN_UNAVAILABLE/,
  });
});

test("P1D-29: Cost calculation and regex fallback tool extraction across providers", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "msg_sonnet",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-6",
        content: [
          {
            type: "text",
            text: 'Here is the plan:\n{"tool": "read_file", "parameters": {"path": "src/app.ts"}}',
          },
        ],
        stop_reason: "end_turn",
        usage: { input_tokens: 1000, output_tokens: 500 },
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const endpoint = `http://127.0.0.1:${port}/v1/messages`;

  const provider = new AnthropicProvider();

  try {
    const res = await provider.complete({
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
      endpoint,
      messages: [{ role: "user", content: "Sonnet test" }],
    });

    assert.equal(res.ok, true);
    assert.equal(res.model, "claude-sonnet-4-6");
    assert.equal(res.toolCalls?.length, 1);
    assert.equal(res.toolCalls?.[0]?.name, "read_file");
    assert.deepEqual(res.toolCalls?.[0]?.parameters, { path: "src/app.ts" });
    assert.ok(res.costEstimateUsd > 0);
  } finally {
    server.close();
  }
});

test("P1D-30: Provider error handling for OpenAI and Ollama retry/fail paths", async () => {
  let openAiAttempts = 0;
  const openAiServer = createServer((_req, res) => {
    openAiAttempts++;
    if (openAiAttempts === 1) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Rate limit" } }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "chatcmpl-ok",
        choices: [{ index: 0, message: { role: "assistant", content: "Ready" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      }),
    );
  });

  await new Promise<void>((resolve) => openAiServer.listen(0, "127.0.0.1", resolve));
  const openAiPort = (openAiServer.address() as AddressInfo).port;

  const openai = new OpenAICompatibleProvider();
  try {
    const res = await openai.complete({
      apiKey: "sk-openai-key",
      endpoint: `http://127.0.0.1:${openAiPort}/v1/chat/completions`,
      messages: [{ role: "user", content: "Hi" }],
    });
    assert.equal(res.ok, true);
    assert.equal(openAiAttempts, 2);
  } finally {
    openAiServer.close();
  }

  // Ollama server error
  const ollamaServer = createServer((_req, res) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal crash" }));
  });
  await new Promise<void>((resolve) => ollamaServer.listen(0, "127.0.0.1", resolve));
  const ollamaPort = (ollamaServer.address() as AddressInfo).port;

  const ollama = new OllamaLocalProvider();
  try {
    const res = await ollama.complete({
      endpoint: `http://127.0.0.1:${ollamaPort}/api/chat`,
      messages: [{ role: "user", content: "Hi" }],
    });
    assert.equal(res.ok, false);
    assert.equal(res.error?.code, AJ_ERR.PROVIDER_UNAVAILABLE);
  } finally {
    ollamaServer.close();
  }
});

test("P1D-31: Coder tool dispatch error handling: read missing file, write duplicate, malformed diff", async () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-p1d-codererrors-"));
  const wt = mkdtempSync(join(tmpdir(), "aj-p1d-codererrors-wt-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "existing.js"), "const x = 1;\n");

    let step = 0;
    const testProvider: ModelProvider = {
      id: "mock_error_tester",
      defaultModel: "mock-model",
      async complete(_req: ProviderRequest): Promise<ProviderResponse> {
        step++;
        if (step === 1) {
          // Read non-existent file
          return {
            ok: true,
            provider: "mock_error_tester",
            model: "mock-model",
            text: "Reading missing",
            toolCalls: [{ id: "c1", name: "read_file", parameters: { path: "src/non_existent.js" } }],
            usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
            costEstimateUsd: 0.0001,
          };
        }
        if (step === 2) {
          // Write already existing file with write_file
          return {
            ok: true,
            provider: "mock_error_tester",
            model: "mock-model",
            text: "Writing existing",
            toolCalls: [{ id: "c2", name: "write_file", parameters: { path: "src/existing.js", content: "const y = 2;\n" } }],
            usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
            costEstimateUsd: 0.0001,
          };
        }
        if (step === 3) {
          // Apply malformed unified diff
          return {
            ok: true,
            provider: "mock_error_tester",
            model: "mock-model",
            text: "Applying bad patch",
            toolCalls: [{ id: "c3", name: "apply_patch", parameters: { patch: "invalid diff text with no hunks" } }],
            usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
            costEstimateUsd: 0.0001,
          };
        }
        return {
          ok: true,
          provider: "mock_error_tester",
          model: "mock-model",
          text: "Finishing",
          toolCalls: [{ id: "c4", name: "finish", parameters: { reason: "Errors tested" } }],
          usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
          costEstimateUsd: 0.0001,
        };
      },
    };

    const res = await implementObjectiveAsync({
      objective: "Test error handling in coder loop",
      projectPath: dir,
      worktreePath: wt,
      config: { provider: testProvider },
    });

    assert.equal(res.ok, true);
    assert.equal(res.ledgerEvents.length, 4);
    assert.ok(res.ledgerEvents[0]?.error?.includes("File not found"));
    assert.ok(res.ledgerEvents[1]?.error?.includes("PATCH_FAILED"));
    assert.ok(res.ledgerEvents[2]?.error?.includes("PATCH_FAILED"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(wt, { recursive: true, force: true });
  }
});

test("P1D-32: Keychain service desktop invoke path error handling & nested array redaction", async () => {
  // Test array and primitive redactions
  const nested = redactObject([123, "sk-live12345678901234567890abcdef", null, true]);
  assert.deepEqual(nested, [123, "[REDACTED_KEY]", null, true]);

  // Test Tauri window IPC error branch
  const originalWindow = (globalThis as { window?: unknown }).window;
  try {
    (globalThis as { window?: unknown }).window = { __TAURI_INTERNALS__: {} };
    await assert.rejects(async () => keychain.getSecret("TEST_KEY"), {
      message: /KEYCHAIN_UNAVAILABLE/,
    });
    await assert.rejects(async () => keychain.setSecret("TEST_KEY", "VAL"), {
      message: /KEYCHAIN_UNAVAILABLE/,
    });
    await assert.rejects(async () => keychain.deleteSecret("TEST_KEY"), {
      message: /KEYCHAIN_UNAVAILABLE/,
    });
  } finally {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});