import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runSandboxed, sandboxAvailable, describeSandbox } from "../src/runtime/sandbox.ts";
import { runNodeTest } from "../src/runtime/workspace.ts";
import { runTerminal } from "../src/runtime/station.ts";
import { DEFAULT_POLICY } from "../src/protocol/station.ts";

const ROOT = join(tmpdir(), `aj-sbx-${Date.now()}`);

function session(cwd: string) {
  const now = new Date().toISOString();
  return {
    sessionId: "t-sbx",
    computerId: "c-sbx",
    title: "User",
    cwd,
    owner: "user" as const,
    running: false,
    output: "",
    createdAt: now,
    updatedAt: now,
  };
}

test("sandbox backend is linux namespaces", () => {
  assert.equal(sandboxAvailable(), true);
  assert.equal(describeSandbox().backend, "linux-namespaces");
});

test("agent cannot read the host secrets vault", () => {
  mkdirSync(ROOT, { recursive: true });
  writeFileSync(join(ROOT, "ok.txt"), "in");
  const r = runSandboxed({
    cwd: ROOT,
    command: "cat /workspace/data/ajd/local-operator/secrets.vault.json",
  });
  assert.equal(r.ok, false);
  assert.match(r.output, /No such file|not found/i);
});

test("agent cannot write the host workspace", () => {
  const r = runSandboxed({ cwd: ROOT, command: "touch /workspace/PWNED_SANDBOX" });
  assert.equal(r.ok, false);
  assert.equal(existsSync("/workspace/PWNED_SANDBOX"), false);
});

test("agent cannot see host env secrets", () => {
  const prev = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "leak-me-now";
  try {
    const r = runSandboxed({ cwd: ROOT, command: "printenv XAI_API_KEY" });
    assert.doesNotMatch(r.output, /leak-me-now/);
  } finally {
    if (prev === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = prev;
  }
});

test("agent can read and write only its work root", () => {
  writeFileSync(join(ROOT, "in.txt"), "hello");
  const r = runSandboxed({ cwd: ROOT, command: "cat /work/in.txt && echo boxed > /work/out.txt" });
  assert.equal(r.ok, true);
  assert.match(r.output, /hello/);
  assert.equal(existsSync(join(ROOT, "out.txt")), true);
});

test("empty net namespace blocks outbound sockets", () => {
  const r = runSandboxed({
    cwd: ROOT,
    command:
      "node -e \"require('net').connect({host:'1.1.1.1',port:80}).on('error',e=>{console.error(e.code);process.exit(1)})\"",
  });
  assert.equal(r.ok, false);
});

test("runNodeTest executes inside the jail", () => {
  mkdirSync(join(ROOT, "tests"), { recursive: true });
  writeFileSync(
    join(ROOT, "tests", "ok.test.js"),
    "const test = require('node:test'); const assert = require('node:assert');\ntest('adds', () => assert.equal(1+1, 2));\n",
  );
  const r = runNodeTest(ROOT, ["tests/ok.test.js"]);
  assert.equal(r.ok, true, r.output);
});

test("runTerminal is sandboxed and tagged", () => {
  const next = runTerminal(session(ROOT), "pwd", DEFAULT_POLICY);
  assert.equal(next.exitCode, 0);
  assert.match(next.output, /vm:|sandbox:/);
  assert.match(next.output, /\/work/);
});

test("cleanup", () => {
  rmSync(ROOT, { recursive: true, force: true });
});
