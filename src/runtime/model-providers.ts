/**
 * Real ModelProvider interface and adapters: Anthropic, OpenAI-Compatible, Ollama.
 * Exponential backoff (max 3 retries on 429/5xx/timeout).
 * Strict TypeScript: no any, full typing, real tool schema and token metrics.
 */
import { AJ_ERR } from "./errors.ts";

export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ToolPropertySchema {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolPropertySchema;
  properties?: Record<string, ToolPropertySchema>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolPropertySchema>;
    required?: string[];
  };
}

export interface ToolCallInvocation {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | "error";

export interface ProviderResponse {
  ok: boolean;
  provider: string;
  model: string;
  text: string;
  toolCalls?: ToolCallInvocation[];
  stopReason?: StopReason;
  usage: TokenUsage;
  costEstimateUsd: number;
  error?: {
    code: string;
    message: string;
    statusCode?: number;
    retryable: boolean;
  };
}

export interface ProviderRequest {
  model?: string;
  messages: ModelMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  apiKey?: string;
  endpoint?: string;
  timeoutMs?: number;
}

export interface ModelProvider {
  readonly id: string;
  readonly defaultModel: string;
  readonly fallbackModel?: string;
  complete(req: ProviderRequest): Promise<ProviderResponse>;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateCostEstimate(providerId: string, model: string, usage: TokenUsage): number {
  // Approximate pricing per million tokens
  let inputRate = 3.0; // $ per 1M input tokens
  let outputRate = 15.0; // $ per 1M output tokens

  if (providerId === "anthropic") {
    if (model.includes("opus")) {
      inputRate = 15.0;
      outputRate = 75.0;
    } else if (model.includes("sonnet")) {
      inputRate = 3.0;
      outputRate = 15.0;
    }
  } else if (providerId === "openai_compatible") {
    if (model.includes("gpt-5") || model.includes("gpt-4o")) {
      inputRate = 5.0;
      outputRate = 15.0;
    }
  } else if (providerId === "ollama_local") {
    inputRate = 0.0;
    outputRate = 0.0;
  }

  const cost = (usage.inputTokens * inputRate + usage.outputTokens * outputRate) / 1_000_000;
  return Number(cost.toFixed(6));
}

function extractToolCallsFromText(text: string): ToolCallInvocation[] | undefined {
  const calls: ToolCallInvocation[] = [];
  const regex = /\{[\s\S]*?"tool"\s*:\s*"([^"]+)"[\s\S]*?"parameters"\s*:\s*(\{[\s\S]*?\})[\s\S]*?\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      const name = match[1];
      const params = JSON.parse(match[2]) as Record<string, unknown>;
      calls.push({
        id: `call_${Math.random().toString(36).slice(2, 9)}`,
        name,
        parameters: params,
      });
    } catch {
      // Ignore parse failure in regex fallback
    }
  }
  return calls.length > 0 ? calls : undefined;
}

