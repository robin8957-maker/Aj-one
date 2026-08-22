#!/usr/bin/env node
/**
 * Real MCP server (JSON-RPC 2.0, newline-delimited stdio).
 * Tools execute locally against the Northstar fixture — never on behalf of an agent directly.
 * Agents must go AJ Tool Gateway → MCP Gateway → this process.
 */
import { createInterface } from "node:readline";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const PROJECT = process.env.NORTHSTAR_ROOT || join(process.cwd(), "fixtures", "northstar");

const TOOLS = [
  {
    name: "northstar.list_files",
    description: "List source files in the Northstar project.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "northstar.read_file",
    description: "Read a scoped project file. Secrets and infra paths are refused.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "northstar.probe_auth",
    description: "Describe whether auth.js still contains the annotated race.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function result(id, payload) {
  send({ jsonrpc: "2.0", id, result: payload });
}

function fail(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function listFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listFiles(full, acc);
    else acc.push(relative(PROJECT, full).replace(/\\/g, "/"));
  }
  return acc;
}

function callTool(name, args) {
  if (name === "northstar.list_files") {
    return { files: existsSync(PROJECT) ? listFiles(PROJECT) : [] };
  }
  if (name === "northstar.read_file") {
    const rel = String(args.path || "");
    if (!rel || rel.includes("..") || rel.startsWith("infra") || rel.includes(".env")) {
      throw new Error("path refused by MCP server policy");
    }
    const full = join(PROJECT, rel);
    if (!full.startsWith(PROJECT) || !existsSync(full)) throw new Error("not found");
    return { path: rel, content: readFileSync(full, "utf8").slice(0, 8000) };
  }
  if (name === "northstar.probe_auth") {
    const auth = join(PROJECT, "src", "auth.js");
    const src = existsSync(auth) ? readFileSync(auth, "utf8") : "";
    return {
      racePresent: src.includes("INTENTIONAL DEFECT") || (src.includes("sessions.get") && !src.includes("inflight")),
      bytes: src.length,
    };
  }
  throw new Error(`unknown tool ${name}`);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  if (method === "initialize") {
    result(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "northstar-mcp", version: "1.0.0" },
    });
    return;
  }
  if (method === "notifications/initialized" || method === "initialized") return;
  if (method === "tools/list") {
    result(id, { tools: TOOLS });
    return;
  }
  if (method === "tools/call") {
    try {
      const data = callTool(params.name, params.arguments ?? {});
      result(id, { content: [{ type: "text", text: JSON.stringify(data) }] });
    } catch (err) {
      fail(id, -32000, err instanceof Error ? err.message : "tool failed");
    }
    return;
  }
  if (id !== undefined) fail(id, -32601, `unknown method ${method}`);
});
