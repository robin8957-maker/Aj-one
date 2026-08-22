import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  type AgentInstance,
  type AgentRole,
  type WorkConstraint,
  type WorkExperiment,
  type WorkMessage,
  type WorkPreset,
  type WorkProposal,
  type WorkRoom,
  type WorkRoundKind,
  makeId,
  nowIso,
} from "../protocol/index.ts";
import { readProjectFile, runNodeTest } from "./workspace.ts";

const MENTION_TO_ROLE: Record<string, AgentRole> = {
  architect: "architecture-lead",
  architecture: "architecture-lead",
  backend: "backend-engineer",
  frontend: "frontend-engineer",
  security: "security-reviewer",
  qa: "test-engineer",
  research: "researcher",
  researcher: "researcher",
  redteam: "red-team",
  "red-team": "red-team",
  experiment: "experiment-engineer",
  performance: "performance-engineer",
  devil: "devil-advocate",
  advocate: "devil-advocate",
};

export function inferPreset(objective: string): WorkPreset {
  const t = objective.toLowerCase();
  if (/incident|outage|sev-|prod down/.test(t)) return "incident";
  if (/review|pr\b|diff/.test(t)) return "review";
  if (/research|compare|survey/.test(t)) return "research";
  if (/security|oauth|authz|threat/.test(t) && !/redesign|architect/.test(t)) return "security";
  if (/debug|root cause|failing|bug/.test(t)) return "debug";
  if (/product|ux|pricing/.test(t)) return "product";
  return "design";
}

export function selectCouncil(
  objective: string,
  preset: WorkPreset,
  quality: "fast" | "balanced" | "max",
): AgentRole[] {
  const t = objective.toLowerCase();
  let roles: AgentRole[] = [];
  if (preset === "security") roles = ["security-reviewer", "red-team", "backend-engineer", "architecture-lead"];
  else if (preset === "debug") roles = ["debugger", "backend-engineer", "test-engineer", "researcher"];
  else if (preset === "research") roles = ["researcher", "dependency-analyst", "architecture-lead"];
  else if (preset === "review") roles = ["architecture-lead", "security-reviewer", "test-engineer", "devil-advocate"];
  else if (preset === "incident") roles = ["debugger", "backend-engineer", "security-reviewer", "qa-lead"];
  else if (preset === "product") roles = ["architecture-lead", "frontend-engineer", "researcher", "qa-lead"];
  else {
    roles = ["architecture-lead", "backend-engineer", "security-reviewer"];
    if (/ui|login|browser|frontend/.test(t)) roles.push("frontend-engineer");
    if (/perf|latency|scale/.test(t)) roles.push("performance-engineer");
    if (/auth|session|token/.test(t)) roles.push("researcher");
  }
  if (quality === "max") {
    for (const extra of ["devil-advocate", "experiment-engineer", "red-team", "test-engineer"] as AgentRole[]) {
      if (!roles.includes(extra)) roles.push(extra);
    }
  } else if (quality === "balanced" && !roles.includes("devil-advocate") && /architect|redesign|auth/.test(t)) {
    roles.push("devil-advocate");
  }
  if (quality === "fast") roles = roles.slice(0, 3);
  return [...new Set(roles)];
}

export function workBudget(quality: "fast" | "balanced" | "max", agentCount: number): WorkRoom["budget"] {
  return {
    maxRounds: quality === "fast" ? 4 : quality === "max" ? 12 : 8,
    roundsUsed: 0,
    maxExperiments: quality === "fast" ? 1 : quality === "max" ? 4 : 2,
    experimentsUsed: 0,
    maxAgents: agentCount + 1,
    tokens: quality === "max" ? 220_000 : 120_000,
    tokensUsed: 0,
    moneyUsd: quality === "max" ? 8 : 3.5,
    moneyUsed: 0,
  };
}

export function emptyWhiteboard(): WorkRoom["whiteboard"] {
  return { nodes: [], edges: [] };
}

