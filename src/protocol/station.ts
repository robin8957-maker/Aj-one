import type { AgentRole, IsoDate, Json, RiskLevel } from "./index.ts";
import type { OperatingMode } from "./work.ts";

export type ContextKind =
  | "file"
  | "folder"
  | "image"
  | "screenshot"
  | "url"
  | "git"
  | "terminal"
  | "browser"
  | "artifact"
  | "decision"
  | "schema"
  | "logs"
  | "issue"
  | "mcp"
  | "symbol"
  | "agent"
  | "mission"
  | "memory"
  | "database";

export interface ContextObject {
  contextId: string;
  kind: ContextKind;
  title: string;
  ref: string;
  preview: string;
  trusted: boolean;
  tainted?: boolean;
  origin?: "user" | "browser" | "webhook" | "mcp" | "agent";
  trustScore?: number;
  trustOrigin?: "user" | "repo" | "browser" | "webhook" | "mcp" | "agent";
  createdAt: IsoDate;
}

export type ChatRole = "user" | "commander" | "agent" | "system";

export interface ChatMessage {
  messageId: string;
  role: ChatRole;
  author: string;
  text: string;
  contextIds: string[];
  command?: string;
  mentions?: string[];
  specId?: string;
  planId?: string;
  missionId?: string;
  createdAt: IsoDate;
}

export interface SpecDocument {
  specId: string;
  missionId?: string;
  goal: string;
  requirements: { key: string; text: string; locked: boolean }[];
  assumptions: string[];
  affected: string[];
  apiChanges: string[];
  schemaChanges: string[];
  security: string[];
  testing: string[];
  rollback: string[];
  definitionOfDone: string[];
  risk: RiskLevel;
  status: "draft" | "ready" | "approved" | "rejected";
  createdAt: IsoDate;
}

export interface PlanStep {
  stepId: string;
  title: string;
  detail: string;
  role?: AgentRole;
  edited?: boolean;
}

export interface PlanDocument {
  planId: string;
  specId: string;
  version: number;
  steps: PlanStep[];
  crew: AgentRole[];
  estimatedMinutes: [number, number];
  estimatedUsd: [number, number];
  status: "proposed" | "approved" | "rejected" | "running" | "superseded";
  missionId?: string;
  createdAt: IsoDate;
}

export type ComputerKind = "local" | "sandbox";
export type ComputerTemplate = "local" | "node-fullstack" | "python" | "blank";

export interface ComputerRecord {
  computerId: string;
  name: string;
  kind: ComputerKind;
  template: ComputerTemplate;
  path: string;
  status: "ready" | "running" | "paused" | "destroyed" | "unavailable";
  missionId?: string;
  agentId?: string;
  parentId?: string;
  note: string;
  createdAt: IsoDate;
}

export interface ComputerSnapshotRecord {
  snapshotId: string;
  computerId: string;
  title: string;
  path: string;
  createdAt: IsoDate;
}

