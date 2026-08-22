/**
 * Detect the repository's real test command. Never invent Jest/Playwright.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { inspectRepository, readRepoFile, type RepositorySnapshot } from "./repository.ts";
import { sandboxAvailable, runSandboxed } from "./sandbox.ts";
import { spawnSync } from "node:child_process";

export interface TestPlan {
  framework: string;
  command: string | null;
  files: string[];
  reason: string;
}

export function detectTestPlan(root: string, snapshot?: RepositorySnapshot): TestPlan {
  const snap = snapshot ?? inspectRepository(root);
  const files = snap.files.filter((f) => /\.(test|spec)\.(js|ts|mjs|cjs)$/.test(f) || /\/tests?\//.test(f));
  const pkgRaw = readRepoFile(root, "package.json");
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string>; devDependencies?: Record<string, string> };
      if (pkg.scripts?.test) {
        return {
          framework: pkg.devDependencies?.vitest ? "vitest" : pkg.scripts.test.includes("playwright") ? "playwright" : "npm-test",
          command: `npm test -- ${files.slice(0, 8).join(" ")}`.trim(),
          files,
          reason: "package.json scripts.test exists",
        };
      }
    } catch {
      /* invalid package.json is not a test runner */
    }
  }
  if (files.some((f) => f.endsWith(".py")) && (existsSync(join(root, "pytest.ini")) || snap.testSystems.includes("pytest"))) {
    return { framework: "pytest", command: "python -m pytest -q", files, reason: "pytest detected" };
  }
  if (files.length) {
    return {
      framework: "node:test",
      command: `node --test ${files.join(" ")}`,
      files,
      reason: "node:test files present",
    };
  }
  return { framework: "none", command: null, files: [], reason: "no test command or test files detected" };
}

export function runDetectedTests(
  cwd: string,
  plan: TestPlan,
): { ok: boolean; output: string; code: number; ran: boolean } {
  if (!plan.command) {
    return { ok: false, output: "no tests declared — refuse to claim pass", code: 1, ran: false };
  }
  if (sandboxAvailable()) {
    const res = runSandboxed({ cwd, command: plan.command, timeoutMs: 25_000, network: "none" });
    return { ok: res.ok, output: res.output.slice(0, 8000), code: res.code, ran: true };
  }
  const argv = plan.framework === "node:test"
    ? ["--test", ...plan.files]
    : (plan.command.match(/(?:[^\s"]+|"[^"]*")+/g) ?? ["--test"]).slice(1).map((p) => p.replace(/^"|"$/g, ""));
  const bin = plan.framework === "node:test" || plan.command.startsWith("node ") ? "node" : plan.command.split(" ")[0]!;
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const res = spawnSync(bin, argv, { cwd, encoding: "utf8", timeout: 25_000, shell: false, env });
  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`.slice(0, 8000);
  if (/skipping running files/i.test(output)) {
    return { ok: false, output, code: 1, ran: false };
  }
  const code = res.status ?? 1;
  return { ok: code === 0, output, code, ran: true };
}

export function impactedTestFiles(changed: string[], allTests: string[]): string[] {
  const stems = changed.map((f) => f.replace(/\.[^.]+$/, "").split("/").pop() ?? "");
  const hit = allTests.filter((t) => stems.some((s) => s && t.includes(s)));
  return hit.length ? hit : allTests.slice(0, 8);
}
