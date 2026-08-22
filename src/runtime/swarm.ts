/**
 * Governed swarm. Agents do not chat.
 * Only structured ballots hit the ledger: proposal | objection | evidence | approval.
 */
import { makeId, nowIso } from "../protocol/index.ts";
import type { AgentRole } from "../protocol/index.ts";

export type BallotKind = "proposal" | "objection" | "evidence" | "approval";
export type ConsensusMode = "majority" | "unanimous-reviewers";
export type SwarmEngine = "anthropic" | "openai" | "aj-local" | "xai-grok";

export interface SwarmPersona {
  role: AgentRole;
  engine: SwarmEngine;
  title: string;
}

export interface SwarmBallot {
  ballotId: string;
  missionId: string;
  agentId: string;
  role: AgentRole;
  kind: BallotKind;
  about?: string;
  claim: string;
  at: string;
}

export interface ConsensusVerdict {
  ok: boolean;
  mode: ConsensusMode;
  approvals: number;
  objections: number;
  needed: number;
  resolution?: string;
  reason: string;
}

export const DEFAULT_SWARM: SwarmPersona[] = [
  { role: "backend-engineer", engine: "anthropic", title: "Coder" },
  { role: "security-reviewer", engine: "openai", title: "Security" },
  { role: "test-engineer", engine: "aj-local", title: "Tester" },
];

export function recordBallot(input: Omit<SwarmBallot, "ballotId" | "at">): SwarmBallot {
  return { ...input, ballotId: makeId("blt"), at: nowIso(), claim: input.claim.slice(0, 400) };
}

export function tallyConsensus(ballots: SwarmBallot[], mode: ConsensusMode = "majority"): ConsensusVerdict {
  const approvals = ballots.filter((b) => b.kind === "approval").length;
  const objections = ballots.filter((b) => b.kind === "objection").length;
  const reviewers = new Set(
    ballots.filter((b) => b.role === "security-reviewer" || b.role === "test-engineer" || b.role === "final-verifier").map((b) => b.agentId),
  );
  const reviewerApprovals = ballots.filter(
    (b) => b.kind === "approval" && (b.role === "security-reviewer" || b.role === "test-engineer" || b.role === "final-verifier"),
  ).length;
  const needed = mode === "unanimous-reviewers" ? Math.max(1, reviewers.size) : Math.max(1, Math.ceil((approvals + objections) / 2) || 1);

  const clash = testerObjectsToCoder(ballots);
  if (clash) {
    return {
      ok: false,
      mode,
      approvals,
      objections,
      needed,
      resolution: "tester-vs-coder",
      reason: "Tester objected to coder work — Commander opens a resolution session. No merge.",
    };
  }
  if (mode === "unanimous-reviewers") {
    const ok = reviewerApprovals >= needed && objections === 0;
    return { ok, mode, approvals, objections, needed, reason: ok ? "Reviewers unanimous." : "Reviewer consensus missing." };
  }
  const ok = approvals >= needed && approvals > objections;
  return { ok, mode, approvals, objections, needed, reason: ok ? "Majority approvals." : "Majority not reached." };
}

export function testerObjectsToCoder(ballots: SwarmBallot[]): boolean {
  const coderIds = new Set(ballots.filter((b) => b.role === "backend-engineer" || b.role === "frontend-engineer").map((b) => b.agentId));
  return ballots.some(
    (b) => b.kind === "objection" && b.role === "test-engineer" && (!b.about || coderIds.has(b.about) || b.about.includes("coder") || b.about.includes("backend")),
  );
}

export function mayCompleteMission(verifierPass: boolean, consensus: ConsensusVerdict): { ok: boolean; reason: string } {
  if (!verifierPass) return { ok: false, reason: "Verifier has not PASSed." };
  if (!consensus.ok) return { ok: false, reason: `Consensus withheld: ${consensus.reason}` };
  return { ok: true, reason: "Verifier PASS + swarm consensus." };
}

export function mayMerge(consensus: ConsensusVerdict): { ok: boolean; reason: string } {
  if (!consensus.ok) return { ok: false, reason: `Merge firewall: ${consensus.reason}` };
  return { ok: true, reason: "Merge allowed after consensus." };
}

export function resolutionSession(ballots: SwarmBallot[]): {
  sessionId: string;
  kind: "tester-vs-coder";
  facts: SwarmBallot[];
} {
  return {
    sessionId: makeId("res"),
    kind: "tester-vs-coder",
    facts: ballots.filter((b) => b.kind !== "approval"),
  };
}