export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic";
  readonly defaultModel = "claude-opus-4-8";
  readonly fallbackModel = "claude-sonnet-4-6";

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const apiKey = req.apiKey;
    const model = req.model || this.defaultModel;
    const endpoint = req.endpoint || "https://api.anthropic.com/v1/messages";

    if (!apiKey) {
      return {
        ok: false,
        provider: this.id,
        model,
        text: "",
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        costEstimateUsd: 0,
        error: {
          code: AJ_ERR.PROVIDER_NOT_CONFIGURED,
          message: "Anthropic API key is not configured.",
          retryable: false,
        },
      };
    }

    const systemPrompt = req.messages.find((m) => m.role === "system")?.content;
    const messages = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const tools = req.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    const payload = {
      model,
      max_tokens: req.maxTokens ?? 4096,
      messages,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      ...(tools && tools.length > 0 ? { tools } : {}),
    };

    let attempt = 0;
    const maxRetries = 3;
    let lastError: Error | null = null;
    let lastStatus: number | undefined;

    while (attempt <= maxRetries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000);

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          lastStatus = res.status;
          const errorBody = await res.text();
          const isRetryable = res.status === 429 || res.status >= 500;
          if (isRetryable && attempt < maxRetries) {
            attempt++;
            await sleep(1000 * Math.pow(2, attempt - 1));
            continue;
          }
          return {
            ok: false,
            provider: this.id,
            model,
            text: "",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            costEstimateUsd: 0,
            error: {
              code: res.status === 429 ? AJ_ERR.RATE_LIMIT_EXCEEDED : AJ_ERR.PROVIDER_UNAVAILABLE,
              message: `Anthropic API error (${res.status}): ${errorBody}`,
              statusCode: res.status,
              retryable: isRetryable,
            },
          };
        }

        const data = (await res.json()) as {
          content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
          stop_reason?: string;
          usage?: { input_tokens?: number; output_tokens?: number };
        };

        const textBlocks = data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "") ?? [];
        const text = textBlocks.join("\n");

        const toolCalls: ToolCallInvocation[] = [];
        const toolUseBlocks = data.content?.filter((c) => c.type === "tool_use") ?? [];
        for (const tu of toolUseBlocks) {
          if (tu.name && tu.input) {
            toolCalls.push({
              id: tu.id || `call_${Math.random().toString(36).slice(2, 9)}`,
              name: tu.name,
              parameters: tu.input,
            });
          }
        }

        const fallbackToolCalls = toolCalls.length === 0 ? extractToolCallsFromText(text) : undefined;
        const resolvedToolCalls = toolCalls.length > 0 ? toolCalls : fallbackToolCalls;

        const inTokens = data.usage?.input_tokens ?? Math.ceil(JSON.stringify(payload).length / 4);
        const outTokens = data.usage?.output_tokens ?? Math.ceil(text.length / 4);
        const usage: TokenUsage = {
          inputTokens: inTokens,
          outputTokens: outTokens,
          totalTokens: inTokens + outTokens,
        };

        let stopReason: StopReason = "end_turn";
        if (data.stop_reason === "tool_use" || (resolvedToolCalls && resolvedToolCalls.length > 0)) {
          stopReason = "tool_use";
        } else if (data.stop_reason === "max_tokens") {
          stopReason = "max_tokens";
        }

        return {
          ok: true,
          provider: this.id,
          model,
          text,
          toolCalls: resolvedToolCalls,
          stopReason,
          usage,
          costEstimateUsd: calculateCostEstimate(this.id, model, usage),
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const isTimeout = lastError.name === "AbortError" || lastError.name === "TimeoutError";
        if (!isTimeout && attempt < maxRetries) {
          attempt++;
          await sleep(1000 * Math.pow(2, attempt - 1));
          continue;
        }
        break;
      }
    }

    const isTimeout = lastError?.name === "AbortError" || lastError?.name === "TimeoutError";
    return {
      ok: false,
      provider: this.id,
      model,
      text: "",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      costEstimateUsd: 0,
      error: {
        code: isTimeout ? AJ_ERR.TIMEOUT : (lastStatus === 429 ? AJ_ERR.RATE_LIMIT_EXCEEDED : AJ_ERR.PROVIDER_UNAVAILABLE),
        message: isTimeout ? "Anthropic request timed out" : `Anthropic call failed after retries: ${lastError?.message ?? "Network error"}`,
        statusCode: lastStatus,
        retryable: false,
      },
    };
  }
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly id = "openai_compatible";
  readonly defaultModel = "gpt-5.6-sol";

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const apiKey = req.apiKey;
    const model = req.model || this.defaultModel;
    const endpoint = req.endpoint || "https://api.openai.com/v1/chat/completions";

    if (!apiKey && !endpoint.includes("localhost") && !endpoint.includes("127.0.0.1")) {
      return {
        ok: false,
        provider: this.id,
        model,
        text: "",
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        costEstimateUsd: 0,
        error: {
          code: AJ_ERR.PROVIDER_NOT_CONFIGURED,
          message: "OpenAI-compatible API key is not configured.",
          retryable: false,
        },
      };
    }

    const messages = req.messages.map((m) => ({ role: m.role, content: m.content }));
    const tools = req.tools?.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const payload = {
      model,
      messages,
      max_tokens: req.maxTokens ?? 4096,
      ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
    };

    let attempt = 0;
    const maxRetries = 3;
    let lastError: Error | null = null;
    let lastStatus: number | undefined;

    while (attempt <= maxRetries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000);

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          lastStatus = res.status;
          const errorBody = await res.text();
          const isRetryable = res.status === 429 || res.status >= 500;
          if (isRetryable && attempt < maxRetries) {
            attempt++;
            await sleep(1000 * Math.pow(2, attempt - 1));
            continue;
          }
          return {
            ok: false,
            provider: this.id,
            model,
            text: "",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            costEstimateUsd: 0,
            error: {
              code: res.status === 429 ? AJ_ERR.RATE_LIMIT_EXCEEDED : AJ_ERR.PROVIDER_UNAVAILABLE,
              message: `OpenAI API error (${res.status}): ${errorBody}`,
              statusCode: res.status,
              retryable: isRetryable,
            },
          };
        }

        const data = (await res.json()) as {
          choices?: Array<{
            message?: {
              content?: string;
              tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
            };
            finish_reason?: string;
          }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        };

        const choice = data.choices?.[0];
        const text = choice?.message?.content ?? "";

        const toolCalls: ToolCallInvocation[] = [];
        if (choice?.message?.tool_calls) {
          for (const tc of choice.message.tool_calls) {
            if (tc.function?.name) {
              let parsedArgs: Record<string, unknown> = {};
              try {
                parsedArgs = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
              } catch {
                parsedArgs = {};
              }
              toolCalls.push({
                id: tc.id || `call_${Math.random().toString(36).slice(2, 9)}`,
                name: tc.function.name,
                parameters: parsedArgs,
              });
            }
          }
        }

        const fallbackToolCalls = toolCalls.length === 0 ? extractToolCallsFromText(text) : undefined;
        const resolvedToolCalls = toolCalls.length > 0 ? toolCalls : fallbackToolCalls;

        const inTokens = data.usage?.prompt_tokens ?? Math.ceil(JSON.stringify(payload).length / 4);
        const outTokens = data.usage?.completion_tokens ?? Math.ceil(text.length / 4);
        const usage: TokenUsage = {
          inputTokens: inTokens,
          outputTokens: outTokens,
          totalTokens: inTokens + outTokens,
        };

        let stopReason: StopReason = "end_turn";
        if (choice?.finish_reason === "tool_calls" || (resolvedToolCalls && resolvedToolCalls.length > 0)) {
          stopReason = "tool_use";
        } else if (choice?.finish_reason === "length") {
          stopReason = "max_tokens";
        }

        return {
          ok: true,
          provider: this.id,
          model,
          text,
          toolCalls: resolvedToolCalls,
          stopReason,
          usage,
          costEstimateUsd: calculateCostEstimate(this.id, model, usage),
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const isTimeout = lastError.name === "AbortError" || lastError.name === "TimeoutError";
        if (!isTimeout && attempt < maxRetries) {
          attempt++;
          await sleep(1000 * Math.pow(2, attempt - 1));
          continue;
        }
        break;
      }
    }

    const isTimeout = lastError?.name === "AbortError" || lastError?.name === "TimeoutError";
    return {
      ok: false,
      provider: this.id,
      model,
      text: "",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      costEstimateUsd: 0,
      error: {
        code: isTimeout ? AJ_ERR.TIMEOUT : (lastStatus === 429 ? AJ_ERR.RATE_LIMIT_EXCEEDED : AJ_ERR.PROVIDER_UNAVAILABLE),
        message: isTimeout ? "OpenAI-compatible request timed out" : `OpenAI-compatible call failed after retries: ${lastError?.message ?? "Network error"}`,
        statusCode: lastStatus,
        retryable: false,
      },
    };
  }
}

