/**
 * Live model engines. The Control Panel catalog is not a lock-in:
 * a ready connector with a sealed secret becomes a callable engine.
 * Grok is never auto-selected as the brain.
 */
import { spawnSync } from "node:child_process";
import { nowIso } from "../protocol/index.ts";
import type { ModelRouteRecord } from "../protocol/index.ts";
import type { ConnectionRecord, ConnectionVendor } from "../protocol/connections.ts";
import { useSecret, listSecretMeta, leaseSecret } from "./secrets.ts";
import { assessBudget, budgetSystemNote } from "./economy.ts";

export type ModelCapability =
  | "planning"
  | "coding"
  | "reasoning"
  | "vision"
  | "judge"
  | "embedding"
  | "memory-extraction";

export type EngineId =
  | "aj-local"
  | "openai"
  | "anthropic"
  | "google"
  | "mistral"
  | "groq"
  | "deepseek"
  | "xai-grok"
  | "azure-openai"
  | "openrouter";

export interface LiveEngine {
  id: EngineId;
  vendor: ConnectionVendor | "aj-local";
  title: string;
  capabilities: ModelCapability[];
  live: boolean;
  secretName?: string;
  endpoint?: string;
}

const CAP: Record<string, ModelCapability[]> = {
  "aj-local": ["planning", "coding", "reasoning", "judge", "embedding", "memory-extraction", "vision"],
  openai: ["planning", "coding", "reasoning", "judge", "vision"],
  anthropic: ["planning", "coding", "reasoning", "judge"],
  google: ["planning", "reasoning", "vision", "judge"],
  mistral: ["planning", "coding", "reasoning"],
  groq: ["reasoning", "coding"],
  deepseek: ["coding", "reasoning"],
  "xai-grok": ["planning", "reasoning", "vision", "judge"],
  "azure-openai": ["planning", "coding", "reasoning", "judge"],
  openrouter: ["planning", "coding", "reasoning", "vision", "judge"],
};

const VENDOR_ENGINE: Partial<Record<ConnectionVendor, EngineId>> = {
  "aj-local": "aj-local",
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  mistral: "mistral",
  groq: "groq",
  deepseek: "deepseek",
  xai: "xai-grok",
  "azure-openai": "azure-openai",
  openrouter: "openrouter",
};

export function liveFleet(connections: ConnectionRecord[], localOnly: boolean): LiveEngine[] {
  const local: LiveEngine = {
    id: "aj-local",
    vendor: "aj-local",
    title: "AJ Local Governor",
    capabilities: CAP["aj-local"]!,
    live: true,
  };
  const extra: LiveEngine[] = [];
  for (const rec of connections) {
    const id = VENDOR_ENGINE[rec.vendor];
    if (!id || id === "aj-local") continue;
    if (localOnly && rec.vendor !== "ollama" && rec.vendor !== "lmstudio") continue;
    extra.push({
      id,
      vendor: rec.vendor,
      title: rec.title,
      capabilities: CAP[id] ?? ["reasoning"],
      live: rec.status === "ready" && rec.enabled && Boolean(rec.secretName),
      secretName: rec.secretName,
      endpoint: rec.endpoint,
    });
  }
  return [local, ...extra];
}

export function routePair(
  fleet: LiveEngine[],
  implementerCap: ModelCapability = "coding",
  judgeCap: ModelCapability = "judge",
): { implementer: ModelRouteRecord; judge: ModelRouteRecord } {
  const live = fleet.filter((e) => e.live);
  const pick = (cap: ModelCapability, exclude?: string): LiveEngine => {
    const pool = live.filter((e) => e.capabilities.includes(cap) && e.id !== "xai-grok" && e.id !== exclude);
    const remote = pool.find((e) => e.id !== "aj-local");
    return remote ?? pool.find((e) => e.id === "aj-local") ?? live[0]!;
  };
  const implementer = pick(implementerCap);
  const judge = pick(judgeCap, implementer.id === "aj-local" ? undefined : implementer.id);
  return {
    implementer: {
      capability: implementerCap,
      provider: implementer.id,
      reason:
        implementer.id === "aj-local"
          ? "No remote implementer live — AJ local writes."
          : `${implementer.title} implements. Grok was not auto-selected.`,
      at: nowIso(),
    },
    judge: {
      capability: judgeCap,
      provider: judge.id,
      reason:
        judge.id !== implementer.id
          ? `${judge.title} judges independently of ${implementer.id}.`
          : "Only one live engine — deterministic tests remain the source of PASS.",
      at: nowIso(),
    },
  };
}

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface EngineCall {
  ok: boolean;
  provider: string;
  text: string;
  reason?: string;
}

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o",
  anthropic: "claude-3-5-sonnet-latest",
  google: "gemini-1.5-pro",
  mistral: "mistral-large-latest",
  groq: "llama-3.3-70b-versatile",
  deepseek: "deepseek-chat",
  "xai-grok": "grok-3",
  "azure-openai": "gpt-4o",
  openrouter: "anthropic/claude-3.5-sonnet",
};

