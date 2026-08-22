import type { AgentRole, IsoDate, RiskLevel } from "./index.ts";

export type OperatingMode = "one" | "work";

export type WorkPreset =
  | "design"
  | "debug"
  | "security"
  | "research"
  | "review"
  | "incident"
  | "product";

export type WorkRoundKind =
  | "understand"
  | "proposals"
  | "cross-exam"
  | "experiments"
  | "critique"
  | "decision"
  | "execution"
  | "verification"
  | "closed";

export type WorkMessageKind =
  | "PROPOSAL"
  | "OBJECTION"
  | "QUESTION"
  | "ANSWER"
  | "EVIDENCE"
  | "RISK"
  | "DECISION"
  | "EXPERIMENT_REQUEST"
  | "BLOCKER"
  | "CONSENSUS"
  | "DISSENT"
  | "CONSTRAINT"
  | "STEER";

export type ClaimStatus = "verified" | "unverified" | "refuted";

export interface WorkClaim {
  claim: string;
  evidence: string;
  source: string;
  impact: string;
  confidence: number;
  status: ClaimStatus;
}

export interface WorkMessage {
  messageId: string;
  roomId: string;
  authorId: string;
  authorRole: AgentRole | "user" | "commander";
  kind: WorkMessageKind;
  text: string;
  proposalId?: string;
  claim?: WorkClaim;
  createdAt: IsoDate;
}

export interface WorkProposal {
  proposalId: string;
  authorId: string;
  authorRole: AgentRole;
  summary: string;
  architecture: string;
  advantages: string[];
  risks: string[];
  cost: string;
  complexity: "low" | "medium" | "high";
  evidence: WorkClaim[];
  confidence: number;
  status: "open" | "invalid" | "leading" | "accepted" | "rejected" | "synthesized";
  derivedFrom?: string[];
  computerId?: string;
  createdAt: IsoDate;
}

export interface WorkConstraint {
  constraintId: string;
  text: string;
  locked: boolean;
  forbidden?: string;
  createdAt: IsoDate;
}

export interface WorkExperiment {
  experimentId: string;
  roomId: string;
  hypothesis: string;
  design: string;
  ownerId: string;
  computerId?: string;
  status: "designed" | "running" | "complete" | "failed";
  measurements: { name: string; value: string; unit: string }[];
  evidence: string;
  invented: false;
  createdAt: IsoDate;
}

export interface WorkVote {
  agentId: string;
  role: AgentRole;
  proposalId: string;
  vote: "for" | "against" | "abstain";
  confidence: number;
  reason: string;
}

export interface MinorityReport {
  agentId: string;
  role: AgentRole;
  concern: string;
  severity: RiskLevel;
}

export interface WhiteboardNode {
  nodeId: string;
  kind: "service" | "note" | "risk" | "decision" | "dependency";
  label: string;
  x: number;
  y: number;
  proposalId?: string;
}

export interface WhiteboardEdge {
  from: string;
  to: string;
  label?: string;
}

export interface WorkWhiteboard {
  nodes: WhiteboardNode[];
  edges: WhiteboardEdge[];
}

export interface WorkHuddle {
  huddleId: string;
  title: string;
  agentIds: string[];
  summary: string;
  status: "open" | "closed";
}

export interface WorkSubroom {
  subroomId: string;
  title: string;
  agentIds: string[];
  summary: string;
  artifactTitle?: string;
}

export interface WorkBudget {
  maxRounds: number;
  roundsUsed: number;
  maxExperiments: number;
  experimentsUsed: number;
  maxAgents: number;
  tokens: number;
  tokensUsed: number;
  moneyUsd: number;
  moneyUsed: number;
}

export interface WorkConfidence {
  area: string;
  value: number;
}

export interface WorkRoom {
  roomId: string;
  missionId: string;
  objective: string;
  preset: WorkPreset;
  quality: "fast" | "balanced" | "max";
  state: "open" | "deciding" | "frozen" | "executing" | "closed";
  round: WorkRoundKind;
  participantIds: string[];
  messages: WorkMessage[];
  proposals: WorkProposal[];
  constraints: WorkConstraint[];
  experiments: WorkExperiment[];
  votes: WorkVote[];
  minority: MinorityReport[];
  whiteboard: WorkWhiteboard;
  huddles: WorkHuddle[];
  subrooms: WorkSubroom[];
  confidence: WorkConfidence[];
  budget: WorkBudget;
  decision?: {
    proposalId: string;
    summary: string;
    frozen: boolean;
    at: IsoDate;
  };
  timeline: { at: IsoDate; text: string }[];
  noConsensus?: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

export const WORK_PRESETS: { id: WorkPreset; title: string; blurb: string }[] = [
  { id: "design", title: "Design", blurb: "Architecture and system design" },
  { id: "debug", title: "Debug", blurb: "Multi-agent root-cause investigation" },
  { id: "security", title: "Security", blurb: "Blue team + red team" },
  { id: "research", title: "Research", blurb: "Evidence gathering and comparison" },
  { id: "review", title: "Review", blurb: "Multi-agent code and design review" },
  { id: "incident", title: "Incident", blurb: "Live war room" },
  { id: "product", title: "Product", blurb: "Product + engineering + UX" },
];
