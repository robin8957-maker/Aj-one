import { nowIso } from "../protocol/index.ts";
import type { ModelRouteRecord } from "../protocol/index.ts";
import { liveFleet, routePair, type LiveEngine } from "./engines.ts";
import type { ConnectionRecord } from "../protocol/connections.ts";

export type ModelCapability =
  | "planning"
  | "coding"
  | "reasoning"
  | "vision"
  | "judge"
  | "embedding"
  | "memory-extraction";

export interface ModelProvider {
  id: string;
  capabilities: ModelCapability[];
  available(): boolean;
}

const LOCAL: ModelProvider = {
  id: "aj-local",
  capabilities: ["planning", "coding", "reasoning", "judge", "embedding", "memory-extraction", "vision"],
  available: () => true,
};

const XAI: ModelProvider = {
  id: "xai-grok",
  capabilities: ["planning", "reasoning", "vision", "judge"],
  available: () => Boolean(process.env.XAI_API_KEY) && process.env.AJ_USE_GROK === "1",
};

export const PROVIDERS: ModelProvider[] = [LOCAL, XAI];

export function routeModel(
  capability: ModelCapability,
  prefer?: string,
  fleet?: LiveEngine[],
): ModelRouteRecord {
  if (prefer === "xai-grok" && XAI.available()) {
    return {
      capability,
      provider: "xai-grok",
      reason: "Optional Grok provider selected for a single capability call.",
      at: nowIso(),
    };
  }
  if (fleet && fleet.some((e) => e.live && e.id !== "aj-local")) {
    const pair = routePair(fleet, capability === "judge" ? "coding" : capability, "judge");
    return capability === "judge" ? pair.judge : pair.implementer;
  }
  return {
    capability,
    provider: "aj-local",
    reason: "AJ governor is the planner. Models are engines, not the OS.",
    at: nowIso(),
  };
}

export function listProviders(): { id: string; capabilities: ModelCapability[]; available: boolean }[] {
  return PROVIDERS.map((p) => ({ id: p.id, capabilities: p.capabilities, available: p.available() }));
}

/** Primary planner is always aj-local. xAI is opt-in, never Anthropic/OpenAI. */
export function selectModel(): { provider: "aj-local" | "xai-grok"; fallback: "aj-local" } {
  if (XAI.available()) return { provider: "xai-grok", fallback: "aj-local" };
  return { provider: "aj-local", fallback: "aj-local" };
}

export function fleetFromConnections(connections: ConnectionRecord[], localOnly: boolean): LiveEngine[] {
  return liveFleet(connections, localOnly);
}
