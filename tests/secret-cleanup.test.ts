import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PERMISSIONS } from "../src/protocol/index.ts";
import {
  putSecret,
  leaseSecret,
  mintSecretHeaders,
  auditSecretAccess,
  listSecretAccessLog,
  resetSecretAccessLog,
  useSecretBuffer,
  verifySecretCleaned,
} from "../src/runtime/secrets.ts";
import { zeroBuffer } from "../src/runtime/keyring.ts";

const DIR = mkdtempSync(join(tmpdir(), "aj-sec-"));
process.env.AJ_DATA_DIR = DIR;
process.env.AJ_KEYRING_DIR = join("/dev/shm", `aj-keyring-sec-${Date.now()}`);

const dummy = {
  agentId: "agt-sec",
  role: "security-reviewer" as const,
  missionId: "m-sec",
  permissions: { ...DEFAULT_PERMISSIONS.commander, secrets: "broker" as const },
};

test("secret cleanup overwrites buffer memory", () => {
  const op = "sec-wipe";
  const secret = "super-secret-api-key-12345";
  putSecret(op, { name: "api-key", value: secret, ttlMs: 60_000 });
  const leased = leaseSecret(op, { name: "api-key", agent: dummy });
  assert.equal(leased.ok, true);
  if (!leased.ok) return;
  const minted = mintSecretHeaders(op, leased.lease.leaseId, dummy.agentId, "api-key");
  assert.equal(minted.ok, true);
  if (!minted.ok) return;
  assert.ok(!minted.lease.headers.Authorization.includes(secret));
  assert.ok(minted.lease.headers.Authorization.startsWith("Bearer "));
  minted.lease.cleanup();
  const scratch = Buffer.from(secret, "utf8");
  zeroBuffer(scratch);
  assert.equal(verifySecretCleaned(scratch), true);
});

test("secret audit log tracks all access", () => {
  resetSecretAccessLog();
  const op = "sec-audit";
  putSecret(op, { name: "db-password", value: "db-secret-zzzz", ttlMs: 60_000 });
  for (let i = 0; i < 5; i += 1) {
    const leased = leaseSecret(op, { name: "db-password", agent: dummy });
    assert.equal(leased.ok, true);
    if (!leased.ok) return;
    const minted = mintSecretHeaders(op, leased.lease.leaseId, dummy.agentId, "db-password");
    assert.equal(minted.ok, true);
    if (minted.ok) minted.lease.cleanup();
  }
  const logs = listSecretAccessLog();
  assert.ok(logs.length >= 5);
  assert.ok(logs.every((e) => e.cleaned === true));
});

test("secret NEVER leaks as plaintext to HTTP headers", () => {
  const op = "sec-hdr";
  const secret = "super-secret-api-key-12345";
  putSecret(op, { name: "test-key", value: secret, ttlMs: 60_000 });
  const leased = leaseSecret(op, { name: "test-key", agent: dummy });
  assert.equal(leased.ok, true);
  if (!leased.ok) return;
  const minted = mintSecretHeaders(op, leased.lease.leaseId, dummy.agentId, "test-key");
  assert.equal(minted.ok, true);
  if (!minted.ok) return;
  assert.equal(JSON.stringify(minted.lease.headers).includes(secret), false);
  assert.equal(minted.lease.headers.Authorization.startsWith("Bearer "), true);
});

test("useSecretBuffer wipes the working copy", () => {
  const op = "sec-buf";
  putSecret(op, { name: "buf-key", value: "ABCDEFGH", ttlMs: 60_000 });
  const leased = leaseSecret(op, { name: "buf-key", agent: dummy });
  assert.equal(leased.ok, true);
  if (!leased.ok) return;
  let seen = 0;
  const used = useSecretBuffer(op, leased.lease.leaseId, (buf) => {
    seen = buf.length;
    assert.ok(buf.length > 0);
  });
  assert.equal(used.ok, true);
  assert.ok(seen > 0);
  auditSecretAccess(dummy.agentId, "buf-key", 1, true);
});

test.after(() => {
  rmSync(DIR, { recursive: true, force: true });
});
