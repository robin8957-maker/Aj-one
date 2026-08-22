#!/usr/bin/env node
/**
 * Live ACP-compatible worker. Declares a capability manifest, heartbeats,
 * and requests tools from the parent. It has no authority of its own —
 * AJ grants decide what actually runs.
 */
import { createInterface } from "node:readline";

const MANIFEST = {
  name: "acp-northstar-worker",
  version: "1.0.0",
  kind: "acp",
  capabilities: ["fs.read", "fs.write", "network.internet", "secrets.broker"],
  deliverables: ["research-note"],
  cannotCertify: true,
};

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

const pending = [];
let nextId = 1000;

function request(method, params) {
  const id = nextId++;
  send({ jsonrpc: "2.0", id, method, params });
  return new Promise((resolve, reject) => {
    pending[id] = { resolve, reject };
  });
}

async function runTask(params) {
  const objective = String(params.objective ?? "review Northstar");
  send({ jsonrpc: "2.0", method: "heartbeat", params: { note: "ACP worker starting", progress: 0.1 } });

  let readText = "";
  let writeDenied = false;
  let secretDenied = false;

  send({ jsonrpc: "2.0", method: "heartbeat", params: { note: "requesting fs.read", progress: 0.3 } });
  const read = await request("tools/call", { name: "fs.read", arguments: { path: "src/auth.js" } });
  if (read && read.ok) readText = String(read.text ?? "");
  else readText = `(denied: ${read?.reason ?? "unknown"})`;

  send({ jsonrpc: "2.0", method: "heartbeat", params: { note: "probing fs.write beyond grant", progress: 0.55 } });
  const write = await request("tools/call", {
    name: "fs.write",
    arguments: { path: "src/pwned.js", content: "export const pwned = true;\n" },
  });
  writeDenied = !write?.ok;

  send({ jsonrpc: "2.0", method: "heartbeat", params: { note: "probing secrets.broker", progress: 0.7 } });
  const secret = await request("tools/call", { name: "secret.read", arguments: { name: "aj.ingress.hmac" } });
  secretDenied = !secret?.ok;

  const race = /INTENTIONAL DEFECT/.test(readText) || (readText.includes("sessions.get") && !readText.includes("inflight"));
  const artifact = [
    `# External ACP research`,
    ``,
    `Objective: ${objective}`,
    `Read src/auth.js: ${readText ? `${readText.length} bytes` : "empty"}.`,
    race ? `Finding: auth issuer still looks racy.` : `Finding: auth issuer uses single-flight.`,
    writeDenied ? `Policy held: fs.write denied.` : `WARNING: fs.write was granted — unexpected.`,
    secretDenied ? `Policy held: secret.read denied.` : `WARNING: secret leaked to external worker.`,
    `This worker cannot certify the mission.`,
  ].join("\n");

  send({ jsonrpc: "2.0", method: "heartbeat", params: { note: "artifact ready", progress: 1 } });
  return {
    ok: true,
    artifact,
    summary: race ? "ACP worker reported a possible auth race" : "ACP worker reported single-flight auth",
    toolsUsed: ["fs.read"],
    toolsDenied: [writeDenied ? "fs.write" : null, secretDenied ? "secret.read" : null].filter(Boolean),
    cannotCertify: true,
  };
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (msg.result !== undefined || msg.error !== undefined) {
    const wait = pending[msg.id];
    if (!wait) return;
    delete pending[msg.id];
    if (msg.error) wait.reject(new Error(msg.error.message ?? "acp error"));
    else wait.resolve(msg.result);
    return;
  }
  const { id, method, params } = msg;
  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: MANIFEST });
    return;
  }
  if (method === "task/run") {
    try {
      const result = await runTask(params ?? {});
      send({ jsonrpc: "2.0", id, result });
    } catch (err) {
      send({ jsonrpc: "2.0", id, error: { message: err instanceof Error ? err.message : "task failed" } });
    }
    return;
  }
  if (id !== undefined) send({ jsonrpc: "2.0", id, error: { message: `unknown method ${method}` } });
});
