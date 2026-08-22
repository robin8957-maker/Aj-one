import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleLensRpc } from "../src/runtime/lens.ts";

test("lens package is 0.2.0 and still a thin client", () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "extensions/aljwharah-lens/package.json"), "utf8"));
  assert.equal(pkg.version, "0.2.0");
  const commands = pkg.contributes.commands.map((c: { command: string }) => c.command);
  assert.ok(commands.includes("aljwharah.openLens"));
  assert.ok(commands.includes("aljwharah.missions"));
});

test("lens RPC still refuses writes", () => {
  const denied = handleLensRpc({ jsonrpc: "2.0", id: 2, method: "fs.write" }, { missions: [] });
  assert.ok(denied.error);
  const ping = handleLensRpc({ jsonrpc: "2.0", id: 1, method: "ping" }, { missions: [] });
  assert.equal((ping.result as { thinClient?: boolean }).thinClient, true);
});
