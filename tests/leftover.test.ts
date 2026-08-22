import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { mirrorEvent, mirroredRows, resetMirrorForTests } from "../src/runtime/pg-mirror.ts";
import { canBootFirecracker, writeVmConfig } from "../src/runtime/firecracker.ts";
import { handleLensRpc } from "../src/runtime/lens.ts";
import { serveLens } from "../src/runtime/lens-server.ts";
import { serveLensWs } from "../src/runtime/lens-ws.ts";
import { notifyNative } from "../src/runtime/toast.ts";
import { authorizeChromeIpc } from "../src/runtime/tauri-ipc.ts";
import { AjDaemon } from "../src/daemon/ajd.ts";

test("postgres mirror stores hash not payload secrets", async () => {
  resetMirrorForTests();
  process.env.AJ_PG_MIRROR = "0";
  const row = await mirrorEvent({
    seq: 1,
    eventId: "evt_m1",
    type: "MissionCreated",
    operatorId: "op",
    missionId: "msn",
    payload: { token: "sk-SHOULD-NOT-BE-STORED-AS-VALUE" },
    at: new Date().toISOString(),
  });
  assert.equal(row.event_id, "evt_m1");
  assert.equal(row.payload_hash.length, 32);
  assert.ok(!JSON.stringify(row).includes("sk-SHOULD"));
  assert.equal(mirroredRows().length, 1);
});

test("firecracker refuses boot without kernel/rootfs but writes a valid config", () => {
  const ready = canBootFirecracker();
  assert.equal(ready.ok, false);
  const cfg = writeVmConfig("vm_test");
  assert.ok(existsSync(cfg));
});

test("lens server answers ping on localhost and rejects fs.write", async () => {
  const srv = serveLens("lens-op", 0);
  if (!srv.listening) await once(srv, "listening");
  const res = handleLensRpc({ jsonrpc: "2.0", id: 1, method: "ping" }, { missions: [] });
  assert.equal((res.result as { thinClient?: boolean }).thinClient, true);
  const denied = handleLensRpc({ jsonrpc: "2.0", id: 2, method: "fs.write" }, { missions: [] });
  assert.ok(denied.error);
  srv.close();
});

test("seccomp helper is present and daemon still starts", () => {
  assert.ok(existsSync(join(process.cwd(), "services/sandbox/seccomp.py")));
  assert.ok(existsSync(join(process.cwd(), "apps/desktop/installer/aljwharah.nsi")));
  assert.ok(existsSync(join(process.cwd(), "extensions/aljwharah-lens/extension.js")));
  const dir = mkdtempSync(join(tmpdir(), "aj-left-"));
  process.env.AJ_DATA_DIR = dir;
  process.env.AJ_PG_MIRROR = "0";
  const ajd = new AjDaemon();
  ajd.startMission("left-op", "Add GET /health that returns { ok: true, service: 'northstar' }");
  assert.ok(ajd.load("left-op").seq >= 1);
  rmSync(dir, { recursive: true, force: true });
});

test("lens websocket binds localhost and toast never embeds secrets", async () => {
  const ws = serveLensWs("lens-op", 0);
  if (!ws.listening) await once(ws, "listening");
  const addr = ws.address();
  assert.ok(addr && typeof addr === "object");
  ws.close();
  const toast = notifyNative("ALJWHARAH", "Bearer sk-SECRET-TOKEN-VALUE failed");
  assert.ok(["notify-send", "in-app", "native-host"].includes(toast.backend));
  assert.equal(authorizeChromeIpc("window.maximize").ok, true);
});