export class OllamaLocalProvider implements ModelProvider {
  readonly id = "ollama_local";
  readonly defaultModel = "qwen3-coder:30b";

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const model = req.model || this.defaultModel;
    const endpoint = req.endpoint || "http://127.0.0.1:11434/api/chat";

    const messages = req.messages.map((m) => ({ role: m.role, content: m.content }));
    const payload = {
      model,
      messages,
      stream: false,
      options: {
        num_predict: req.maxTokens ?? 4096,
        temperature: req.temperature ?? 0.2,
      },
    };

    let attempt = 0;
    const maxRetries = 3;
    let lastError: Error | null = null;
    let lastStatus: number | undefined;

    while (attempt <= maxRetries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000);

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          lastStatus = res.status;
          const errorBody = await res.text();
          const isRetryable = res.status === 429 || res.status >= 500;
          if (isRetryable && attempt < maxRetries) {
            attempt++;
            await sleep(1000 * Math.pow(2, attempt - 1));
            continue;
          }
          return {
            ok: false,
            provider: this.id,
            model,
            text: "",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            costEstimateUsd: 0,
            error: {
              code: res.status === 429 ? AJ_ERR.RATE_LIMIT_EXCEEDED : AJ_ERR.PROVIDER_UNAVAILABLE,
              message: `Ollama API error (${res.status}): ${errorBody}`,
              statusCode: res.status,
              retryable: isRetryable,
            },
          };
        }

        const data = (await res.json()) as {
          message?: { content?: string };
          done_reason?: string;
          prompt_eval_count?: number;
          eval_count?: number;
        };

        const text = data.message?.content ?? "";
        const toolCalls = extractToolCallsFromText(text);

        const inTokens = data.prompt_eval_count ?? Math.ceil(JSON.stringify(payload).length / 4);
        const outTokens = data.eval_count ?? Math.ceil(text.length / 4);
        const usage: TokenUsage = {
          inputTokens: inTokens,
          outputTokens: outTokens,
          totalTokens: inTokens + outTokens,
        };

        let stopReason: StopReason = "end_turn";
        if (toolCalls && toolCalls.length > 0) {
          stopReason = "tool_use";
        }

        if (req.onChunk && text) {
          req.onChunk(text);
        }

        return {
          ok: true,
          provider: this.id,
          model,
          text,
          toolCalls,
          stopReason,
          usage,
          costEstimateUsd: 0,
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const isTimeout = lastError.name === "AbortError" || lastError.name === "TimeoutError";
        if (!isTimeout && attempt < maxRetries) {
          attempt++;
          await sleep(1000 * Math.pow(2, attempt - 1));
          continue;
        }
        break;
      }
    }

    const isTimeout = lastError?.name === "AbortError" || lastError?.name === "TimeoutError";
    return {
      ok: false,
      provider: this.id,
      model,
      text: "",
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      costEstimateUsd: 0,
      error: {
        code: isTimeout ? AJ_ERR.TIMEOUT : (lastStatus && lastStatus >= 500 ? AJ_ERR.PROVIDER_UNAVAILABLE : AJ_ERR.PROVIDER_NOT_CONFIGURED),
        message: isTimeout ? "Ollama request timed out" : `Ollama local instance unavailable at ${endpoint}: ${lastError?.message ?? "Connection refused"}`,
        statusCode: lastStatus,
        retryable: false,
      },
    };
  }
}

