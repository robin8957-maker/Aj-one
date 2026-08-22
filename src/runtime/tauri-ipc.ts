/**
 * Twin of the Rust renderer middleware + live Tauri invoke.
 * In the desktop shell this talks to native_invoke / overlay_run.
 * XSS in agent output cannot fs.write or read keys through the bridge.
 */

export const RENDERER_ALLOWED = ["mission.approve", "mission.reject"] as const;
export type RendererIpcCmd = (typeof RENDERER_ALLOWED)[number];

export const CHROME_ALLOWED = ["window.minimize", "window.maximize", "window.close", "overlay.toggle", "tray.panic"] as const;
export type ChromeIpcCmd = (typeof CHROME_ALLOWED)[number];

const FORBIDDEN = /^(fs\.|secret\.|keychain|shell\.)/;

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function authorizeRendererIpc(
  cmd: string,
  payload: string,
): { ok: true; cmd: RendererIpcCmd } | { ok: false; reason: string } {
  if (FORBIDDEN.test(cmd) || cmd === "fs.write") {
    return { ok: false, reason: "ipc denied: renderer cannot touch host fs or secrets" };
  }
  if (!RENDERER_ALLOWED.includes(cmd as RendererIpcCmd)) {
    return { ok: false, reason: "ipc denied: renderer may only mission.approve / mission.reject" };
  }
  if (!payload || payload.length > 256) return { ok: false, reason: "ipc denied: approval id required" };
  if (/\.\.|[\0]|BEGIN |sk-|Bearer /.test(payload)) return { ok: false, reason: "ipc denied: tainted payload" };
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) return { ok: false, reason: "ipc denied: approval id must be inert" };
  return { ok: true, cmd: cmd as RendererIpcCmd };
}

export function authorizeChromeIpc(
  cmd: string,
  payload = "",
): { ok: true; cmd: ChromeIpcCmd } | { ok: false; reason: string } {
  if (FORBIDDEN.test(cmd)) {
    return { ok: false, reason: "ipc denied: chrome cannot touch host fs or secrets" };
  }
  if (!CHROME_ALLOWED.includes(cmd as ChromeIpcCmd)) {
    return { ok: false, reason: "ipc denied: unknown chrome command" };
  }
  if (payload.includes("..") || payload.includes("\0") || payload.length > 64) {
    return { ok: false, reason: "ipc denied: tainted chrome payload" };
  }
  return { ok: true, cmd: cmd as ChromeIpcCmd };
}

async function invokeHost<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function invokeNative(
  cmd: string,
  payload = "",
): Promise<{ ok: true; cmd: string; result: string } | { ok: false; reason: string }> {
  const chrome = authorizeChromeIpc(cmd, payload);
  const renderer = authorizeRendererIpc(cmd, payload);
  if (!chrome.ok && !renderer.ok) {
    return { ok: false, reason: chrome.reason };
  }
  if (!isTauriRuntime()) {
    if (chrome.ok) return { ok: true, cmd: chrome.cmd, result: "web-preview" };
    if (renderer.ok) return { ok: true, cmd: renderer.cmd, result: "web-preview" };
    return { ok: false, reason: "ipc denied" };
  }
  try {
    const result = await invokeHost<string>("native_invoke", { cmd, payload });
    return { ok: true, cmd, result };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export async function invokeOverlay(raw: string): Promise<{ ok: true; result: string } | { ok: false; reason: string }> {
  if (!isTauriRuntime()) return { ok: false, reason: "not tauri" };
  try {
    const result = await invokeHost<string>("overlay_run", { raw });
    return { ok: true, result };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export async function invokeToast(title: string, body: string, approvalId: string): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    await invokeHost<string>("show_toast", { title, body, approvalId });
    return true;
  } catch {
    return false;
  }
}

export async function invokeHostStatus(): Promise<Record<string, unknown> | null> {
  if (!isTauriRuntime()) return null;
  try {
    return await invokeHost<Record<string, unknown>>("host_status", {});
  } catch {
    return null;
  }
}
