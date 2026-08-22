import type { AgentInstance, AgentPermissions, AgentRole, RiskLevel } from "../protocol/index.ts";
import { ROLE_AUTONOMY } from "../protocol/index.ts";

export type ToolName =
  | "fs.read"
  | "fs.write"
  | "fs.list"
  | "term.exec"
  | "git.worktree"
  | "git.merge"
  | "test.run"
  | "knowledge.scan"
  | "browser.navigate"
  | "browser.snapshot"
  | "browser.click"
  | "browser.type"
  | "browser.scroll"
  | "browser.screenshot"
  | "mcp.call"
  | "mcp.invoke"
  | "mcp.discover"
  | "secret.read"
  | "secret.request"
  | "secret.revoke"
  | "net.fetch"
  | "rewind.self";

const TOOL_RISK: Record<ToolName, RiskLevel> = {
  "fs.read": "low",
  "fs.list": "low",
  "knowledge.scan": "low",
  "fs.write": "medium",
  "term.exec": "high",
  "test.run": "medium",
  "git.worktree": "medium",
  "git.merge": "high",
  "browser.navigate": "medium",
  "browser.snapshot": "low",
  "browser.click": "medium",
  "browser.type": "medium",
  "browser.scroll": "low",
  "browser.screenshot": "low",
  "mcp.call": "high",
  "mcp.invoke": "high",
  "mcp.discover": "medium",
  "secret.read": "critical",
  "secret.request": "high",
  "secret.revoke": "critical",
  "net.fetch": "high",
  "rewind.self": "high",
};

export function toolRisk(tool: ToolName): RiskLevel {
  return TOOL_RISK[tool];
}

export function authorizeTool(
  agent: AgentInstance,
  tool: ToolName,
): { ok: true } | { ok: false; reason: string } {
  const p = agent.permissions;
  switch (tool) {
    case "fs.read":
    case "fs.list":
    case "knowledge.scan":
      if (p.filesystem === "none") return { ok: false, reason: "filesystem denied" };
      return { ok: true };
    case "fs.write":
      if (p.filesystem !== "scoped-write" && p.filesystem !== "write") {
        return { ok: false, reason: "write not in contract" };
      }
      return { ok: true };
    case "term.exec":
    case "test.run":
      if (p.terminal === "none") return { ok: false, reason: "terminal denied" };
      return { ok: true };
    case "git.worktree":
      if (p.git === "none") return { ok: false, reason: "git denied" };
      return { ok: true };
    case "git.merge":
      if (p.git !== "merge") return { ok: false, reason: "merge not granted — coordinator only" };
      return { ok: true };
    case "browser.navigate":
    case "browser.snapshot":
    case "browser.screenshot":
    case "browser.scroll":
      if (p.browser === "none") return { ok: false, reason: "browser denied" };
      return { ok: true };
    case "browser.click":
    case "browser.type":
      if (p.browser !== "interact") return { ok: false, reason: "browser interact not granted" };
      return { ok: true };
    case "mcp.call":
      return { ok: false, reason: "raw MCP is denied — use mcp.invoke through the MCP gateway" };
    case "mcp.invoke":
    case "mcp.discover":
      if (p.filesystem === "none" && p.network === "none") {
        return { ok: false, reason: "MCP gateway denied — no filesystem or network grant" };
      }
      return { ok: true };
    case "secret.request":
      return { ok: true };
    case "secret.read":
      if (p.secrets !== "broker") return { ok: false, reason: "secrets broker denied" };
      return { ok: true };
    case "secret.revoke":
      if (agent.role !== "commander") return { ok: false, reason: "only commander may revoke secrets" };
      return { ok: true };
    case "net.fetch":
      if (p.network === "none") return { ok: false, reason: "network denied" };
      return { ok: true };
    case "rewind.self":
      if (agent.role === "researcher" && p.filesystem !== "write") {
        return { ok: false, reason: "external/ACP agent cannot rewind the mission" };
      }
      if (agent.autonomy < 40) return { ok: false, reason: "autonomy too low to rewind" };
      if (!["commander", "debugger", "architecture-lead", "backend-engineer"].includes(agent.role)) {
        return { ok: false, reason: "role cannot rewind.self" };
      }
      return { ok: true };
    default:
      return { ok: false, reason: "unknown tool — fail closed" };
  }
}

export function clampChildPermissions(
  parent: AgentPermissions,
  requested: AgentPermissions,
): AgentPermissions {
  const fsRank = { none: 0, read: 1, "scoped-write": 2, write: 3 } as const;
  const termRank = { none: 0, sandbox: 1, host: 2 } as const;
  const netRank = { none: 0, "approved-only": 1, internet: 2 } as const;
  const gitRank = { none: 0, worktree: 1, merge: 2 } as const;
  const pick = <T extends string>(a: T, b: T, rank: Record<string, number>): T =>
    rank[a] <= rank[b] ? a : b;
  return {
    filesystem: pick(requested.filesystem, parent.filesystem, fsRank),
    terminal: pick(requested.terminal, parent.terminal, termRank),
    browser: requested.browser === "interact" && parent.browser !== "interact" ? parent.browser : requested.browser === "none" || parent.browser === "none" ? "none" : requested.browser,
    network: pick(requested.network, parent.network, netRank),
    git: pick(requested.git, parent.git, gitRank),
    secrets: parent.secrets === "broker" ? requested.secrets : "none",
    spawnAgents: Boolean(requested.spawnAgents && parent.spawnAgents),
    maxChildAutonomy: Math.min(requested.maxChildAutonomy, parent.maxChildAutonomy),
  };
}

export function autonomyFor(role: AgentRole): number {
  return ROLE_AUTONOMY[role];
}

export function unknownToolDenied(name: string): { ok: false; reason: string } {
  return { ok: false, reason: `unknown tool '${name}' — fail closed` };
}