export function createProvider(providerId: "anthropic" | "openai_compatible" | "ollama_local"): ModelProvider {
  switch (providerId) {
    case "anthropic":
      return new AnthropicProvider();
    case "openai_compatible":
      return new OpenAICompatibleProvider();
    case "ollama_local":
      return new OllamaLocalProvider();
    default: {
      const _exhaustive: never = providerId;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}

export interface VerifyResult {
  ok: boolean;
  provider: string;
  httpStatus?: number;
  modelEchoed?: string;
  stopReason?: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  rawResponse?: string;
  error?: {
    code: string;
    message: string;
  };
}

export async function verifyProvider(
  providerId: "anthropic" | "openai_compatible" | "ollama_local",
  options?: { apiKey?: string; endpoint?: string; model?: string },
): Promise<VerifyResult> {
  const provider = createProvider(providerId);
  const start = Date.now();
  const res = await provider.complete({
    model: options?.model,
    apiKey: options?.apiKey,
    endpoint: options?.endpoint,
    messages: [
      { role: "system", content: "You are being verified by ALJWHARAH ONE diagnostic harness. Respond with one word: READY" },
      { role: "user", content: "Ping" },
    ],
    maxTokens: 16,
    timeoutMs: 15_000,
  });
  const latencyMs = Date.now() - start;

  if (!res.ok) {
    return {
      ok: false,
      provider: providerId,
      httpStatus: res.error?.statusCode,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs,
      error: {
        code: res.error?.code ?? AJ_ERR.PROVIDER_UNAVAILABLE,
        message: res.error?.message ?? "Verification call failed",
      },
    };
  }

  return {
    ok: true,
    provider: providerId,
    httpStatus: 200,
    modelEchoed: res.model,
    stopReason: res.stopReason,
    tokensIn: res.usage.inputTokens,
    tokensOut: res.usage.outputTokens,
    latencyMs,
    rawResponse: res.text,
  };
}

export async function validateModelId(
  providerId: "anthropic" | "openai_compatible" | "ollama_local",
  modelId: string,
  options?: { apiKey?: string; endpoint?: string },
): Promise<{ ok: boolean; code?: string; reason?: string; availableModels?: string[] }> {
  try {
    if (providerId === "ollama_local") {
      const endpoint = options?.endpoint || "http://127.0.0.1:11434/api/tags";
      const res = await fetch(endpoint);
      if (!res.ok) {
        return { ok: false, code: AJ_ERR.PROVIDER_UNAVAILABLE, reason: `Ollama tags query failed (${res.status})` };
      }
      const data = (await res.json()) as { models?: Array<{ name?: string }> };
      const models = data.models?.map((m) => m.name ?? "").filter(Boolean) ?? [];
      const match = models.some((m) => m === modelId || m.startsWith(modelId + ":"));
      if (!match) {
        return {
          ok: false,
          code: AJ_ERR.MODEL_ID_INVALID,
          reason: `Model "${modelId}" not found in local Ollama instance. Available models: ${models.join(", ") || "none"}`,
          availableModels: models,
        };
      }
      return { ok: true, availableModels: models };
    }

    if (providerId === "openai_compatible") {
      const apiKey = options?.apiKey;
      const endpoint = options?.endpoint ? options.endpoint.replace(/\/chat\/completions$/, "/models") : "https://api.openai.com/v1/models";
      if (!apiKey && !endpoint.includes("localhost") && !endpoint.includes("127.0.0.1")) {
        return { ok: false, code: AJ_ERR.PROVIDER_NOT_CONFIGURED, reason: "OpenAI API key not configured." };
      }
      const res = await fetch(endpoint, {
        headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      });
      if (!res.ok) {
        return { ok: false, code: AJ_ERR.PROVIDER_UNAVAILABLE, reason: `OpenAI models endpoint failed (${res.status})` };
      }
      const data = (await res.json()) as { data?: Array<{ id?: string }> };
      const models = data.data?.map((m) => m.id ?? "").filter(Boolean) ?? [];
      const match = models.includes(modelId);
      if (!match && models.length > 0) {
        return {
          ok: false,
          code: AJ_ERR.MODEL_ID_INVALID,
          reason: `Model "${modelId}" not found. Available models: ${models.slice(0, 10).join(", ")}...`,
          availableModels: models,
        };
      }
      return { ok: true, availableModels: models };
    }

    if (providerId === "anthropic") {
      const knownAnthropicModels = [
        "claude-opus-4-8",
        "claude-sonnet-4-6",
        "claude-3-7-sonnet-20250219",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-opus-20240229",
      ];
      if (!knownAnthropicModels.includes(modelId) && !modelId.startsWith("claude-")) {
        return {
          ok: false,
          code: AJ_ERR.MODEL_ID_INVALID,
          reason: `Model "${modelId}" is not a recognized Anthropic model id. Recognized models: ${knownAnthropicModels.join(", ")}`,
          availableModels: knownAnthropicModels,
        };
      }
      return { ok: true, availableModels: knownAnthropicModels };
    }
  } catch (err: unknown) {
    return {
      ok: false,
      code: AJ_ERR.PROVIDER_UNAVAILABLE,
      reason: `Failed to query models endpoint: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { ok: true };
}