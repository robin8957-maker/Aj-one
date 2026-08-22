export * from "./station.ts";
export * from "./work.ts";
export * from "./connections.ts";
import type { StationState } from "./station.ts";
import { emptyStation } from "./station.ts";
import type { WorkRoom } from "./work.ts";
import type { ConnectionRecord } from "./connections.ts";

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type IsoDate = string;

export type AgentState =
  | "CREATED"
  | "PREPARING"
  | "RUNNING"
  | "WAITING"
  | "BLOCKED"
  | "PAUSED"
  | "FAILED"
  | "CANCELLED"
  | "VERIFYING"
  | "COMPLETE";

export type MissionState =
  | "CREATED"
  | "PLANNING"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "PAUSED"
  | "VERIFYING"
  | "BLOCKED"
  | "FAILED"
  | "CANCELLED"
  | "COMPLETE";

export type TaskState =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "BLOCKED"
  | "FAILED"
  | "CANCELLED"
  | "VERIFYING"
  | "COMPLETE";

export type AgentRole =
  | "commander"
  | "architecture-lead"
  | "researcher"
  | "dependency-analyst"
  | "engineering-lead"
  | "backend-engineer"
  | "frontend-engineer"
  | "database-engineer"
  | "qa-lead"
  | "test-engineer"
  | "browser-verifier"
  | "security-reviewer"
  | "debugger"
  | "final-verifier"
  | "experiment-engineer"
  | "devil-advocate"
  | "performance-engineer"
  | "red-team";

export type ArtifactKind =
  | "requirement"
  | "research"
  | "architecture"
  | "decision"
  | "plan"
  | "diff"
  | "test"
  | "security"
  | "browser"
  | "performance"
  | "failure"
  | "verification"
  | "release"
  | "change-report"
  | "knowledge-card"
  | "preview";

export type MemoryClass =
  | "working"
  | "session"
  | "episodic"
  | "semantic"
  | "procedural"
  | "decision"
  | "failure"
  | "preference"
  | "project"
  | "organization";

export type MemoryHealth =
  | "healthy"
  | "stale"
  | "contradictory"
  | "low-confidence"
  | "unverified"
  | "superseded";

export type MemoryKind =
  | "incident"
  | "observation"
  | "hypothesis"
  | "verified-fact"
  | "decision"
  | "preference";

export type ApprovalStatus = "pending" | "denied" | "allow-once" | "allow-mission";

