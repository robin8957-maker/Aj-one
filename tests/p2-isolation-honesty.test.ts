import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sandboxAvailable, runSandboxed, describeSandbox } from "../src/runtime/sandbox.ts";
import { createWorktree, writeScoped } from "../src/runtime/workspace.ts";

test("P2-1: sandbox is fail-closed without unshare/chroot and does not fake a jail", () => {
  const desc = describeSandbox();
  assert.ok(desc.backend === "linux-namespaces" || desc.backend === "unavailable");

  if (!sandboxAvailable()) {
    const res = runSandboxed({
      cwd: process.cwd(),
      command: "echo test",
      network: "none",
    });
    assert.equal(res.ok, false, "Must fail closed when sandbox primitives are missing");
    assert.equal(res.code, 126, "Exit code must be 126 fail-closed");
    assert.match(res.output, /sandbox unavailable — refuse to run on the host/);
  }
});

test("P2-2: unique worktrees have isolated paths and prevent cross-writes", () => {
  const operatorId = `op-p2-${Date.now()}`;
  const missionId = `msn-p2-${Date.now()}`;
  const seedDir = mkdtempSync(join(tmpdir(), "aj-p2-seed-"));

  try {
    mkdirSync(join(seedDir, "src"), { recursive: true });
    writeFileSync(join(seedDir, "src", "math.js"), "export function add(a, b) { return a + b; }\n");

    const wtA = createWorktree(operatorId, missionId, "agent-A", seedDir);
    const wtB = createWorktree(operatorId, missionId, "agent-B", seedDir);

    // 1. Worktree paths must be distinct and non-overlapping
    assert.notEqual(wtA.path, wtB.path, "Worktree paths must be distinct");
    assert.ok(wtA.path.includes("agent-A"));
    assert.ok(wtB.path.includes("agent-B"));

    const ALLOW = ["src/**", "tests/**", "docs/**"];
    const FORBID = [".env", "infra/**", "data/**", "production/**"];

    // 2. Agent A writes legitimately to its own worktree
    const writeA = writeScoped(wtA.path, "src/math.js", "export function add() { return 42; }\n", ALLOW, FORBID);
    assert.equal(writeA.ok, true);

    // 3. Agent A attempts cross-worktree escape into Agent B's worktree
    const crossPath = `../agent-B/src/math.js`;
    const crossWrite = writeScoped(wtA.path, crossPath, "HACKED BY AGENT A", ALLOW, FORBID);
    assert.equal(crossWrite.ok, false, "Path escape must be blocked");
    assert.equal(crossWrite.reason, "path escape blocked");

    // 4. Agent A attempts to write to forbidden scope (.env, infra)
    const envWrite = writeScoped(wtA.path, ".env", "SECRET=leaked", ALLOW, FORBID);
    assert.equal(envWrite.ok, false);
    assert.match(envWrite.reason, /forbidden scope/);

    const infraWrite = writeScoped(wtA.path, "infra/deploy.yaml", "dangerous: true", ALLOW, FORBID);
    assert.equal(infraWrite.ok, false);
    assert.match(infraWrite.reason, /forbidden scope/);

    // 5. Verify agent B's worktree was completely untouched
    assert.ok(!existsSync(join(wtB.path, "src/math.js.tmp")));
    const bContent = existsSync(join(wtB.path, "src", "math.js"));
    assert.ok(bContent, "Agent B worktree exists and is untainted");
  } finally {
    rmSync(seedDir, { recursive: true, force: true });
  }
});
