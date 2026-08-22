import { createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { AgentInstance, AgentRole, McpServerRecord } from "../protocol/index.ts";

export interface McpCallResult {
  ok: boolean;
  tool: string;
  serverId: string;
  text?: string;
  reason?: string;
}

interface LiveServer {
  record: McpServerRecord;
  child?: ChildProcessWithoutNullStreams;
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>;
  nextId: number;
  buffer: string;
}

const live = new Map<string, LiveServer>();

export function defaultMcpCommand(): string {
  return join(process.cwd(), "services", "mcp", "northstar-mcp.mjs");
}

export function pinTools(tools: { name: string; description: string }[]): string {
  const canon = [...tools]
    .map((t) => `${t.name}\n${t.description ?? ""}`)
    .sort()
    .join("\n--\n");
  return createHash("sha256").update(canon).digest("hex");
}

export function applyToolPin(
  record: McpServerRecord,
  tools: { name: string; description: string }[],
): McpServerRecord {
  const hash = pinTools(tools);
  if (!record.pinnedHash) {
    return { ...record, tools, pinnedHash: hash, pinStatus: "pinned", status: "ready" };
  }
  if (record.pinnedHash !== hash) {
    return {
      ...record,
      tools,
      pinStatus: "drift",
      status: "drift",
      lastError: "MCP tool definition drift — rug-pull refused",
    };
  }
  return { ...record, tools, pinStatus: "pinned", status: "ready" };
}

export function seedMcpRecord(): McpServerRecord {
  return {
    serverId: "mcp_northstar",
    name: "northstar-mcp",
    command: defaultMcpCommand(),
    status: "registered",
    tools: [],
    allowRoles: ["researcher", "security-reviewer", "commander", "architecture-lead"],
    allowAgents: [],
    pinStatus: "unpinned",
  };
}

export async function startMcpServer(record: McpServerRecord, env: NodeJS.ProcessEnv = process.env): Promise<McpServerRecord> {
  if (live.get(record.serverId)?.child) return live.get(record.serverId)!.record;
  const child = spawn(process.execPath, [record.command], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...env },
  });
  const session: LiveServer = {
    record: { ...record, status: "registered" },
    child,
    pending: new Map(),
    nextId: 1,
    buffer: "",
  };
  live.set(record.serverId, session);
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    session.buffer += chunk;
    let idx;
    while ((idx = session.buffer.indexOf("\n")) >= 0) {
      const line = session.buffer.slice(0, idx);
      session.buffer = session.buffer.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as { id?: number; result?: unknown; error?: { message: string } };
        if (msg.id == null) continue;
        const wait = session.pending.get(msg.id);
        if (!wait) continue;
        clearTimeout(wait.timer);
        session.pending.delete(msg.id);
        if (msg.error) wait.reject(new Error(msg.error.message));
        else wait.resolve(msg.result);
      } catch {
        // ignore malformed
      }
    }
  });
  child.on("exit", () => {
    session.record.status = "stopped";
    for (const wait of session.pending.values()) {
      clearTimeout(wait.timer);
      wait.reject(new Error("MCP server exited"));
    }
    session.pending.clear();
    session.child = undefined;
  });

  try {
    await rpc(session, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "aj-mcp-gateway", version: "1.0.0" },
    });
    notify(session, "notifications/initialized", {});
    const listed = (await rpc(session, "tools/list", {})) as { tools?: { name: string; description: string }[] };
    session.record = applyToolPin(session.record, listed.tools ?? []);
  } catch (err) {
    session.record.status = "error";
    session.record.lastError = err instanceof Error ? err.message : "init failed";
  }
  return session.record;
}

