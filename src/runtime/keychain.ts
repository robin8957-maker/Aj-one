/**
 * OS Keychain integration and key redaction engine.
 * Protects keys from leaking into logs, ledger, config, or git diffs.
 */

// Patterns matching common AI API keys and authorization headers
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /xai-[a-zA-Z0-9_-]{20,}/g,
  /anthropic-[a-zA-Z0-9_-]{20,}/g,
  /Bearer\s+[a-zA-Z0-9_.-]{20,}/gi,
  /[0-9a-fA-F]{64}/g, // 256-bit hex keys
  /ghp_[a-zA-Z0-9]{36}/g,
  /gho_[a-zA-Z0-9]{36}/g,
];

export function redactSecrets(text: string): string {
  if (!text) return text;
  let redacted = text;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED_KEY]");
  }
  return redacted;
}

export function redactObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    return redactSecrets(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item)) as unknown as T;
  }
  if (typeof obj === "object") {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k.toLowerCase().includes("key") || k.toLowerCase().includes("secret") || k.toLowerCase().includes("password")) {
        res[k] = "[REDACTED_FIELD]";
      } else {
        res[k] = redactObject(v);
      }
    }
    return res as unknown as T;
  }
  return obj;
}

export interface KeychainService {
  getSecret(name: string): Promise<string | null>;
  setSecret(name: string, value: string): Promise<boolean>;
  deleteSecret(name: string): Promise<boolean>;
}

export class DefaultKeychainService implements KeychainService {
  async getSecret(name: string): Promise<string | null> {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        return await invoke<string | null>("get_secret", { name });
      } catch (err: unknown) {
        throw new Error(`KEYCHAIN_UNAVAILABLE: OS keychain access failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw new Error("KEYCHAIN_UNAVAILABLE: OS keychain is only available inside the ALJWHARAH ONE desktop shell. No environment or memory fallback permitted.");
  }

  async setSecret(name: string, value: string): Promise<boolean> {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        return await invoke<boolean>("set_secret", { name, value });
      } catch (err: unknown) {
        throw new Error(`KEYCHAIN_UNAVAILABLE: OS keychain write failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw new Error("KEYCHAIN_UNAVAILABLE: OS keychain is only available inside the ALJWHARAH ONE desktop shell. No environment or memory fallback permitted.");
  }

  async deleteSecret(name: string): Promise<boolean> {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        return await invoke<boolean>("delete_secret", { name });
      } catch (err: unknown) {
        throw new Error(`KEYCHAIN_UNAVAILABLE: OS keychain deletion failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw new Error("KEYCHAIN_UNAVAILABLE: OS keychain is only available inside the ALJWHARAH ONE desktop shell. No environment or memory fallback permitted.");
  }
}

export const keychain = new DefaultKeychainService();