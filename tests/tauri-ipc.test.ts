import test from "node:test";
import assert from "node:assert/strict";
import { authorizeRendererIpc, authorizeChromeIpc, invokeNative, isTauriRuntime } from "../src/runtime/tauri-ipc.ts";

test("renderer IPC cannot fs.write, read keys, or traverse — only approve/reject", () => {
  assert.equal(authorizeRendererIpc("mission.approve", "apr_ok").ok, true);
  assert.equal(authorizeRendererIpc("mission.reject", "apr_ok").ok, true);
  assert.equal(authorizeRendererIpc("fs.write", "/tmp/pwned").ok, false);
  assert.equal(authorizeRendererIpc("fs.read", "/etc/passwd").ok, false);
  assert.equal(authorizeRendererIpc("keychain-get", "master").ok, false);
  assert.equal(authorizeRendererIpc("secret.read", "x").ok, false);
  assert.equal(authorizeRendererIpc("mission.approve", "../etc/passwd").ok, false);
  assert.equal(authorizeRendererIpc("mission.approve", "BEGIN SECRET").ok, false);
  assert.equal(authorizeRendererIpc("status", "").ok, false);
  assert.equal(authorizeRendererIpc("window.minimize", "").ok, false);
});

test("caption chrome may min/max/close but never fs.write", () => {
  assert.equal(authorizeChromeIpc("window.minimize").ok, true);
  assert.equal(authorizeChromeIpc("window.close").ok, true);
  assert.equal(authorizeChromeIpc("fs.write").ok, false);
  assert.equal(authorizeChromeIpc("window.minimize", "../x").ok, false);
});

test("native invoke refuses fs.write and does not fake a Tauri runtime in node tests", async () => {
  assert.equal(isTauriRuntime(), false);
  const denied = await invokeNative("fs.write", "/tmp/x");
  assert.equal(denied.ok, false);
  const chrome = await invokeNative("window.minimize");
  assert.equal(chrome.ok, true);
  if (chrome.ok) assert.equal(chrome.result, "web-preview");
});