export function workMessage(
  roomId: string,
  authorId: string,
  authorRole: WorkMessage["authorRole"],
  kind: WorkMessage["kind"],
  text: string,
  extra?: Partial<WorkMessage>,
): WorkMessage {
  return {
    messageId: makeId("wmsg"),
    roomId,
    authorId,
    authorRole,
    kind,
    text,
    createdAt: nowIso(),
    ...extra,
  };
}

function readAuth(projectPath: string): string {
  return readProjectFile(projectPath, "src/auth.js") ?? "";
}

export function draftIndependentProposals(
  room: WorkRoom,
  agents: AgentInstance[],
  projectPath: string,
): WorkProposal[] {
  const auth = readAuth(projectPath);
  const hasInflight = auth.includes("inflight");
  const hasRace = auth.includes("INTENTIONAL DEFECT") || (auth.includes("sessions.get") && !hasInflight);
  const architect = agents.find((a) => a.role === "architecture-lead");
  const backend = agents.find((a) => a.role === "backend-engineer");
  const security = agents.find((a) => a.role === "security-reviewer");
  const researcher = agents.find((a) => a.role === "researcher");
  const out: WorkProposal[] = [];

  if (architect || backend) {
    const author = architect ?? backend!;
    out.push({
      proposalId: makeId("prp"),
      authorId: author.agentId,
      authorRole: author.role,
      summary: "Single-flight session issuer",
      architecture:
        "Keep an in-process session map. login() shares one in-flight promise per user so overlapping calls cannot mint two tokens.",
      advantages: ["Minimal surface", "No new store", "Matches existing Northstar tests"],
      risks: ["Process-local only", "Does not rotate tokens"],
      cost: "low",
      complexity: "low",
      evidence: [
        {
          claim: hasInflight
            ? "src/auth.js already implements inflight coalescing"
            : "src/auth.js still allows overlapping login() to mint two tokens",
          evidence: hasInflight ? "inflight Map present" : hasRace ? "no inflight guard" : "auth module present",
          source: "src/auth.js",
          impact: "Correctness of concurrent login",
          confidence: hasInflight ? 0.92 : 0.88,
          status: "verified",
        },
      ],
      confidence: 0.86,
      status: "open",
      createdAt: nowIso(),
    });
  }

  if (security || researcher || backend) {
    const author = security ?? researcher ?? backend!;
    out.push({
      proposalId: makeId("prp"),
      authorId: author.agentId,
      authorRole: author.role,
      summary: "Versioned session + explicit revoke",
      architecture:
        "Each login increments a per-user version. Old tokens fail closed. Revoke is a first-class operation. Still process-local unless a store is approved later.",
      advantages: ["Rotation", "Revocation", "Clear security model"],
      risks: ["More moving parts", "Requires test rewrite"],
      cost: "medium",
      complexity: "medium",
      evidence: [
        {
          claim: "No token rotation primitive exists in src/auth.js",
          evidence: /rotat|version|revoke/i.test(auth) ? "rotation keywords found" : "no rotate/revoke helpers",
          source: "src/auth.js",
          impact: "Session theft window",
          confidence: 0.8,
          status: /rotat|revoke/i.test(auth) ? "verified" : "unverified",
        },
      ],
      confidence: 0.74,
      status: "open",
      createdAt: nowIso(),
    });
  }

  if (room.quality === "max" && (researcher || architect)) {
    const author = researcher ?? architect!;
    out.push({
      proposalId: makeId("prp"),
      authorId: author.agentId,
      authorRole: author.role,
      summary: "External session store (not Redis unless allowed)",
      architecture:
        "Move sessions behind a store port. Default adapter is in-memory. A Postgres adapter can be added later. Redis is not assumed.",
      advantages: ["Multi-process ready", "Adapter-tested"],
      risks: ["Scope creep", "Ops burden"],
      cost: "high",
      complexity: "high",
      evidence: [
        {
          claim: "Northstar has no session store port today",
          evidence: existsSync(join(projectPath, "src/auth.js")) ? "single module" : "auth missing",
          source: "src/auth.js",
          impact: "Horizontal scale",
          confidence: 0.7,
          status: "unverified",
        },
      ],
      confidence: 0.55,
      status: "open",
      createdAt: nowIso(),
    });
  }

  return out;
}