export function localComplete(turns: ChatTurn[], budgetNote?: string): EngineCall {
  const last = turns.filter((t) => t.role === "user").at(-1)?.content ?? "";
  const note = budgetNote ?? budgetSystemNote(assessBudget({ tokens: 100, tokensUsed: 0, moneyUsd: 1, moneyUsed: 0, timeMs: 1, parallelAgents: 1 }));
  return {
    ok: true,
    provider: "aj-local",
    text: `[aj-local] ${note}\n${last.slice(0, 400)}`,
  };
}

export function completeWithEngine(operatorId: string, engine: LiveEngine, turns: ChatTurn[]): EngineCall {
  if (engine.id === "aj-local" || !engine.live || !engine.secretName) {
    return localComplete(turns);
  }
  if (engine.id === "xai-grok" && process.env.AJ_USE_GROK !== "1") {
    return { ok: false, provider: engine.id, text: "", reason: "Grok requires explicit AJ_USE_GROK=1" };
  }
  const meta = listSecretMeta(operatorId).find((s) => s.name === engine.secretName && s.status === "active");
  if (!meta) return { ok: false, provider: engine.id, text: "", reason: "no sealed credential" };
  const dummy = {
    agentId: "ajd",
    role: "commander" as const,
    missionId: "engine",
    permissions: {
      filesystem: "none" as const,
      terminal: "none" as const,
      browser: "none" as const,
      network: "none" as const,
      git: "none" as const,
      secrets: "broker" as const,
      spawnAgents: false,
      maxChildAutonomy: 0,
    },
  };
  const leased = leaseSecret(operatorId, { name: engine.secretName, agent: dummy, asDaemon: true, ttlMs: 20_000 });
  if (!leased.ok) return { ok: false, provider: engine.id, text: "", reason: leased.reason };
  const used = useSecret(operatorId, leased.lease.leaseId, (key) => httpComplete(engine, key, turns));
  return used.ok ? used.result : { ok: false, provider: engine.id, text: "", reason: used.reason };
}

function httpComplete(engine: LiveEngine, apiKey: string, turns: ChatTurn[]): EngineCall {
  if (process.env.AJ_ENGINE_STUB === "1") {
    return { ok: true, provider: engine.id, text: `[stub:${engine.id}] ${turns.at(-1)?.content?.slice(0, 120) ?? ""}` };
  }
  const model = DEFAULT_MODELS[engine.id] ?? "gpt-4o";
  try {
    if (engine.id === "anthropic") {
      const res = postJson("https://api.anthropic.com/v1/messages", {
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 800,
          messages: turns.filter((t) => t.role !== "system").map((t) => ({ role: t.role, content: t.content })),
          system: turns.find((t) => t.role === "system")?.content,
        }),
      });
      const text = res.content?.map((c) => c.text ?? "").join("") ?? "";
      return { ok: Boolean(text), provider: engine.id, text, reason: text ? undefined : "empty anthropic response" };
    }
    const url = engine.id === "openai" ? "https://api.openai.com/v1/chat/completions" : engine.endpoint || "https://api.openai.com/v1/chat/completions";
    const res = postJson(url, {
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: turns, max_tokens: 800 }),
    });
    const text = res.choices?.[0]?.message?.content ?? "";
    return { ok: Boolean(text), provider: engine.id, text, reason: text ? undefined : "empty chat response" };
  } catch (err) {
    return { ok: false, provider: engine.id, text: "", reason: err instanceof Error ? err.message : "engine call failed" };
  }
}

function postJson(
  url: string,
  init: { headers: Record<string, string>; body: string },
): { content?: { text?: string }[]; choices?: { message?: { content?: string } }[] } {
  const args = ["-sS", "-X", "POST", url, "--max-time", "20"];
  for (const [k, v] of Object.entries(init.headers)) {
    args.push("-H", `${k}: ${v}`);
  }
  args.push("-d", init.body);
  const res = spawnSync("curl", args, { encoding: "utf8", timeout: 22_000, maxBuffer: 800_000 });
  if (res.status !== 0) throw new Error(res.stderr?.slice(0, 200) || "curl failed");
  return JSON.parse(res.stdout || "{}") as { content?: { text?: string }[]; choices?: { message?: { content?: string } }[] };
}
