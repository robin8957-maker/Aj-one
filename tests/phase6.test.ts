import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { detectBuildFailure, proposeWatchdogFix, applyWatchdogFix } from "../src/runtime/watchdog.ts";
import { handleLensRpc } from "../src/runtime/lens.ts";
import { AjDaemon } from "../src/daemon/ajd.ts";

test("watchdog proposes a jail fix and refuses host merge without a click", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-wd-"));
  writeFileSync(join(dir, "broken.js"), "export function add(a,b){\nreturn a+b\n}\n");
  const finding = detectBuildFailure("SyntaxError: Unexpected token in src/app.ts");
  assert.ok(finding);
  assert.match(finding!.file, /src\/app.ts/);
  const proposal = proposeWatchdogFix(dir, { ...finding!, file: "broken.js" });
  assert.equal(proposal.merged, false);
  assert.equal(proposal.needsApproval, true);
  assert.match(proposal.notification, /انقر للمراجعة/);
  const denied = applyWatchdogFix(dir, proposal, false);
  assert.equal(denied.ok, false);
  const ok = applyWatchdogFix(dir, proposal, true);
  assert.equal(ok.ok, true);
  assert.ok(readFileSync(join(dir, "broken.js"), "utf8").length > 0);
  rmSync(dir, { recursive: true, force: true });
});

test("lens JSON-RPC is a thin viewer and rejects unknown methods", () => {
  const pong = handleLensRpc({ jsonrpc: "2.0", id: 1, method: "ping" }, { missions: [] });
  assert.equal((pong.result as { thinClient?: boolean }).thinClient, true);
  const bad = handleLensRpc({ jsonrpc: "2.0", id: 2, method: "fs.write" }, { missions: [] });
  assert.ok(bad.error);
  const list = handleLensRpc(
    { jsonrpc: "2.0", id: 3, method: "missions.list" },
    { missions: [{ missionId: "m", state: "RUNNING", title: "t" }] },
  );
  assert.equal((list.result as { missionId: string }[])[0]?.missionId, "m");
});

test("aj CLI init binds a folder without starting a second runtime", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-cli-"));
  const r = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "apps/cli/aj.ts", "init", dir],
    { encoding: "utf8", cwd: process.cwd(), env: { ...process.env, AJ_DATA_DIR: join(dir, "data") } },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(dir, ".aljwharah", "config.json")));
  rmSync(dir, { recursive: true, force: true });
});

test("daemon watchdog records a proposal event", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-wd2-"));
  process.env.AJ_DATA_DIR = dir;
  const ajd = new AjDaemon();
  const out = ajd.observeBuild("wd-op", "FAIL tests/foo.test.ts\nSyntaxError: Unexpected token", dir);
  assert.equal(out.proposed, true);
  const world = ajd.load("wd-op");
  assert.ok(world.events.some((e) => e.type === "WatchdogProposed"));
  rmSync(dir, { recursive: true, force: true });
});