export async function invokeMcp(opts: {
  record: McpServerRecord;
  agent: AgentInstance;
  tool: string;
  args?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<McpCallResult> {
  const allowed =
    opts.record.allowAgents.includes(opts.agent.agentId) ||
    opts.record.allowRoles.includes(opts.agent.role as AgentRole);
  if (!allowed) {
    return { ok: false, tool: opts.tool, serverId: opts.record.serverId, reason: "agent not on MCP allowlist" };
  }
  if (opts.record.pinStatus === "drift" || opts.record.status === "drift") {
    return { ok: false, tool: opts.tool, serverId: opts.record.serverId, reason: "MCP pin drift — invoke refused" };
  }
  const known = opts.record.tools.some((t) => t.name === opts.tool);
  if (opts.record.tools.length && !known) {
    return { ok: false, tool: opts.tool, serverId: opts.record.serverId, reason: "unknown MCP tool — fail closed" };
  }
  const session = live.get(opts.record.serverId);
  if (!session?.child) {
    return { ok: false, tool: opts.tool, serverId: opts.record.serverId, reason: "MCP server not running" };
  }
  try {
    const res = (await rpc(session, "tools/call", { name: opts.tool, arguments: opts.args ?? {} }, opts.timeoutMs ?? 8000)) as {
      content?: { type: string; text?: string }[];
    };
    const text = res.content?.map((c) => c.text ?? "").join("\n") ?? JSON.stringify(res);
    return { ok: true, tool: opts.tool, serverId: opts.record.serverId, text };
  } catch (err) {
    return {
      ok: false,
      tool: opts.tool,
      serverId: opts.record.serverId,
      reason: err instanceof Error ? err.message : "mcp call failed",
    };
  }
}

export function stopMcp(serverId: string): void {
  const session = live.get(serverId);
  session?.child?.kill("SIGTERM");
  live.delete(serverId);
}

function rpc(session: LiveServer, method: string, params: unknown, timeoutMs = 8000): Promise<unknown> {
  if (!session.child) return Promise.reject(new Error("no process"));
  const id = session.nextId++;
  session.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.pending.delete(id);
      reject(new Error(`MCP timeout ${method}`));
    }, timeoutMs);
    session.pending.set(id, { resolve, reject, timer });
  });
}

function notify(session: LiveServer, method: string, params: unknown): void {
  session.child?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

export function invokeMcpOnce(opts: {
  record: McpServerRecord;
  agent: Pick<AgentInstance, "agentId" | "role">;
  tool?: string;
  args?: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): McpCallResult {
  const allowed =
    opts.record.allowAgents.includes(opts.agent.agentId) ||
    opts.record.allowRoles.includes(opts.agent.role as AgentRole);
  if (!allowed) {
    return {
      ok: false,
      tool: opts.tool ?? "discover",
      serverId: opts.record.serverId,
      reason: "agent not on MCP allowlist",
    };
  }
  if (opts.tool && opts.record.tools.length && !opts.record.tools.some((t) => t.name === opts.tool)) {
    return {
      ok: false,
      tool: opts.tool,
      serverId: opts.record.serverId,
      reason: "unknown MCP tool — fail closed",
    };
  }
  const caller = join(process.cwd(), "services", "mcp", "call-once.mjs");
  const mode = opts.tool ? "call" : "list";
  const args = [caller, opts.record.command, mode];
  if (opts.tool) {
    args.push(opts.tool, JSON.stringify(opts.args ?? {}));
  }
  const res = spawnSync(process.execPath, args, {
    encoding: "utf8",
    timeout: opts.timeoutMs ?? 12_000,
    env: { ...process.env, ...opts.env },
  });
  const line = (res.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .at(-1);
  if (!line) {
    return {
      ok: false,
      tool: opts.tool ?? "discover",
      serverId: opts.record.serverId,
      reason: res.stderr?.slice(0, 240) || "MCP runner produced no output",
    };
  }
  try {
    const parsed = JSON.parse(line) as {
      ok?: boolean;
      reason?: string;
      tools?: { name: string; description: string }[];
      result?: { content?: { type: string; text?: string }[] };
    };
    if (!parsed.ok) {
      return {
        ok: false,
        tool: opts.tool ?? "discover",
        serverId: opts.record.serverId,
        reason: parsed.reason ?? "mcp failed",
      };
    }
    if (mode === "list") {
      const next = applyToolPin(opts.record, parsed.tools ?? []);
      Object.assign(opts.record, next);
      if (next.pinStatus === "drift") {
        return { ok: false, tool: "tools/list", serverId: opts.record.serverId, reason: next.lastError };
      }
      return {
        ok: true,
        tool: "tools/list",
        serverId: opts.record.serverId,
        text: JSON.stringify(opts.record.tools),
      };
    }
    const text =
      parsed.result?.content?.map((c) => c.text ?? "").join("\n") ?? JSON.stringify(parsed.result);
    return { ok: true, tool: opts.tool ?? "call", serverId: opts.record.serverId, text };
  } catch {
    return {
      ok: false,
      tool: opts.tool ?? "discover",
      serverId: opts.record.serverId,
      reason: "invalid MCP runner payload",
    };
  }
}