export function crossExamine(room: WorkRoom, agents: AgentInstance[]): WorkMessage[] {
  const msgs: WorkMessage[] = [];
  const [a, b] = room.proposals;
  const security = agents.find((x) => x.role === "security-reviewer" || x.role === "red-team");
  const perf = agents.find((x) => x.role === "performance-engineer" || x.role === "debugger");
  const devil = agents.find((x) => x.role === "devil-advocate");
  const architect = agents.find((x) => x.role === "architecture-lead");
  if (b && security) {
    msgs.push(
      workMessage(
        room.roomId,
        security.agentId,
        security.role,
        "OBJECTION",
        `Challenges “${b.summary}”: rotation is claimed without a written revoke API or test. Status remains UNVERIFIED until an experiment proves it.`,
        { proposalId: b.proposalId },
      ),
    );
  }
  if (a && perf) {
    msgs.push(
      workMessage(
        room.roomId,
        perf.agentId,
        perf.role,
        "QUESTION",
        `Asks for a measured login() race on “${a.summary}”. Opinion is not a benchmark.`,
        { proposalId: a.proposalId },
      ),
    );
  }
  if (a && architect) {
    msgs.push(
      workMessage(
        room.roomId,
        architect.agentId,
        architect.role,
        "QUESTION",
        "Request dependency impact: who imports login() besides tests?",
        { proposalId: a.proposalId },
      ),
    );
  }
  if (devil && a) {
    msgs.push(
      workMessage(
        room.roomId,
        devil.agentId,
        devil.role,
        "DISSENT",
        `Devil's advocate: “${a.summary}” may hide a multi-process race. Evidence is process-local only.`,
        { proposalId: a.proposalId },
      ),
    );
  }
  return msgs;
}

export function designAuthExperiment(room: WorkRoom, owner: AgentInstance): WorkExperiment {
  return {
    experimentId: makeId("exp"),
    roomId: room.roomId,
    hypothesis: "Overlapping login() calls must return one live token",
    design: "Run fixtures/northstar tests/auth.test.js (or the room computer copy) and record pass/fail + duration.",
    ownerId: owner.agentId,
    status: "designed",
    measurements: [],
    evidence: "",
    invented: false,
    createdAt: nowIso(),
  };
}

export function runRealExperiment(experiment: WorkExperiment, projectPath: string): WorkExperiment {
  const started = Date.now();
  const testFile = existsSync(join(projectPath, "tests", "auth.test.js")) ? ["tests/auth.test.js"] : [];
  const result = testFile.length
    ? runNodeTest(projectPath, testFile)
    : { ok: false, output: "no tests/auth.test.js — experiment refused to invent a number", code: 1 };
  const ms = Date.now() - started;
  return {
    ...experiment,
    status: result.ok ? "complete" : "failed",
    measurements: [
      { name: "auth.test.js", value: result.ok ? "pass" : "fail", unit: "result" },
      { name: "duration", value: String(ms), unit: "ms" },
      { name: "exit", value: String(result.code), unit: "code" },
    ],
    evidence: result.output.slice(0, 1200),
    invented: false,
  };
}

export function applyConstraints(room: WorkRoom): WorkRoom {
  const locked = room.constraints.filter((c) => c.locked);
  for (const proposal of room.proposals) {
    for (const c of locked) {
      const needle = (c.forbidden ?? c.text).toLowerCase();
      const blob = `${proposal.summary} ${proposal.architecture} ${proposal.advantages.join(" ")}`.toLowerCase();
      if (needle && blob.includes(needle.toLowerCase())) {
        proposal.status = "invalid";
      }
    }
  }
  return room;
}

