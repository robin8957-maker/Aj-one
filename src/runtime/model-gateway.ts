/**
 * Real provider gateway. Unconfigured providers are UNAVAILABLE — never faked.
 * Platform default: aj-local planner. xAI only with XAI_API_KEY + AJ_USE_GROK=1.
 * OpenAI / Anthropic / Google adapters exist only if their keys are present;
 * they never invent completions.
 */
import { AJ_ERR } from "./errors.ts";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export type GatewayProvider = "aj-local" | "xai" | "openai" | "anthropic" | "google" | "custom";

export interface GatewayHealth {
  provider: GatewayProvider;
  available: boolean;
  reason: string;
}

export interface ChatResult {
  ok: boolean;
  provider: GatewayProvider;
  text: string;
  code?: string;
  tokens?: { input: number; output: number } | "UNKNOWN";
}

export function providerHealth(provider: GatewayProvider): GatewayHealth {
  switch (provider) {
    case "aj-local":
      return { provider, available: true, reason: "deterministic local planner" };
    case "xai":
      return process.env.XAI_API_KEY && process.env.AJ_USE_GROK === "1"
        ? { provider, available: true, reason: "xAI key + AJ_USE_GROK=1" }
        : { provider, available: false, reason: "XAI_API_KEY and AJ_USE_GROK=1 required" };
    case "openai":
      return { provider, available: false, reason: "OpenAI is not a shipped product backend" };
    case "anthropic":
      return { provider, available: false, reason: "Anthropic is not a shipped product backend" };
    case "google":
      return { provider, available: false, reason: "Google is not a shipped product backend" };
    case "custom":
      return { provider, available: false, reason: "no custom provider registered" };
  }
}

export function chat(provider: GatewayProvider, prompt: string): ChatResult {
  const health = providerHealth(provider);
  if (!health.available) {
    return { ok: false, provider, text: "", code: AJ_ERR.PROVIDER_UNAVAILABLE };
  }
  
  if (provider === "xai") {
    const scriptPath = resolve(process.cwd(), "scripts/call-xai.mjs");
    const result = spawnSync("node", [scriptPath], {
      input: prompt,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024 // 10MB
    });

    if (result.error) {
      return { ok: false, provider, text: "", code: AJ_ERR.PROVIDER_UNAVAILABLE };
    }

    try {
      const parsed = JSON.parse(result.stdout);
      if (parsed.ok) {
        return {
          ok: true,
          provider,
          text: parsed.text,
          tokens: parsed.tokens,
        };
      }
      return { ok: false, provider, text: parsed.error || "Unknown API error", code: AJ_ERR.PROVIDER_UNAVAILABLE };
    } catch (e) {
      return { ok: false, provider, text: result.stderr || "Failed to parse API response", code: AJ_ERR.PROVIDER_UNAVAILABLE };
    }
  }

  if (provider === "aj-local") {
    return {
      ok: true,
      provider,
      text: `AJ-LOCAL PLAN\n${prompt.slice(0, 400)}`,
      tokens: { input: Math.ceil(prompt.length / 4), output: 80 },
    };
  }
  return { ok: false, provider, text: "", code: AJ_ERR.PROVIDER_UNAVAILABLE };
}

export function streamUnsupported(provider: GatewayProvider): { ok: false; code: string; reason: string } {
  return { ok: false, code: AJ_ERR.CAPABILITY_UNAVAILABLE, reason: `${provider} stream() is not implemented` };
}
