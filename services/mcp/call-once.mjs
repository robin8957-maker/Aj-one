#!/usr/bin/env node
/**
 * One-shot MCP client. Starts a stdio server, initializes, lists or calls, exits.
 * Used by the AJ MCP gateway so the daemon can stay synchronous.
 *
 * argv: <commandPath> <mode:list|call> [toolName] [argsJson]
 */
import { spawn } from "node:child_process";

const command = process.argv[2];
const mode = process.argv[3] || "list";
const toolName = process.argv[4] || "";
const argsJson = process.argv[5] || "{}";

if (!command) {
  process.stderr.write("usage: call-once.mjs <command> list|call [tool] [argsJson]\n");
  process.exit(2);
}

const child = spawn(process.execPath, [command], {
  stdio: ["pipe", "pipe", "pipe"],
  env: process.env,
});

let buffer = "";
const pending = new Map();
let nextId = 1;

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
    if (msg.id == null) continue;
    const wait = pending.get(msg.id);
    if (!wait) continue;
    pending.delete(msg.id);
    if (msg.error) wait.reject(new Error(msg.error.message));
    else wait.resolve(msg.result);
  }
});

function rpc(method, params) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`MCP timeout ${method}`));
    }, 8000);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
  });
}

function notify(method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

try {
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "aj-mcp-gateway", version: "1.0.0" },
  });
  notify("notifications/initialized", {});
  if (mode === "list") {
    const listed = await rpc("tools/list", {});
    process.stdout.write(`${JSON.stringify({ ok: true, tools: listed.tools ?? [] })}\n`);
  } else {
    let args = {};
    try {
      args = JSON.parse(argsJson);
    } catch {
      args = {};
    }
    const res = await rpc("tools/call", { name: toolName, arguments: args });
    process.stdout.write(`${JSON.stringify({ ok: true, result: res })}\n`);
  }
  child.kill("SIGTERM");
  process.exit(0);
} catch (err) {
  process.stdout.write(
    `${JSON.stringify({ ok: false, reason: err instanceof Error ? err.message : "mcp failed" })}\n`,
  );
  child.kill("SIGTERM");
  process.exit(1);
}
