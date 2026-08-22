import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, openSync, writeSync, fsyncSync, closeSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type AjEvent,
  type WorldSnapshot,
  emptyWorld,
  type AgentInstance,
  type Mission,
  type AgentContract,
  type ArtifactRecord,
  type EvidenceRecord,
  type DecisionRecord,
  type MemoryRecord,
  type KnowledgeCard,
  type WorktreeRecord,
  type ApprovalRecord,
  type Requirement,
  type TaskNode,
  type KnowledgeGraph,
  type SemanticConflictRecord,
  type AutomationRecord,
  type McpServerRecord,
  type ExternalAgentRecord,
  type ModelRouteRecord,
  type SecretMeta,
  type IngressRecord,
  type AgentPerformanceProfile,
  type ModelPerformanceProfile,
  type ExecutionPlacement,
} from "../protocol/index.ts";

export function dataRoot(): string {
  return process.env.AJ_DATA_DIR || join(process.cwd(), "data", "ajd");
}

export function operatorDir(operatorId: string): string {
  const safe = operatorId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return join(dataRoot(), safe);
}

export function ledgerPath(operatorId: string): string {
  return join(operatorDir(operatorId), "ledger.jsonl");
}

export function snapshotPath(operatorId: string): string {
  return join(operatorDir(operatorId), "snapshot.json");
}

export function ensureOperatorDir(operatorId: string): string {
  const dir = operatorDir(operatorId);
  mkdirSync(join(dir, "artifacts"), { recursive: true });
  mkdirSync(join(dir, "worktrees"), { recursive: true });
  mkdirSync(join(dir, "checkpoints"), { recursive: true });
  return dir;
}

function writeAtomic(path: string, data: string): void {
  const tmp = `${path}.tmp.${process.pid}`;
  const fd = openSync(tmp, "w", 0o600);
  try {
    writeSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}

import { ipcAppend } from "../runtime/ledger-ipc.ts";

export function appendEvent(operatorId: string, event: AjEvent): void {
  ensureOperatorDir(operatorId);
  const path = ledgerPath(operatorId);
  const line = `${JSON.stringify(event)}\n`;
  const fd = openSync(path, "a", 0o600);
  try {
    writeSync(fd, line);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  ipcAppend(path, line);
}

export function readLedger(operatorId: string): AjEvent[] {
  const path = ledgerPath(operatorId);
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const events: AjEvent[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as AjEvent);
    } catch {
      // Truncated/corrupt line is skipped — reconstruction stays idempotent.
    }
  }
  return events;
}

export function writeSnapshot(world: WorldSnapshot): void {
  ensureOperatorDir(world.operatorId);
  writeAtomic(snapshotPath(world.operatorId), JSON.stringify(world));
}

export function readSnapshot(operatorId: string): WorldSnapshot | null {
  const path = snapshotPath(operatorId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as WorldSnapshot;
  } catch {
    return null;
  }
}

