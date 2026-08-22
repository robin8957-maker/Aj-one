/**
 * General coder. Reads the inspected tree and writes scoped patches.
 * Real agent loop with tool calling: read_file, write_file (new only), apply_patch (unified diff),
 * search_repo, run_command (disabled -> SANDBOX_REQUIRED), finish.
 * Hard bounds: max 40 steps, 200k tokens, cost ceiling, 15m timeout.
 * Fail-fast on unconfigured provider. Corrective retry on malformed tool call.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { inspectRepository, readRepoFile, listRepoFiles, type RepositorySnapshot } from "./repository.ts";
import { writeScoped } from "./workspace.ts";
import { AJ_ERR } from "./errors.ts";
import {
  createProvider,
  type ModelProvider,
  type ModelMessage,
  type ToolDefinition,
  type TokenUsage,
} from "./model-providers.ts";
import { applyUnifiedDiff, writeFileNewOnly } from "./patch-engine.ts";
import { redactSecrets } from "./keychain.ts";

export const DEFAULT_ALLOWED_TEST_COMMANDS = [
  "npm test",
  "npm run test",
  "npm run test:unit",
  "node --test",
  "node --test tests",
  "node --experimental-strip-types --test",
  "cargo test",
  "pytest",
];

export function executeProjectTests(
  worktreePath: string,
  configuredCommand?: string,
  allowedCommands?: string[],
): { ok: boolean; code: number; errorCode?: string; output: string; durationMs: number } {
  const start = Date.now();
  let cmd = configuredCommand;

  if (!cmd) {
    const pkgPath = join(worktreePath, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
        if (pkg.scripts?.test) {
          cmd = "npm test";
        }
      } catch {
        // Fallback
      }
    }
  }

  if (!cmd) {
    cmd = "node --test tests";
  }

  const allowed = allowedCommands ?? DEFAULT_ALLOWED_TEST_COMMANDS;
  const isAllowed = allowed.some((prefix) => cmd === prefix || cmd?.startsWith(prefix + " "));

  if (!isAllowed) {
    const durationMs = Date.now() - start;
    return {
      ok: false,
      code: 1,
      errorCode: AJ_ERR.TEST_COMMAND_NOT_ALLOWED,
      output: `TEST_COMMAND_NOT_ALLOWED: Command "${cmd}" is not in the allowed test commands list (${allowed.join(", ")}).`,
      durationMs,
    };
  }

  try {
    const res = spawnSync(cmd, {
      cwd: worktreePath,
      shell: true,
      timeout: 300_000, // 300s hard timeout
      maxBuffer: 32 * 1024, // 32KB max buffer
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "test",
        CI: "true",
      },
    });

    const durationMs = Date.now() - start;
    // F4: Redact secrets BEFORE truncation and BEFORE ledger write
    const rawOutput = ((res.stdout || "") + "\n" + (res.stderr || "")).trim();
    const redacted = redactSecrets(rawOutput);
    const output = redacted.slice(0, 32 * 1024);
    const code = res.status ?? (res.error ? 1 : 0);

    return {
      ok: code === 0,
      code,
      output: output || (code === 0 ? "Tests passed with no output." : "Tests failed with no output."),
      durationMs,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const errText = redactSecrets(`Test runner execution error: ${err instanceof Error ? err.message : String(err)}`);
    return {
      ok: false,
      code: 1,
      output: errText.slice(0, 32 * 1024),
      durationMs,
    };
  }
}

const ALLOW = ["src/**", "tests/**", "test/**", "web/**", "docs/**", "lib/**", "*.md"];
const FORBID = [".env", "infra/**", "data/**", "production/**"];

export interface CodeChange {
  path: string;
  reason: string;
}

export interface CoderConfig {
  maxSteps?: number;
  maxInputTokens?: number;
  maxCostUsd?: number;
  maxWallClockMs?: number;
  provider?: ModelProvider;
  providerId?: "anthropic" | "openai_compatible" | "ollama_local";
  model?: string;
  apiKey?: string;
  endpoint?: string;
  testCommand?: string;
  allowedTestCommands?: string[];
}

export interface LedgerEvent {
  taskId: string;
  stepIndex: number;
  toolName?: string;
  hashedArgs?: string;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  costEstimateUsd: number;
  error?: string;
}

export interface ImplementResult {
  ok: boolean;
  changes: CodeChange[];
  usedPlaybook: boolean;
  reason: string;
  code?: string;
  steps: number;
  totalTokens: TokenUsage;
  totalCostUsd: number;
  durationMs: number;
  ledgerEvents: LedgerEvent[];
}

const DEFAULT_MAX_STEPS = 40;
const DEFAULT_MAX_INPUT_TOKENS = 200_000;
const DEFAULT_MAX_COST_USD = 10.0;
const DEFAULT_MAX_WALL_CLOCK_MS = 15 * 60 * 1000; // 15 minutes

const TOOLS_SCHEMA: ToolDefinition[] = [
  {
    name: "read_file",
    description: "Reads the content of a file in the repository.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path to the file." },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Writes a brand NEW file. For existing files, you MUST use apply_patch instead.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path for the new file." },
        content: { type: "string", description: "Complete file content to write." },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "apply_patch",
    description: "Applies a unified diff patch to modify existing files in the repository. Must include standard diff headers (--- a/file +++ b/file and @@ hunks).",
    parameters: {
      type: "object",
      properties: {
        patch: { type: "string", description: "Standard unified diff text." },
      },
      required: ["patch"],
    },
  },
  {
    name: "search_repo",
    description: "Searches for a text pattern or symbol across repository files.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query or regex string." },
      },
      required: ["query"],
    },
  },
  {
    name: "run_project_tests",
    description: "Executes the project's test suite in the repository root. Takes no free-form arguments.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "finish",
    description: "Finishes the task with a summary of the changes.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Summary of changes and verification status." },
      },
      required: ["reason"],
    },
  },
];

export async function implementObjectiveAsync(input: {
  taskId?: string;
  objective: string;
  projectPath: string;
  worktreePath: string;
  snapshot?: RepositorySnapshot;
  config?: CoderConfig;
}): Promise<ImplementResult> {
  const taskId = input.taskId || `task_${Date.now().toString(36)}`;
  const startTime = Date.now();
  const maxSteps = input.config?.maxSteps ?? DEFAULT_MAX_STEPS;
  const maxInputTokens = input.config?.maxInputTokens ?? DEFAULT_MAX_INPUT_TOKENS;
  const maxCostUsd = input.config?.maxCostUsd ?? DEFAULT_MAX_COST_USD;
  const maxWallClockMs = input.config?.maxWallClockMs ?? DEFAULT_MAX_WALL_CLOCK_MS;

  // Resolve ModelProvider
  let provider = input.config?.provider;
  if (!provider && input.config?.providerId) {
    provider = createProvider(input.config.providerId);
  }

  // V2: FAIL-FAST ON STEP 0 IF NO LIVE PROVIDER IS CONFIGURED
  if (!provider) {
    return {
      ok: false,
      changes: [],
      usedPlaybook: false,
      reason: "No live ModelProvider configured. Cannot start agent coding loop without an active provider.",
      code: AJ_ERR.PROVIDER_NOT_CONFIGURED,
      steps: 0,
      totalTokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      totalCostUsd: 0,
      durationMs: 0,
      ledgerEvents: [],
    };
  }

  const snapshot = input.snapshot ?? inspectRepository(input.projectPath);
  const changes: CodeChange[] = [];
  const ledgerEvents: LedgerEvent[] = [];
  mkdirSync(input.worktreePath, { recursive: true });

  // Sync initial repository files into worktree
  for (const file of snapshot.files) {
    const content = readRepoFile(input.projectPath, file);
    if (content != null) {
      const target = join(input.worktreePath, file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, "utf8");
    }
  }

  const systemPrompt = `You are the autonomous coding agent of ALJWHARAH ONE.
Your objective is: ${input.objective}

You have access to tools to inspect and modify the repository.
Rules:
1. To modify existing files, you MUST use apply_patch with a valid unified diff (--- a/path +++ b/path @@ hunk @@).
2. write_file is strictly for creating brand NEW files. It will fail if the file already exists.
3. run_command is disabled and requires an isolated sandbox.
4. When finished, call the finish tool with a detailed reason.

Always invoke tools using valid tool calls.`;

  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Repository contains ${snapshot.files.length} files. Begin working on: ${input.objective}` },
  ];

  let steps = 0;
  let accumulatedInputTokens = 0;
  let accumulatedOutputTokens = 0;
  let accumulatedCostUsd = 0;
  let finished = false;
  let finishReason = "Task in progress";
  let failCode: string | undefined;
  let consecutiveMalformedRetries = 0;

  while (steps < maxSteps && !finished) {
    // Check wall clock timeout
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs > maxWallClockMs) {
      finishReason = `Wall clock timeout exceeded (${maxWallClockMs}ms)`;
      failCode = AJ_ERR.TIMEOUT;
      break;
    }

    // Check token budget
    if (accumulatedInputTokens > maxInputTokens) {
      finishReason = `Input token budget exceeded (${maxInputTokens} tokens)`;
      failCode = AJ_ERR.TOKEN_BUDGET_EXCEEDED;
      break;
    }

    // Check cost ceiling
    if (accumulatedCostUsd > maxCostUsd) {
      finishReason = `Task cost ceiling exceeded ($${maxCostUsd})`;
      failCode = AJ_ERR.COST_LIMIT_EXCEEDED;
      break;
    }

    steps++;
    const stepStart = Date.now();

    // Call Model Provider
    const response = await provider.complete({
      model: input.config?.model,
      apiKey: input.config?.apiKey,
      endpoint: input.config?.endpoint,
      messages,
      tools: TOOLS_SCHEMA,
    });

    const stepDuration = Date.now() - stepStart;
    accumulatedInputTokens += response.usage.inputTokens;
    accumulatedOutputTokens += response.usage.outputTokens;
    accumulatedCostUsd += response.costEstimateUsd;

    if (!response.ok) {
      finishReason = response.error?.message || "Model provider error";
      failCode = response.error?.code || AJ_ERR.PROVIDER_UNAVAILABLE;
      ledgerEvents.push({
        taskId,
        stepIndex: steps,
        durationMs: stepDuration,
        tokensIn: response.usage.inputTokens,
        tokensOut: response.usage.outputTokens,
        costEstimateUsd: response.costEstimateUsd,
        error: redactSecrets(finishReason),
      });
      break;
    }

    messages.push({ role: "assistant", content: response.text });

    const toolCalls = response.toolCalls;

    // V3: MALFORMED TOOL CALL HANDLING (1 RETRY THEN ABORT)
    if (!toolCalls || toolCalls.length === 0) {
      if (consecutiveMalformedRetries === 0) {
        consecutiveMalformedRetries++;
        messages.push({
          role: "user",
          content: "Your response did not invoke any tool. Please call one of the available tools (e.g. read_file, apply_patch, write_file, search_repo, finish).",
        });
        ledgerEvents.push({
          taskId,
          stepIndex: steps,
          toolName: "malformed_retry",
          durationMs: stepDuration,
          tokensIn: response.usage.inputTokens,
          tokensOut: response.usage.outputTokens,
          costEstimateUsd: response.costEstimateUsd,
          error: "Schema-repair retry requested",
        });
        continue;
      } else {
        finishReason = "Malformed tool call after corrective retry.";
        failCode = AJ_ERR.MALFORMED_TOOL_CALL;
        ledgerEvents.push({
          taskId,
          stepIndex: steps,
          toolName: "malformed_abort",
          durationMs: stepDuration,
          tokensIn: response.usage.inputTokens,
          tokensOut: response.usage.outputTokens,
          costEstimateUsd: response.costEstimateUsd,
          error: AJ_ERR.MALFORMED_TOOL_CALL,
        });
        break;
      }
    }

    // Reset malformed retry counter on valid tool call
    consecutiveMalformedRetries = 0;

    for (const tc of toolCalls) {
      const toolStart = Date.now();
      const toolName = tc.name;
      const params = tc.parameters;
      const hashedArgs = createHash("sha256").update(JSON.stringify(params)).digest("hex").slice(0, 16);

      let toolOutput = "";
      let toolError: string | undefined;

      try {
        switch (toolName) {
          case "read_file": {
            const relPath = String(params.path || "");
            const fullPath = join(input.worktreePath, relPath);
            if (existsSync(fullPath)) {
              toolOutput = readFileSync(fullPath, "utf8");
            } else {
              toolError = `File not found: ${relPath}`;
              toolOutput = `Error: File not found: ${relPath}`;
            }
            break;
          }

          case "write_file": {
            const relPath = String(params.path || "");
            const content = String(params.content || "");
            const writeRes = writeFileNewOnly(input.worktreePath, relPath, content, ALLOW, FORBID);
            if (writeRes.ok) {
              toolOutput = `File created successfully: ${writeRes.path}`;
              changes.push({ path: writeRes.path, reason: "Agent created new file via write_file" });
            } else {
              toolError = writeRes.code || writeRes.reason;
              toolOutput = `Error writing file (${writeRes.code || "FAILED"}): ${writeRes.reason}`;
            }
            break;
          }

          case "apply_patch": {
            const patchText = String(params.patch || "");
            const patchRes = applyUnifiedDiff(input.worktreePath, patchText, ALLOW, FORBID);
            if (patchRes.ok) {
              toolOutput = `Patch applied successfully to: ${patchRes.patchedFiles.join(", ")}`;
              for (const pf of patchRes.patchedFiles) {
                changes.push({ path: pf, reason: "Agent applied unified diff patch" });
              }
            } else {
              toolError = patchRes.code || patchRes.reason;
              toolOutput = `Error applying patch (${patchRes.code || "FAILED"}): ${patchRes.reason}`;
            }
            break;
          }

          case "search_repo": {
            const query = String(params.query || "").toLowerCase();
            const snap = inspectRepository(input.worktreePath);
            const matches: string[] = [];
            for (const file of snap.files.slice(0, 50)) {
              const body = readRepoFile(input.worktreePath, file);
              if (body && body.toLowerCase().includes(query)) {
                matches.push(file);
              }
            }
            toolOutput = matches.length > 0 ? `Found matches in:\n${matches.join("\n")}` : `No matches found for "${query}".`;
            break;
          }

          case "run_project_tests": {
            const testRes = executeProjectTests(input.worktreePath, input.config?.testCommand, input.config?.allowedTestCommands);
            toolOutput = `Test Suite Execution (Exit Code ${testRes.code}, Duration ${testRes.durationMs}ms):\n${testRes.output}`;
            if (!testRes.ok) {
              toolError = testRes.errorCode || `Tests failed with exit code ${testRes.code}`;
            }
            break;
          }

          // Legacy/Safety fallback: arbitrary run_command stays permanently disabled
          case "run_command": {
            toolError = AJ_ERR.SANDBOX_REQUIRED;
            toolOutput = JSON.stringify({
              ok: false,
              code: AJ_ERR.SANDBOX_REQUIRED,
              reason: "Arbitrary command execution is permanently disabled. Use run_project_tests to run tests.",
            });
            break;
          }

          case "finish": {
            finished = true;
            finishReason = String(params.reason || "Task completed by agent.");
            toolOutput = "Task completed.";
            break;
          }

          default: {
            toolError = `Unknown tool: ${toolName}`;
            toolOutput = `Error: Unknown tool: ${toolName}`;
          }
        }
      } catch (err: unknown) {
        toolError = err instanceof Error ? err.message : String(err);
        toolOutput = `Tool execution exception: ${toolError}`;
      }

      const toolDuration = Date.now() - toolStart;
      ledgerEvents.push({
        taskId,
        stepIndex: steps,
        toolName,
        hashedArgs,
        durationMs: toolDuration,
        tokensIn: 0,
        tokensOut: 0,
        costEstimateUsd: 0,
        error: toolError,
      });

      if (!finished) {
        messages.push({
          role: "user",
          content: `Tool result for ${toolName}:\n${toolOutput}`,
        });
      }
    }
  }

  if (!finished && steps >= maxSteps) {
    finishReason = `Max steps reached (${maxSteps})`;
    failCode = AJ_ERR.STEP_LIMIT_EXCEEDED;
  }

  const uniqueChanges = Array.from(new Map(changes.map((c) => [c.path, c])).values());

  return {
    ok: finished && !failCode,
    changes: uniqueChanges,
    usedPlaybook: false,
    reason: finishReason,
    code: failCode,
    steps,
    totalTokens: {
      inputTokens: accumulatedInputTokens,
      outputTokens: accumulatedOutputTokens,
      totalTokens: accumulatedInputTokens + accumulatedOutputTokens,
    },
    totalCostUsd: Number(accumulatedCostUsd.toFixed(6)),
    durationMs: Date.now() - startTime,
    ledgerEvents,
  };
}

// Synchronous wrapper to preserve backwards compatibility for sync callers
export function implementObjective(input: {
  objective: string;
  projectPath: string;
  worktreePath: string;
  snapshot?: RepositorySnapshot;
  config?: CoderConfig;
}): { changes: CodeChange[]; usedPlaybook: boolean; reason: string; code?: string } {
  // If called without a live async engine, fails fast with PROVIDER_NOT_CONFIGURED (Rule V2)
  if (!input.config?.provider && !input.config?.providerId) {
    return {
      changes: [],
      usedPlaybook: false,
      reason: "No live ModelProvider configured. Cannot start agent coding loop without an active provider.",
      code: AJ_ERR.PROVIDER_NOT_CONFIGURED,
    };
  }

  // Placeholder for synchronous callers: async engine should be awaited via implementObjectiveAsync
  return {
    changes: [],
    usedPlaybook: false,
    reason: "Async implementation requires implementObjectiveAsync.",
    code: AJ_ERR.CAPABILITY_UNAVAILABLE,
  };
}

export function writeBrokenPatch(worktree: string, rel: string, _source: string): void {
  mkdirSync(dirname(join(worktree, rel)), { recursive: true });
  writeFileSync(
    join(worktree, rel),
    `export function add(a: unknown, b: unknown) { throw new Error("INTENTIONAL_BROKEN_PATCH"); }\n`,
    "utf8",
  );
}

export function copyTreeFiles(from: string, to: string): string[] {
  const files = listRepoFiles(from, 200);
  const copied: string[] = [];
  for (const rel of files) {
    const body = readRepoFile(from, rel);
    if (body == null) continue;
    const written = writeScoped(to, rel, body, ALLOW.concat(["**/*"]), []);
    if (written.ok) copied.push(rel);
  }
  return copied;
}