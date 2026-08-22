import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type AgentContract,
  type AgentInstance,
  type AgentRole,
  type AjEvent,
  type ArtifactRecord,
  type DecisionRecord,
  type EventType,
  type KnowledgeCard,
  type MemoryRecord,
  type Mission,
  type Requirement,
  type TaskNode,
  type WhyRecord,
  type WorktreeRecord,
  type WorldSnapshot,
  DEFAULT_PERMISSIONS,
  HEARTBEAT_STALE_MS,
  emptyBudget,
  makeId,
  nowIso,
  toJson,
  ROLE_AUTONOMY,
} from "../protocol/index.ts";
import type { ConsoleView } from "./types.ts";
import {
  appendEvent,
  applyEvent,
  operatorDir,
  reconstruct,
  writeArtifactFile,
  writeCheckpoint,
  writeSnapshot,
} from "./store.ts";
import { resolveFeature, type FeatureSpec } from "../runtime/catalog.ts";
import { inspectRepository } from "../runtime/repository.ts";
import { planMission } from "../runtime/mission-planner.ts";
import { inspectUntrustedText } from "../runtime/instruction-boundary.ts";
import { readRepoFile } from "../runtime/repository.ts";
import { implementObjective } from "../runtime/coder.ts";
import {
  changedFiles,
  createWorktree,
  defaultProjectPath,
  mergeWorktree,
  readProjectFile,
  runNodeTest,
  scanKnowledge,
  writeScoped,
} from "../runtime/workspace.ts";
import { authorizeTool, type ToolName } from "../runtime/policy.ts";
import { buildKnowledgeGraph, contextForTask, impactAnalysis, renameImpact } from "../runtime/graph.ts";
import { ingestMemory } from "../runtime/memory.ts";
import { decisionAffects, detectDecisionConflict } from "../runtime/decisions.ts";
import { detectSemanticConflicts } from "../runtime/semantic.ts";
import { runBrowserScriptSync } from "../runtime/browser.ts";
import { invokeMcpOnce, seedMcpRecord } from "../runtime/mcp.ts";
import { defaultAutomations } from "../runtime/automations.ts";
import { seedExternalAgents } from "../runtime/external.ts";
import { routeModel, fleetFromConnections } from "../runtime/models.ts";
import { routePair } from "../runtime/engines.ts";
import { writeForensicReport } from "../runtime/forensics.ts";
import { DEFAULT_SWARM, mayCompleteMission, mayMerge, recordBallot, resolutionSession, tallyConsensus, type ConsensusMode, type SwarmBallot } from "../runtime/swarm.ts";
import { authorizeMercenaryFrame, mercenaryMay, receiveMercenaryPayload, type MercenaryFrame } from "../runtime/mercenary.ts";
import { getJailPool } from "../runtime/jail-pool.ts";
import { parseOverlayIntent } from "../runtime/overlay.ts";
import { detectBuildFailure, proposeWatchdogFix, applyWatchdogFix, type WatchdogProposal } from "../runtime/watchdog.ts";
import { resumeFromLedger, sweepOrphans } from "../runtime/chaos.ts";
import { rewindToSeq } from "../runtime/rewind.ts";
import {
  authorizeRewindSelf,
  MAX_SELF_REWINDS,
  missionCreatedSeq,
  restoreCheckpoint,
  rewindPrompt,
  saveCheckpoint,
} from "../runtime/rewind-self.ts";
import { scheduleWorkspaceIndex, snippetForEdit, getWorkspaceIndex } from "../runtime/indexer.ts";
import { buildTopology } from "../runtime/topology.ts";
import { visualInspect } from "../runtime/visual-inspect.ts";
import { budgetSystemNote, assessBudget } from "../runtime/economy.ts";
import { buildNegotiationRequest, evaluateNegotiation, sanitizeReason } from "../runtime/negotiate.ts";
import { rememberVector, searchSimilar } from "../runtime/vectors.ts";
import { policyDryRun } from "../runtime/dryrun.ts";
import { writeAuditBundle, AUDIT_CLAIM } from "../runtime/audit.ts";
import { computeGovernanceMetrics } from "../runtime/metrics.ts";
import { classifyFailure, shouldAvoidAgent } from "../runtime/failures.ts";
import { nextHealAction, MAX_SELF_HEALS } from "../runtime/heal.ts";
import { listSecretMeta, seedOperatorSecrets, leaseSecret, revokeSecret, rotateMasterKey, redactSecretsFromText, currentKeyId } from "../runtime/secrets.ts";
import { decideIngress, type IngressInput } from "../runtime/ingress.ts";
import { grantAcpRecord, runAcpSessionSync } from "../runtime/acp.ts";
import {
  applyAgentSample,
  applyModelSample,
  classifyTask,
  emptyAgentProfile,
  emptyModelProfile,
  modelKey,
  pickAgentProfile,
  pickModelProvider,
  profileKey,
  type Sample,
  type TaskClass,
} from "../runtime/reputation.ts";
import { environmentForRole, schedulePlacement } from "../runtime/environment.ts";
import type { ExecutionPlacement, IngressRecord, SecretMeta } from "../protocol/index.ts";
import {
  attachManual,
  collectProblems,
  commanderReply,
  createComputer,
  destroyComputer,
  detectServices,
  draftPlan,
  draftUnderstanding,
  encodeScreenshot,
  estimateCost,
  forkComputer,
  inboxOf,
  inspectCommand,
  listTree,
  message,
  openTerminal,
  pickComputer,
  playbookObjective,
  previewPermissions,
  readSourceFile,
  restoreSnapshot,
  runArena,
  runRedTeam,
  runTerminal,
  searchInTree,
  seedLocalComputer,
  setCell,
  shouldDraftSpec,
  snapshotComputer,
  stationOf,
  writeSource,
  resolveMention,
} from "../runtime/station.ts";
import { parseComposer } from "../protocol/station.ts";
import {
  applyConstraints,
  buildWhiteboard,
  compareProposals,
  crossExamine,
  decideRoom,
  designAuthExperiment,
  draftIndependentProposals,
  inferPreset,
  meetingArtifacts,
  nextRound,
  parseWorkSteer,
  planDiff,
  runRealExperiment,
  selectCouncil,
  synthesizeProposals,
  workBudget,
  workMessage,
} from "../runtime/work.ts";
import type { WorkConstraint, WorkPreset, WorkProposal, WorkRoom, WorkRoundKind } from "../protocol/work.ts";
import {
  connectVendor,
  disconnectVendor,
  refreshConnection,
  seedConnections,
} from "../runtime/connections.ts";
import type { ConnectionVendor } from "../protocol/connections.ts";

const STEP_MS = 520;
const ACTIVE: Mission["state"][] = ["CREATED", "PLANNING", "RUNNING", "VERIFYING"];

export type { ConsoleView };

export class AjDaemon {
  readonly daemonId = makeId("ajd");
  readonly startedAt = nowIso();
  readonly catalogRev = 25;
  private worlds = new Map<string, WorldSnapshot>();
  private due = new Map<string, number>();
  private fingerprints = new Map<string, string[]>();
  private features = new Map<string, FeatureSpec>();
  private missionRoute = new Map<
    string,
    { taskClass: TaskClass; placement: ExecutionPlacement; provider: string; why: string[] }
  >();

  load(operatorId: string): WorldSnapshot {
    let world = this.worlds.get(operatorId);
    if (!world) {
      world = reconstruct(operatorId);
      this.worlds.set(operatorId, world);
      this.ensureRuntimeServices(world);
      getJailPool().ensure();
      this.recoverInFlight(world);
    }
    return world;
  }

  private ensureRuntimeServices(world: WorldSnapshot): void {
    world.automations = world.automations ?? {};
    world.mcpServers = world.mcpServers ?? {};
    world.externalAgents = world.externalAgents ?? {};
    world.semanticConflicts = world.semanticConflicts ?? [];
    world.modelRoutes = world.modelRoutes ?? [];
    world.secretMeta = world.secretMeta ?? {};
    world.ingress = world.ingress ?? [];
    world.performance = world.performance ?? { agents: {}, models: {} };
    world.ingressDeliveries = world.ingressDeliveries ?? {};
    world.placements = world.placements ?? {};
    world.station = world.station ?? stationOf(world);
    world.rooms = world.rooms ?? {};
    world.connections = seedConnections(world.operatorId, world.connections);
    const st0 = stationOf(world);
    for (const rec of Object.values(world.connections)) {
      world.connections[rec.connectionId] = refreshConnection(world.operatorId, rec, Boolean(st0.localOnly));
    }
    seedLocalComputer(world, defaultProjectPath());
    scheduleWorkspaceIndex(pickComputer(world)?.path ?? defaultProjectPath());
    if (Object.keys(world.automations).length === 0) {
      for (const auto of defaultAutomations()) {
        this.emit(world, "AutomationRegistered", { automation: auto });
      }
    }
    if (Object.keys(world.mcpServers).length === 0) {
      this.emit(world, "McpServerRegistered", { server: seedMcpRecord() });
    }
    if (Object.keys(world.externalAgents).length === 0) {
      for (const agent of seedExternalAgents()) {
        this.emit(world, "ExternalAgentRegistered", { agent });
      }
    } else {
      for (const ext of Object.values(world.externalAgents)) {
        if (ext.kind === "acp" && (ext.status === "declared" || ext.granted.length === 0)) {
          const granted = grantAcpRecord(ext);
          this.emit(world, "ExternalAgentRegistered", { agent: granted });
        }
      }
    }
    for (const meta of seedOperatorSecrets(world.operatorId)) {
      this.emit(world, "SecretPut", { meta }, { why: { because: [`Broker stored ${meta.name} (value sealed).`], sources: [{ kind: "broker", id: meta.secretId, score: 1, trust: 1 }] } });
    }
    for (const meta of listSecretMeta(world.operatorId)) {
      world.secretMeta[meta.secretId] = meta;
    }
  }

  fireAutomation(operatorId: string, automationId: string): Mission | null {
    const world = this.load(operatorId);
    const auto = world.automations?.[automationId];
    if (!auto || !auto.enabled) return null;
    const mission = this.startMission(operatorId, auto.objective);
    this.emit(
      world,
      "AutomationFired",
      { automationId, missionId: mission.missionId, trigger: auto.trigger },
      {
        missionId: mission.missionId,
        why: {
          because: [`Automation '${auto.title}' fired on trigger ${auto.trigger}.`],
          sources: [{ kind: "automation", id: automationId, score: 1, trust: 1 }],
        },
      },
    );
    return mission;
  }

  ingestExternalEvent(operatorId: string, input: IngressInput): { accepted: boolean; reason: string; missionId?: string; ingress: IngressRecord } {
    const world = this.load(operatorId);
    const decision = decideIngress(operatorId, input, Object.values(world.automations ?? {}), {
      deliveries: world.ingressDeliveries ?? {},
      recent: world.ingress ?? [],
    });
    this.emit(
      world,
      "IngressReceived",
      { ingress: { ...decision.record, accepted: false, reason: decision.record.accepted ? "pending policy apply" : decision.record.reason } },
      {
        why: {
          because: [`External event '${input.event}' from ${input.source || "unknown"}.`],
          sources: [{ kind: "ingress", id: decision.record.ingressId, score: 1, trust: 0.5 }],
        },
      },
    );
    if (decision.duplicate) {
      this.emit(world, "IngressDuplicate", { ingress: decision.record, deliveryId: decision.record.deliveryId });
      return { accepted: false, reason: decision.record.reason, missionId: decision.record.missionId, ingress: decision.record };
    }
    if (!decision.record.accepted || !decision.automation) {
      this.emit(world, "IngressDenied", { ingress: decision.record });
      return { accepted: false, reason: decision.record.reason, ingress: decision.record };
    }
    const mission = this.fireAutomation(operatorId, decision.automation.automationId);
    const record: IngressRecord = {
      ...decision.record,
      missionId: mission?.missionId,
      accepted: Boolean(mission),
      reason: mission ? decision.record.reason : "automation failed to start",
    };
    this.emit(
      world,
      mission ? "IngressAccepted" : "IngressDenied",
      { ingress: record },
      {
        missionId: mission?.missionId,
        why: {
          because: [record.reason],
          sources: [{ kind: "ingress", id: record.ingressId, score: 1, trust: mission ? 1 : 0.2 }],
        },
      },
    );
    return { accepted: Boolean(mission), reason: record.reason, missionId: mission?.missionId, ingress: record };
  }

  rotateOperatorKey(operatorId: string): { keyId: string; resealed: number } {
    const world = this.load(operatorId);
    const result = rotateMasterKey(operatorId);
    this.emit(
      world,
      "SecretRotated",
      { keyId: result.keyId, resealed: result.resealed },
      {
        why: {
          because: [`Master key rotated. ${result.resealed} secrets re-sealed. Previous key file dropped.`],
          sources: [{ kind: "broker", id: result.keyId, score: 1, trust: 1 }],
        },
      },
    );
    return result;
  }

  revokeOperatorSecret(operatorId: string, secretId: string): SecretMeta | null {
    const world = this.load(operatorId);
    const meta = revokeSecret(operatorId, secretId);
    if (!meta) return null;
    this.emit(world, "SecretRevoked", { meta });
    return meta;
  }

  private persist(world: WorldSnapshot, event: AjEvent): void {
    appendEvent(world.operatorId, event);
    applyEvent(world, event);
    if (world.seq % 4 === 0) writeSnapshot(world);
    void import("../runtime/pg-mirror.ts")
      .then((m) => m.mirrorEvent(event))
      .catch(() => {});
  }

  emit(
    world: WorldSnapshot,
    type: EventType,
    payload: object,
    extra?: { missionId?: string; agentId?: string; why?: WhyRecord },
  ): AjEvent {
    const event: AjEvent = {
      eventId: makeId("evt"),
      seq: world.seq + 1,
      type,
      operatorId: world.operatorId,
      missionId: extra?.missionId,
      agentId: extra?.agentId,
      at: nowIso(),
      payload: toJson(payload) as Record<string, import("../protocol/index").Json>,
      why: extra?.why,
    };
    this.persist(world, event);
    return event;
  }

  private recoverInFlight(world: WorldSnapshot): void {
    for (const mission of Object.values(world.missions)) {
      if (!ACTIVE.includes(mission.state) && mission.state !== "WAITING_APPROVAL") continue;
      const feature = resolveFeature(mission.objective);
      this.features.set(mission.missionId, feature);
      for (const agent of Object.values(world.agents)) {
        if (agent.missionId !== mission.missionId) continue;
        if (agent.state === "RUNNING" || agent.state === "PREPARING") {
          this.emit(
            world,
            "RecoveryStarted",
            { reason: "daemon restart — restoring agent from ledger" },
            {
              missionId: mission.missionId,
              agentId: agent.agentId,
              why: {
                because: ["Daemon reconstructed mission from the event ledger."],
                sources: [{ kind: "ledger", id: String(world.seq), score: 1, trust: 1 }],
              },
            },
          );
        }
      }
      this.emit(
        world,
        "CheckpointCreated",
        { kind: "restart-recovery", seq: world.seq },
        { missionId: mission.missionId },
      );
    }
    writeSnapshot(world);
    sweepOrphans();
  }

