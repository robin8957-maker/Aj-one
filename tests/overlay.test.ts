import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isCommanderChord, parseOverlayIntent } from "../src/runtime/overlay.ts";
import { AjDaemon } from "../src/daemon/ajd.ts";

test("overlay parse: start, stop, reject traversal", () => {
  const stop = parseOverlayIntent("stop");
  assert.equal(stop.ok, true);
  if (stop.ok) assert.equal(stop.intent.kind, "stop");
  const panic = parseOverlayIntent("panic");
  assert.equal(panic.ok && panic.intent.kind === "stop", true);
  const start = parseOverlayIntent("start Add GET /health");
  assert.equal(start.ok && start.intent.kind === "start", true);
  assert.equal(parseOverlayIntent("../etc/passwd").ok, false);
  assert.equal(
    isCommanderChord({ ctrlKey: true, metaKey: false, shiftKey: true, code: "Space", key: " " }),
    true,
  );
  assert.equal(
    isCommanderChord({ ctrlKey: true, metaKey: false, shiftKey: false, code: "Space", key: " " }),
    false,
  );
});

test("overlay start then stop goes through ajd", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-ovl-"));
  process.env.AJ_DATA_DIR = dir;
  const ajd = new AjDaemon();
  const started = ajd.overlayInvoke("ov-op", "Add GET /health that returns { ok: true, service: 'northstar' }");
  assert.equal(started.ok, true);
  assert.equal(started.action, "start");
  const stopped = ajd.overlayInvoke("ov-op", "stop");
  assert.equal(stopped.ok, true);
  assert.equal(stopped.action, "stop");
  const world = ajd.load("ov-op");
  assert.ok(world.events.some((e) => e.type === "OverlayInvoked"));
  rmSync(dir, { recursive: true, force: true });
});
