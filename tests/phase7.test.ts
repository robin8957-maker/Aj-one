import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { isUserScoped, pipePath } from "../src/runtime/ipc-pipe.ts";

const BIN = "apps/desktop/src-tauri/target/debug/aljwharah-one";

function host(args: string[]) {
  return spawnSync(BIN, args, { encoding: "utf8" });
}

test("named pipe path is scoped to the current user", () => {
  const p = pipePath();
  assert.equal(isUserScoped(p), true);
  assert.ok(!p.includes("0.0.0.0"));
  assert.ok(!p.includes("127.0.0.1"));
});

test("native host: mica dry-run, toast buttons, unsigned updater refused, shell HKCU", () => {
  const mica = host(["mica"]);
  assert.equal(mica.status, 0, mica.stderr);
  assert.match(mica.stdout, /DwmSetWindowAttribute|applied/);

  const toast = host(["toast", "apr_ok"]);
  assert.equal(toast.status, 0, toast.stderr);
  assert.match(toast.stdout, /Approve Merge/);
  assert.match(toast.stdout, /Reject/);

  const secret = host(["toast", "../x"]);
  assert.notEqual(secret.status, 0);

  const upd = host(["updater-check", "0.2.0"]);
  assert.match(upd.stdout + upd.stderr, /unsigned|pubkey|refused/i);

  const shell = host(["register-shell", "/opt/aljwharah-one"]);
  assert.equal(shell.status, 0, shell.stderr);
  assert.match(shell.stdout, /HKEY_CURRENT_USER|verbs/);
});
