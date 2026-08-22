import type {
  AgentContract,
  AgentInstance,
  AjEvent,
  ApprovalRecord,
  ArtifactRecord,
  AutomationRecord,
  DecisionRecord,
  EvidenceRecord,
  ExternalAgentRecord,
  KnowledgeCard,
  KnowledgeGraph,
  McpServerRecord,
  MemoryRecord,
  Mission,
  ModelRouteRecord,
  SemanticConflictRecord,
  SecretMeta,
  IngressRecord,
  WorktreeRecord,
  WorldSnapshot,
  AgentPerformanceProfile,
  ModelPerformanceProfile,
  ExecutionPlacement,
  StationState,
  WorkRoom,
  ConnectionRecord,
} from "../protocol/index.ts";
import type { GovernanceMetrics } from "../runtime/metrics.ts";
import type { TopologyMap } from "../runtime/topology.ts";

export interface ConsoleView {
  daemon: { id: string; startedAt: string; seq: number; healthy: boolean };
  missions: Array<Mission & { progress: number; agentCount: number }>;
  agents: AgentInstance[];
  contracts: AgentContract[];
  artifacts: ArtifactRecord[];
  evidence: EvidenceRecord[];
  decisions: DecisionRecord[];
  memories: MemoryRecord[];
  knowledge: KnowledgeCard[];
  worktrees: WorktreeRecord[];
  approvals: ApprovalRecord[];
  events: AjEvent[];
  reputation: WorldSnapshot["reputation"];
  graph?: KnowledgeGraph;
  automations: AutomationRecord[];
  mcpServers: McpServerRecord[];
  externalAgents: ExternalAgentRecord[];
  semanticConflicts: SemanticConflictRecord[];
  modelRoutes: ModelRouteRecord[];
  secrets: SecretMeta[];
  ingress: IngressRecord[];
  performance: {
    agents: AgentPerformanceProfile[];
    models: ModelPerformanceProfile[];
  };
  placements: Record<string, ExecutionPlacement>;
  broker: { keyId: string };
  station: StationState;
  problems: { source: string; severity: "error" | "warning" | "info"; message: string }[];
  inbox: { decisions: number; blocked: number; approvals: number; artifacts: number };
  services: { name: string; hint: string }[];
  tree: { path: string; kind: "file" | "dir" }[];
  activeComputerId?: string;
  rooms: WorkRoom[];
  activeRoomId?: string;
  connections: ConnectionRecord[];
  governance: GovernanceMetrics;
  topology: TopologyMap;
}