export function listOperators(): string[] {
  const root = dataRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function asRecord<T>(value: unknown): T {
  return value as T;
}

function missionOf(world: WorldSnapshot, event: AjEvent): Mission | undefined {
  return event.missionId ? world.missions[event.missionId] : undefined;
}

export function applyEvent(world: WorldSnapshot, event: AjEvent): WorldSnapshot {
  world.seq = Math.max(world.seq, event.seq);
  world.events.push(event);
  const p = event.payload;
  switch (event.type) {
    case "MissionCreated": {
      const mission = asRecord<Mission>(p.mission);
      world.missions[mission.missionId] = mission;
      break;
    }
    case "RequirementAdded": {
      const mission = missionOf(world, event);
      if (mission && p.requirement) mission.requirements.push(asRecord<Requirement>(p.requirement));
      break;
    }
    case "RequirementUpdated": {
      const mission = missionOf(world, event);
      const id = String(p.requirementId ?? "");
      const req = mission?.requirements.find((r) => r.requirementId === id);
      if (req && p.patch && typeof p.patch === "object") Object.assign(req, p.patch);
      break;
    }
    case "PlanCreated": {
      const mission = missionOf(world, event);
      if (mission) {
        mission.state = "PLANNING";
        if (p.summary) mission.planSummary = String(p.summary);
        mission.updatedAt = event.at;
      }
      break;
    }
    case "PlanApproved": {
      const mission = missionOf(world, event);
      if (mission) {
        mission.state = "RUNNING";
        mission.updatedAt = event.at;
      }
      break;
    }
    case "TaskGraphMutated": {
      const mission = missionOf(world, event);
      if (mission && Array.isArray(p.tasks)) mission.tasks = p.tasks as unknown as TaskNode[];
      break;
    }
    case "AgentSpawned": {
      const agent = asRecord<AgentInstance>(p.agent);
      world.agents[agent.agentId] = agent;
      if (agent.role === "commander" && world.missions[agent.missionId]) {
        world.missions[agent.missionId].commanderId = agent.agentId;
      }
      break;
    }
    case "AgentStarted":
    case "AgentStateChanged":
    case "AgentCancelled":
    case "AgentReplaced": {
      const agent = event.agentId ? world.agents[event.agentId] : undefined;
      if (agent && p.state) {
        agent.state = p.state as AgentInstance["state"];
        agent.updatedAt = event.at;
      }
      break;
    }
    case "AgentHeartbeat": {
      const agent = event.agentId ? world.agents[event.agentId] : undefined;
      if (agent && p.heartbeat) {
        agent.heartbeat = asRecord<AgentInstance["heartbeat"]>(p.heartbeat);
        agent.lastHeartbeatAt = event.at;
      }
      break;
    }
    case "ContractCreated":
    case "ContractMutated": {
      const contract = asRecord<AgentContract>(p.contract);
      world.contracts[contract.contractId] = contract;
      break;
    }
    case "DecisionCreated": {
      const d = asRecord<DecisionRecord>(p.decision);
      world.decisions[d.decisionId] = d;
      break;
    }
    case "DecisionSuperseded": {
      const id = String(p.decisionId ?? "");
      const rec = world.decisions[id];
      if (rec) {
        rec.status = "superseded";
        if (p.supersededBy) rec.supersededBy = String(p.supersededBy);
      }
      break;
    }
    case "MemoryCreated": {
      const mem = asRecord<MemoryRecord>(p.memory);
      world.memories[mem.memoryId] = mem;
      break;
    }
    case "MemoryUpdated": {
      const id = String(p.memoryId ?? "");
      const mem = world.memories[id];
      if (mem && p.patch && typeof p.patch === "object") {
        Object.assign(mem, p.patch);
        mem.updatedAt = event.at;
      }
      break;
    }
    case "KnowledgeCardCreated": {
      const card = asRecord<KnowledgeCard>(p.card);
      world.knowledge[card.cardId] = card;
      break;
    }
    case "WorktreeCreated": {
      const wt = asRecord<WorktreeRecord>(p.worktree);
      world.worktrees[wt.worktreeId] = wt;
      const agent = world.agents[wt.agentId];
      if (agent) agent.worktreeId = wt.worktreeId;
      break;
    }
    case "WorktreeMerged": {
      const id = String(p.worktreeId ?? "");
      const wt = world.worktrees[id];
      if (wt) {
        wt.mergeStatus = (p.mergeStatus as WorktreeRecord["mergeStatus"]) ?? wt.mergeStatus;
        if (Array.isArray(p.changedFiles)) wt.changedFiles = p.changedFiles as string[];
      }
      break;
    }
    case "ApprovalRequested": {
      const approval = asRecord<ApprovalRecord>(p.approval);
      world.approvals[approval.approvalId] = approval;
      break;
    }
    case "ApprovalResolved": {
      const id = String(p.approvalId ?? "");
      const approval = world.approvals[id];
      if (approval) {
        approval.status = p.status as ApprovalRecord["status"];
        approval.resolvedAt = event.at;
      }
      break;
    }
    case "BudgetAllocated":
    case "BudgetConsumed": {
      const agent = event.agentId ? world.agents[event.agentId] : undefined;
      if (agent && p.budget) Object.assign(agent.budget, p.budget);
      const mission = missionOf(world, event);
      if (mission && p.missionBudget) Object.assign(mission.budget, p.missionBudget);
      break;
    }
    case "ArtifactCreated": {
      if (p.artifact) {
        const art = asRecord<ArtifactRecord>(p.artifact);
        world.artifacts[art.artifactId] = art;
        const agent = art.agentId ? world.agents[art.agentId] : undefined;
        if (agent && !agent.artifacts.includes(art.artifactId)) agent.artifacts.push(art.artifactId);
      }
      if (p.evidence) {
        const evd = asRecord<EvidenceRecord>(p.evidence);
        world.evidence[evd.evidenceId] = evd;
      }
      break;
    }
    case "FailureRecorded": {
      const agent = event.agentId ? world.agents[event.agentId] : undefined;
      if (agent && p.failureId) agent.failures.push(String(p.failureId));
      break;
    }
    case "VerificationStarted": {
      const mission = missionOf(world, event);
      if (mission) {
        mission.state = "VERIFYING";
        mission.updatedAt = event.at;
      }
      break;
    }
    case "VerificationFinished": {
      const mission = missionOf(world, event);
      if (mission) {
        mission.verification = {
          result: (typeof p.result === "string" ? p.result : "PARTIAL") as NonNullable<Mission["verification"]>["result"],
          summary: String(p.summary ?? ""),
          at: event.at,
        };
        mission.updatedAt = event.at;
      }
      break;
    }
    case "MissionPaused": {
      const mission = missionOf(world, event);
      if (mission) {
        mission.state = "PAUSED";
        mission.updatedAt = event.at;
      }
      break;
    }
    case "MissionResumed": {
      const mission = missionOf(world, event);
      if (mission) {
        mission.state = "RUNNING";
        mission.updatedAt = event.at;
      }
      break;
    }
    case "MissionBlocked": {
      const mission = missionOf(world, event);
      if (mission) {
        mission.state = "BLOCKED";
        mission.updatedAt = event.at;
      }
      break;
    }
    case "MissionCompleted": {
      const mission = missionOf(world, event);
      if (mission) {
        mission.state = "COMPLETE";
        mission.completedAt = event.at;
        mission.updatedAt = event.at;
        if (p.result && mission.verification) mission.verification.result = p.result as NonNullable<Mission["verification"]>["result"];
      }
      break;
    }
    case "MissionFailed": {
      const mission = missionOf(world, event);
      if (mission) {
        mission.state = "FAILED";
        mission.updatedAt = event.at;
        mission.completedAt = event.at;
      }
      break;
    }
    case "MissionCancelled": {
      const mission = missionOf(world, event);
      if (mission) {
        mission.state = "CANCELLED";
        mission.updatedAt = event.at;
      }
      break;
    }
    case "SteerReceived": {
      break;
    }
    case "GraphRebuilt": {
      if (p.graph) world.graph = asRecord<KnowledgeGraph>(p.graph);
      break;
    }
    case "SemanticConflict": {
      world.semanticConflicts = world.semanticConflicts ?? [];
      if (p.conflict) world.semanticConflicts.push(asRecord<SemanticConflictRecord>(p.conflict));
      break;
    }
    case "McpServerRegistered": {
      world.mcpServers = world.mcpServers ?? {};
      if (p.server) {
        const rec = asRecord<McpServerRecord>(p.server);
        world.mcpServers[rec.serverId] = rec;
      }
      break;
    }
    case "McpToolCalled":
    case "McpToolDenied":
    case "BrowserAction":
    case "DecisionConflict":
      break;
    case "AutomationRegistered": {
      world.automations = world.automations ?? {};
      if (p.automation) {
        const auto = asRecord<AutomationRecord>(p.automation);
        world.automations[auto.automationId] = auto;
      }
      break;
    }
    case "AutomationFired": {
      world.automations = world.automations ?? {};
      const id = String(p.automationId ?? "");
      const auto = world.automations[id];
      if (auto) {
        auto.runs += 1;
        auto.lastRunAt = event.at;
        auto.lastMissionId = String(p.missionId ?? event.missionId ?? "");
      }
      break;
    }
    case "ExternalAgentRegistered": {
      world.externalAgents = world.externalAgents ?? {};
      if (p.agent) {
        const rec = asRecord<ExternalAgentRecord>(p.agent);
        world.externalAgents[rec.externalId] = rec;
      }
      break;
    }
    case "ModelRouted": {
      world.modelRoutes = world.modelRoutes ?? [];
      if (p.route) world.modelRoutes.push(asRecord<ModelRouteRecord>(p.route));
      break;
    }
    case "SecretPut":
    case "SecretLeased":
    case "SecretDenied":
    case "SecretRevoked": {
      world.secretMeta = world.secretMeta ?? {};
      if (p.meta) {
        const meta = asRecord<SecretMeta>(p.meta);
        world.secretMeta[meta.secretId] = meta;
      }
      break;
    }
    case "IngressReceived":
    case "IngressAccepted":
    case "IngressDenied":
    case "IngressDuplicate": {
      world.ingress = world.ingress ?? [];
      world.ingressDeliveries = world.ingressDeliveries ?? {};
      if (p.ingress) {
        const rec = asRecord<IngressRecord>(p.ingress);
        world.ingress.push(rec);
        if (rec.accepted && rec.deliveryId) {
          world.ingressDeliveries[rec.deliveryId] = {
            at: rec.at,
            ingressId: rec.ingressId,
            missionId: rec.missionId,
          };
        }
      }
      break;
    }
    case "ReputationUpdated": {
      world.performance = world.performance ?? { agents: {}, models: {} };
      const key = String(p.key ?? "");
      if (p.kind === "agent" && p.profile && key) {
        const profile = asRecord<AgentPerformanceProfile>(p.profile);
        world.performance.agents[key] = profile;
        world.reputation[profile.role] = {
          success: profile.successRate,
          fail: 1 - profile.successRate,
          retries: profile.avgRetries,
          cost: profile.avgCost,
        };
      }
      if (p.kind === "model" && p.profile && key) {
        world.performance.models[key] = asRecord<ModelPerformanceProfile>(p.profile);
      }
      break;
    }
    case "WorkerRouted": {
      const agentId = String(p.agentId ?? event.agentId ?? "");
      const agent = agentId ? world.agents[agentId] : undefined;
      if (agent && p.provider) agent.model = String(p.provider);
      break;
    }
    case "WorkerStarted": {
      const agentId = String(p.agentId ?? event.agentId ?? "");
      const agent = agentId ? world.agents[agentId] : undefined;
      if (agent) {
        agent.state = "RUNNING";
        agent.updatedAt = event.at;
      }
      break;
    }
    case "WorkerCompleted":
    case "WorkerExecuted": {
      const agentId = String(p.agentId ?? event.agentId ?? "");
      const agent = agentId ? world.agents[agentId] : undefined;
      if (agent) {
        agent.state = p.ok ? "COMPLETE" : "FAILED";
        agent.updatedAt = event.at;
      }
      break;
    }
    case "WorkerFailed": {
      const agentId = String(p.agentId ?? event.agentId ?? "");
      const agent = agentId ? world.agents[agentId] : undefined;
      if (agent) {
        agent.state = "FAILED";
        agent.failures.push(String(p.reason ?? p.error ?? "worker_failure"));
        agent.updatedAt = event.at;
      }
      break;
    }
    case "ChangeProofWritten": {
      const mission = missionOf(world, event);
      if (mission && p.verifierResult) {
        mission.verification = {
          result: p.verifierResult === "ok" ? "PASS" : "FAIL",
          summary: `ChangeProof verifierResult=${p.verifierResult}`,
          at: event.at,
        };
        mission.updatedAt = event.at;
      }
      break;
    }
    case "EnvironmentRouted": {
      world.placements = world.placements ?? {};
      const missionId = String(event.missionId ?? p.missionId ?? "");
      if (missionId && p.placement) {
        world.placements[missionId] = asRecord<ExecutionPlacement>(p.placement);
      }
      break;
    }
    case "SecretRotated": {
      world.secretMeta = world.secretMeta ?? {};
      break;
    }
    case "ExternalAgentHeartbeat":
    case "ExternalAgentCompleted": {
      const id = String(p.externalId ?? "");
      const rec = id ? world.externalAgents?.[id] : undefined;
      if (rec) {
        rec.session = {
          ...(rec.session ?? { status: "idle" }),
          status: (p.status as NonNullable<typeof rec.session>["status"]) ?? rec.session?.status ?? "running",
          lastHeartbeatAt: event.at,
          toolsUsed: Array.isArray(p.toolsUsed) ? (p.toolsUsed as string[]) : rec.session?.toolsUsed,
          toolsDenied: Array.isArray(p.toolsDenied) ? (p.toolsDenied as string[]) : rec.session?.toolsDenied,
          artifactSummary: p.summary ? String(p.summary) : rec.session?.artifactSummary,
        };
      }
      break;
    }
    case "StationMutated":
    case "ChatPosted":
    case "ContextAttached":
    case "SpecCreated":
    case "PlanReviewed":
    case "ComputerCreated":
    case "ComputerSnapshot":
    case "ComputerForked":
    case "TerminalExecuted":
    case "PermissionChanged":
    case "ArenaStarted":
    case "ArenaJudged":
    case "MissionBranched":
    case "RedTeamFinished":
    case "SourceWritten": {
      if (p.station && typeof p.station === "object") {
        world.station = asRecord(p.station);
      }
      break;
    }
    case "WorkRoomOpened":
    case "WorkRoundAdvanced":
    case "WorkProposalCreated":
    case "WorkMessagePosted":
    case "WorkConstraintLocked":
    case "WorkExperimentRan":
    case "WorkDecisionFrozen":
    case "WorkModeChanged": {
      world.rooms = world.rooms ?? {};
      if (p.room && typeof p.room === "object") {
        const room = asRecord<import("../protocol/work.ts").WorkRoom>(p.room);
        world.rooms[room.roomId] = room;
      }
      if (p.rooms && typeof p.rooms === "object") {
        world.rooms = asRecord(p.rooms);
      }
      if (p.station && typeof p.station === "object") {
        world.station = asRecord(p.station);
      }
      break;
    }
    case "ConnectionUpdated": {
      world.connections = world.connections ?? {};
      if (p.connections && typeof p.connections === "object") {
        world.connections = asRecord(p.connections);
      }
      break;
    }
    case "RewindBranched": {
      const mission = missionOf(world, event);
      if (mission) {
        mission.rewindCount = Number(p.rewindCount ?? (mission.rewindCount ?? 0));
        if (p.hint) mission.rewindHint = String(p.hint);
        mission.pruned = mission.pruned ?? [];
        if (p.branch && typeof p.branch === "object") {
          mission.pruned.push(asRecord(p.branch));
        }
        mission.state = "RUNNING";
        for (const t of mission.tasks) {
          if (t.state === "FAILED" || t.state === "RUNNING") t.state = "READY";
        }
        mission.updatedAt = event.at;
      }
      if (event.agentId && world.agents[event.agentId]) {
        world.agents[event.agentId]!.state = "PREPARING";
        world.agents[event.agentId]!.updatedAt = event.at;
      }
      break;
    }
    case "RewindEscalated": {
      const mission = missionOf(world, event);
      if (mission) {
        mission.state = "WAITING_APPROVAL";
        mission.updatedAt = event.at;
      }
      break;
    }
    default:
      break;
  }
  return world;
}

export function healLedger(operatorId: string): { kept: number; dropped: number } {
  const events = readLedger(operatorId);
  const seen = new Set<string>();
  const kept: AjEvent[] = [];
  let dropped = 0;
  for (const ev of events) {
    if (!ev?.eventId || seen.has(ev.eventId)) {
      dropped += 1;
      continue;
    }
    seen.add(ev.eventId);
    kept.push(ev);
  }
  const path = ledgerPath(operatorId);
  const body = kept.map((e) => JSON.stringify(e)).join("\n") + (kept.length ? "\n" : "");
  const tmp = `${path}.heal`;
  const fd = openSync(tmp, "w", 0o600);
  try {
    writeSync(fd, body);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
  return { kept: kept.length, dropped };
}

export function reconstruct(operatorId: string): WorldSnapshot {
  const snap = readSnapshot(operatorId);
  const events = readLedger(operatorId);
  const seedMissing = (world: WorldSnapshot): WorldSnapshot => {
    world.performance = world.performance ?? { agents: {}, models: {} };
    world.ingressDeliveries = world.ingressDeliveries ?? {};
    world.placements = world.placements ?? {};
    world.ingress = world.ingress ?? [];
    world.secretMeta = world.secretMeta ?? {};
    return world;
  };
  if (snap) {
    const world: WorldSnapshot = seedMissing({
      ...snap,
      events: [...snap.events],
    });
    for (const ev of events) {
      if (ev.seq > snap.seq) applyEvent(world, ev);
    }
    return world;
  }
  const world = emptyWorld(operatorId);
  for (const ev of events) applyEvent(world, ev);
  const healed = seedMissing(world);
  if (events.length) writeSnapshot(healed);
  return healed;
}

export function writeArtifactFile(operatorId: string, artifactId: string, content: string): string {
  const dir = join(operatorDir(operatorId), "artifacts");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${artifactId}.md`);
  writeFileSync(path, content, "utf8");
  return path;
}

export function writeCheckpoint(operatorId: string, missionId: string, world: WorldSnapshot): string {
  const dir = join(operatorDir(operatorId), "checkpoints");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${missionId}_${Date.now()}.json`);
  writeFileSync(path, JSON.stringify({ at: new Date().toISOString(), seq: world.seq, missionId }), "utf8");
  return path;
}

export function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}