export function decideRoom(room: WorkRoom, agents: AgentInstance[]): WorkRoom {
  const open = room.proposals.filter((p) => p.status !== "invalid" && p.status !== "rejected");
  if (open.length === 0) {
    room.noConsensus = "All proposals invalid under locked constraints. Reduce scope or request a user decision.";
    room.round = "decision";
    return room;
  }
  const scored = [...open].sort((a, b) => {
    const evA = a.evidence.filter((e) => e.status === "verified").length + a.confidence;
    const evB = b.evidence.filter((e) => e.status === "verified").length + b.confidence;
    const expBoost = (p: WorkProposal) =>
      room.experiments.some((e) => e.status === "complete" && e.hypothesis.toLowerCase().includes(p.summary.slice(0, 12).toLowerCase()))
        ? 0.2
        : 0;
    return evB + expBoost(b) - (evA + expBoost(a));
  });
  const winner = scored[0]!;
  winner.status = "leading";
  const votes: WorkRoom["votes"] = [];
  for (const agent of agents.filter((a) => a.role !== "commander")) {
    const aligned = agent.agentId === winner.authorId || agent.role === "architecture-lead";
    votes.push({
      agentId: agent.agentId,
      role: agent.role,
      proposalId: winner.proposalId,
      vote: aligned ? "for" : winner.confidence < 0.7 ? "abstain" : "for",
      confidence: aligned ? 0.84 : 0.62,
      reason: aligned ? "Author or architect alignment after evidence" : "Evidence preferred this option; vote informs Commander only",
    });
  }
  room.votes = votes;
  const dissenters = agents.filter((a) => a.role === "devil-advocate" || a.role === "red-team" || a.role === "security-reviewer");
  room.minority = dissenters.slice(0, 1).map((a) => ({
    agentId: a.agentId,
    role: a.role,
    concern: winner.risks[0] ?? "Residual risk not experimentally closed",
    severity: "medium" as const,
  }));
  const verifiedShare = winner.evidence.filter((e) => e.status === "verified").length / Math.max(1, winner.evidence.length);
  if (verifiedShare < 0.34 && room.experiments.every((e) => e.status !== "complete")) {
    room.noConsensus = "Evidence is insufficient. Commander will not fabricate consensus.";
    room.round = "experiments";
    return room;
  }
  room.decision = {
    proposalId: winner.proposalId,
    summary: winner.summary,
    frozen: false,
    at: nowIso(),
  };
  room.state = "deciding";
  room.round = "decision";
  room.confidence = [
    { area: "Architecture", value: Math.round(winner.confidence * 100) },
    { area: "Security", value: winner.risks.length ? 70 : 88 },
    { area: "Performance", value: room.experiments.some((e) => e.status === "complete") ? 84 : 61 },
    { area: "Migration", value: winner.complexity === "low" ? 80 : 55 },
  ];
  return room;
}

export function buildWhiteboard(room: WorkRoom): WorkRoom["whiteboard"] {
  const nodes = [
    { nodeId: "n-current", kind: "service" as const, label: "Current auth.js", x: 40, y: 40 },
    ...room.proposals.map((p, i) => ({
      nodeId: `n-${p.proposalId}`,
      kind: "decision" as const,
      label: p.summary,
      x: 40 + i * 180,
      y: 140,
      proposalId: p.proposalId,
    })),
    ...room.constraints.filter((c) => c.locked).map((c, i) => ({
      nodeId: `n-c-${c.constraintId}`,
      kind: "risk" as const,
      label: `LOCKED ${c.forbidden ?? c.text}`,
      x: 40 + i * 160,
      y: 240,
    })),
  ];
  const edges = room.proposals.map((p) => ({ from: "n-current", to: `n-${p.proposalId}` }));
  return { nodes, edges };
}

export function meetingArtifacts(room: WorkRoom): { title: string; body: string }[] {
  const winner = room.proposals.find((p) => p.proposalId === room.decision?.proposalId);
  return [
    { title: "Executive Summary", body: `${room.objective}\nDecision: ${room.decision?.summary ?? "none"}\nRound: ${room.round}` },
    { title: "Proposals", body: room.proposals.map((p) => `${p.status} · ${p.summary} (${p.authorRole})`).join("\n") },
    { title: "Architecture", body: winner?.architecture ?? "No accepted architecture." },
    { title: "Decisions", body: room.decision ? `${room.decision.summary} frozen=${room.decision.frozen}` : "No decision." },
    {
      title: "Minority Report",
      body: room.minority.map((m) => `${m.role}: ${m.concern} (${m.severity})`).join("\n") || "No dissent recorded.",
    },
    {
      title: "Experiments",
      body: room.experiments.map((e) => `${e.status} · ${e.hypothesis} · ${e.measurements.map((m) => `${m.name}=${m.value}${m.unit}`).join(", ")}`).join("\n") || "None",
    },
    { title: "Risks", body: room.proposals.flatMap((p) => p.risks).join("\n") },
    { title: "Verification Report", body: room.round === "verification" || room.state === "closed" ? "Independent verification required after ONE execution." : "Verification not started." },
  ];
}