export type VerificationResult = "PASS" | "FAIL" | "PARTIAL" | "BLOCKED";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type EventType =
  | "MissionCreated"
  | "RequirementAdded"
  | "RequirementUpdated"
  | "PlanCreated"
  | "PlanApproved"
  | "TaskGraphMutated"
  | "AgentSpawned"
  | "AgentStarted"
  | "AgentStateChanged"
  | "AgentHeartbeat"
  | "AgentCancelled"
  | "AgentReplaced"
  | "ContractCreated"
  | "ContractMutated"
  | "ToolRequested"
  | "ToolDenied"
  | "ToolExecuted"
  | "DecisionCreated"
  | "DecisionSuperseded"
  | "MemoryCreated"
  | "MemoryUpdated"
  | "KnowledgeCardCreated"
  | "CheckpointCreated"
  | "WorktreeCreated"
  | "WorktreeMerged"
  | "SemanticConflict"
  | "ApprovalRequested"
  | "ApprovalResolved"
  | "BudgetAllocated"
  | "BudgetConsumed"
  | "StrategyChanged"
  | "FailureRecorded"
  | "RecoveryStarted"
  | "VerificationStarted"
  | "VerificationFinished"
  | "ArtifactCreated"
  | "SteerReceived"
  | "MissionPaused"
  | "MissionResumed"
  | "MissionBlocked"
  | "MissionCompleted"
  | "MissionFailed"
  | "MissionCancelled"
  | "GraphRebuilt"
  | "BrowserAction"
  | "McpServerRegistered"
  | "McpToolDenied"
  | "McpToolCalled"
  | "AutomationFired"
  | "AutomationRegistered"
  | "ExternalAgentRegistered"
  | "DecisionConflict"
  | "ModelRouted"
  | "SecretPut"
  | "SecretLeased"
  | "SecretDenied"
  | "SecretRevoked"
  | "IngressReceived"
  | "IngressAccepted"
  | "IngressDenied"
  | "ExternalAgentHeartbeat"
  | "ExternalAgentCompleted"
  | "ReputationUpdated"
  | "WorkerRouted"
  | "EnvironmentRouted"
  | "SecretRotated"
  | "IngressDuplicate"
  | "ChatPosted"
  | "ContextAttached"
  | "SpecCreated"
  | "PlanReviewed"
  | "StationMutated"
  | "ComputerCreated"
  | "ComputerSnapshot"
  | "ComputerForked"
  | "TerminalExecuted"
  | "PermissionChanged"
  | "ArenaStarted"
  | "ArenaJudged"
  | "MissionBranched"
  | "RedTeamFinished"
  | "SourceWritten"
  | "WorkRoomOpened"
  | "WorkRoundAdvanced"
  | "WorkProposalCreated"
  | "WorkMessagePosted"
  | "WorkConstraintLocked"
  | "WorkExperimentRan"
  | "WorkDecisionFrozen"
  | "WorkModeChanged"
  | "ConnectionUpdated"
  | "BudgetExhausted"
  | "BudgetNegotiationRequested"
  | "BudgetRenegotiated"
  | "BudgetNegotiationDenied"
  | "ResolutionStarted"
  | "ResolutionExhausted"
  | "MicrovmDestroyed"
  | "VectorIndexed"
  | "ToolDryRun"
  | "AuditExported"
  | "FailureClassed"
  | "MissionRewound"
  | "ForensicWritten"
  | "AuditSigned"
  | "WorkspaceIndexed"
  | "WorkspaceContextInjected"
  | "RewindSelfRequested"
  | "BranchPruned"
  | "RewindBranched"
  | "RewindSelfDenied"
  | "RewindEscalated"
  | "SwarmSpawned"
  | "SwarmBallot"
  | "ConsensusReached"
  | "ConsensusDenied"
  | "ResolutionSessionOpened"
  | "MercenaryInvoked"
  | "MercenaryDenied"
  | "ChaosRecovered"
  | "WatchdogProposed"
  | "WatchdogApplied"
  | "WatchdogDenied"
  | "OverlayInvoked"
  | "VisualInspected"
  | "TopologyRead"
  | "WorkerStarted"
  | "WorkerExecuted"
  | "WorkerCompleted"
  | "WorkerFailed"
  | "ChangeProofWritten";

export interface AgentBudget {
  tokens: number;
  tokensUsed: number;
  moneyUsd: number;
  moneyUsed: number;
  timeMs: number;
  timeUsedMs: number;
  toolCalls: number;
  toolCallsUsed: number;
  retries: number;
  retriesUsed: number;
  browserActions: number;
  browserActionsUsed: number;
}

export interface AgentPermissions {
  filesystem: "none" | "read" | "scoped-write" | "write";
  terminal: "none" | "sandbox" | "host";
  browser: "none" | "observe" | "interact";
  network: "none" | "approved-only" | "internet";
  git: "none" | "worktree" | "merge";
  secrets: "none" | "broker";
  spawnAgents: boolean;
  maxChildAutonomy: number;
}

export interface AgentContract {
  contractId: string;
  agentId: string;
  role: AgentRole;
  objective: string;
  allowedScope: string[];
  forbiddenScope: string[];
  inputs: string[];
  deliverables: string[];
  definitionOfDone: string[];
  budget: AgentBudget;
  permissions: AgentPermissions;
  createdAt: IsoDate;
  mutatedAt?: IsoDate;
}

export interface AgentHeartbeat {
  at: IsoDate;
  currentTaskId?: string;
  currentTool?: string;
  progress: number;
  resourceUse: { cpu: number; ramMb: number };
  note?: string;
}