  startMission(operatorId: string, objective: string, projectPath?: string): Mission {
    const world = this.load(operatorId);
    const feature = resolveFeature(objective);
    const missionId = makeId("msn");
    const project = projectPath || defaultProjectPath();
    const snapshot = inspectRepository(project);
    const injection = snapshot.files.slice(0, 30).some((f) => {
      const body = readRepoFile(project, f);
      return body ? !inspectUntrustedText(body, "REPOSITORY").allowed : false;
    });
    const plan = planMission(objective, snapshot, feature);
    const mission: Mission = {
      missionId,
      operatorId,
      title: titleFrom(objective),
      objective,
      projectPath: project,
      state: "CREATED",
      requirements: [],
      constraints: [
        "Child authority may not exceed parent.",
        "Implementation agents cannot certify the mission.",
        "Unknown tools fail closed.",
        "No merge onto primary without the merge coordinator.",
        `Repository snapshot ${snapshot.snapshotId} languages=${snapshot.languages.join(",") || "unknown"}.`,
        injection ? "UNTRUSTED repository text contained an injection pattern — treated as data, not policy." : "No injection pattern in scanned files.",
        plan.refused ? `Planner refused: ${plan.refused.reason}` : `Plan nodes: ${plan.nodes.map((n) => n.role).join(",")}`,
      ],
      tasks: [],
      budget: {
        tokens: 180_000,
        tokensUsed: 0,
        moneyUsd: 6,
        moneyUsed: 0,
        timeMs: 20 * 60_000,
        parallelAgents: 4,
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.features.set(missionId, feature);
    scheduleWorkspaceIndex(mission.projectPath);
    this.emit(
      world,
      "MissionCreated",
      { mission },
      {
        missionId,
        why: {
          because: [`Operator submitted intent: ${objective}`],
          sources: [{ kind: "user", id: operatorId, score: 1, trust: 1 }],
        },
      },
    );

    const commander = this.spawnAgent(world, {
      missionId,
      parentAgentId: null,
      role: "commander",
      title: "AJ Commander",
      objective: `Govern mission: ${objective}`,
      autonomy: ROLE_AUTONOMY.commander,
    });
    const stored = world.missions[missionId];
    if (stored) stored.commanderId = commander.agentId;
    this.due.set(missionId, Date.now() + 180);
    return world.missions[missionId]!;
  }

  private spawnAgent(
    world: WorldSnapshot,
    args: {
      missionId: string;
      parentAgentId: string | null;
      role: AgentRole;
      title: string;
      objective: string;
      autonomy: number;
    },
  ): AgentInstance {
    const mission = world.missions[args.missionId]!;
    const parent = args.parentAgentId ? world.agents[args.parentAgentId] : null;
    let autonomy = args.autonomy;
    if (parent && autonomy > parent.autonomy) autonomy = parent.autonomy;
    if (parent && autonomy > parent.permissions.maxChildAutonomy) {
      autonomy = parent.permissions.maxChildAutonomy;
    }
    const perms = { ...DEFAULT_PERMISSIONS[args.role] };
    if (parent && !parent.permissions.spawnAgents && args.role !== "commander") {
      throw new Error("parent may not spawn agents");
    }
    const agentId = makeId("agt");
    const contractId = makeId("ctr");
    const budget = emptyBudget({
      tokens: args.role === "commander" ? 60_000 : 28_000,
      moneyUsd: args.role === "commander" ? 1.8 : 0.9,
    });
    const contract: AgentContract = {
      contractId,
      agentId,
      role: args.role,
      objective: args.objective,
      allowedScope:
        args.role === "frontend-engineer" || args.role === "browser-verifier"
          ? ["web/**", "src/**", "docs/**"]
          : args.role === "backend-engineer" || args.role === "test-engineer"
            ? ["src/**", "tests/**", "docs/**"]
            : ["src/**", "docs/**", "README.md"],
      forbiddenScope: ["infra/**", "production/**", ".env", "data/**"],
      inputs: ["mission-objective", "project-knowledge"],
      deliverables: deliverablesFor(args.role),
      definitionOfDone: dodFor(args.role),
      budget,
      permissions: perms,
      createdAt: nowIso(),
    };
    const routed = this.missionRoute.get(args.missionId);
    const agent: AgentInstance = {
      agentId,
      missionId: args.missionId,
      parentAgentId: args.parentAgentId,
      role: args.role,
      title: args.title,
      objective: args.objective,
      contractId,
      capabilities: capabilitiesFor(args.role),
      permissions: perms,
      model: routed?.provider ?? (args.role === "commander" ? "aj-local" : "aj-local"),
      contextIds: [],
      memoryScope: `mission:${args.missionId}`,
      worktreeId: undefined,
      executionEnvironment: environmentForRole(
        args.role,
        routed?.placement ?? { kind: "local", location: "operator-host", reason: "default", intended: true },
      ),
      budget,
      state: "CREATED",
      artifacts: [],
      failures: [],
      autonomy,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.emit(
      world,
      "AgentSpawned",
      { agent },
      {
        missionId: args.missionId,
        agentId,
        why: {
          because: [
            parent
              ? `${parent.title} delegated ${args.role} under its authority ceiling.`
              : "Mission requires a Commander below user policy.",
            `Autonomy ${autonomy} ≤ parent ceiling.`,
          ],
          sources: [{ kind: "factory", id: args.role, score: 1, trust: 1 }],
        },
      },
    );
    this.emit(world, "ContractCreated", { contract }, { missionId: args.missionId, agentId });
    this.emit(
      world,
      "BudgetAllocated",
      { budget, missionBudget: mission.budget },
      { missionId: args.missionId, agentId },
    );
    return world.agents[agentId]!;
  }

  pause(operatorId: string, missionId: string): void {
    const world = this.load(operatorId);
    const mission = world.missions[missionId];
    if (!mission || mission.state === "COMPLETE") return;
    this.emit(world, "MissionPaused", {}, { missionId });
    for (const agent of Object.values(world.agents)) {
      if (agent.missionId === missionId && (agent.state === "RUNNING" || agent.state === "PREPARING")) {
        this.emit(world, "AgentStateChanged", { state: "PAUSED" }, { missionId, agentId: agent.agentId });
      }
    }
  }

  resume(operatorId: string, missionId: string): void {
    const world = this.load(operatorId);
    const mission = world.missions[missionId];
    if (!mission || mission.state !== "PAUSED") return;
    this.emit(world, "MissionResumed", {}, { missionId });
    for (const agent of Object.values(world.agents)) {
      if (agent.missionId === missionId && agent.state === "PAUSED") {
        this.emit(world, "AgentStateChanged", { state: "RUNNING" }, { missionId, agentId: agent.agentId });
      }
    }
    this.due.set(missionId, Date.now());
  }

  cancel(operatorId: string, missionId: string): void {
    const world = this.load(operatorId);
    const mission = world.missions[missionId];
    if (!mission || mission.state === "COMPLETE") return;
    this.emit(world, "MissionCancelled", {}, { missionId });
    for (const agent of Object.values(world.agents)) {
      if (agent.missionId === missionId && agent.state !== "COMPLETE") {
        this.emit(world, "AgentCancelled", { state: "CANCELLED" }, { missionId, agentId: agent.agentId });
      }
    }
  }

  steer(operatorId: string, missionId: string, text: string): void {
    const world = this.load(operatorId);
    const mission = world.missions[missionId];
    if (!mission) return;
    const req: Requirement = {
      requirementId: makeId("req"),
      key: `STEER-${mission.requirements.length + 1}`,
      text,
      mandatory: true,
      status: "open",
    };
    this.emit(
      world,
      "SteerReceived",
      { text },
      {
        missionId,
        why: {
          because: ["Operator changed requirements during execution.", "Commander will replan only affected work."],
          sources: [{ kind: "user", id: operatorId, score: 1, trust: 1 }],
        },
      },
    );
    this.emit(world, "RequirementAdded", { requirement: req }, { missionId });
  }

  resolveApproval(
    operatorId: string,
    approvalId: string,
    status: "denied" | "allow-once" | "allow-mission",
  ): void {
    const world = this.load(operatorId);
    const approval = world.approvals[approvalId];
    if (!approval) return;
    this.emit(
      world,
      "ApprovalResolved",
      { approvalId, status },
      { missionId: approval.missionId, agentId: approval.agentId },
    );
  }

  pinMemory(operatorId: string, memoryId: string, pinned: boolean): void {
    const world = this.load(operatorId);
    if (!world.memories[memoryId]) return;
    this.emit(world, "MemoryUpdated", { memoryId, patch: { pinned } });
  }

  forgetMemory(operatorId: string, memoryId: string): void {
    const world = this.load(operatorId);
    if (!world.memories[memoryId]) return;
    this.emit(world, "MemoryUpdated", {
      memoryId,
      patch: { health: "superseded", body: "(forgotten by operator)" },
    });
  }

  advance(operatorId: string, now = Date.now()): WorldSnapshot {
    const world = this.load(operatorId);
    for (const mission of Object.values(world.missions)) {
      if (!ACTIVE.includes(mission.state)) continue;
      const due = this.due.get(mission.missionId) ?? 0;
      if (now < due) continue;
      this.stepMission(world, mission);
      this.due.set(mission.missionId, now + STEP_MS);
    }
    return world;
  }

  private stepMission(world: WorldSnapshot, mission: Mission): void {
    if (mission.mode === "work") {
      const room = Object.values(world.rooms ?? {}).find((r) => r.missionId === mission.missionId);
      if (!room || (room.round !== "execution" && room.round !== "verification")) {
        if (mission.state === "CREATED") this.commanderPlan(world, mission);
        return;
      }
    }
    this.detectStalls(world, mission);
    if (mission.state === "CREATED") {
      this.commanderPlan(world, mission);
      return;
    }
    if (mission.state === "PLANNING") {
      this.commanderStaff(world, mission);
      return;
    }
    for (const task of mission.tasks) {
      if (task.state === "PENDING" && task.dependencies.every((d) => depComplete(mission, d))) {
        task.state = "READY";
      }
    }
    this.emit(world, "TaskGraphMutated", { tasks: mission.tasks }, { missionId: mission.missionId });

    const runnable = mission.tasks.filter((t) => t.state === "READY" || t.state === "RUNNING");
    const runningCount = mission.tasks.filter((t) => t.state === "RUNNING").length;
    for (const task of runnable) {
      if (task.state === "READY" && runningCount >= mission.budget.parallelAgents) break;
      const agent = task.assignedAgentId ? world.agents[task.assignedAgentId] : undefined;
      if (!agent || agent.state === "PAUSED" || agent.state === "CANCELLED") continue;
      this.stepTask(world, mission, task, agent);
      break;
    }

    const allDone = mission.tasks.length > 0 && mission.tasks.every((t) => t.state === "COMPLETE");
    if (allDone && mission.state !== "VERIFYING" && mission.state !== "COMPLETE") {
      this.finalVerify(world, mission);
    }
  }

  private commanderPlan(world: WorldSnapshot, mission: Mission): void {
    const commander = mission.commanderId ? world.agents[mission.commanderId] : undefined;
    if (commander) {
      this.heartbeat(world, commander, "Scanning project knowledge");
      this.setAgent(world, commander, "PREPARING");
    }
    const scan = scanKnowledge(mission.projectPath);
    const feature = this.features.get(mission.missionId) ?? resolveFeature(mission.objective);
    this.features.set(mission.missionId, feature);

    const taskClass = classifyTask(mission.objective, feature.key, scan.runtime);
    const preferGrok = process.env.AJ_USE_GROK === "1" && process.env.AJ_PREFER_GROK === "1";
    const modelPick = pickModelProvider(
      Object.values(world.performance?.models ?? {}),
      taskClass.capability,
      taskClass.domain,
      preferGrok,
    );
    const placement = schedulePlacement({
      domain: taskClass.domain,
      risk: taskClass.risk,
      compute: taskClass.compute,
      touchesSecrets: feature.key === "audit" || /secret|credential/i.test(mission.objective),
      browser: feature.key === "ui-login" || feature.crew.includes("browser-verifier"),
    });
    this.missionRoute.set(mission.missionId, {
      taskClass,
      placement,
      provider: modelPick.provider,
      why: [modelPick.why],
    });
    this.emit(
      world,
      "EnvironmentRouted",
      { placement, taskClass, missionId: mission.missionId },
      {
        missionId: mission.missionId,
        why: {
          because: [
            `Task class ${taskClass.domain}/${taskClass.language} risk=${taskClass.risk} compute=${taskClass.compute}.`,
            placement.reason,
            placement.intended ? "Placement is the live environment." : "Intended placement recorded; work still runs locally.",
          ],
          sources: [{ kind: "scheduler", id: placement.kind, score: 1, trust: placement.intended ? 1 : 0.6 }],
        },
      },
    );

    const card: KnowledgeCard = {
      cardId: makeId("kc"),
      kind: "DomainConcept",
      title: `Project scan · ${feature.title}`,
      body: `${scan.runtime} runtime. Files: ${scan.files.slice(0, 12).join(", ")}. ${scan.notes.join(" ")}`,
      source: mission.projectPath,
      evidence: scan.files.slice(0, 6),
      confidence: 0.86,
      scope: "project",
      status: "active",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastVerified: nowIso(),
    };
    this.emit(world, "KnowledgeCardCreated", { card }, { missionId: mission.missionId });

    const graph = buildKnowledgeGraph(mission.projectPath);
    this.emit(world, "GraphRebuilt", { graph }, { missionId: mission.missionId });
    const impact = impactAnalysis(graph, feature.key === "ui-login" ? "web/index.html" : feature.key);
    const retrieved = contextForTask(graph, mission.objective);
    const rename = renameImpact(mission.projectPath, feature.key === "auth-race" ? "login" : feature.key === "health" ? "health" : "handle");
    const graphCard: KnowledgeCard = {
      cardId: makeId("kc"),
      kind: "ArchitectureDecision",
      title: `Knowledge graph · ${graph.nodes.length} nodes`,
      body: [
        `${graph.edges.length} edges. ${graph.diagnostics.length} diagnostics.`,
        impact.affectedFiles.length
          ? `Impact of ${impact.symbol}: ${impact.affectedFiles.slice(0, 8).join(", ")}.`
          : "No symbol impact yet.",
        rename.definition
          ? `Rename ${rename.symbol} @ ${rename.definition.file}:${rename.definition.line} touches ${rename.files.length} files.`
          : "",
        retrieved.length ? `Context: ${retrieved.map((c) => c.id).slice(0, 5).join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      source: mission.projectPath,
      evidence: graph.diagnostics.map((d) => d.file).slice(0, 6),
      confidence: 0.8,
      scope: "project",
      status: graph.diagnostics.some((d) => d.severity === "error") ? "stale" : "active",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastVerified: nowIso(),
    };
    this.emit(world, "KnowledgeCardCreated", { card: graphCard }, { missionId: mission.missionId });

    const fleet = fleetFromConnections(Object.values(world.connections ?? {}), Boolean(stationOf(world).localOnly));
    const pair = routePair(fleet, taskClass.capability, "judge");
    const route = routeModel(taskClass.capability, modelPick.provider, fleet);
    this.emit(world, "ModelRouted", { route, pair }, { missionId: mission.missionId, agentId: commander?.agentId });
    world.modelRoutes = [...(world.modelRoutes ?? []), pair.implementer, pair.judge];

    if (commander) this.discoverMcp(world, commander, mission.projectPath);

    for (const reqSpec of feature.requirements) {
      const requirement: Requirement = {
        requirementId: makeId("req"),
        key: reqSpec.key,
        text: reqSpec.text,
        mandatory: reqSpec.mandatory,
        status: "open",
      };
      this.emit(world, "RequirementAdded", { requirement }, { missionId: mission.missionId });
    }

    const memoryDraft = {
      missionId: mission.missionId,
      klass: "project" as const,
      kind: "observation" as const,
      title: "Initial project observation",
      body: scan.notes.join(" ") || "Project scanned.",
      source: "knowledge-scan",
      evidence: scan.files.slice(0, 4),
      confidence: 0.7,
      pinned: false,
    };
    this.remember(world, memoryDraft);

    const summary = [
      `Crew policy: minimum sufficient for '${feature.key}'.`,
      `Runtime: ${scan.runtime}.`,
      `Class: ${taskClass.domain}/${taskClass.language} risk=${taskClass.risk}.`,
      `Model: ${modelPick.provider} — ${modelPick.why}`,
      `Environment: ${placement.kind} @ ${placement.location}${placement.intended ? "" : " (local stand-in)"}.`,
      `Requirements: ${feature.requirements.length}.`,
      `Playbook files: ${feature.files.length}.`,
    ].join(" ");
    this.emit(
      world,
      "PlanCreated",
      { summary },
      {
        missionId: mission.missionId,
        agentId: commander?.agentId,
        why: {
          because: [
            "Commander retrieved project knowledge before staffing.",
            `Selected playbook ${feature.key} from objective match — not a fixed team.`,
          ],
          sources: [
            { kind: "knowledge", id: card.cardId, score: 0.9, trust: 0.86 },
            { kind: "playbook", id: feature.key, score: 0.95, trust: 1 },
          ],
        },
      },
    );
    const planArt = artifact(mission.missionId, commander?.agentId, "plan", "Mission plan", summary);
    this.emit(world, "ArtifactCreated", { artifact: planArt }, { missionId: mission.missionId });
    writeArtifactFile(world.operatorId, planArt.artifactId, redactSecretsFromText(`# Plan\n\n${summary}\n`));
    if (commander) this.setAgent(world, commander, "RUNNING");
  }

  private commanderStaff(world: WorldSnapshot, mission: Mission): void {
    const commander = mission.commanderId ? world.agents[mission.commanderId] : undefined;
    const feature = this.features.get(mission.missionId) ?? resolveFeature(mission.objective);
    const existing = Object.values(world.agents).filter((a) => a.missionId === mission.missionId);
    if (existing.length <= 1) {
      for (const role of feature.crew) {
        this.spawnAgent(world, {
          missionId: mission.missionId,
          parentAgentId: commander?.agentId ?? null,
          role,
          title: titleForRole(role),
          objective: objectiveFor(role, feature),
          autonomy: ROLE_AUTONOMY[role],
        });
      }
    }

    const routed = this.missionRoute.get(mission.missionId);
    const taskClass = routed?.taskClass ?? classifyTask(mission.objective, feature.key);
    const profiles = Object.values(world.performance?.agents ?? {});
    for (const role of feature.crew) {
      const pick = pickAgentProfile(
        profiles,
        role,
        taskClass.domain,
        taskClass.language,
        taskClass.risk,
        mission.budget.moneyUsd,
      );
      const avoid = shouldAvoidAgent(world.failureLedger ?? [], role, taskClass.domain, "verify");
      if (avoid.avoid) pick.why.push(avoid.why);
      const worker = Object.values(world.agents).find((a) => a.missionId === mission.missionId && a.role === role);
      this.emit(
        world,
        "WorkerRouted",
        {
          role,
          agentId: worker?.agentId,
          profile: pick.profile,
          why: pick.why,
          provider: routed?.provider ?? "aj-local",
          taskClass,
        },
        {
          missionId: mission.missionId,
          agentId: worker?.agentId,
          why: {
            because: [
              pick.profile
                ? `${role} fitness uses ${pick.profile.sampleSize} samples on ${pick.profile.taskDomain}/${pick.profile.language}.`
                : `No ${role} history — default playbook worker.`,
              ...pick.why,
            ],
            sources: [{ kind: "reputation", id: pick.profile?.profileId ?? role, score: 1, trust: pick.profile ? 0.8 : 0.4 }],
          },
        },
      );
    }

    const specialists = Object.values(world.agents).filter(
      (a) => a.missionId === mission.missionId && a.role !== "commander",
    );
    const tasks: TaskNode[] = [];
    const byRole = new Map(specialists.map((a) => [a.role, a]));

    const add = (
      partial: Omit<TaskNode, "taskId" | "missionId" | "state" | "inputs" | "outputs" | "dependencies"> & {
        after?: string[];
      },
    ) => {
      const taskId = makeId("tsk");
      const deps = partial.after ?? [];
      tasks.push({
        taskId,
        missionId: mission.missionId,
        title: partial.title,
        description: partial.description,
        role: partial.role,
        assignedAgentId: byRole.get(partial.role)?.agentId,
        dependencies: deps,
        inputs: ["plan"],
        outputs: [],
        state: deps.length ? "PENDING" : "READY",
        priority: partial.priority,
        risk: partial.risk,
        budgetTokens: partial.budgetTokens,
        playbook: feature.key,
        featureKey: feature.key,
      });
      return taskId;
    };

    let researchId: string | undefined;
    if (byRole.has("researcher") || byRole.has("architecture-lead")) {
      researchId = add({
        title: "Map architecture",
        description: "Read the repository and publish an architecture artifact.",
        role: byRole.has("architecture-lead") ? "architecture-lead" : "researcher",
        priority: 10,
        risk: "low",
        budgetTokens: 4000,
      });
    }
    if (byRole.has("security-reviewer") && feature.key === "audit") {
      add({
        title: "Security review",
        description: "Cite findings against source files.",
        role: "security-reviewer",
        priority: 8,
        risk: "medium",
        budgetTokens: 5000,
        after: researchId ? [researchId] : [],
      });
    }
    let implId: string | undefined;
    if (byRole.has("backend-engineer")) {
      implId = add({
        title: "Implement in isolated worktree",
        description: "Apply the contracted file set inside a private worktree.",
        role: "backend-engineer",
        priority: 9,
        risk: feature.key === "auth-race" ? "high" : "medium",
        budgetTokens: 8000,
        after: researchId ? [researchId] : [],
      });
    }
    let feId: string | undefined;
    if (byRole.has("frontend-engineer")) {
      feId = add({
        title: "Fix UI in isolated worktree",
        description: "Apply the contracted web surface inside a private worktree.",
        role: "frontend-engineer",
        priority: 9,
        risk: "medium",
        budgetTokens: 6000,
        after: researchId ? [researchId] : [],
      });
    }
    let testId: string | undefined;
    if (byRole.has("test-engineer")) {
      testId = add({
        title: "Prove with tests",
        description: "Write or run contracted tests in the agent worktree.",
        role: "test-engineer",
        priority: 8,
        risk: "medium",
        budgetTokens: 5000,
        after: implId ? [implId] : researchId ? [researchId] : [],
      });
    }
    let browserId: string | undefined;
    if (byRole.has("browser-verifier")) {
      browserId = add({
        title: "Computer-use verification",
        description: "Drive the UI: a11y tree, click/type, screenshot, console, network.",
        role: "browser-verifier",
        priority: 7,
        risk: "high",
        budgetTokens: 5000,
        after: feId ? [feId] : implId ? [implId] : [],
      });
    }
    add({
      title: "Independent verification",
      description: "Final verifier evaluates evidence. Builders cannot self-certify.",
      role: "final-verifier",
      priority: 6,
      risk: "high",
      budgetTokens: 4000,
      after: [implId, testId, researchId, feId, browserId].filter(Boolean) as string[],
    });

    this.emit(world, "TaskGraphMutated", { tasks }, { missionId: mission.missionId });
    this.emit(world, "PlanApproved", {}, { missionId: mission.missionId, agentId: commander?.agentId });
    writeCheckpoint(world.operatorId, mission.missionId, world);
    this.emit(world, "CheckpointCreated", { kind: "plan-approved" }, { missionId: mission.missionId });
  }

  private stepTask(world: WorldSnapshot, mission: Mission, task: TaskNode, agent: AgentInstance): void {
    if (agent.state === "CREATED") this.setAgent(world, agent, "PREPARING");
    if (task.state === "READY") {
      task.state = "RUNNING";
      task.startedAt = nowIso();
      this.setAgent(world, agent, "RUNNING");
      this.emit(
        world,
        "AgentStarted",
        { state: "RUNNING", taskId: task.taskId },
        { missionId: mission.missionId, agentId: agent.agentId },
      );
    }

    this.heartbeat(world, agent, task.title);
    const feature = this.features.get(mission.missionId) ?? resolveFeature(mission.objective);

    if (task.role === "architecture-lead" || task.role === "researcher") {
      this.tool(world, agent, "knowledge.scan", { path: mission.projectPath });
      const scan = scanKnowledge(mission.projectPath);
      const body = [
        `# Architecture`,
        ``,
        `Runtime: **${scan.runtime}**`,
        ``,
        ...scan.notes.map((n) => `- ${n}`),
        ``,
        `## Files`,
        ...scan.files.map((f) => `- \`${f}\``),
      ].join("\n");
      const art = artifact(mission.missionId, agent.agentId, "architecture", "Architecture notes", body);
      this.emit(world, "ArtifactCreated", { artifact: art }, { missionId: mission.missionId, agentId: agent.agentId });
      writeArtifactFile(world.operatorId, art.artifactId, body);
      for (const d of feature.decisions) {
        const decision: DecisionRecord = {
          decisionId: makeId("dec"),
          missionId: mission.missionId,
          question: d.question,
          options: d.options,
          choice: d.choice,
          evidence: ["architecture artifact"],
          confidence: 0.82,
          author: agent.agentId,
          status: "accepted",
          dependencies: [],
          affects: decisionAffects(d.question, d.choice),
          why: `Chosen over ${d.options.filter((o) => o !== d.choice).join(", ") || "no alternatives"}.`,
          createdAt: nowIso(),
        };
        this.emit(world, "DecisionCreated", { decision }, { missionId: mission.missionId, agentId: agent.agentId });
      }
      this.completeTask(world, mission, task, agent);
      return;
    }

    if (task.role === "security-reviewer") {
      this.tool(world, agent, "fs.read", { path: "src/auth.js" });
      const auth = readProjectFile(mission.projectPath, "src/auth.js") ?? "";
      const mcpText = this.callMcp(world, agent, mission.projectPath, "northstar.probe_auth");
      const listed = this.callMcp(world, agent, mission.projectPath, "");
      this.tool(world, agent, "secret.request", { name: "northstar.demo" });
      const demo = leaseSecret(world.operatorId, { name: "northstar.demo", agent });
      if (demo.ok) {
        this.emit(world, "SecretLeased", { meta: listSecretMeta(world.operatorId).find((s) => s.name === "northstar.demo"), lease: demo.lease }, { missionId: mission.missionId, agentId: agent.agentId });
      } else {
        this.emit(world, "SecretDenied", { name: "northstar.demo", reason: demo.reason }, { missionId: mission.missionId, agentId: agent.agentId });
      }
      const hmacTry = leaseSecret(world.operatorId, { name: "aj.ingress.hmac", agent });
      this.emit(
        world,
        hmacTry.ok ? "SecretLeased" : "SecretDenied",
        hmacTry.ok
          ? { meta: listSecretMeta(world.operatorId).find((s) => s.name === "aj.ingress.hmac"), lease: hmacTry.lease }
          : { name: "aj.ingress.hmac", reason: hmacTry.reason },
        { missionId: mission.missionId, agentId: agent.agentId },
      );
      let acpNote = "No granted ACP worker.";
      const acp = Object.values(world.externalAgents ?? {}).find((a) => a.kind === "acp" && a.status === "granted");
      if (acp) {
        this.emit(world, "ExternalAgentHeartbeat", { externalId: acp.externalId, status: "running" }, { missionId: mission.missionId });
        const session = runAcpSessionSync({ record: acp, projectPath: mission.projectPath, objective: mission.objective });
        this.emit(
          world,
          "ExternalAgentCompleted",
          {
            externalId: acp.externalId,
            status: session.ok ? "complete" : "error",
            toolsUsed: session.toolsUsed,
            toolsDenied: session.toolsDenied,
            summary: session.summary ?? session.reason,
          },
          { missionId: mission.missionId },
        );
        if (session.artifact) {
          const acpArt = artifact(mission.missionId, agent.agentId, "research", "ACP worker research", session.artifact);
          this.emit(world, "ArtifactCreated", { artifact: acpArt }, { missionId: mission.missionId, agentId: agent.agentId });
          writeArtifactFile(world.operatorId, acpArt.artifactId, session.artifact);
        }
        acpNote = session.ok
          ? `ACP live process: used ${session.toolsUsed.join(",") || "none"}; denied ${session.toolsDenied.join(",") || "none"}.`
          : `ACP session failed: ${session.reason}`;
      }
      const findings = [
        auth.includes("INTENTIONAL DEFECT") || !auth.includes("inflight")
          ? "FINDING high: login() check-then-set race in src/auth.js"
          : "OK: login() uses single-flight.",
        existsSyncSafe(join(mission.projectPath, ".env"))
          ? "FINDING critical: .env present in workspace"
          : "OK: no committed .env.",
        demo.ok
          ? `Broker leased northstar.demo as ${demo.lease.redacted} (plaintext not written to ledger).`
          : `Broker denied northstar.demo: ${demo.reason}`,
        hmacTry.ok
          ? "POLICY FAIL: ingress hmac leaked to an agent."
          : `OK: ingress hmac withheld (${hmacTry.reason}).`,
        acpNote,
        mcpText ? `MCP probe_auth: ${mcpText.slice(0, 280)}` : "MCP probe skipped or denied.",
        listed ? `MCP inventory: ${listed.slice(0, 200)}` : "",
      ].filter(Boolean);
      const body = `# Security artifact\n\n${findings.map((f) => `- ${f}`).join("\n")}\n`;
      const art = artifact(mission.missionId, agent.agentId, "security", "Security review", body);
      this.emit(world, "ArtifactCreated", { artifact: art }, { missionId: mission.missionId, agentId: agent.agentId });
      writeArtifactFile(world.operatorId, art.artifactId, body);
      const evd = {
        evidenceId: makeId("evd"),
        missionId: mission.missionId,
        claim: "Security review cites source files",
        kind: "security" as const,
        passed: true,
        detail: findings.join("; "),
        path: "src/auth.js",
        createdAt: nowIso(),
      };
      this.emit(world, "ArtifactCreated", { artifact: art, evidence: evd }, { missionId: mission.missionId });
      this.completeTask(world, mission, task, agent);
      return;
    }

    if (task.role === "backend-engineer" || task.role === "frontend-engineer") {
      this.ensureWorktree(world, mission, agent);
      const wt = agent.worktreeId ? world.worktrees[agent.worktreeId] : undefined;
      if (!wt) return;
      this.tool(world, agent, "git.worktree", { path: wt.path });
      const general = implementObjective({
        objective: mission.objective,
        projectPath: mission.projectPath,
        worktreePath: wt.path,
      });
      for (const change of general.changes) {
        wt.changedFiles = Array.from(new Set([...wt.changedFiles, change.path]));
        this.tool(world, agent, "fs.write", { path: change.path });
      }
      const files = feature.files.filter((f) =>
        task.role === "frontend-engineer"
          ? f.path.startsWith("web/")
          : !f.path.startsWith("tests/") && !f.path.startsWith("web/"),
      );
      for (const file of files) {
        const clash = detectDecisionConflict(Object.values(world.decisions), {
          file: file.path,
          content: file.content,
        });
        if (clash.conflict) {
          this.emit(
            world,
            "DecisionConflict",
            { decisionId: clash.decision.decisionId, reason: clash.reason, file: file.path },
            {
              missionId: mission.missionId,
              agentId: agent.agentId,
              why: {
                because: [clash.reason],
                sources: [{ kind: "decision", id: clash.decision.decisionId, score: 1, trust: 1 }],
              },
            },
          );
          continue;
        }
        const snippet = snippetForEdit(mission.projectPath, file.path);
        if (snippet) {
          this.emit(
            world,
            "WorkspaceContextInjected",
            { file: file.path, snippet },
            { missionId: mission.missionId, agentId: agent.agentId },
          );
        }
        const authz = authorizeTool(agent, "fs.write");
        if (!authz.ok) {
          this.deny(world, agent, "fs.write", authz.reason);
          continue;
        }
        const contract = world.contracts[agent.contractId];
        const written = writeScoped(
          wt.path,
          file.path,
          file.content,
          contract?.allowedScope ?? ["src/**", "web/**"],
          contract?.forbiddenScope ?? [],
        );
        if (!written.ok) {
          this.deny(world, agent, "fs.write", written.reason);
          continue;
        }
        this.tool(world, agent, "fs.write", { path: file.path });
        wt.changedFiles = Array.from(new Set([...wt.changedFiles, file.path]));
      }
      if (task.role === "frontend-engineer" && feature.decisions.length && !Object.values(world.decisions).length) {
        for (const d of feature.decisions) {
          const decision: DecisionRecord = {
            decisionId: makeId("dec"),
            missionId: mission.missionId,
            question: d.question,
            options: d.options,
            choice: d.choice,
            evidence: wt.changedFiles,
            confidence: 0.8,
            author: agent.agentId,
            status: "accepted",
            dependencies: [],
            affects: decisionAffects(d.question, d.choice),
            why: `Chosen over ${d.options.filter((o) => o !== d.choice).join(", ") || "no alternatives"}.`,
            createdAt: nowIso(),
          };
          this.emit(world, "DecisionCreated", { decision }, { missionId: mission.missionId, agentId: agent.agentId });
        }
      }
      const art = artifact(
        mission.missionId,
        agent.agentId,
        "diff",
        "Implementation diff",
        wt.changedFiles.join(", "),
      );
      this.emit(world, "ArtifactCreated", { artifact: art }, { missionId: mission.missionId, agentId: agent.agentId });
      for (const req of mission.requirements) {
        if (req.status === "open") {
          this.emit(
            world,
            "RequirementUpdated",
            { requirementId: req.requirementId, patch: { status: "implemented", implementation: wt.changedFiles } },
            { missionId: mission.missionId },
          );
        }
      }
      const hasTester = Object.values(world.agents).some(
        (a) => a.missionId === mission.missionId && a.role === "test-engineer",
      );
      if (task.role === "frontend-engineer" && !hasTester) this.mergeIfReady(world, mission);
      this.completeTask(world, mission, task, agent);
      return;
    }

    if (task.role === "test-engineer") {
      const backend = Object.values(world.agents).find(
        (a) => a.missionId === mission.missionId && a.role === "backend-engineer" && a.worktreeId,
      );
      const sourceWt = backend?.worktreeId ? world.worktrees[backend.worktreeId] : undefined;
      this.ensureWorktree(world, mission, agent);
      const wt = agent.worktreeId ? world.worktrees[agent.worktreeId] : undefined;
      if (!wt) return;
      if (sourceWt) {
        for (const file of feature.files.filter((f) => !f.path.startsWith("tests/"))) {
          const content = readProjectFile(sourceWt.path, file.path);
          if (content != null) writeScoped(wt.path, file.path, content, ["src/**", "tests/**"], []);
        }
      }
      for (const file of feature.files.filter((f) => f.path.startsWith("tests/"))) {
        const written = writeScoped(wt.path, file.path, file.content, ["tests/**", "src/**"], []);
        if (written.ok) {
          this.tool(world, agent, "fs.write", { path: file.path });
          wt.changedFiles = Array.from(new Set([...wt.changedFiles, file.path]));
        }
      }
      const result = this.gateway(world, agent, "test.run", () => runNodeTest(wt.path, feature.testsToRun));
      const evd = {
        evidenceId: makeId("evd"),
        missionId: mission.missionId,
        claim: "Contracted tests pass in isolated worktree",
        kind: "unit-test" as const,
        passed: result.ok,
        detail: result.output.slice(0, 1500),
        createdAt: nowIso(),
      };
      const art = artifact(
        mission.missionId,
        agent.agentId,
        "test",
        result.ok ? "Tests passed" : "Tests failed",
        evd.detail,
      );
      this.emit(
        world,
        "ArtifactCreated",
        { artifact: art, evidence: evd },
        { missionId: mission.missionId, agentId: agent.agentId },
      );
      if (!result.ok) {
        this.recoverFromTestFailure(world, mission, agent, evd.detail);
        return;
      }
      this.mergeIfReady(world, mission);
      this.completeTask(world, mission, task, agent);
      return;
    }

    if (task.role === "browser-verifier") {
      this.runBrowserVerification(world, mission, task, agent, feature);
      return;
    }

    if (task.role === "final-verifier") {
      this.finalVerify(world, mission);
      this.completeTask(world, mission, task, agent);
      return;
    }

    this.completeTask(world, mission, task, agent);
  }

  private mergeIfReady(world: WorldSnapshot, mission: Mission): void {
    const trees = Object.values(world.worktrees).filter(
      (w) => w.missionId === mission.missionId && w.mergeStatus === "open",
    );
    const files = new Set<string>();
    for (const wt of trees) {
      const changed = changedFiles(wt.path, mission.projectPath);
      wt.changedFiles = changed;
      for (const f of changed) files.add(f);
    }
    if (trees.length > 0) {
      const conflict = detectSemanticConflicts(
        mission.missionId,
        mission.projectPath,
        trees.map((wt) => ({ agentId: wt.agentId, path: wt.path, changedFiles: wt.changedFiles })),
      );
      this.emit(
        world,
        "SemanticConflict",
        { conflict },
        {
          missionId: mission.missionId,
          why: {
            because: [conflict.summary],
            sources: [{ kind: "semantic", id: conflict.conflictId, score: 1, trust: 1 }],
          },
        },
      );
      if (conflict.verdict === "CONFLICT") {
        for (const wt of trees) {
          this.emit(
            world,
            "WorktreeMerged",
            { worktreeId: wt.worktreeId, mergeStatus: "conflict", changedFiles: wt.changedFiles },
            { missionId: mission.missionId, agentId: wt.agentId },
          );
        }
        return;
      }
    }
    const all = [...files];
    for (const wt of trees) {
      const { merged, conflicts } = mergeWorktree(wt.path, mission.projectPath, all);
      this.emit(
        world,
        "WorktreeMerged",
        { worktreeId: wt.worktreeId, mergeStatus: conflicts.length ? "conflict" : "merged", changedFiles: merged },
        { missionId: mission.missionId, agentId: wt.agentId },
      );
    }
  }

  private recoverFromTestFailure(
    world: WorldSnapshot,
    mission: Mission,
    agent: AgentInstance,
    output: string,
  ): void {
    const fp = fingerprint("test", output);
    const prev = this.fingerprints.get(mission.missionId) ?? [];
    if (prev.filter((x) => x === fp).length >= 2) {
      this.emit(
        world,
        "MissionBlocked",
        { reason: "anti-loop: identical test failure repeated" },
        { missionId: mission.missionId, agentId: agent.agentId },
      );
      this.setAgent(world, agent, "BLOCKED");
      return;
    }
    this.fingerprints.set(mission.missionId, [...prev, fp]);
    agent.budget.retriesUsed += 1;
    this.emit(
      world,
      "FailureRecorded",
      { failureId: makeId("fail"), fingerprint: fp, output: output.slice(0, 400) },
      { missionId: mission.missionId, agentId: agent.agentId },
    );
    this.emit(
      world,
      "StrategyChanged",
      { strategy: "re-apply playbook files and rerun tests" },
      { missionId: mission.missionId, agentId: agent.agentId },
    );
    this.emit(world, "RecoveryStarted", { strategy: "replay-playbook" }, { missionId: mission.missionId });
    if (agent.budget.retriesUsed >= agent.budget.retries) {
      this.setAgent(world, agent, "FAILED");
      this.emit(world, "MissionFailed", { reason: "retry budget exhausted" }, { missionId: mission.missionId });
      this.recordPerformance(world, mission, "FAIL");
    }
  }

  private finalVerify(world: WorldSnapshot, mission: Mission): void {
    if (mission.state === "COMPLETE") return;
    const verifier = Object.values(world.agents).find(
      (a) => a.missionId === mission.missionId && a.role === "final-verifier",
    );
    if (verifier) this.setAgent(world, verifier, "VERIFYING");
    this.emit(world, "VerificationStarted", {}, { missionId: mission.missionId, agentId: verifier?.agentId });

    const feature = this.features.get(mission.missionId) ?? resolveFeature(mission.objective);
    const implementers = Object.values(world.agents).filter(
      (a) => a.missionId === mission.missionId && a.role !== "final-verifier" && a.role !== "commander",
    );
    const evidence = Object.values(world.evidence).filter((e) => e.missionId === mission.missionId);
    const reqs = mission.requirements.filter((r) => r.mandatory);
    const tests = runNodeTest(mission.projectPath, feature.testsToRun);
    const testEvd = {
      evidenceId: makeId("evd"),
      missionId: mission.missionId,
      claim: "Independent verifier re-ran contracted tests on merged tree",
      kind: "unit-test" as const,
      passed: feature.testsToRun.length === 0 ? true : tests.ok,
      detail: tests.output.slice(0, 1500),
      createdAt: nowIso(),
    };
    const art = artifact(mission.missionId, verifier?.agentId, "verification", "Final verification", testEvd.detail);
    this.emit(world, "ArtifactCreated", { artifact: art, evidence: testEvd }, { missionId: mission.missionId });

    const missingFiles = feature.files.filter((f) => !readProjectFile(mission.projectPath, f.path));
    const allReqsCovered = reqs.every((r) => r.status === "implemented" || r.status === "verified");
    const buildersDidNotCertify = !implementers.some((a) => a.role === "final-verifier");
    const testsPass = testEvd.passed;
    const filesPresent = missingFiles.length === 0;

    let result: "PASS" | "FAIL" | "PARTIAL" | "BLOCKED" = "PASS";
    const reasons: string[] = [];
    if (!buildersDidNotCertify) {
      result = "FAIL";
      reasons.push("Implementation agent attempted to self-certify.");
    }
    if (!testsPass) {
      result = "FAIL";
      reasons.push("Deterministic tests failed under the verifier.");
    }
    if (!filesPresent) {
      result = "FAIL";
      reasons.push(`Missing files: ${missingFiles.map((f) => f.path).join(", ")}`);
    }
    if (!allReqsCovered && feature.key !== "audit") {
      result = result === "PASS" ? "PARTIAL" : result;
      reasons.push("Mandatory requirements lack implementation mapping.");
    }
    if (feature.key === "audit") {
      const sec = Object.values(world.artifacts).some(
        (a) => a.missionId === mission.missionId && a.kind === "security",
      );
      if (!sec) {
        result = "FAIL";
        reasons.push("Audit produced no security artifact.");
      }
    }
    if (feature.key === "ui-login") {
      const independent = runBrowserScriptSync({ root: join(mission.projectPath, "web") });
      const browserEvd = {
        evidenceId: makeId("evd"),
        missionId: mission.missionId,
        claim: "Independent verifier re-ran computer-use on the merged login surface",
        kind: "browser" as const,
        passed: independent.passed,
        detail: independent.passed ? "Sign in is enabled and named" : independent.defects.join("; "),
        path: independent.screenshotPath,
        createdAt: nowIso(),
      };
      const browserArt = artifact(
        mission.missionId,
        verifier?.agentId,
        "browser",
        independent.passed ? "Independent browser PASS" : "Independent browser FAIL",
        browserEvd.detail,
      );
      this.emit(
        world,
        "ArtifactCreated",
        { artifact: browserArt, evidence: browserEvd },
        { missionId: mission.missionId },
      );
      if (!independent.passed) {
        result = "FAIL";
        reasons.push(`Independent browser failed: ${independent.defects.join("; ")}`);
      }
    }
    const blockingSemantic = (world.semanticConflicts ?? []).some(
      (c) => c.missionId === mission.missionId && c.verdict === "CONFLICT",
    );
    if (blockingSemantic) {
      result = "FAIL";
      reasons.push("Semantic conflict across worktrees — merge coordinator refused.");
    }
    // Deterministic gates already ran. A model may never upgrade FAIL → PASS.
    // Judge is always aj-local unless the operator explicitly prefers another engine.
    const judge = routeModel("judge");
    world.modelRoutes = [...(world.modelRoutes ?? []), judge];
    const implementerProvider = (world.modelRoutes ?? []).find((r) => r.capability === "coding" && r.provider !== "aj-local")
      ?.provider;
    if (result === "PASS" && implementerProvider && judge.provider === implementerProvider) {
      result = "FAIL";
      reasons.push("Verifier refused correlated model — judge must not share the implementer provider.");
    }
    if (result === "PASS") {
      for (const req of mission.requirements) {
        this.emit(
          world,
          "RequirementUpdated",
          {
            requirementId: req.requirementId,
            patch: { status: "verified", evidence: [testEvd.evidenceId], tests: feature.testsToRun },
          },
          { missionId: mission.missionId },
        );
      }
    }

    const summary =
      result === "PASS"
        ? "Independent deterministic verifier PASS. Tests + files + no self-certification. Model cannot upgrade a fail."
        : `${result}: ${reasons.join(" ")}`;
    this.emit(
      world,
      "VerificationFinished",
      { result, summary },
      {
        missionId: mission.missionId,
        agentId: verifier?.agentId,
        why: {
          because: reasons.length ? reasons : ["All completion gates held."],
          sources: evidence.map((e) => ({
            kind: "evidence",
            id: e.evidenceId,
            score: 1,
            trust: e.passed ? 1 : 0.2,
          })),
        },
      },
    );
    if (verifier) this.setAgent(world, verifier, result === "PASS" ? "COMPLETE" : "FAILED");
    if (result === "PASS") {
      const ballots = this.swarmBallots(world, mission.missionId);
      if (ballots.length) {
        const consensus = tallyConsensus(ballots, "majority");
        const seal = mayCompleteMission(true, consensus);
        if (!seal.ok) {
          this.emit(world, "ConsensusDenied", { consensus }, { missionId: mission.missionId });
          if (consensus.resolution) {
            this.emit(world, "ResolutionSessionOpened", { session: resolutionSession(ballots) }, { missionId: mission.missionId });
          }
          mission.state = "VERIFYING";
          return;
        }
        this.emit(world, "ConsensusReached", { consensus }, { missionId: mission.missionId });
      }
      this.emit(world, "MissionCompleted", { result }, { missionId: mission.missionId });
      if (mission.commanderId && world.agents[mission.commanderId]) {
        this.setAgent(world, world.agents[mission.commanderId]!, "COMPLETE");
      }
      const memDraft = {
        missionId: mission.missionId,
        klass: "episodic" as const,
        kind: "verified-fact" as const,
        title: `Mission complete: ${mission.title}`,
        body: summary,
        source: "final-verifier",
        evidence: [testEvd.evidenceId],
        confidence: 0.93,
        pinned: false,
        lastVerified: nowIso(),
      };
      this.remember(world, memDraft);
    } else {
      rememberVector(world.operatorId, { text: summary, kind: "failure", missionId: mission.missionId });
      const kind = classifyFailure(summary);
      world.failureLedger = [
        ...(world.failureLedger ?? []),
        { role: "final-verifier", domain: "general", kind, missionId: mission.missionId, detail: summary.slice(0, 200), at: nowIso() },
      ];
      this.emit(world, "FailureClassed", { kind, summary: summary.slice(0, 160) }, { missionId: mission.missionId });
      const prior = searchSimilar(world.operatorId, summary, { k: 3, kind: "fix" });
      const attempts = mission.healAttempts ?? 0;
      if (nextHealAction(mission) === "resolve") {
        mission.healAttempts = attempts + 1;
        mission.state = "RUNNING";
        const debuggerAgent = this.spawnAgent(world, {
          missionId: mission.missionId,
          parentAgentId: mission.commanderId ?? null,
          role: "debugger",
          title: `Resolution ${attempts + 1}/${MAX_SELF_HEALS}`,
          objective: `Fix verifier failure: ${summary.slice(0, 240)}`,
          autonomy: ROLE_AUTONOMY.debugger,
        });
        const healTask: import("../protocol/index.ts").TaskNode = {
          taskId: makeId("tsk"),
          missionId: mission.missionId,
          title: `Resolution ${attempts + 1}`,
          description: summary.slice(0, 400),
          role: "debugger",
          assignedAgentId: debuggerAgent.agentId,
          dependencies: mission.tasks.filter((t) => t.state === "COMPLETE").map((t) => t.taskId).slice(-1),
          inputs: prior.map((p) => p.doc.vectorId),
          outputs: [],
          state: "READY",
          priority: 0,
          risk: "high",
          budgetTokens: 3000,
          playbook: "self-heal",
        };
        mission.tasks.push(healTask);
        this.emit(world, "TaskGraphMutated", { tasks: mission.tasks }, { missionId: mission.missionId });
        this.emit(
          world,
          "ResolutionStarted",
          {
            attempt: mission.healAttempts,
            priorFixes: prior.map((p) => p.doc.text.slice(0, 160)),
            agentId: debuggerAgent.agentId,
          },
          { missionId: mission.missionId, agentId: debuggerAgent.agentId },
        );
        this.emit(world, "RecoveryStarted", { strategy: "self-heal-dag" }, { missionId: mission.missionId });
      } else {
        mission.state = "WAITING_APPROVAL";
        this.emit(
          world,
          "ResolutionExhausted",
          { attempts, summary },
          { missionId: mission.missionId },
        );
        const forensicPath = writeForensicReport(world, mission.missionId, summary);
        this.emit(world, "ForensicWritten", { path: forensicPath }, { missionId: mission.missionId });
        this.emit(world, "MissionFailed", { result, summary, escalate: "human" }, { missionId: mission.missionId });
      }
    }
    this.recordPerformance(world, mission, result);
    writeSnapshot(world);
    writeCheckpoint(world.operatorId, mission.missionId, world);
  }

  private runBrowserVerification(
    world: WorldSnapshot,
    mission: Mission,
    task: TaskNode,
    agent: AgentInstance,
    feature: FeatureSpec,
  ): void {
    const frontend = Object.values(world.agents).find(
      (a) => a.missionId === mission.missionId && a.role === "frontend-engineer" && a.worktreeId,
    );
    const sourceWt = frontend?.worktreeId ? world.worktrees[frontend.worktreeId] : undefined;
    const webRoot = sourceWt ? join(sourceWt.path, "web") : join(mission.projectPath, "web");
    this.tool(world, agent, "browser.navigate", { path: webRoot });
    this.tool(world, agent, "browser.snapshot", { path: webRoot });
    this.tool(world, agent, "browser.click", { selector: '[aria-label="Sign in"]' });
    this.tool(world, agent, "browser.screenshot", { path: webRoot });
    const shotDir = join(operatorDir(world.operatorId), "artifacts");
    let obs = runBrowserScriptSync({ root: webRoot, screenshotDir: shotDir });
    this.emit(
      world,
      "BrowserAction",
      {
        passed: obs.passed,
        defects: obs.defects,
        title: obs.title,
        a11y: obs.a11y.slice(0, 12),
      },
      { missionId: mission.missionId, agentId: agent.agentId },
    );
    if (!obs.passed) {
      this.emit(
        world,
        "RecoveryStarted",
        { strategy: "replay-ui-playbook", defects: obs.defects },
        { missionId: mission.missionId, agentId: agent.agentId },
      );
      const target = sourceWt?.path ?? mission.projectPath;
      for (const file of feature.files.filter((f) => f.path.startsWith("web/"))) {
        writeScoped(target, file.path, file.content, ["web/**", "src/**"], []);
      }
      obs = runBrowserScriptSync({ root: join(target, "web"), screenshotDir: shotDir });
      this.emit(
        world,
        "BrowserAction",
        { passed: obs.passed, defects: obs.defects, repaired: true },
        { missionId: mission.missionId, agentId: agent.agentId },
      );
    }
    const evd = {
      evidenceId: makeId("evd"),
      missionId: mission.missionId,
      claim: "Login control is enabled, named, and usable",
      kind: "browser" as const,
      passed: obs.passed,
      detail: obs.passed
        ? `a11y ${obs.a11y.length} nodes · ${obs.requestUrls.length} requests`
        : obs.defects.join("; "),
      path: obs.screenshotPath,
      createdAt: nowIso(),
    };
    const art = artifact(
      mission.missionId,
      agent.agentId,
      "browser",
      obs.passed ? "Browser evidence PASS" : "Browser evidence FAIL",
      evd.detail,
    );
    art.path = obs.screenshotPath;
    this.emit(
      world,
      "ArtifactCreated",
      { artifact: art, evidence: evd },
      { missionId: mission.missionId, agentId: agent.agentId },
    );
    if (obs.passed) this.mergeIfReady(world, mission);
    this.completeTask(world, mission, task, agent);
  }

  private remember(
    world: WorldSnapshot,
    draft: Omit<MemoryRecord, "memoryId" | "createdAt" | "updatedAt" | "health">,
  ): void {
    const result = ingestMemory(Object.values(world.memories), draft);
    if (result.superseded) {
      for (const id of result.superseded) {
        this.emit(world, "MemoryUpdated", { memoryId: id, patch: { health: "superseded" } });
      }
    }
    if (result.discarded === "deduplicated") {
      this.emit(
        world,
        "MemoryUpdated",
        { memoryId: result.accepted.memoryId, patch: result.accepted },
        { missionId: draft.missionId },
      );
      return;
    }
    this.emit(
      world,
      "MemoryCreated",
      { memory: result.accepted },
      { missionId: draft.missionId },
    );
  }

  private discoverMcp(world: WorldSnapshot, agent: AgentInstance, projectPath: string): void {
    const rec = Object.values(world.mcpServers ?? {})[0] ?? seedMcpRecord();
    this.tool(world, agent, "mcp.discover", { serverId: rec.serverId });
    const listed = invokeMcpOnce({
      record: rec,
      agent,
      env: { ...process.env, NORTHSTAR_ROOT: projectPath },
    });
    if (listed.ok) {
      this.emit(world, "McpToolCalled", { tool: "tools/list", text: listed.text }, {
        missionId: agent.missionId,
        agentId: agent.agentId,
      });
      this.emit(world, "McpServerRegistered", { server: rec }, { missionId: agent.missionId });
    } else {
      this.emit(
        world,
        "McpToolDenied",
        { tool: "tools/list", reason: listed.reason },
        { missionId: agent.missionId, agentId: agent.agentId },
      );
    }
  }

  private callMcp(world: WorldSnapshot, agent: AgentInstance, projectPath: string, tool: string): string {
    const rec = Object.values(world.mcpServers ?? {})[0] ?? seedMcpRecord();
    if (!tool) {
      this.discoverMcp(world, agent, projectPath);
      return rec.tools.map((t) => t.name).join(", ");
    }
    this.tool(world, agent, "mcp.invoke", { tool });
    const result = invokeMcpOnce({
      record: rec,
      agent,
      tool,
      env: { ...process.env, NORTHSTAR_ROOT: projectPath },
    });
    if (result.ok) {
      this.emit(
        world,
        "McpToolCalled",
        { tool, text: result.text?.slice(0, 500) },
        { missionId: agent.missionId, agentId: agent.agentId },
      );
      return result.text ?? "";
    }
    this.emit(
      world,
      "McpToolDenied",
      { tool, reason: result.reason },
      { missionId: agent.missionId, agentId: agent.agentId },
    );
    return "";
  }

  private ensureWorktree(world: WorldSnapshot, mission: Mission, agent: AgentInstance): void {
    if (agent.worktreeId && world.worktrees[agent.worktreeId]) return;
    const authz = authorizeTool(agent, "git.worktree");
    if (!authz.ok) {
      this.deny(world, agent, "git.worktree", authz.reason);
      return;
    }
    const created = createWorktree(world.operatorId, mission.missionId, agent.agentId, mission.projectPath);
    const worktree: WorktreeRecord = {
      worktreeId: makeId("wt"),
      missionId: mission.missionId,
      agentId: agent.agentId,
      branch: `aj/${mission.missionId.slice(0, 8)}/${agent.role}`,
      path: created.path,
      baseRevision: "workspace",
      changedFiles: [],
      mergeStatus: "open",
    };
    this.emit(world, "WorktreeCreated", { worktree }, { missionId: mission.missionId, agentId: agent.agentId });
    saveCheckpoint(world.operatorId, mission.missionId, world.seq, created.path);
  }

  private tool(world: WorldSnapshot, agent: AgentInstance, tool: ToolName, args: Record<string, unknown>): void {
    const authz = authorizeTool(agent, tool);
    if (!authz.ok) {
      this.deny(world, agent, tool, authz.reason);
      return;
    }
    this.gateway(world, agent, tool, () => args);
  }

  private gateway<T>(world: WorldSnapshot, agent: AgentInstance, tool: ToolName, exec: () => T): T {
    const authz = authorizeTool(agent, tool);
    this.emit(
      world,
      "ToolRequested",
      { tool, argsPreview: tool },
      { missionId: agent.missionId, agentId: agent.agentId },
    );
    if (!authz.ok) {
      this.deny(world, agent, tool, authz.reason);
      throw new Error(authz.reason);
    }
    if (tool === "git.merge") {
      const ballots = this.swarmBallots(world, agent.missionId);
      if (ballots.length) {
        const merge = mayMerge(tallyConsensus(ballots));
        if (!merge.ok) {
          this.deny(world, agent, tool, merge.reason);
          throw new Error(merge.reason);
        }
      }
    }
    const mission = world.missions[agent.missionId];
    if (mission) {
      const eco = assessBudget(mission.budget);
      if (eco.action === "renegotiate") {
        const granted = this.renegotiateBudget(world, mission, agent);
        if (!granted) {
          throw new Error("budget negotiation denied");
        }
      } else if (eco.action === "stop") {
        this.emit(world, "BudgetExhausted", { verdict: eco }, { missionId: mission.missionId, agentId: agent.agentId });
        this.emit(world, "MissionPaused", { reason: eco.reason }, { missionId: mission.missionId });
        mission.state = "PAUSED";
        throw new Error(eco.reason);
      }
      if (eco.action === "ask-human") {
        this.emit(world, "BudgetExhausted", { verdict: eco }, { missionId: mission.missionId });
        this.emit(
          world,
          "ApprovalRequested",
          {
            approval: {
              approvalId: makeId("appr"),
              missionId: mission.missionId,
              agentId: agent.agentId,
              action: "budget.continue",
              arguments: {},
              reason: eco.reason,
              affected: [],
              risk: "high",
              status: "pending",
              createdAt: nowIso(),
            },
          },
          { missionId: mission.missionId },
        );
        mission.state = "WAITING_APPROVAL";
        throw new Error(eco.reason);
      }
    }
    if (stationOf(world).policyDryRun) {
      this.emit(world, "ToolDryRun", { tool, decision: "would-allow" }, { missionId: agent.missionId, agentId: agent.agentId });
      return undefined as T;
    }
    agent.budget.toolCallsUsed += 1;
    agent.budget.tokensUsed += 180;
    agent.budget.moneyUsed += 0.004;
    if (mission) {
      mission.budget.tokensUsed += 180;
      mission.budget.moneyUsed += 0.004;
    }
    const result = exec();
    this.emit(world, "ToolExecuted", { tool, ok: true }, { missionId: agent.missionId, agentId: agent.agentId });
    this.emit(
      world,
      "BudgetConsumed",
      { budget: agent.budget, missionBudget: mission?.budget },
      { missionId: agent.missionId, agentId: agent.agentId },
    );
    return result;
  }

  /** aj-local resource manager. Implementer cannot grant itself. Once only. */
  renegotiateBudget(
    world: WorldSnapshot,
    mission: Mission,
    agent: AgentInstance,
    lastError?: string,
  ): boolean {
    const request = buildNegotiationRequest({
      mission,
      agentId: agent.agentId,
      role: agent.role,
      wastedCalls: Math.max(0, agent.budget.toolCallsUsed - mission.tasks.filter((t) => t.state === "COMPLETE").length),
      lastError: sanitizeReason(lastError ?? "unexpected cost near completion"),
    });
    this.emit(world, "BudgetNegotiationRequested", { request }, { missionId: mission.missionId, agentId: agent.agentId });
    const key = `${agent.role}::`;
    const profile =
      Object.values(world.performance?.agents ?? {}).find((p) => p.role === agent.role) ??
      Object.values(world.performance?.agents ?? {}).find((p) => p.profileId.includes(key)) ??
      null;
    const decision = evaluateNegotiation(request, profile, (mission.budget.extensionsGranted ?? 0) >= 1, mission.budget);
    if (!decision.granted) {
      this.emit(world, "BudgetNegotiationDenied", { request, decision }, { missionId: mission.missionId, agentId: agent.agentId });
      this.emit(world, "BudgetExhausted", { verdict: { action: "stop", reason: decision.reason } }, { missionId: mission.missionId });
      this.emit(world, "MissionFailed", { reason: decision.reason }, { missionId: mission.missionId });
      mission.state = "FAILED";
      return false;
    }
    mission.budget.tokens += decision.extraTokens;
    mission.budget.moneyUsd = Number((mission.budget.moneyUsd + decision.extraUsd).toFixed(4));
    mission.budget.extensionsGranted = (mission.budget.extensionsGranted ?? 0) + 1;
    this.emit(world, "BudgetRenegotiated", { request, decision, budget: mission.budget }, { missionId: mission.missionId, agentId: agent.agentId });
    return true;
  }

  private deny(world: WorldSnapshot, agent: AgentInstance, tool: string, reason: string): void {
    this.emit(
      world,
      "ToolDenied",
      { tool, reason },
      {
        missionId: agent.missionId,
        agentId: agent.agentId,
        why: {
          because: [reason, "Policy firewall is above the Commander."],
          sources: [{ kind: "policy", id: tool, score: 1, trust: 1 }],
        },
      },
    );
  }

  private heartbeat(world: WorldSnapshot, agent: AgentInstance, note: string): void {
    this.emit(
      world,
      "AgentHeartbeat",
      {
        heartbeat: {
          at: nowIso(),
          currentTask: note,
          progress: agent.state === "COMPLETE" ? 1 : 0.4,
          resourceUse: { cpu: 0.12, ramMb: 48 },
          note,
        },
      },
      { missionId: agent.missionId, agentId: agent.agentId },
    );
  }

  private setAgent(world: WorldSnapshot, agent: AgentInstance, state: AgentInstance["state"]): void {
    this.emit(world, "AgentStateChanged", { state }, { missionId: agent.missionId, agentId: agent.agentId });
  }

  private completeTask(world: WorldSnapshot, mission: Mission, task: TaskNode, agent: AgentInstance): void {
    task.state = "COMPLETE";
    task.completedAt = nowIso();
    this.emit(world, "TaskGraphMutated", { tasks: mission.tasks }, { missionId: mission.missionId });
    if (agent.role !== "commander" && agent.role !== "final-verifier") {
      this.setAgent(world, agent, "COMPLETE");
    }
  }

  private detectStalls(world: WorldSnapshot, mission: Mission): void {
    const now = Date.now();
    for (const agent of Object.values(world.agents)) {
      if (agent.missionId !== mission.missionId) continue;
      if (agent.state !== "RUNNING" && agent.state !== "PREPARING") continue;
      if (!agent.lastHeartbeatAt) continue;
      const age = now - Date.parse(agent.lastHeartbeatAt);
      if (age > HEARTBEAT_STALE_MS) {
        this.emit(
          world,
          "RecoveryStarted",
          { reason: "stale heartbeat" },
          { missionId: mission.missionId, agentId: agent.agentId },
        );
        this.heartbeat(world, agent, "Recovered after stale heartbeat");
      }
    }
  }

  private recordPerformance(world: WorldSnapshot, mission: Mission, result: "PASS" | "FAIL" | "PARTIAL" | "BLOCKED"): void {
    const feature = this.features.get(mission.missionId) ?? resolveFeature(mission.objective);
    const routed = this.missionRoute.get(mission.missionId);
    const cls = routed?.taskClass ?? classifyTask(mission.objective, feature.key);
    const latencyMs = Math.max(1, Date.now() - Date.parse(mission.createdAt));
    const success = result === "PASS";
    const verifierReject = result === "FAIL" || result === "PARTIAL";
    world.performance = world.performance ?? { agents: {}, models: {} };

    for (const agent of Object.values(world.agents)) {
      if (agent.missionId !== mission.missionId || agent.role === "commander") continue;
      const denials = world.events.filter((e) => e.type === "ToolDenied" && e.agentId === agent.agentId).length;
      const key = profileKey(agent.role, cls.domain, cls.language);
      const prev = world.performance.agents[key] ?? emptyAgentProfile(agent.role, cls.domain, cls.language);
      const sample: Sample = {
        role: agent.role,
        domain: cls.domain,
        language: cls.language,
        provider: agent.model.startsWith("xai") ? "xai-grok" : "aj-local",
        capability: cls.capability,
        success: agent.state === "COMPLETE" && success,
        firstPass: success && agent.budget.retriesUsed === 0,
        verifierReject: agent.role !== "final-verifier" && verifierReject,
        retries: agent.budget.retriesUsed,
        latencyMs,
        cost: agent.budget.moneyUsed,
        rollback: agent.failures.length > 0,
        policyDenials: denials,
        toolFailures: agent.failures.length,
        toolCalls: Math.max(1, agent.budget.toolCallsUsed),
      };
      const next = applyAgentSample(prev, sample);
      this.emit(world, "ReputationUpdated", { kind: "agent", key, profile: next }, { missionId: mission.missionId, agentId: agent.agentId });
    }

    const provider = routed?.provider ?? "aj-local";
    const mk = modelKey(provider, cls.capability, cls.domain);
    const prevModel = world.performance.models[mk] ?? emptyModelProfile(provider, cls.capability, cls.domain);
    const modelSample: Sample = {
      role: "commander",
      domain: cls.domain,
      language: cls.language,
      provider,
      capability: cls.capability,
      success,
      firstPass: success,
      verifierReject,
      retries: 0,
      latencyMs,
      cost: mission.budget.moneyUsed,
      rollback: !success,
      policyDenials: 0,
      toolFailures: 0,
      toolCalls: 1,
    };
    this.emit(
      world,
      "ReputationUpdated",
      { kind: "model", key: mk, profile: applyModelSample(prevModel, modelSample) },
      { missionId: mission.missionId },
    );
  }

  submitComposer(
    operatorId: string,
    input: { text: string; computerId?: string; contextIds?: string[] },
  ) {
    const world = this.load(operatorId);
    const st = stationOf(world);
    const parsed = parseComposer(input.text);
    const computer = pickComputer(world, input.computerId) ?? seedLocalComputer(world, defaultProjectPath());
    const contexts = [...(input.contextIds ?? []).map((id) => st.contexts[id]).filter(Boolean)];
    for (const mention of parsed.mentions) {
      const ctx = resolveMention(world, mention.kind, mention.query, computer.path);
      st.contexts[ctx.contextId] = ctx;
      contexts.push(ctx);
    }
    const userMsg = message("user", "operator", parsed.text || input.text, {
      command: parsed.command,
      mentions: parsed.mentions.map((m) => m.raw),
      contextIds: contexts.map((c) => c.contextId),
    });
    st.messages.push(userMsg);

    if (parsed.command === "deploy") {
      st.messages.push(message("commander", "AJ Commander", commanderReply({ text: "", command: "deploy", contexts })));
      this.touchStation(world, "ChatPosted");
      return this.view(operatorId);
    }

    const inspected = parsed.command ? inspectCommand(world, parsed.command) : "";
    if (inspected) {
      st.messages.push(message("commander", "AJ Commander", inspected, { command: parsed.command }));
      this.touchStation(world, "ChatPosted");
      return this.view(operatorId);
    }

    if (parsed.command === "computer") {
      const pc = createComputer(world, { template: "node-fullstack", name: "Agent sandbox" });
      st.messages.push(
        message("commander", "AJ Commander", `Sandbox computer ${pc.name} is ready. Isolated tree — not a cloud VM.`),
      );
      this.touchStation(world, "ComputerCreated");
      return this.view(operatorId);
    }

    if (parsed.command === "fork") {
      const child = forkComputer(world, computer.computerId);
      st.messages.push(message("commander", "AJ Commander", `Forked ${computer.name} → ${child.name}.`));
      this.touchStation(world, "ComputerForked");
      return this.view(operatorId);
    }

    if (parsed.command === "checkpoint") {
      const snap = snapshotComputer(world, computer.computerId, parsed.text || "manual checkpoint");
      st.messages.push(message("commander", "AJ Commander", `Snapshot ${snap.title} stored.`));
      this.touchStation(world, "ComputerSnapshot");
      return this.view(operatorId);
    }

    if (parsed.command === "rollback") {
      const last = Object.values(st.snapshots).filter((s) => s.computerId === computer.computerId).at(-1);
      if (!last) st.messages.push(message("commander", "AJ Commander", "No snapshot to restore."));
      else {
        restoreSnapshot(world, last.snapshotId);
        st.messages.push(message("commander", "AJ Commander", `Restored ${last.title}.`));
      }
      this.touchStation(world, "ComputerSnapshot");
      return this.view(operatorId);
    }

    if (parsed.command === "terminal" && parsed.text) {
      return this.execTerminal(operatorId, { computerId: computer.computerId, command: parsed.text });
    }

    if (parsed.command === "arena") {
      return this.startArena(operatorId, playbookObjective(parsed.command, parsed.text) || "Fix the Northstar operator console login");
    }

    if (parsed.command === "redteam") {
      return this.runAdversary(operatorId, { computerId: computer.computerId });
    }

    if (parsed.command === "work") {
      return this.startWorkRoom(operatorId, {
        objective: parsed.text || "Redesign authentication architecture",
        preset: inferPreset(parsed.text || "redesign authentication"),
      });
    }

    const objective = playbookObjective(parsed.command, parsed.text);
    if (shouldDraftSpec(parsed.command, objective, parsed.flags) && objective) {
      const spec = draftUnderstanding(objective, computer.path);
      const plan = draftPlan(spec, objective);
      st.specs[spec.specId] = spec;
      st.plans[plan.planId] = plan;
      st.messages.push(
        message("commander", "AJ Commander", commanderReply({ text: objective, command: parsed.command, contexts, spec }), {
          specId: spec.specId,
          planId: plan.planId,
        }),
      );
      if (st.autonomy === "autopilot" || parsed.flags.autopilot) {
        return this.approvePlan(operatorId, { planId: plan.planId, computerId: computer.computerId });
      }
      this.touchStation(world, "SpecCreated");
      return this.view(operatorId);
    }

    st.messages.push(
      message(
        "commander",
        "AJ Commander",
        contexts.length
          ? commanderReply({ text: "Context attached. Tell me the outcome, or /plan.", contexts })
          : "Describe an outcome, use /plan, or pick a playbook. Large work waits for a spec.",
        { contextIds: contexts.map((c) => c.contextId) },
      ),
    );
    this.touchStation(world, "ChatPosted");
    return this.view(operatorId);
  }

  generateSpec(operatorId: string, specId: string) {
    const world = this.load(operatorId);
    const spec = stationOf(world).specs[specId];
    if (!spec) return this.view(operatorId);
    spec.status = "ready";
    stationOf(world).messages.push(
      message("commander", "AJ Commander", `Spec ready. ${spec.requirements.length} requirements. Risk ${spec.risk}. Approve the plan to staff.`, { specId }),
    );
    this.touchStation(world, "SpecCreated");
    return this.view(operatorId);
  }

  approvePlan(operatorId: string, input: { planId: string; computerId?: string }) {
    const world = this.load(operatorId);
    const st = stationOf(world);
    const plan = st.plans[input.planId];
    const spec = plan ? st.specs[plan.specId] : undefined;
    if (!plan || !spec) return this.view(operatorId);
    plan.status = "approved";
    spec.status = "approved";
    const computer = pickComputer(world, input.computerId);
    const mission = this.startMission(operatorId, spec.goal, computer && computer.kind === "sandbox" ? computer.path : undefined);
    plan.missionId = mission.missionId;
    plan.status = "running";
    spec.missionId = mission.missionId;
    if (computer) computer.missionId = mission.missionId;
    st.messages.push(
      message("commander", "AJ Commander", `Plan approved. Mission “${mission.title}” is live.`, {
        planId: plan.planId,
        specId: spec.specId,
        missionId: mission.missionId,
      }),
    );
    this.touchStation(world, "PlanReviewed");
    return this.view(operatorId);
  }

  editPlanStep(operatorId: string, input: { planId: string; stepId: string; title: string }) {
    const world = this.load(operatorId);
    const step = stationOf(world).plans[input.planId]?.steps.find((s) => s.stepId === input.stepId);
    if (step) {
      step.title = input.title;
      step.edited = true;
    }
    this.touchStation(world, "PlanReviewed");
    return this.view(operatorId);
  }

  rejectPlan(operatorId: string, planId: string) {
    const world = this.load(operatorId);
    const plan = stationOf(world).plans[planId];
    if (plan) plan.status = "rejected";
    stationOf(world).messages.push(message("commander", "AJ Commander", "Plan rejected. Nothing executed."));
    this.touchStation(world, "PlanReviewed");
    return this.view(operatorId);
  }

  attachContext(
    operatorId: string,
    input: { kind: import("../protocol/station.ts").ContextKind; ref: string; extra?: string; computerId?: string },
  ) {
    const world = this.load(operatorId);
    const computer = pickComputer(world, input.computerId) ?? seedLocalComputer(world, defaultProjectPath());
    const ctx = attachManual(input.kind, input.ref, computer.path, input.extra);
    stationOf(world).contexts[ctx.contextId] = ctx;
    this.touchStation(world, "ContextAttached");
    return ctx;
  }

  setAutonomy(operatorId: string, autonomy: import("../protocol/station.ts").AutonomyUx) {
    const world = this.load(operatorId);
    stationOf(world).autonomy = autonomy;
    this.touchStation(world, "StationMutated");
    return this.view(operatorId);
  }

  setQuality(operatorId: string, quality: import("../protocol/station.ts").QualityMode) {
    const world = this.load(operatorId);
    stationOf(world).quality = quality;
    this.touchStation(world, "StationMutated");
    return this.view(operatorId);
  }

  provisionComputer(operatorId: string, template: import("../protocol/station.ts").ComputerTemplate) {
    const world = this.load(operatorId);
    createComputer(world, { template });
    this.touchStation(world, "ComputerCreated");
    return this.view(operatorId);
  }

  snapshotNow(operatorId: string, computerId: string, title: string) {
    const world = this.load(operatorId);
    snapshotComputer(world, computerId, title);
    this.touchStation(world, "ComputerSnapshot");
    return this.view(operatorId);
  }

  forkNow(operatorId: string, computerId: string) {
    const world = this.load(operatorId);
    forkComputer(world, computerId);
    this.touchStation(world, "ComputerForked");
    return this.view(operatorId);
  }

  restoreNow(operatorId: string, snapshotId: string) {
    const world = this.load(operatorId);
    restoreSnapshot(world, snapshotId);
    this.touchStation(world, "ComputerSnapshot");
    return this.view(operatorId);
  }

  destroyNow(operatorId: string, computerId: string) {
    const world = this.load(operatorId);
    destroyComputer(world, computerId);
    this.touchStation(world, "StationMutated");
    return this.view(operatorId);
  }

  execTerminal(operatorId: string, input: { computerId?: string; sessionId?: string; command: string; asAgent?: boolean }) {
    const world = this.load(operatorId);
    const st = stationOf(world);
    const computer = pickComputer(world, input.computerId) ?? seedLocalComputer(world, defaultProjectPath());
    let session = input.sessionId
      ? st.terminals[input.sessionId]
      : Object.values(st.terminals).find((t) => t.computerId === computer.computerId);
    if (!session) session = openTerminal(world, computer, input.asAgent ? "Agent" : "User");
    if (session.owner === "agent" && !input.asAgent) {
      session.output += "\n(take control before typing — agent owns this session)\n";
      this.touchStation(world, "TerminalExecuted");
      return this.view(operatorId);
    }
    const tainted = Object.values(st.contexts)
      .filter((c) => c.tainted)
      .map((c) => c.preview);
    st.terminals[session.sessionId] = runTerminal(session, input.command, st.policy, tainted, Object.values(st.contexts));
    this.touchStation(world, "TerminalExecuted");
    return this.view(operatorId);
  }

  takeoverTerminal(operatorId: string, sessionId: string, owner: "user" | "agent") {
    const world = this.load(operatorId);
    const session = stationOf(world).terminals[sessionId];
    if (session) session.owner = owner;
    this.touchStation(world, "TerminalExecuted");
    return this.view(operatorId);
  }

  writeEditorFile(operatorId: string, input: { computerId?: string; path: string; content: string }) {
    const world = this.load(operatorId);
    const st = stationOf(world);
    const computer = pickComputer(world, input.computerId) ?? seedLocalComputer(world, defaultProjectPath());
    const written = writeSource(computer.path, input.path, input.content, st.policy);
    const snippet = snippetForEdit(computer.path, input.path);
    if (snippet) this.emit(world, "WorkspaceContextInjected", { file: input.path, snippet });
    this.touchStation(world, "SourceWritten");
    return { ok: written.ok, reason: written.ok ? undefined : written.reason, view: this.view(operatorId) };
  }

  readEditorFile(operatorId: string, input: { computerId?: string; path: string }) {
    const world = this.load(operatorId);
    const computer = pickComputer(world, input.computerId) ?? seedLocalComputer(world, defaultProjectPath());
    return { path: input.path, content: readSourceFile(computer.path, input.path) ?? "", tree: listTree(computer.path) };
  }

  searchEditor(operatorId: string, query: string, computerId?: string) {
    const world = this.load(operatorId);
    const computer = pickComputer(world, computerId) ?? seedLocalComputer(world, defaultProjectPath());
    return searchInTree(computer.path, query);
  }

  liveBrowser(operatorId: string, input?: { computerId?: string }) {
    const world = this.load(operatorId);
    const st = stationOf(world);
    const computer = pickComputer(world, input?.computerId) ?? seedLocalComputer(world, defaultProjectPath());
    const web = join(computer.path, "web");
    const root = existsSync(web) ? web : computer.path;
    const obs = runBrowserScriptSync({
      root,
      screenshotDir: join(operatorDir(world.operatorId), "artifacts"),
    });
    st.live = {
      agentTitle: "Browser verifier",
      goal: "Verify the live surface",
      action: obs.passed ? "Sign in available" : obs.defects[0] ?? "Inspect",
      reason: "Computer-use workbench",
      paused: false,
      screenshot: encodeScreenshot(obs.screenshotPath),
    };
    this.touchStation(world, "BrowserAction");
    return { observation: obs, screenshot: st.live.screenshot, view: this.view(operatorId) };
  }

  pauseLive(operatorId: string, paused: boolean) {
    const world = this.load(operatorId);
    stationOf(world).live = { ...(stationOf(world).live ?? {}), paused };
    this.touchStation(world, "StationMutated");
    return this.view(operatorId);
  }

  startArena(operatorId: string, objective: string) {
    const world = this.load(operatorId);
    stationOf(world).messages.push(message("commander", "AJ Commander", `Opening a solution arena for: ${objective}`));
    const arena = runArena(world, objective);
    stationOf(world).messages.push(
      message("commander", "AJ Commander", arena.winner ? `Judge selected ${arena.winner}. ${arena.why}` : arena.why),
    );
    this.touchStation(world, "ArenaJudged");
    return this.view(operatorId);
  }

  runAdversary(operatorId: string, input?: { computerId?: string; missionId?: string }) {
    const world = this.load(operatorId);
    const computer = pickComputer(world, input?.computerId) ?? seedLocalComputer(world, defaultProjectPath());
    const report = runRedTeam(computer.path, input?.missionId);
    stationOf(world).redteams.push(report);
    stationOf(world).messages.push(
      message(
        "commander",
        "AJ Commander",
        report.passed ? "Red team could not break the tree." : `Red team: ${report.findings[0]?.title ?? "findings"}.`,
      ),
    );
    this.touchStation(world, "RedTeamFinished");
    return this.view(operatorId);
  }

  branchMission(operatorId: string, fromMissionId: string) {
    const world = this.load(operatorId);
    const from = world.missions[fromMissionId];
    if (!from) return this.view(operatorId);
    const computer = createComputer(world, { template: "node-fullstack", name: `Branch of ${from.title}` });
    const mission = this.startMission(operatorId, from.objective, computer.path);
    const branch = {
      branchId: makeId("br"),
      fromMissionId,
      missionId: mission.missionId,
      title: `Branch · ${from.title}`,
      createdAt: nowIso(),
    };
    stationOf(world).branches[branch.branchId] = branch;
    stationOf(world).messages.push(
      message("commander", "AJ Commander", "Mission branched onto an isolated computer.", { missionId: mission.missionId }),
    );
    this.touchStation(world, "MissionBranched");
    return this.view(operatorId);
  }

  setPermission(
    operatorId: string,
    input: { capability: string; role: string; mode: import("../protocol/station.ts").GrantMode },
  ) {
    const world = this.load(operatorId);
    const st = stationOf(world);
    st.policy = setCell(st.policy, input.capability, input.role, input.mode);
    this.touchStation(world, "PermissionChanged");
    return this.view(operatorId);
  }

  dryRun(operatorId: string, objective: string) {
    const world = this.load(operatorId);
    const computer = pickComputer(world) ?? seedLocalComputer(world, defaultProjectPath());
    const spec = draftUnderstanding(objective, computer.path);
    const plan = draftPlan(spec, objective);
    const report = policyDryRun(objective, stationOf(world).policy);
    stationOf(world).specs[spec.specId] = spec;
    stationOf(world).plans[plan.planId] = plan;
    stationOf(world).lastDryRun = report;
    stationOf(world).messages.push(
      message(
        "commander",
        "AJ Commander",
        `Policy dry-run — nothing executed. ${report.wouldExecute} would run · ${report.wouldDeny} refused.\n${report.steps.map((s) => `${s.decision === "would-deny" ? "✗" : "·"} ${s.role} ${s.tool} — ${s.reason}`).join("\n")}`,
        { specId: spec.specId, planId: plan.planId },
      ),
    );
    this.emit(world, "ToolDryRun", { report }, { why: { because: [report.claim], sources: [{ kind: "policy", id: "dry-run", score: 1, trust: 1 }] } });
    this.touchStation(world, "SpecCreated");
    return this.view(operatorId);
  }

  exportAudit(operatorId: string, missionId: string) {
    const world = this.load(operatorId);
    const { path, bundle } = writeAuditBundle(operatorId, missionId, world);
    stationOf(world).lastAuditPath = path;
    this.emit(world, "AuditExported", { path, missionId, claim: AUDIT_CLAIM }, { missionId });
    this.touchStation(world, "AuditExported");
    return { path, bundle, view: this.view(operatorId) };
  }

  executeRewindSelf(
    operatorId: string,
    missionId: string,
    agentId: string,
    targetSeq: number,
    reason: string,
  ): { ok: boolean; reason?: string; hint?: string } {
    const world = this.load(operatorId);
    const mission = world.missions[missionId];
    const agent = world.agents[agentId];
    if (!mission || !agent) return { ok: false, reason: "unknown mission or agent" };
    const authz = authorizeTool(agent, "rewind.self");
    if (!authz.ok) {
      this.emit(world, "RewindSelfDenied", { reason: authz.reason, targetSeq }, { missionId, agentId });
      return { ok: false, reason: authz.reason };
    }
    const createdSeq = missionCreatedSeq(world.events, missionId);
    const gate = authorizeRewindSelf({
      targetSeq,
      currentSeq: world.seq,
      rewindCount: mission.rewindCount ?? 0,
      missionCreatedSeq: createdSeq,
    });
    const request = { target_seq: targetSeq, reason: rewindPrompt(reason).slice(80) ? reason : reason };
    this.emit(world, "RewindSelfRequested", { targetSeq, reason: sanitizeReason(reason), request }, { missionId, agentId });
    if (!gate.ok) {
      this.emit(world, "RewindSelfDenied", { reason: gate.reason, targetSeq }, { missionId, agentId });
      if (gate.escalate) {
        mission.state = "WAITING_APPROVAL";
        this.emit(world, "RewindEscalated", { reason: gate.reason, used: MAX_SELF_REWINDS }, { missionId, agentId });
      }
      return { ok: false, reason: gate.reason };
    }
    const wt = agent.worktreeId ? world.worktrees[agent.worktreeId] : Object.values(world.worktrees).find((w) => w.missionId === missionId);
    if (wt) restoreCheckpoint(operatorId, missionId, targetSeq, wt.path);
    const hint = rewindPrompt(reason);
    const branch = {
      branchId: makeId("br"),
      fromSeq: targetSeq + 1,
      toSeq: world.seq,
      reason: sanitizeReason(reason),
      at: nowIso(),
    };
    mission.rewindCount = (mission.rewindCount ?? 0) + 1;
    mission.rewindHint = hint;
    mission.pruned = [...(mission.pruned ?? []), branch];
    this.emit(world, "BranchPruned", { branch }, { missionId, agentId });
    this.emit(
      world,
      "RewindBranched",
      { targetSeq, rewindCount: mission.rewindCount, hint, branch },
      { missionId, agentId },
    );
    return { ok: true, hint };
  }

  rewindMission(operatorId: string, seq: number) {
    const world = rewindToSeq(operatorId, seq);
    this.worlds.set(operatorId, world);
    this.emit(world, "MissionRewound", { seq }, { why: { because: [`Rewound ledger to seq ${seq}.`], sources: [{ kind: "operator", id: operatorId, score: 1, trust: 1 }] } });
    return this.view(operatorId);
  }

  spawnSwarm(operatorId: string, missionId: string, mode: ConsensusMode = "majority") {
    const world = this.load(operatorId);
    const mission = world.missions[missionId];
    if (!mission) return this.view(operatorId);
    const spawned = DEFAULT_SWARM.map((persona) =>
      this.spawnAgent(world, {
        missionId,
        parentAgentId: mission.commanderId ?? null,
        role: persona.role,
        title: persona.title,
        objective: `${persona.title} on ${mission.title}`,
        autonomy: 40,
      }),
    );
    for (const agent of spawned) {
      const persona = DEFAULT_SWARM.find((p) => p.role === agent.role);
      if (persona) agent.model = persona.engine;
    }
    this.emit(world, "SwarmSpawned", { missionId, mode, agents: spawned.map((a) => ({ agentId: a.agentId, role: a.role, model: a.model })) }, { missionId });
    return this.view(operatorId);
  }

  recordSwarmBallot(operatorId: string, ballot: Omit<SwarmBallot, "ballotId" | "at">) {
    const world = this.load(operatorId);
    const recorded = recordBallot(ballot);
    this.emit(world, "SwarmBallot", { ballot: recorded }, { missionId: ballot.missionId, agentId: ballot.agentId });
    const all = this.swarmBallots(world, ballot.missionId);
    const consensus = tallyConsensus(all);
    this.emit(world, consensus.ok ? "ConsensusReached" : "ConsensusDenied", { consensus }, { missionId: ballot.missionId });
    if (consensus.resolution) {
      this.emit(world, "ResolutionSessionOpened", { session: resolutionSession(all) }, { missionId: ballot.missionId });
    }
    return { ballot: recorded, consensus, view: this.view(operatorId) };
  }

  swarmBallots(world: WorldSnapshot, missionId: string): SwarmBallot[] {
    return world.events
      .filter((e) => e.type === "SwarmBallot" && e.missionId === missionId && e.payload.ballot)
      .map((e) => e.payload.ballot as unknown as SwarmBallot);
  }

  invokeMercenary(operatorId: string, frame: MercenaryFrame, payload: string, expectedToken: string) {
    const world = this.load(operatorId);
    const auth = authorizeMercenaryFrame(frame, expectedToken);
    if (!auth.ok) {
      this.emit(world, "MercenaryDenied", { reason: auth.reason }, {});
      return { ok: false as const, reason: auth.reason };
    }
    const reply = receiveMercenaryPayload(frame, payload);
    this.emit(world, "MercenaryInvoked", { frameId: frame.frameId, trustScore: reply.trustScore, cannotCertify: true }, {});
    return { ok: true as const, reply };
  }

  resumeAfterChaos(operatorId: string) {
    this.worlds.delete(operatorId);
    const resume = resumeFromLedger(operatorId);
    const world = this.load(operatorId);
    this.emit(world, "ChaosRecovered", { seq: resume.seq, inFlight: resume.inFlight, orphans: resume.orphans.length }, {});
    return resume;
  }

  overlayInvoke(operatorId: string, raw: string) {
    const parsed = parseOverlayIntent(raw);
    if (!parsed.ok) return { ok: false as const, reason: parsed.reason };
    const world = this.load(operatorId);
    if (parsed.intent.kind === "toggle") {
      this.emit(world, "OverlayInvoked", { action: "toggle" }, {});
      return { ok: true as const, action: "toggle" as const };
    }
    if (parsed.intent.kind === "stop") {
      const active = Object.values(world.missions).find((m) =>
        ["CREATED", "PLANNING", "RUNNING", "VERIFYING"].includes(m.state),
      );
      if (!active) {
        this.emit(world, "OverlayInvoked", { action: "stop", reason: "no-active" }, {});
        return { ok: false as const, reason: "no active mission" };
      }
      this.cancel(operatorId, active.missionId);
      this.emit(this.load(operatorId), "OverlayInvoked", { action: "stop", missionId: active.missionId }, { missionId: active.missionId });
      return { ok: true as const, action: "stop" as const, missionId: active.missionId };
    }
    const mission = this.startMission(operatorId, parsed.intent.objective);
    this.emit(this.load(operatorId), "OverlayInvoked", { action: "start", missionId: mission.missionId }, { missionId: mission.missionId });
    return { ok: true as const, action: "start" as const, missionId: mission.missionId };
  }

  inspectVisual(operatorId: string, html: string, root?: string) {
    const world = this.load(operatorId);
    const report = visualInspect(html, root);
    this.emit(world, "VisualInspected", { report }, {});
    return report;
  }

  observeBuild(operatorId: string, output: string, root?: string) {
    const world = this.load(operatorId);
    const finding = detectBuildFailure(output);
    if (!finding) return { proposed: false as const };
    const project = root ?? Object.values(world.missions).at(-1)?.projectPath ?? process.cwd();
    const proposal = proposeWatchdogFix(project, finding);
    this.emit(world, "WatchdogProposed", { proposal, finding }, {});
    return { proposed: true as const, proposal, finding };
  }

  approveWatchdog(operatorId: string, proposal: WatchdogProposal, root: string, approved: boolean) {
    const world = this.load(operatorId);
    const result = applyWatchdogFix(root, proposal, approved);
    this.emit(world, result.ok ? "WatchdogApplied" : "WatchdogDenied", { reason: result.reason, file: proposal.file }, {});
    return result;
  }

  setPolicyDryRun(operatorId: string, on: boolean) {
    const world = this.load(operatorId);
    stationOf(world).policyDryRun = on;
    this.touchStation(world, "StationMutated");
    return this.view(operatorId);
  }

  private touchStation(world: WorldSnapshot, type: EventType): void {
    const st = stationOf(world);
    const shot = st.live?.screenshot;
    const persist = {
      ...st,
      live: st.live ? { ...st.live, screenshot: undefined } : undefined,
    };
    this.emit(world, type, { station: persist });
    if (shot && world.station?.live) world.station.live.screenshot = shot;
  }

  setOperatingMode(operatorId: string, mode: "one" | "work") {
    const world = this.load(operatorId);
    const st = stationOf(world);
    st.operatingMode = mode;
    this.touchStation(world, "WorkModeChanged");
    return this.view(operatorId);
  }

  startWorkRoom(
    operatorId: string,
    input: { objective: string; preset?: WorkPreset; quality?: "fast" | "balanced" | "max"; fromMissionId?: string },
  ) {
    const world = this.load(operatorId);
    const st = stationOf(world);
    st.operatingMode = "work";
    const objective = input.objective.trim();
    const preset = input.preset ?? inferPreset(objective);
    const quality = input.quality ?? (st.quality === "max" || st.quality === "fast" ? st.quality : "balanced");
    const project = pickComputer(world)?.path ?? defaultProjectPath();
    const from = input.fromMissionId ? world.missions[input.fromMissionId] : undefined;
    const feature = resolveFeature(objective);
    const missionId = makeId("msn");
    const mission: Mission = {
      missionId,
      operatorId,
      title: titleFrom(objective),
      objective,
      projectPath: from?.projectPath ?? project,
      state: "PLANNING",
      requirements: from?.requirements ?? [],
      constraints: [
        ...(from?.constraints ?? [
          "Child authority may not exceed parent.",
          "Discussion never grants execution permission.",
        ]),
      ],
      tasks: [],
      budget: {
        tokens: 180_000,
        tokensUsed: 0,
        moneyUsd: 6,
        moneyUsed: 0,
        timeMs: 20 * 60_000,
        parallelAgents: 6,
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
      mode: "work",
    };
    this.features.set(missionId, feature);
    this.emit(world, "MissionCreated", { mission }, { missionId, why: { because: [`WORK room for: ${objective}`], sources: [{ kind: "user", id: operatorId, score: 1, trust: 1 }] } });
    const commander = this.spawnAgent(world, {
      missionId,
      parentAgentId: null,
      role: "commander",
      title: "AJ Commander",
      objective: `Govern WORK room: ${objective}`,
      autonomy: ROLE_AUTONOMY.commander,
    });
    const stored = world.missions[missionId];
    if (stored) stored.commanderId = commander.agentId;
    this.setAgent(world, commander, "RUNNING");
    const council = selectCouncil(objective, preset, quality);
    const participants = [commander.agentId];
    for (const role of council) {
      const agent = this.spawnAgent(world, {
        missionId,
        parentAgentId: commander.agentId,
        role,
        title: titleForRole(role),
        objective: `Contribute as ${titleForRole(role)} in the WORK room. Do not implement until the decision is frozen and executed with ONE.`,
        autonomy: ROLE_AUTONOMY[role],
      });
      participants.push(agent.agentId);
      this.setAgent(world, agent, "RUNNING");
      this.heartbeat(world, agent, `Joined WORK council as ${agent.title}`);
    }
    const room: WorkRoom = {
      roomId: makeId("room"),
      missionId,
      objective,
      preset,
      quality,
      state: "open",
      round: "understand",
      participantIds: participants,
      messages: [
        workMessage(makeId("tmp"), commander.agentId, "commander", "PROPOSAL", `Understanding: ${objective}. Council is ${council.map(titleForRole).join(", ")}. Discussion does not grant write permission.`),
      ],
      proposals: [],
      constraints: [],
      experiments: [],
      votes: [],
      minority: [],
      whiteboard: { nodes: [], edges: [] },
      huddles: [],
      subrooms: [],
      confidence: [],
      budget: workBudget(quality, council.length),
      timeline: [
        { at: nowIso(), text: "Work room opened" },
        { at: nowIso(), text: `Council: ${council.map(titleForRole).join(", ")}` },
      ],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    room.messages[0]!.roomId = room.roomId;
    const agents = Object.values(world.agents).filter((a) => a.missionId === missionId);
    room.round = "proposals";
    room.budget.roundsUsed = 1;
    room.proposals = draftIndependentProposals(room, agents, mission.projectPath);
    room.timeline.push({ at: nowIso(), text: `Independent proposals: ${room.proposals.length}` });
    for (const p of room.proposals) {
      room.messages.push(
        workMessage(room.roomId, p.authorId, p.authorRole, "PROPOSAL", p.summary, { proposalId: p.proposalId }),
      );
    }
    const skip = new Set<WorkRoundKind>();
    if (quality === "fast") skip.add("experiments");
    room.round = "cross-exam";
    room.budget.roundsUsed += 1;
    room.messages.push(...crossExamine(room, agents));
    room.timeline.push({ at: nowIso(), text: "Cross-examination recorded" });
    const experimenter = agents.find((a) => a.role === "experiment-engineer" || a.role === "test-engineer" || a.role === "performance-engineer");
    if (experimenter && quality !== "fast") {
      room.round = "experiments";
      const exp = runRealExperiment(designAuthExperiment(room, experimenter), mission.projectPath);
      room.experiments.push(exp);
      room.budget.experimentsUsed += 1;
      room.messages.push(
        workMessage(
          room.roomId,
          experimenter.agentId,
          experimenter.role,
          "EVIDENCE",
          `Experiment ${exp.status}: ${exp.measurements.map((m) => `${m.name}=${m.value}${m.unit}`).join(", ")}`,
        ),
      );
      room.timeline.push({ at: nowIso(), text: `Experiment ${exp.status}` });
    }
    if (quality === "max") {
      const red = agents.find((a) => a.role === "red-team");
      if (red) {
        const report = runRedTeam(mission.projectPath, missionId);
        room.messages.push(
          workMessage(
            room.roomId,
            red.agentId,
            red.role,
            "RISK",
            report.passed ? "Red team could not break the tree." : `Red team: ${report.findings.map((f) => f.title).join("; ")}`,
          ),
        );
        room.timeline.push({ at: nowIso(), text: "Red team round" });
      }
    }
    decideRoom(room, agents);
    room.whiteboard = buildWhiteboard(room);
    if (room.decision) {
      const art = artifact(missionId, commander.agentId, "architecture", `WORK decision: ${room.decision.summary}`, room.decision.summary);
      this.emit(world, "ArtifactCreated", { artifact: art }, { missionId });
      writeArtifactFile(world.operatorId, art.artifactId, meetingArtifacts(room).map((a) => `# ${a.title}\n${a.body}`).join("\n\n"));
      this.remember(world, {
        missionId,
        klass: "decision",
        kind: "decision",
        title: room.decision.summary,
        body: `WORK decided ${room.decision.summary}. Dissent: ${room.minority[0]?.concern ?? "none"}.`,
        source: "work-room",
        evidence: room.experiments.map((e) => e.experimentId).slice(0, 3),
        confidence: 0.82,
        pinned: true,
      });
    }
    st.activeRoomId = room.roomId;
    world.rooms = world.rooms ?? {};
    world.rooms[room.roomId] = room;
    st.messages.push(
      message("commander", "AJ Commander", `WORK room open. ${room.proposals.length} independent proposals. Decision is not execution.`, {
        missionId,
      }),
    );
    this.emit(world, "WorkRoomOpened", { room, station: st }, { missionId });
    return this.view(operatorId);
  }

  steerWork(operatorId: string, input: { roomId?: string; text: string }) {
    const world = this.load(operatorId);
    const st = stationOf(world);
    const room = (input.roomId ? world.rooms?.[input.roomId] : world.rooms?.[st.activeRoomId ?? ""]) ?? Object.values(world.rooms ?? {})[0];
    if (!room) return this.startWorkRoom(operatorId, { objective: input.text });
    const parsed = parseWorkSteer(input.text);
    const agents = Object.values(world.agents).filter((a) => a.missionId === room.missionId);
    const commander = agents.find((a) => a.role === "commander");
    room.messages.push(workMessage(room.roomId, "user", "user", "STEER", input.text));
    if (parsed.target === "room" && parsed.constraint) {
      const c: WorkConstraint = {
        constraintId: makeId("cst"),
        text: parsed.body,
        locked: true,
        forbidden: parsed.constraint.forbidden,
        createdAt: nowIso(),
      };
      room.constraints.push(c);
      applyConstraints(room);
      room.messages.push(
        workMessage(
          room.roomId,
          commander?.agentId ?? "commander",
          "commander",
          "CONSTRAINT",
          `Locked constraint: ${c.forbidden ?? c.text} is FORBIDDEN. Conflicting proposals invalidated. Room continues.`,
        ),
      );
      room.timeline.push({ at: nowIso(), text: `Constraint locked: ${c.forbidden}` });
      room.whiteboard = buildWhiteboard(room);
      if (room.decision && room.proposals.find((p) => p.proposalId === room.decision?.proposalId)?.status === "invalid") {
        room.decision = undefined;
        decideRoom(room, agents);
      }
      this.emit(world, "WorkConstraintLocked", { room }, { missionId: room.missionId });
      return this.view(operatorId);
    }
    if (parsed.target !== "room" && parsed.target !== "unknown") {
      const target = agents.find((a) => a.role === parsed.target);
      if (target) {
        room.messages.push(
          workMessage(
            room.roomId,
            target.agentId,
            target.role,
            "ANSWER",
            `${titleForRole(target.role)} received a directed steer through Commander: ${parsed.body || "standing by with evidence, not hidden chain-of-thought."}`,
          ),
        );
        this.heartbeat(world, target, `Answered @${parsed.mention}`);
      }
    }
    room.updatedAt = nowIso();
    this.emit(world, "WorkMessagePosted", { room }, { missionId: room.missionId });
    return this.view(operatorId);
  }

  advanceWork(operatorId: string, roomId?: string) {
    const world = this.load(operatorId);
    const room = roomId ? world.rooms?.[roomId] : Object.values(world.rooms ?? {})[0];
    if (!room) return this.view(operatorId);
    if (room.budget.roundsUsed >= room.budget.maxRounds) {
      room.messages.push(
        workMessage(room.roomId, "commander", "commander", "BLOCKER", "Discussion limit reached. Switching to experiment or user decision."),
      );
      room.round = room.experiments.length ? "decision" : "experiments";
    } else {
      room.round = nextRound(room.round, new Set());
      room.budget.roundsUsed += 1;
    }
    room.timeline.push({ at: nowIso(), text: `Round → ${room.round}` });
    this.emit(world, "WorkRoundAdvanced", { room }, { missionId: room.missionId });
    return this.view(operatorId);
  }

  runWorkExperiment(operatorId: string, roomId?: string) {
    const world = this.load(operatorId);
    const room = roomId ? world.rooms?.[roomId] : Object.values(world.rooms ?? {})[0];
    if (!room) return this.view(operatorId);
    const mission = world.missions[room.missionId];
    const owner =
      Object.values(world.agents).find((a) => a.missionId === room.missionId && (a.role === "experiment-engineer" || a.role === "test-engineer")) ??
      Object.values(world.agents).find((a) => a.missionId === room.missionId && a.role === "commander");
    if (!mission || !owner) return this.view(operatorId);
    if (room.budget.experimentsUsed >= room.budget.maxExperiments) {
      room.messages.push(workMessage(room.roomId, owner.agentId, owner.role, "BLOCKER", "Experiment budget exhausted."));
      this.emit(world, "WorkExperimentRan", { room }, { missionId: room.missionId });
      return this.view(operatorId);
    }
    const exp = runRealExperiment(designAuthExperiment(room, owner), mission.projectPath);
    room.experiments.push(exp);
    room.budget.experimentsUsed += 1;
    room.round = "experiments";
    room.messages.push(
      workMessage(room.roomId, owner.agentId, owner.role, "EVIDENCE", `Measured: ${exp.measurements.map((m) => `${m.name}=${m.value}${m.unit}`).join(", ")}`),
    );
    decideRoom(room, Object.values(world.agents).filter((a) => a.missionId === room.missionId));
    this.emit(world, "WorkExperimentRan", { room }, { missionId: room.missionId });
    return this.view(operatorId);
  }

  freezeWorkDecision(operatorId: string, roomId?: string) {
    const world = this.load(operatorId);
    const room = roomId ? world.rooms?.[roomId] : Object.values(world.rooms ?? {})[0];
    if (!room?.decision) return this.view(operatorId);
    room.decision.frozen = true;
    room.state = "frozen";
    room.messages.push(workMessage(room.roomId, "commander", "commander", "DECISION", `FROZEN: ${room.decision.summary}. Change requires a Decision Change Request.`));
    this.emit(
      world,
      "DecisionCreated",
      {
        decision: {
          decisionId: makeId("dec"),
          missionId: room.missionId,
          question: room.objective,
          choice: room.decision.summary,
          options: room.proposals.map((p) => p.summary),
          evidence: room.experiments.map((e) => e.evidence).slice(0, 3),
          confidence: 0.8,
          author: "AJ Commander",
          dependencies: [],
          status: "accepted",
          affects: ["auth"],
          why: "WORK room evidence + votes inform Commander; votes do not bind.",
          createdAt: nowIso(),
        },
      },
      { missionId: room.missionId },
    );
    this.emit(world, "WorkDecisionFrozen", { room }, { missionId: room.missionId });
    return this.view(operatorId);
  }

  executeWorkWithOne(operatorId: string, roomId?: string) {
    const world = this.load(operatorId);
    const room = roomId ? world.rooms?.[roomId] : Object.values(world.rooms ?? {})[0];
    if (!room) return this.view(operatorId);
    const mission = world.missions[room.missionId];
    if (!mission) return this.view(operatorId);
    mission.mode = "one";
    mission.state = "PLANNING";
    room.round = "execution";
    room.state = "executing";
    stationOf(world).operatingMode = "one";
    this.due.set(mission.missionId, Date.now());
    room.timeline.push({ at: nowIso(), text: "EXECUTE WITH ONE" });
    this.emit(world, "WorkRoundAdvanced", { room }, { missionId: mission.missionId });
    return this.view(operatorId);
  }

  escalateToWork(operatorId: string, missionId: string) {
    const world = this.load(operatorId);
    const mission = world.missions[missionId];
    if (!mission) return this.view(operatorId);
    return this.startWorkRoom(operatorId, { objective: mission.objective, fromMissionId: missionId });
  }

  workHuddle(operatorId: string, input: { roomId?: string; roles: AgentRole[] }) {
    const world = this.load(operatorId);
    const room = input.roomId ? world.rooms?.[input.roomId] : Object.values(world.rooms ?? {})[0];
    if (!room) return this.view(operatorId);
    const agents = Object.values(world.agents).filter((a) => a.missionId === room.missionId && input.roles.includes(a.role));
    room.huddles.push({
      huddleId: makeId("hdl"),
      title: input.roles.map(titleForRole).join(" ↔ "),
      agentIds: agents.map((a) => a.agentId),
      summary: "Focused collaboration. Summary only — internals stay out of the main room.",
      status: "closed",
    });
    this.emit(world, "WorkMessagePosted", { room }, { missionId: room.missionId });
    return this.view(operatorId);
  }

  forkWorkProposal(operatorId: string, input: { roomId?: string; proposalId: string }) {
    const world = this.load(operatorId);
    const room = input.roomId ? world.rooms?.[input.roomId] : Object.values(world.rooms ?? {})[0];
    const src = room?.proposals.find((p) => p.proposalId === input.proposalId);
    if (!room || !src) return this.view(operatorId);
    const pc = createComputer(world, { template: "node-fullstack", name: `Branch ${src.summary}` });
    const child: WorkProposal = {
      ...src,
      proposalId: makeId("prp"),
      summary: `${src.summary} (fork)`,
      status: "open",
      computerId: pc.computerId,
      derivedFrom: [src.proposalId],
      createdAt: nowIso(),
    };
    room.proposals.push(child);
    room.timeline.push({ at: nowIso(), text: `Forked proposal ${src.summary}` });
    this.emit(world, "WorkProposalCreated", { room }, { missionId: room.missionId });
    return this.view(operatorId);
  }

  connectProvider(operatorId: string, input: { vendor: ConnectionVendor; secret?: string }) {
    const world = this.load(operatorId);
    const st = stationOf(world);
    world.connections = connectVendor(operatorId, world.connections ?? {}, input.vendor, input.secret, Boolean(st.localOnly));
    this.emit(world, "ConnectionUpdated", { connections: world.connections });
    return this.view(operatorId);
  }

  disconnectProvider(operatorId: string, vendor: ConnectionVendor) {
    const world = this.load(operatorId);
    world.connections = disconnectVendor(operatorId, world.connections ?? {}, vendor);
    this.emit(world, "ConnectionUpdated", { connections: world.connections });
    return this.view(operatorId);
  }

  probeConnections(operatorId: string) {
    const world = this.load(operatorId);
    const st = stationOf(world);
    world.connections = seedConnections(operatorId, world.connections);
    for (const rec of Object.values(world.connections)) {
      world.connections[rec.connectionId] = refreshConnection(operatorId, rec, Boolean(st.localOnly));
    }
    this.emit(world, "ConnectionUpdated", { connections: world.connections });
    return this.view(operatorId);
  }

  setLocale(operatorId: string, locale: "en" | "ar") {
    const world = this.load(operatorId);
    stationOf(world).locale = locale;
    this.touchStation(world, "StationMutated");
    return this.view(operatorId);
  }

  setTheme(operatorId: string, theme: "pearl-dark" | "pearl-light") {
    const world = this.load(operatorId);
    stationOf(world).theme = theme;
    this.touchStation(world, "StationMutated");
    return this.view(operatorId);
  }

  setLocalOnly(operatorId: string, localOnly: boolean) {
    const world = this.load(operatorId);
    stationOf(world).localOnly = localOnly;
    world.connections = seedConnections(operatorId, world.connections);
    for (const rec of Object.values(world.connections ?? {})) {
      world.connections[rec.connectionId] = refreshConnection(operatorId, rec, localOnly);
    }
    this.touchStation(world, "StationMutated");
    this.emit(world, "ConnectionUpdated", { connections: world.connections });
    return this.view(operatorId);
  }

  view(operatorId: string): ConsoleView {
    const world = this.advance(operatorId);
    world.connections = seedConnections(operatorId, world.connections);
    const st = stationOf(world);
    for (const rec of Object.values(world.connections)) {
      world.connections[rec.connectionId] = refreshConnection(operatorId, rec, Boolean(st.localOnly));
    }
    const missions = Object.values(world.missions)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((m) => ({
        ...m,
        progress: progressOf(m),
        agentCount: Object.values(world.agents).filter((a) => a.missionId === m.missionId).length,
      }));
    return {
      daemon: { id: this.daemonId, startedAt: this.startedAt, seq: world.seq, healthy: true },
      missions,
      agents: Object.values(world.agents),
      contracts: Object.values(world.contracts),
      artifacts: Object.values(world.artifacts).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      evidence: Object.values(world.evidence),
      decisions: Object.values(world.decisions),
      memories: Object.values(world.memories),
      knowledge: Object.values(world.knowledge),
      worktrees: Object.values(world.worktrees),
      approvals: Object.values(world.approvals),
      events: world.events.slice(-400),
      reputation: world.reputation,
      graph: world.graph,
      automations: Object.values(world.automations ?? {}),
      mcpServers: Object.values(world.mcpServers ?? {}),
      externalAgents: Object.values(world.externalAgents ?? {}),
      semanticConflicts: world.semanticConflicts ?? [],
      modelRoutes: world.modelRoutes ?? [],
      secrets: listSecretMeta(operatorId),
      ingress: (world.ingress ?? []).slice(-40).reverse(),
      performance: {
        agents: Object.values(world.performance?.agents ?? {}),
        models: Object.values(world.performance?.models ?? {}),
      },
      placements: world.placements ?? {},
      broker: { keyId: currentKeyId(operatorId) },
      station: stationOf(world),
      problems: collectProblems(world, pickComputer(world)?.path ?? defaultProjectPath()),
      inbox: inboxOf(world),
      services: detectServices(pickComputer(world)?.path ?? defaultProjectPath()),
      tree: listTree(pickComputer(world)?.path ?? defaultProjectPath()),
      activeComputerId: pickComputer(world)?.computerId,
      rooms: Object.values(world.rooms ?? {}),
      activeRoomId: stationOf(world).activeRoomId,
      connections: Object.values(world.connections ?? {}),
      governance: computeGovernanceMetrics(world),
      topology: (() => {
        const root = pickComputer(world)?.path ?? defaultProjectPath();
        const idx = getWorkspaceIndex(root);
        return idx ? buildTopology(idx, world.events) : { nodes: [], edges: [], readOnly: true as const };
      })(),
    };
  }

  missionView(operatorId: string, missionId: string): ConsoleView {
    const v = this.view(operatorId);
    return {
      ...v,
      missions: v.missions.filter((m) => m.missionId === missionId),
      agents: v.agents.filter((a) => a.missionId === missionId),
      contracts: v.contracts.filter((c) => v.agents.some((a) => a.agentId === c.agentId)),
      artifacts: v.artifacts.filter((a) => a.missionId === missionId),
      evidence: v.evidence.filter((e) => e.missionId === missionId),
      decisions: v.decisions.filter((d) => d.missionId === missionId),
      memories: v.memories.filter((m) => m.missionId === missionId),
      worktrees: v.worktrees.filter((w) => w.missionId === missionId),
      approvals: v.approvals.filter((a) => a.missionId === missionId),
      events: v.events.filter((e) => e.missionId === missionId),
    };
  }
}

function progressOf(mission: Mission): number {
  if (mission.state === "COMPLETE") return 100;
  if (mission.tasks.length === 0) return mission.state === "CREATED" ? 4 : 12;
  const w: Record<TaskNode["state"], number> = {
    PENDING: 0,
    READY: 0.08,
    RUNNING: 0.5,
    BLOCKED: 0.2,
    FAILED: 0,
    CANCELLED: 0,
    VERIFYING: 0.85,
    COMPLETE: 1,
  };
  return Math.round((mission.tasks.reduce((s, t) => s + w[t.state], 0) / mission.tasks.length) * 100);
}

function depComplete(mission: Mission, id: string): boolean {
  return mission.tasks.find((t) => t.taskId === id)?.state === "COMPLETE";
}

function titleFrom(objective: string): string {
  const t = objective.trim();
  return t.length > 56 ? `${t.slice(0, 53)}…` : t;
}

function titleForRole(role: AgentRole): string {
  return {
    commander: "AJ Commander",
    "architecture-lead": "Architecture Lead",
    researcher: "Researcher",
    "dependency-analyst": "Dependency Analyst",
    "engineering-lead": "Engineering Lead",
    "backend-engineer": "Backend Engineer",
    "frontend-engineer": "Frontend Engineer",
    "database-engineer": "Database Engineer",
    "qa-lead": "QA Lead",
    "test-engineer": "Test Engineer",
    "browser-verifier": "Browser Verifier",
    "security-reviewer": "Security Reviewer",
    debugger: "Debugger",
    "final-verifier": "Final Verifier",
    "experiment-engineer": "Experiment Agent",
    "devil-advocate": "Devil's Advocate",
    "performance-engineer": "Performance Engineer",
    "red-team": "Red Team",
  }[role];
}

function objectiveFor(role: AgentRole, feature: FeatureSpec): string {
  if (role === "final-verifier") return `Independently verify ${feature.title}. Do not implement.`;
  if (role === "backend-engineer") return `Implement ${feature.title} inside an isolated worktree.`;
  if (role === "frontend-engineer") return `Implement the UI for ${feature.title} inside an isolated worktree.`;
  if (role === "browser-verifier")
    return `Computer-use verify ${feature.title}. Capture a11y, screenshot, console, and network.`;
  if (role === "test-engineer") return `Prove ${feature.title} with contracted tests.`;
  if (role === "security-reviewer") return `Review ${feature.title} against security policy.`;
  if (role === "architecture-lead") return `Decide architecture for ${feature.title}.`;
  return `Support ${feature.title}.`;
}

function deliverablesFor(role: AgentRole): string[] {
  if (role === "backend-engineer") return ["implementation", "change-report"];
  if (role === "frontend-engineer") return ["ui-implementation", "change-report"];
  if (role === "test-engineer") return ["tests", "evidence"];
  if (role === "browser-verifier") return ["browser-evidence"];
  if (role === "final-verifier") return ["verification"];
  if (role === "architecture-lead") return ["architecture", "decision"];
  if (role === "security-reviewer") return ["security"];
  return ["notes"];
}

function dodFor(role: AgentRole): string[] {
  if (role === "final-verifier") return ["requirements-verified", "tests", "no-self-certify"];
  if (role === "backend-engineer") return ["files-in-scope", "worktree-isolated"];
  if (role === "frontend-engineer") return ["files-in-scope", "worktree-isolated"];
  if (role === "browser-verifier") return ["a11y-pass", "screenshot"];
  if (role === "test-engineer") return ["tests-pass"];
  return ["artifact-published"];
}

function capabilitiesFor(role: AgentRole): string[] {
  if (role === "commander") return ["plan", "staff", "budget", "replan", "escalate"];
  if (role === "backend-engineer") return ["fs.scoped-write", "worktree", "terminal.sandbox"];
  if (role === "frontend-engineer") return ["fs.scoped-write", "worktree", "browser.observe"];
  if (role === "browser-verifier") return ["browser.interact", "browser.snapshot", "browser.screenshot"];
  if (role === "test-engineer") return ["test.run", "fs.scoped-write"];
  if (role === "final-verifier") return ["verify", "read"];
  return ["read"];
}

function artifact(
  missionId: string,
  agentId: string | undefined,
  kind: ArtifactRecord["kind"],
  title: string,
  summary: string,
): ArtifactRecord {
  return {
    artifactId: makeId("art"),
    missionId,
    agentId,
    kind,
    title,
    summary: redactSecretsFromText(summary).slice(0, 400),
    version: 1,
    createdAt: nowIso(),
  };
}

function fingerprint(kind: string, text: string): string {
  let h = 0;
  const s = `${kind}:${text.slice(0, 240)}`;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `fp_${kind}_${h.toString(36)}`;
}

function existsSyncSafe(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

const g = globalThis as typeof globalThis & { __ajd?: AjDaemon };

export function getDaemon(): AjDaemon {
  if (
    !g.__ajd ||
    (g.__ajd.catalogRev as number) !== 25 ||
    typeof g.__ajd.setTheme !== "function" ||
    typeof g.__ajd.connectProvider !== "function" ||
    typeof g.__ajd.startWorkRoom !== "function" ||
    typeof g.__ajd.submitComposer !== "function" ||
    typeof g.__ajd.ingestExternalEvent !== "function" ||
    typeof g.__ajd.rotateOperatorKey !== "function"
  ) {
    g.__ajd = new AjDaemon();
  }
  return g.__ajd;
}

export function resetDaemonForTests(): void {
  g.__ajd = new AjDaemon();
}
