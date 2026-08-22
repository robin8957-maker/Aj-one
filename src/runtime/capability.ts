import { AJ_ERR } from "./errors.ts";
import type { ToolName } from "./policy.ts";

export type CapabilityName =
  | "FILE_READ"
  | "FILE_WRITE"
  | "TERMINAL_EXEC"
  | "NETWORK"
  | "GIT"
  | "BROWSER"
  | "SECRET_READ"
  | "SECRET_USE"
  | "MODEL_CALL";

export interface CapabilityToken {
  tokenId: string;
  missionId: string;
  agentId: string;
  capability: CapabilityName;
  paths: string[];
  commands: string[];
  issuedAt: number;
  expiresAt: number;
  revoked: boolean;
}

const TOOL_CAP: Record<ToolName, CapabilityName> = {
  "fs.read": "FILE_READ",
  "fs.list": "FILE_READ",
  "knowledge.scan": "FILE_READ",
  "fs.write": "FILE_WRITE",
  "term.exec": "TERMINAL_EXEC",
  "test.run": "TERMINAL_EXEC",
  "git.worktree": "GIT",
  "git.merge": "GIT",
  "browser.navigate": "BROWSER",
  "browser.snapshot": "BROWSER",
  "browser.click": "BROWSER",
  "browser.type": "BROWSER",
  "browser.scroll": "BROWSER",
  "browser.screenshot": "BROWSER",
  "mcp.call": "NETWORK",
  "mcp.invoke": "NETWORK",
  "mcp.discover": "NETWORK",
  "secret.read": "SECRET_READ",
  "secret.request": "SECRET_USE",
  "secret.revoke": "SECRET_READ",
  "net.fetch": "NETWORK",
  "rewind.self": "GIT",
};

export function capabilityForTool(tool: ToolName): CapabilityName {
  return TOOL_CAP[tool];
}

export function mintCapability(input: {
  missionId: string;
  agentId: string;
  capability: CapabilityName;
  paths?: string[];
  commands?: string[];
  ttlMs?: number;
}): CapabilityToken {
  const now = Date.now();
  return {
    tokenId: `cap-${input.agentId}-${input.capability}`,
    missionId: input.missionId,
    agentId: input.agentId,
    capability: input.capability,
    paths: input.paths ?? [],
    commands: input.commands ?? [],
    issuedAt: now,
    expiresAt: now + (input.ttlMs ?? 30 * 60_000),
    revoked: false,
  };
}

export function authorizeCapability(
  token: CapabilityToken | undefined,
  need: CapabilityName,
  now = Date.now(),
): { ok: true } | { ok: false; code: string; reason: string } {
  if (!token) return { ok: false, code: AJ_ERR.POLICY_DENIED, reason: "no capability token" };
  if (token.revoked) return { ok: false, code: AJ_ERR.POLICY_DENIED, reason: "capability revoked" };
  if (now > token.expiresAt) return { ok: false, code: AJ_ERR.CAPABILITY_EXPIRED, reason: "capability expired" };
  if (token.capability !== need) return { ok: false, code: AJ_ERR.POLICY_DENIED, reason: `need ${need}` };
  return { ok: true };
}

export function defaultCapsForRole(role: string): CapabilityName[] {
  if (role === "final-verifier" || role === "red-team") return ["FILE_READ", "TERMINAL_EXEC"];
  if (role.includes("engineer") || role === "debugger") return ["FILE_READ", "FILE_WRITE", "TERMINAL_EXEC", "GIT"];
  if (role === "browser-verifier") return ["FILE_READ", "BROWSER"];
  if (role === "security-reviewer") return ["FILE_READ", "SECRET_USE"];
  if (role === "commander") return ["FILE_READ", "MODEL_CALL"];
  return ["FILE_READ"];
}
