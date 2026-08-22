#!/usr/bin/env node
/**
 * Parent-side ACP session driver. The worker is a child process.
 * Tool calls are authorized here against AJ grants — the worker cannot self-authorize.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [, , worker, projectPath, grantsJson, objective, externalId, timeoutRaw] = process.argv;
const grants = JSON.parse(grantsJson || "[]");
const timeoutMs = Number(timeoutRaw || 8000);

function execute(name, args) {
  if (!grants.includes(name)) return { ok: false, reason: `ACP grant missing '${name}'` };
  if (name === "fs.read") {
    const rel = String(args.path || "");
    if (!rel || rel.includes("..") || rel.startsWith("infra") || rel.includes(".env")) {
      return { ok: false, reason: "path refused by ACP gateway" };
    }
    const full = join(projectPath, rel);
    if (!full.startsWith(projectPath) || !existsSync(full)) return { ok: false, reason: "not found" };
    return { ok: true, text: readFileSync(full, "utf8").slice(0, 8000) };
  }
  return { ok: false, reason: `ACP tool '${name}' not implemented or not granted` };
}

const child = spawn(process.execPath, [worker], { stdio: ["pipe", "pipe", "pipe"] });
let buffer = "";
const heartbeats = [];
const toolsUsed = [];
const toolsDenied = [];
const pending = new Map();
let nextWait = 1;
let manifest = null;

function write(msg) {
  child.stdin.write(`${JSON.stringify(msg)}\n`);
}

function rpc(method, params, ms) {
  const id = nextWait++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ACP timeout ${method}`)), ms);
    pending.set(id, (v) => {
      clearTimeout(timer);
      resolve(v);
    });
    write({ jsonrpc: "2.0", id, method, params });
  });
}

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.method === "heartbeat") {
      heartbeats.push({ note: String(msg.params?.note ?? ""), progress: Number(msg.params?.progress ?? 0) });
      continue;
    }
    if (msg.method === "tools/call") {
      const name = String(msg.params?.name ?? "");
      const result = execute(name, msg.params?.arguments ?? {});
      if (result.ok) toolsUsed.push(name);
      else toolsDenied.push(name);
      if (msg.id != null) write({ jsonrpc: "2.0", id: msg.id, result });
      continue;
    }
    if (msg.id != null && pending.has(msg.id)) {
      pending.get(msg.id)(msg.error ? { error: msg.error } : msg.result);
      pending.delete(msg.id);
    }
  }
});

const fail = (reason) => ({
  ok: false,
  externalId,
  manifest,
  heartbeats,
  toolsUsed,
  toolsDenied,
  reason,
});

const killer = setTimeout(() => {
  child.kill("SIGTERM");
  process.stdout.write(`${JSON.stringify(fail("ACP session timed out"))}\n`);
  process.exit(1);
}, timeoutMs + 800);

try {
  manifest = await rpc("initialize", { client: "aj-acp-gateway" }, 3000);
  const result = await rpc("task/run", { objective, grants, projectPath }, timeoutMs);
  clearTimeout(killer);
  child.kill("SIGTERM");
  if (result?.error) {
    process.stdout.write(`${JSON.stringify(fail(result.error.message))}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      externalId,
      manifest,
      heartbeats,
      toolsUsed: [...new Set([...toolsUsed, ...(result.toolsUsed ?? [])])],
      toolsDenied: [...new Set([...toolsDenied, ...(result.toolsDenied ?? [])])],
      artifact: result.artifact,
      summary: result.summary,
    })}\n`,
  );
  process.exit(0);
} catch (err) {
  clearTimeout(killer);
  child.kill("SIGTERM");
  process.stdout.write(`${JSON.stringify(fail(err instanceof Error ? err.message : "ACP failed"))}\n`);
  process.exit(1);
}
