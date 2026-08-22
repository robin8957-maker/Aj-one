/**
 * 9-Run Acceptance Test Runner across 3 providers:
 * - Anthropic (claude-opus-4-8)
 * - OpenAI-compatible (gpt-5.6-sol)
 * - Ollama (qwen3-coder:30b)
 *
 * Tasks:
 * (a) add a new function plus its tests
 * (b) fix a genuinely failing test
 * (c) refactor a function across 2 or more files
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { implementObjectiveAsync } from '../src/runtime/coder.ts';
import { createProvider } from '../src/runtime/model-providers.ts';

function createRepoA(dir) {
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'task-a', type: 'module' }));
  writeFileSync(join(dir, 'src', 'math.js'), 'export function add(a, b) { return a + b; }\n');
  writeFileSync(join(dir, 'tests', 'math.test.js'), 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { add } from "../src/math.js";\ntest("add", () => assert.equal(add(1, 2), 3));\n');
}

function createRepoB(dir) {
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'task-b', type: 'module' }));
  // Bug: subtraction instead of multiplication
  writeFileSync(join(dir, 'src', 'calc.js'), 'export function multiply(a, b) { return a - b; }\n');
  writeFileSync(join(dir, 'tests', 'calc.test.js'), 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { multiply } from "../src/calc.js";\ntest("multiply", () => assert.equal(multiply(3, 4), 12));\n');
}

function createRepoC(dir) {
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'task-c', type: 'module' }));
  writeFileSync(join(dir, 'src', 'format.js'), 'export function formatUser(name) { return "User: " + name.trim(); }\n');
  writeFileSync(join(dir, 'src', 'service.js'), 'import { formatUser } from "./format.js";\nexport function getWelcome(name) { return "Welcome, " + formatUser(name); }\n');
  writeFileSync(join(dir, 'tests', 'service.test.js'), 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { getWelcome } from "../src/service.js";\ntest("welcome", () => assert.equal(getWelcome(" Alice "), "Welcome, User: Alice"));\n');
}

const PROVIDERS = [
  { id: 'anthropic', req: 'Anthropic API Key (ANTHROPIC_API_KEY / keychain entry "anthropic_api_key")' },
  { id: 'openai_compatible', req: 'OpenAI API Key (OPENAI_API_KEY / keychain entry "openai_api_key")' },
  { id: 'ollama_local', req: 'Local Ollama daemon running at http://127.0.0.1:11434 with model qwen3-coder:30b' },
];

const TASKS = [
  { id: 'a', name: 'Task (a): Add new function plus tests', setup: createRepoA, prompt: 'Add a new function subtract(a, b) in src/math.js and add corresponding tests in tests/math.test.js' },
  { id: 'b', name: 'Task (b): Fix genuinely failing test', setup: createRepoB, prompt: 'Fix the failing test in tests/calc.test.js so multiply(3, 4) returns 12' },
  { id: 'c', name: 'Task (c): Refactor function across 2+ files', setup: createRepoC, prompt: 'Refactor formatUser in src/format.js and update usages in src/service.js and tests' },
];

async function runAcceptance() {
  console.log('====================================================');
  console.log('=== PHASE 1C ACCEPTANCE TEST: 9 REAL RUNS ===');
  console.log('====================================================\n');

  let runIndex = 1;
  const results = [];

  for (const prov of PROVIDERS) {
    const provider = createProvider(prov.id);

    for (const task of TASKS) {
      console.log(`--- RUN ${runIndex}/9: Provider=${prov.id} (${provider.defaultModel}) | ${task.name} ---`);
      const repoDir = mkdtempSync(join(tmpdir(), `aj-accept-${prov.id}-${task.id}-`));
      const wtDir = mkdtempSync(join(tmpdir(), `aj-accept-wt-${prov.id}-${task.id}-`));

      try {
        task.setup(repoDir);
        const startTime = Date.now();

        const res = await implementObjectiveAsync({
          taskId: `run_${prov.id}_${task.id}`,
          objective: task.prompt,
          projectPath: repoDir,
          worktreePath: wtDir,
          config: {
            provider,
            maxSteps: 10,
            maxWallClockMs: 30000,
          },
        });

        const duration = Date.now() - startTime;
        const isCredentialMissing = res.code === 'PROVIDER_NOT_CONFIGURED' || res.code === 'AJ_ERR_PROVIDER_UNAVAILABLE';
        const statusLabel = res.ok ? 'PASS' : (isCredentialMissing ? 'NOT_RUN — MISSING_CREDENTIAL' : 'FAIL');

        const resultRecord = {
          run: runIndex,
          provider: prov.id,
          model: provider.defaultModel,
          taskId: task.id,
          taskName: task.name,
          status: statusLabel,
          code: isCredentialMissing ? 'MISSING_CREDENTIAL' : (res.code || 'SUCCESS'),
          steps: res.steps,
          tokensIn: res.totalTokens.inputTokens,
          tokensOut: res.totalTokens.outputTokens,
          costUsd: res.totalCostUsd,
          durationMs: duration,
          reason: res.reason,
          requiredFromOwner: isCredentialMissing ? prov.req : 'none',
          changedFiles: res.changes.map(c => c.path),
        };

        results.push(resultRecord);

        console.log(`STATUS: ${statusLabel}`);
        console.log(`STEPS: ${res.steps}`);
        console.log(`TOKENS: in=${res.totalTokens.inputTokens}, out=${res.totalTokens.outputTokens}`);
        console.log(`COST: $${res.totalCostUsd.toFixed(6)}`);
        console.log(`DURATION: ${duration}ms`);
        console.log(`REASON: ${res.reason}`);
        if (isCredentialMissing) {
          console.log(`REQUIRED FROM OWNER: ${prov.req}`);
        }
        console.log(`CHANGED FILES: ${res.changes.map(c => c.path).join(', ') || 'none'}\n`);
      } catch (err) {
        console.log(`EXCEPTION: ${err.message}\n`);
        results.push({
          run: runIndex,
          provider: prov.id,
          model: provider.defaultModel,
          taskId: task.id,
          taskName: task.name,
          status: 'EXCEPTION',
          code: 'EXCEPTION',
          steps: 0,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          durationMs: 0,
          reason: err.message,
          requiredFromOwner: prov.req,
          changedFiles: [],
        });
      } finally {
        rmSync(repoDir, { recursive: true, force: true });
        rmSync(wtDir, { recursive: true, force: true });
        runIndex++;
      }
    }
  }

  console.log('====================================================');
  console.log('=== SUMMARY OF 9 ACCEPTANCE RUNS ===');
  console.log('====================================================');
  console.table(results.map(r => ({
    Run: r.run,
    Provider: r.provider,
    Task: r.taskId,
    Status: r.status,
    Steps: r.steps,
    TokensIn: r.tokensIn,
    TokensOut: r.tokensOut,
    Cost: `$${r.costUsd.toFixed(4)}`,
    Duration: `${r.durationMs}ms`,
    RequiredFromOwner: r.requiredFromOwner,
  })));
}

runAcceptance();