export function parseWorkSteer(text: string): {
  target: "room" | AgentRole | "unknown";
  mention: string;
  body: string;
  constraint?: { forbidden: string };
} {
  const m = /@([a-z][\w-]*)\s*(.*)$/is.exec(text.trim());
  if (!m) return { target: "unknown", mention: "", body: text.trim() };
  const mention = m[1]!.toLowerCase();
  const body = (m[2] ?? "").trim();
  if (mention === "room") {
    const forbidden = /(?:do not use|forbidden|forbid|ban)\s+([a-z0-9._-]+)/i.exec(body);
    return {
      target: "room",
      mention,
      body,
      constraint: forbidden ? { forbidden: forbidden[1]! } : /redis/i.test(body) ? { forbidden: "redis" } : undefined,
    };
  }
  const role = MENTION_TO_ROLE[mention];
  return { target: role ?? "unknown", mention, body };
}

export function nextRound(current: WorkRoundKind, skip: Set<WorkRoundKind>): WorkRoundKind {
  const order: WorkRoundKind[] = [
    "understand",
    "proposals",
    "cross-exam",
    "experiments",
    "critique",
    "decision",
    "execution",
    "verification",
    "closed",
  ];
  const i = order.indexOf(current);
  for (let k = i + 1; k < order.length; k += 1) {
    if (!skip.has(order[k]!)) return order[k]!;
  }
  return "closed";
}

export function compareProposals(room: WorkRoom): { dimension: string; values: Record<string, string> }[] {
  const dims = ["correctness", "security", "complexity", "cost", "confidence"];
  return dims.map((dimension) => {
    const values: Record<string, string> = {};
    for (const p of room.proposals) {
      if (dimension === "complexity") values[p.summary] = p.complexity;
      else if (dimension === "cost") values[p.summary] = p.cost;
      else if (dimension === "confidence") values[p.summary] = String(p.confidence);
      else if (dimension === "security") values[p.summary] = String(p.risks.length);
      else values[p.summary] = p.evidence.some((e) => e.status === "verified") ? "evidenced" : "unverified";
    }
    return { dimension, values };
  });
}

export function synthesizeProposals(room: WorkRoom, commanderId: string): WorkProposal | null {
  const open = room.proposals.filter((p) => p.status !== "invalid");
  if (open.length < 2) return null;
  const [a, b] = open;
  return {
    proposalId: makeId("prp"),
    authorId: commanderId,
    authorRole: "commander",
    summary: `Synthesis: ${a!.summary} + security notes from ${b!.summary}`,
    architecture: `${a!.architecture}\n+\n${b!.risks[0] ?? "retain residual-risk review"}`,
    advantages: [...a!.advantages.slice(0, 2), ...b!.advantages.slice(0, 1)],
    risks: b!.risks.slice(0, 2),
    cost: "medium",
    complexity: "medium",
    evidence: [...a!.evidence, ...b!.evidence].slice(0, 4),
    confidence: Number((((a!.confidence + b!.confidence) / 2) * 0.95).toFixed(2)),
    status: "synthesized",
    derivedFrom: [a!.proposalId, b!.proposalId],
    createdAt: nowIso(),
  };
}

export function planDiff(before: string, after: string): string {
  if (before === after) return "No plan change.";
  return `- ${before}\n+ ${after}`;
}

export function mentionRole(name: string): AgentRole | undefined {
  return MENTION_TO_ROLE[name.toLowerCase()];
}
