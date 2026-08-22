import { DEFAULT_PERMISSIONS, type AgentPermissions, type AgentRole } from "../protocol/index.ts";
import { authorizeTool, type ToolName } from "./policy.ts";
import type { PermissionPolicy } from "../protocol/station.ts";

export interface DryRunStep {
  role: string;
  tool: ToolName;
  decision: "would-allow" | "would-deny";
  reason: string;
}

export interface PolicyHint {
  capability: string;
  role: string;
  mode: "allow-task" | "allow-mission";
  summary: string;
}

export interface DryRunReport {
  objective: string;
  steps: DryRunStep[];
  wouldExecute: number;
  wouldDeny: number;
  claim: string;
  hints: PolicyHint[];
}

const ACP_PERMS: AgentPermissions = {
  filesystem: "read",
  terminal: "none",
  browser: "none",
  network: "none",
  git: "none",
  secrets: "none",
  spawnAgents: false,
  maxChildAutonomy: 0,
};

const WALK: Array<{ role: string; tool: ToolName; perms: AgentPermissions }> = [
  { role: "commander", tool: "knowledge.scan", perms: DEFAULT_PERMISSIONS.commander },
  { role: "architecture-lead", tool: "fs.read", perms: DEFAULT_PERMISSIONS["architecture-lead"] },
  { role: "backend-engineer", tool: "fs.read", perms: DEFAULT_PERMISSIONS["backend-engineer"] },
  { role: "backend-engineer", tool: "fs.write", perms: DEFAULT_PERMISSIONS["backend-engineer"] },
  { role: "backend-engineer", tool: "term.exec", perms: DEFAULT_PERMISSIONS["backend-engineer"] },
  { role: "test-engineer", tool: "test.run", perms: DEFAULT_PERMISSIONS["test-engineer"] },
  { role: "browser-verifier", tool: "browser.screenshot", perms: DEFAULT_PERMISSIONS["browser-verifier"] },
  { role: "final-verifier", tool: "test.run", perms: DEFAULT_PERMISSIONS["final-verifier"] },
  { role: "acp-worker", tool: "fs.write", perms: ACP_PERMS },
  { role: "acp-worker", tool: "secret.read", perms: ACP_PERMS },
  { role: "acp-worker", tool: "net.fetch", perms: ACP_PERMS },
  { role: "acp-worker", tool: "rewind.self", perms: ACP_PERMS },
];

export function whatWouldAllow(step: DryRunStep): PolicyHint | null {
  if (step.decision !== "would-deny") return null;
  const capability = step.tool.startsWith("fs.")
    ? "files.write"
    : step.tool.startsWith("secret")
      ? "secrets"
      : step.tool.startsWith("net")
        ? "internet"
        : step.tool.startsWith("term")
          ? "terminal"
          : step.tool;
  return {
    capability,
    role: step.role,
    mode: "allow-mission",
    summary: `Set ${step.role} / ${capability} → allow-mission (still cannot certify).`,
  };
}

export function policyDryRun(objective: string, _policy?: PermissionPolicy): DryRunReport {
  void _policy;
  const steps: DryRunStep[] = WALK.map(({ role, tool, perms }) => {
    const dummy = {
      agentId: `dry_${role}`,
      role: (role === "acp-worker" ? "researcher" : role) as AgentRole,
      missionId: "dry",
      permissions: perms,
    };
    const authz = authorizeTool(dummy as never, tool);
    return {
      role,
      tool,
      decision: authz.ok ? "would-allow" : "would-deny",
      reason: authz.ok ? "contract allows" : authz.reason,
    };
  });
  return {
    objective,
    steps,
    wouldExecute: steps.filter((s) => s.decision === "would-allow").length,
    wouldDeny: steps.filter((s) => s.decision === "would-deny").length,
    claim: "Nothing executed. This is what policy would have allowed or refused.",
    hints: steps.map(whatWouldAllow).filter((h): h is PolicyHint => Boolean(h)),
  };
}
