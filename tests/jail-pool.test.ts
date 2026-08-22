import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getJailPool, POOL_SIZE, POOL_MIN_READY, runPooled } from "../src/runtime/jail-pool.ts";

test("warm pool primes 3 jails and acquire pops one", () => {
  process.env.AJ_JAIL_POOL = mkdtempSync(join(tmpdir(), "aj-warm-t-"));
  const g = globalThis as unknown as { __ajWarmPool?: unknown };
  g.__ajWarmPool = undefined;
  const pool = getJailPool();
  pool.ensure();
  const before = pool.stats();
  assert.equal(before.ready, POOL_SIZE);
  assert.ok(before.ready >= POOL_MIN_READY);
  const proj = mkdtempSync(join(tmpdir(), "aj-warm-p-"));
  writeFileSync(join(proj, "ok.txt"), "ready");
  const lease = pool.acquire(proj);
  assert.equal(lease.fromPool, true);
  assert.ok(lease.waitMs < 5_000);
  assert.equal(pool.stats().ready, POOL_SIZE - 1);
  pool.release(lease.jail);
  rmSync(proj, { recursive: true, force: true });
  pool.drain();
  rmSync(process.env.AJ_JAIL_POOL, { recursive: true, force: true });
});

test("runPooled executes in a leased jail and host file stays", () => {
  process.env.AJ_JAIL_POOL = mkdtempSync(join(tmpdir(), "aj-warm-r-"));
  const g = globalThis as unknown as { __ajWarmPool?: unknown };
  g.__ajWarmPool = undefined;
  const proj = mkdtempSync(join(tmpdir(), "aj-warm-h-"));
  writeFileSync(join(proj, "keep.txt"), "host");
  const out = runPooled(proj, "node -e \"console.log('pooled-ok')\"", 8_000);
  assert.equal(out.fromPool, true);
  assert.match(out.output, /pooled-ok|ok/);
  assert.equal(out.destroyed, true);
  rmSync(proj, { recursive: true, force: true });
  getJailPool().drain();
  rmSync(process.env.AJ_JAIL_POOL, { recursive: true, force: true });
});