export interface AgentInstance {
  agentId: string;
  missionId: string;
  parentAgentId: string | null;
  role: AgentRole;
  title: string;
  objective: string;
  contractId: string;
  capabilities: string[];
  permissions: AgentPermissions;
  model: string;
  contextIds: string[];
  memoryScope: string;
  worktreeId?: string;
  executionEnvironment: "local" | "sandbox" | "remote" | "cloud";
  budget: AgentBudget;
  state: AgentState;
  artifacts: string[];
  failures: string[];
  heartbeat?: AgentHeartbeat;
  lastHeartbeatAt?: IsoDate;
  autonomy: number;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export interface Requirement {
  requirementId: string;
  key: string;
  text: string;
  mandatory: boolean;
  implementation?: string[];
  tests?: string[];
  evidence?: string[];
  status: "open" | "in-progress" | "implemented" | "verified" | "failed";
}

export interface TaskNode {
  taskId: string;
  missionId: string;
  title: string;
  description: string;
  role: AgentRole;
  assignedAgentId?: string;
  dependencies: string[];
  inputs: string[];
  outputs: string[];
  state: TaskState;
  priority: number;
  risk: RiskLevel;
  budgetTokens: number;
  playbook?: string;
  featureKey?: string;
  startedAt?: IsoDate;
  completedAt?: IsoDate;
}

export interface ArtifactRecord {
  artifactId: string;
  missionId: string;
  agentId?: string;
  kind: ArtifactKind;
  title: string;
  summary: string;
  path?: string;
  content?: string;
  version: number;
  createdAt: IsoDate;
}

export interface EvidenceRecord {
  evidenceId: string;
  missionId: string;
  requirementId?: string;
  claim: string;
  kind: "unit-test" | "integration-test" | "browser" | "http" | "console" | "static" | "security";
  passed: boolean;
  detail: string;
  path?: string;
  createdAt: IsoDate;
}

export interface DecisionRecord {
  decisionId: string;
  missionId: string;
  question: string;
  options: string[];
  choice: string;
  evidence: string[];
  confidence: number;
  author: string;
  approval?: ApprovalStatus;
  dependencies: string[];
  status: "proposed" | "accepted" | "superseded" | "rejected";
  supersededBy?: string;
  affects: string[];
  why: string;
  createdAt: IsoDate;
}

export interface MemoryRecord {
  memoryId: string;
  missionId?: string;
  klass: MemoryClass;
  kind: MemoryKind;
  title: string;
  body: string;
  source: string;
  evidence: string[];
  confidence: number;
  health: MemoryHealth;
  pinned: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  lastVerified?: IsoDate;
  subject?: string;
  polarity?: "positive" | "negative" | "neutral";
  ttlMs?: number;
  expiresAt?: IsoDate;
}

export interface KnowledgeCard {
  cardId: string;
  kind:
    | "ArchitectureDecision"
    | "Constraint"
    | "SecurityRule"
    | "KnownFailure"
    | "KnownSolution"
    | "DependencyFact"
    | "DomainConcept"
    | "CodingConvention"
    | "DeprecatedPattern"
    | "TeamPreference";
  title: string;
  body: string;
  source: string;
  evidence: string[];
  confidence: number;
  scope: string;
  status: "active" | "stale" | "superseded";
  createdAt: IsoDate;
  updatedAt: IsoDate;
  lastVerified?: IsoDate;
}

export interface WorktreeRecord {
  worktreeId: string;
  missionId: string;
  agentId: string;
  branch: string;
  path: string;
  baseRevision: string;
  changedFiles: string[];
  mergeStatus: "open" | "merging" | "merged" | "conflict" | "abandoned";
}

export interface ApprovalRecord {
  approvalId: string;
  missionId: string;
  agentId: string;
  action: string;
  arguments: Record<string, Json>;
  reason: string;
  affected: string[];
  risk: RiskLevel;
  status: ApprovalStatus;
  createdAt: IsoDate;
  resolvedAt?: IsoDate;
}

export interface WhyRecord {
  because: string[];
  sources: { kind: string; id: string; score: number; trust: number }[];
}

export interface AjEvent {
  eventId: string;
  seq: number;
  type: EventType;
  operatorId: string;
  missionId?: string;
  agentId?: string;
  at: IsoDate;
  payload: Record<string, Json>;
  why?: WhyRecord;
}

export interface MissionBudget {
  tokens: number;
  tokensUsed: number;
  moneyUsd: number;
  moneyUsed: number;
  timeMs: number;
  parallelAgents: number;
  extensionsGranted?: number;
}

export interface Mission {
  missionId: string;
  operatorId: string;
  title: string;
  objective: string;
  projectPath: string;
  state: MissionState;
  commanderId?: string;
  requirements: Requirement[];
  constraints: string[];
  planSummary?: string;
  tasks: TaskNode[];
  budget: MissionBudget;
  verification?: {
    result: VerificationResult;
    summary: string;
    at: IsoDate;
  };
  createdAt: IsoDate;
  updatedAt: IsoDate;
  completedAt?: IsoDate;
  mode?: "one" | "work";
  healAttempts?: number;
  parentMissionId?: string;
  rewindCount?: number;
  rewindHint?: string;
  pruned?: { branchId: string; fromSeq: number; toSeq: number; reason: string; at: string }[];
}

export interface GraphNode {
  id: string;
  kind: "file" | "symbol" | "module" | "decision" | "requirement";
  label: string;
  file?: string;
  exported?: boolean;
  line?: number;
  column?: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: "imports" | "exports" | "references" | "contains" | "affects";
}

export interface KnowledgeGraph {
  projectPath: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  diagnostics: { file: string; message: string; severity: "error" | "warning" }[];
  git: { file: string; recent: string[] }[];
  builtAt: IsoDate;
}

export interface SemanticConflictRecord {
  conflictId: string;
  missionId: string;
  verdict: "SAFE" | "CONFLICT" | "REVIEW";
  summary: string;
  symbols: string[];
  agents: string[];
  createdAt: IsoDate;
}

export interface AutomationRecord {
  automationId: string;
  trigger: "ci-failure" | "security-alert" | "schedule" | "dependency-update" | "manual";
  title: string;
  objective: string;
  enabled: boolean;
  permissionCeiling: number;
  budgetUsd: number;
  lastRunAt?: IsoDate;
  lastMissionId?: string;
  runs: number;
}

export interface McpServerRecord {
  serverId: string;
  name: string;
  command: string;
  status: "registered" | "ready" | "error" | "stopped" | "drift";
  tools: { name: string; description: string }[];
  allowRoles: AgentRole[];
  allowAgents: string[];
  lastError?: string;
  pinnedHash?: string;
  pinStatus?: "pinned" | "drift" | "unpinned";
}

export interface ExternalAgentRecord {
  externalId: string;
  kind: "native" | "acp" | "external" | "enterprise";
  name: string;
  requested: string[];
  granted: string[];
  status: "declared" | "granted" | "denied";
  session?: {
    status: "idle" | "running" | "complete" | "denied" | "error";
    lastHeartbeatAt?: IsoDate;
    toolsUsed?: string[];
    toolsDenied?: string[];
    artifactSummary?: string;
  };
}

export interface SecretScope {
  missions?: string[];
  agents?: string[];
  roles?: AgentRole[];
  tools?: string[];
}

export interface SecretMeta {
  secretId: string;
  name: string;
  status: "active" | "expired" | "revoked";
  scope: SecretScope;
  ttlMs: number;
  createdAt: IsoDate;
  expiresAt: IsoDate;
  revokedAt?: IsoDate;
  leaseCount: number;
  lastLeaseAt?: IsoDate;
}

export interface SecretLeaseMeta {
  leaseId: string;
  secretId: string;
  secretName: string;
  agentId: string;
  missionId: string;
  expiresAt: IsoDate;
  revokedAt?: IsoDate;
  redacted: string;
  useCount?: number;
  lastUsedAt?: IsoDate;
}

export interface IngressRecord {
  ingressId: string;
  source: string;
  event: string;
  accepted: boolean;
  reason: string;
  automationId?: string;
  missionId?: string;
  deliveryId?: string;
  at: IsoDate;
}

export interface AgentPerformanceProfile {
  profileId: string;
  role: AgentRole;
  taskDomain: string;
  language: string;
  successRate: number;
  firstPassSuccess: number;
  verifierRejectRate: number;
  avgRetries: number;
  avgLatencyMs: number;
  avgCost: number;
  rollbackRate: number;
  policyDenials: number;
  toolFailureRate: number;
  sampleSize: number;
  failureKinds?: Partial<Record<string, number>>;
  updatedAt: IsoDate;
}

export interface ModelPerformanceProfile {
  profileId: string;
  provider: string;
  capability: string;
  taskDomain: string;
  successRate: number;
  avgCost: number;
  avgLatencyMs: number;
  sampleSize: number;
  updatedAt: IsoDate;
}

export interface ExecutionPlacement {
  kind: "local" | "local-sandbox" | "remote" | "cloud";
  location: string;
  reason: string;
  intended: boolean;
}

export interface ModelRouteRecord {
  capability: string;
  provider: string;
  reason: string;
  at: IsoDate;
}

export interface WorldSnapshot {
  version: 1;
  operatorId: string;
  seq: number;
  missions: Record<string, Mission>;
  agents: Record<string, AgentInstance>;
  contracts: Record<string, AgentContract>;
  artifacts: Record<string, ArtifactRecord>;
  evidence: Record<string, EvidenceRecord>;
  decisions: Record<string, DecisionRecord>;
  memories: Record<string, MemoryRecord>;
  knowledge: Record<string, KnowledgeCard>;
  worktrees: Record<string, WorktreeRecord>;
  approvals: Record<string, ApprovalRecord>;
  events: AjEvent[];
  reputation: Record<string, { success: number; fail: number; retries: number; cost: number }>;
  performance?: {
    agents: Record<string, AgentPerformanceProfile>;
    models: Record<string, ModelPerformanceProfile>;
  };
  graph?: KnowledgeGraph;
  automations?: Record<string, AutomationRecord>;
  mcpServers?: Record<string, McpServerRecord>;
  externalAgents?: Record<string, ExternalAgentRecord>;
  semanticConflicts?: SemanticConflictRecord[];
  modelRoutes?: ModelRouteRecord[];
  secretMeta?: Record<string, SecretMeta>;
  ingress?: IngressRecord[];
  ingressDeliveries?: Record<string, { at: IsoDate; ingressId: string; missionId?: string }>;
  placements?: Record<string, ExecutionPlacement>;
  station?: StationState;
  rooms?: Record<string, WorkRoom>;
  connections?: Record<string, ConnectionRecord>;
  failureLedger?: { role: AgentRole; domain: string; kind: string; missionId?: string; detail: string; at: string }[];
}

export const HEARTBEAT_STALE_MS = 12_000;
export const PROTOCOL_VERSION = "1.0.0";

export const ROLE_AUTONOMY: Record<AgentRole, number> = {
  commander: 90,
  "architecture-lead": 70,
  "engineering-lead": 70,
  "qa-lead": 65,
  researcher: 50,
  "dependency-analyst": 45,
  "backend-engineer": 55,
  "frontend-engineer": 55,
  "database-engineer": 55,
  "test-engineer": 50,
  "browser-verifier": 40,
  "security-reviewer": 60,
  debugger: 55,
  "final-verifier": 40,
  "experiment-engineer": 45,
  "devil-advocate": 50,
  "performance-engineer": 50,
  "red-team": 45,
};

export const DEFAULT_PERMISSIONS: Record<AgentRole, AgentPermissions> = {
  commander: {
    filesystem: "read",
    terminal: "none",
    browser: "none",
    network: "none",
    git: "none",
    secrets: "none",
    spawnAgents: true,
    maxChildAutonomy: 70,
  },
  "architecture-lead": {
    filesystem: "read",
    terminal: "none",
    browser: "none",
    network: "none",
    git: "none",
    secrets: "none",
    spawnAgents: true,
    maxChildAutonomy: 55,
  },
  "engineering-lead": {
    filesystem: "read",
    terminal: "sandbox",
    browser: "none",
    network: "approved-only",
    git: "worktree",
    secrets: "none",
    spawnAgents: true,
    maxChildAutonomy: 55,
  },
  "qa-lead": {
    filesystem: "read",
    terminal: "sandbox",
    browser: "observe",
    network: "none",
    git: "none",
    secrets: "none",
    spawnAgents: true,
    maxChildAutonomy: 50,
  },
  researcher: {
    filesystem: "read",
    terminal: "none",
    browser: "none",
    network: "approved-only",
    git: "none",
    secrets: "none",
    spawnAgents: false,
    maxChildAutonomy: 0,
  },
  "dependency-analyst": {
    filesystem: "read",
    terminal: "none",
    browser: "none",
    network: "none",
    git: "none",
    secrets: "none",
    spawnAgents: false,
    maxChildAutonomy: 0,
  },
  "backend-engineer": {
    filesystem: "scoped-write",
    terminal: "sandbox",
    browser: "none",
    network: "approved-only",
    git: "worktree",
    secrets: "none",
    spawnAgents: false,
    maxChildAutonomy: 0,
  },
  "frontend-engineer": {
    filesystem: "scoped-write",
    terminal: "sandbox",
    browser: "interact",
    network: "approved-only",
    git: "worktree",
    secrets: "none",
    spawnAgents: false,
    maxChildAutonomy: 0,
  },
  "database-engineer": {
    filesystem: "scoped-write",
    terminal: "sandbox",
    browser: "none",
    network: "approved-only",
    git: "worktree",
    secrets: "none",
    spawnAgents: false,
    maxChildAutonomy: 0,
  },
  "test-engineer": {
    filesystem: "scoped-write",
    terminal: "sandbox",
    browser: "none",
    network: "none",
    git: "worktree",
    secrets: "none",
    spawnAgents: false,
    maxChildAutonomy: 0,
  },
  "browser-verifier": {
    filesystem: "read",
    terminal: "none",
    browser: "interact",
    network: "approved-only",
    git: "none",
    secrets: "none",
    spawnAgents: false,
    maxChildAutonomy: 0,
  },
  "security-reviewer": {
    filesystem: "read",
    terminal: "sandbox",
    browser: "none",
    network: "none",
    git: "none",
    secrets: "broker",
    spawnAgents: false,
    maxChildAutonomy: 0,
  },
  debugger: {
    filesystem: "read",
    terminal: "sandbox",
    browser: "none",
    network: "none",
    git: "worktree",
    secrets: "none",
    spawnAgents: false,
    maxChildAutonomy: 0,
  },
  "final-verifier": {
    filesystem: "read",
    terminal: "sandbox",
    browser: "observe",
    network: "none",
    git: "none",
    secrets: "none",
    spawnAgents: false,
    maxChildAutonomy: 0,
  },
  "experiment-engineer": {
    filesystem: "read",
    terminal: "sandbox",
    browser: "none",
    network: "none",
    git: "none",
    secrets: "none",
    spawnAgents: false,
    maxChildAutonomy: 0,
  },
  "devil-advocate": {
    filesystem: "read",
    terminal: "none",
    browser: "none",
    network: "none",
    git: "none",
    secrets: "none",
    spawnAgents: false,
    maxChildAutonomy: 0,
  },
  "performance-engineer": {
    filesystem: "read",
    terminal: "sandbox",
    browser: "none",
    network: "none",
    git: "none",
    secrets: "none",
    spawnAgents: false,
    maxChildAutonomy: 0,
  },
  "red-team": {
    filesystem: "read",
    terminal: "sandbox",
    browser: "observe",
    network: "none",
    git: "none",
    secrets: "none",
    spawnAgents: false,
    maxChildAutonomy: 0,
  },
};

export function emptyBudget(partial?: Partial<AgentBudget>): AgentBudget {
  return {
    tokens: 40_000,
    tokensUsed: 0,
    moneyUsd: 1.5,
    moneyUsed: 0,
    timeMs: 8 * 60_000,
    timeUsedMs: 0,
    toolCalls: 40,
    toolCallsUsed: 0,
    retries: 3,
    retriesUsed: 0,
    browserActions: 0,
    browserActionsUsed: 0,
    ...partial,
  };
}

export function emptyWorld(operatorId: string): WorldSnapshot {
  return {
    version: 1,
    operatorId,
    seq: 0,
    missions: {},
    agents: {},
    contracts: {},
    artifacts: {},
    evidence: {},
    decisions: {},
    memories: {},
    knowledge: {},
    worktrees: {},
    approvals: {},
    events: [],
    reputation: {},
    automations: {},
    mcpServers: {},
    externalAgents: {},
    semanticConflicts: [],
    modelRoutes: [],
    secretMeta: {},
    ingress: [],
    performance: { agents: {}, models: {} },
    ingressDeliveries: {},
    placements: {},
    station: emptyStation(),
    rooms: {},
    connections: {},
  };
}

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function nowIso(): IsoDate {
  return new Date().toISOString();
}

export function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

export function childMayAct(
  parent: Pick<AgentInstance, "autonomy" | "permissions">,
  child: Pick<AgentInstance, "autonomy" | "permissions">,
): { ok: true } | { ok: false; reason: string } {
  if (child.autonomy > parent.autonomy) {
    return { ok: false, reason: "child autonomy exceeds parent" };
  }
  if (child.autonomy > parent.permissions.maxChildAutonomy) {
    return { ok: false, reason: "child autonomy exceeds parent spawn ceiling" };
  }
  if (child.permissions.network === "internet" && parent.permissions.network !== "internet") {
    return { ok: false, reason: "child network exceeds parent" };
  }
  if (child.permissions.secrets === "broker" && parent.permissions.secrets !== "broker") {
    return { ok: false, reason: "child secrets exceed parent" };
  }
  return { ok: true };
}

export function missionProgress(mission: Mission): number {
  if (mission.state === "COMPLETE") return 100;
  if (mission.tasks.length === 0) return mission.state === "CREATED" ? 2 : 8;
  const weights: Record<TaskState, number> = {
    PENDING: 0,
    READY: 0.05,
    RUNNING: 0.45,
    BLOCKED: 0.2,
    FAILED: 0,
    CANCELLED: 0,
    VERIFYING: 0.8,
    COMPLETE: 1,
  };
  const sum = mission.tasks.reduce((s, t) => s + weights[t.state], 0);
  return Math.round((sum / mission.tasks.length) * 100);
}

export const MISSION_TEMPLATES: {
  id: string;
  title: string;
  objective: string;
  blurb: string;
}[] = [
  {
    id: "auth-race",
    title: "Fix authentication race",
    objective:
      "Fix the authentication race condition in the Northstar service so concurrent logins cannot issue two live sessions for the same user.",
    blurb: "Two engineers, isolated worktrees, independent verifier.",
  },
  {
    id: "health",
    title: "Add health endpoint",
    objective:
      "Add GET /health to the Northstar service that returns { ok: true, service: 'northstar' } and ship a failing-closed unit test.",
    blurb: "Minimum crew. Deterministic definition of done.",
  },
  {
    id: "rate-limit",
    title: "Add API rate limiter",
    objective:
      "Add a token-bucket rate limiter to the Northstar request path with per-identity burst control and tests for window exhaustion.",
    blurb: "Architect + backend + tester + verifier.",
  },
  {
    id: "audit",
    title: "Security audit",
    objective:
      "Run a security audit of the Northstar service. Produce a security artifact covering auth, secrets, and input trust. Do not modify production paths unless a critical finding requires a patch.",
    blurb: "Read-only crew. Evidence required for every claim.",
  },
  {
    id: "ui-login",
    title: "Fix login console",
    objective:
      "Fix the Northstar operator console login: the Sign in control must be enabled, named accessibly, and complete a login. Capture browser evidence.",
    blurb: "Frontend + browser verifier. Visual evidence required.",
  },
];