export interface TerminalSession {
  sessionId: string;
  computerId: string;
  title: string;
  cwd: string;
  owner: "user" | "agent";
  running: boolean;
  lastCommand?: string;
  output: string;
  exitCode?: number | null;
  ptyId?: string;
  pendingPrompt?: "confirm" | "secret" | "tui" | null;
  interactive?: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export type GrantMode =
  | "deny"
  | "ask"
  | "allow-once"
  | "allow-task"
  | "allow-mission"
  | "allow-project"
  | "always";

export interface PermissionCell {
  capability: string;
  role: string;
  mode: GrantMode;
}

export interface PermissionPolicy {
  matrix: PermissionCell[];
  allowGlobs: string[];
  denyGlobs: string[];
  allowHosts: string[];
  denyHosts: string[];
}

export interface ArenaCandidate {
  label: string;
  computerId: string;
  approach: string;
  testsPassed: boolean;
  detail: string;
  costUsd: number;
}

export interface ArenaRun {
  arenaId: string;
  objective: string;
  status: "running" | "judged" | "failed";
  candidates: ArenaCandidate[];
  winner?: string;
  why: string;
  createdAt: IsoDate;
}

export interface MissionBranch {
  branchId: string;
  fromMissionId: string;
  missionId: string;
  title: string;
  createdAt: IsoDate;
}

export interface RedTeamFinding {
  id: string;
  severity: RiskLevel;
  title: string;
  evidence: string;
  attack: string;
}

export interface RedTeamReport {
  reportId: string;
  missionId?: string;
  computerId?: string;
  findings: RedTeamFinding[];
  passed: boolean;
  createdAt: IsoDate;
}

export type AutonomyUx = "manual" | "assisted" | "autonomous" | "autopilot";
export type QualityMode = "fast" | "balanced" | "max" | "economy" | "private";

export interface SlashCommand {
  name: string;
  blurb: string;
  custom?: boolean;
}

export interface StationState {
  messages: ChatMessage[];
  contexts: Record<string, ContextObject>;
  specs: Record<string, SpecDocument>;
  plans: Record<string, PlanDocument>;
  computers: Record<string, ComputerRecord>;
  snapshots: Record<string, ComputerSnapshotRecord>;
  terminals: Record<string, TerminalSession>;
  policy: PermissionPolicy;
  arenas: Record<string, ArenaRun>;
  branches: Record<string, MissionBranch>;
  redteams: RedTeamReport[];
  autonomy: AutonomyUx;
  quality: QualityMode;
  commands: SlashCommand[];
  operatingMode?: OperatingMode;
  activeRoomId?: string;
  locale?: "en" | "ar";
  theme?: "pearl-dark" | "pearl-light";
  localOnly?: boolean;
  policyDryRun?: boolean;
  lastDryRun?: {
    objective: string;
    steps: { role: string; tool: string; decision: string; reason: string }[];
    wouldExecute: number;
    wouldDeny: number;
    claim: string;
    hints?: { capability: string; role: string; mode: string; summary: string }[];
  };
  lastAuditPath?: string;
  live?: {
    agentTitle?: string;
    goal?: string;
    action?: string;
    reason?: string;
    paused?: boolean;
    screenshot?: string;
  };
}

export interface ComposerParse {
  text: string;
  command?: string;
  flags: Record<string, string | boolean>;
  mentions: { raw: string; kind: string; query: string }[];
}

export const DEFAULT_COMMANDS: SlashCommand[] = [
  { name: "plan", blurb: "Draft a plan without executing" },
  { name: "spec", blurb: "Generate a specification" },
  { name: "build", blurb: "Spec → plan → wait for approval" },
  { name: "fix", blurb: "Repair a failing surface" },
  { name: "debug", blurb: "Investigate a failure with evidence" },
  { name: "review", blurb: "Read-only review" },
  { name: "test", blurb: "Run contracted tests" },
  { name: "security", blurb: "Security audit mission" },
  { name: "research", blurb: "Research only — no writes" },
  { name: "architect", blurb: "Architecture decision first" },
  { name: "team", blurb: "Staff a crew for the request" },
  { name: "browser", blurb: "Open the browser workbench" },
  { name: "computer", blurb: "Give the agent a sandbox computer" },
  { name: "terminal", blurb: "Run a command in the selected computer" },
  { name: "run", blurb: "Execute the approved plan" },
  { name: "deploy", blurb: "No production target — refused" },
  { name: "rollback", blurb: "Restore the latest snapshot" },
  { name: "checkpoint", blurb: "Snapshot filesystem + git-like tree" },
  { name: "memory", blurb: "Inspect memory health" },
  { name: "decisions", blurb: "Inspect accepted decisions" },
  { name: "artifacts", blurb: "List artifacts" },
  { name: "agents", blurb: "List the live fleet" },
  { name: "automate", blurb: "Fire a matching automation" },
  { name: "arena", blurb: "Solve with isolated parallel candidates" },
  { name: "redteam", blurb: "Adversarial verification" },
  { name: "fork", blurb: "Fork the current computer" },
  { name: "work", blurb: "Open a live WORK room instead of autonomous ONE" },
];

export const DEFAULT_POLICY: PermissionPolicy = {
  matrix: [
    { capability: "files.read", role: "commander", mode: "always" },
    { capability: "files.write", role: "commander", mode: "deny" },
    { capability: "files.write", role: "backend-engineer", mode: "allow-mission" },
    { capability: "files.write", role: "frontend-engineer", mode: "allow-mission" },
    { capability: "terminal", role: "backend-engineer", mode: "allow-mission" },
    { capability: "terminal", role: "test-engineer", mode: "allow-mission" },
    { capability: "browser", role: "browser-verifier", mode: "allow-mission" },
    { capability: "browser", role: "frontend-engineer", mode: "allow-task" },
    { capability: "internet", role: "commander", mode: "deny" },
    { capability: "secrets", role: "security-reviewer", mode: "allow-task" },
    { capability: "git.commit", role: "backend-engineer", mode: "allow-mission" },
    { capability: "git.push", role: "commander", mode: "ask" },
    { capability: "deploy", role: "commander", mode: "ask" },
    { capability: "spawn", role: "commander", mode: "always" },
    { capability: "files.write", role: "acp", mode: "deny" },
    { capability: "terminal", role: "acp", mode: "deny" },
  ],
  allowGlobs: ["src/**", "tests/**", "web/**", "docs/**"],
  denyGlobs: [".env", "infra/**", "production/**", "data/**"],
  allowHosts: ["npmjs.com", "github.com", "registry.npmjs.org"],
  denyHosts: [],
};

export function emptyStation(): StationState {
  return {
    messages: [],
    contexts: {},
    specs: {},
    plans: {},
    computers: {},
    snapshots: {},
    terminals: {},
    policy: DEFAULT_POLICY,
    arenas: {},
    branches: {},
    redteams: [],
    autonomy: "assisted",
    quality: "balanced",
    commands: DEFAULT_COMMANDS,
    operatingMode: "one",
    locale: "en",
    theme: "pearl-dark",
    localOnly: false,
  };
}

export function parseComposer(raw: string): ComposerParse {
  const text = raw.trim();
  const flags: Record<string, string | boolean> = {};
  const mentions: ComposerParse["mentions"] = [];
  let command: string | undefined;
  let body = text;
  const cmd = /^\/([a-z][\w-]*)\s*(.*)$/is.exec(text);
  if (cmd) {
    command = cmd[1]!.toLowerCase();
    body = cmd[2] ?? "";
  }
  body = body.replace(/--([a-z]+)(?:=(\S+))?/gi, (_, k: string, v?: string) => {
    flags[k.toLowerCase()] = v ?? true;
    return "";
  });
  const cleaned = body.replace(/@([a-z][\w-]*)(?:[/:]([^\s]+))?/gi, (full, kind: string, query?: string) => {
    mentions.push({ raw: full, kind: kind.toLowerCase(), query: query ?? "" });
    return full;
  });
  return { text: cleaned.trim(), command, flags, mentions };
}
