/**
 * Warm jail pool. 2–3 OverlayFS roots sit ready.
 * Acquire is a pop + optional remount. Refill happens after the guest starts.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { runSandboxed } from "./sandbox.ts";

export const POOL_SIZE = 3;
export const POOL_MIN_READY = 2;

export interface WarmJail {
  jailId: string;
  root: string;
  guest: string;
  overlay: boolean;
  ready: boolean;
  inUse: boolean;
  lower: string;
  primedAt: number;
}

export interface JailLease {
  jail: WarmJail;
  fromPool: true;
  waitMs: number;
}

const poolRoot = () => process.env.AJ_JAIL_POOL || join(tmpdir(), "aj-warm");

function mountOverlay(lower: string, root: string): boolean {
  const upper = join(root, "upper");
  const work = join(root, "work");
  const merged = join(root, "merged");
  mkdirSync(upper, { recursive: true });
  mkdirSync(work, { recursive: true });
  mkdirSync(merged, { recursive: true });
  const res = spawnSync(
    "mount",
    ["-t", "overlay", "overlay", "-o", `lowerdir=${lower},upperdir=${upper},workdir=${work}`, merged],
    { encoding: "utf8" },
  );
  return res.status === 0;
}

function unmountOverlay(root: string): void {
  spawnSync("umount", ["-l", join(root, "merged")], { encoding: "utf8" });
}

function templateLower(): string {
  const dir = join(poolRoot(), "_template");
  if (!existsSync(join(dir, ".keep"))) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".keep"), "warm");
  }
  return dir;
}

function primeOne(): WarmJail {
  const jailId = `warm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const root = join(poolRoot(), jailId);
  mkdirSync(root, { recursive: true });
  const lower = templateLower();
  const overlay = mountOverlay(lower, root);
  const guest = overlay ? join(root, "merged") : join(root, "copy");
  if (!overlay) mkdirSync(guest, { recursive: true });
  return {
    jailId,
    root,
    guest,
    overlay,
    ready: true,
    inUse: false,
    lower,
    primedAt: Date.now(),
  };
}

function attachProject(jail: WarmJail, cwd: string): void {
  if (jail.overlay) {
    if (jail.lower === cwd) return;
    unmountOverlay(jail.root);
    if (mountOverlay(cwd, jail.root)) {
      jail.lower = cwd;
      jail.guest = join(jail.root, "merged");
      return;
    }
    jail.overlay = false;
    jail.guest = join(jail.root, "copy");
    mkdirSync(jail.guest, { recursive: true });
  }
  cpSync(cwd, jail.guest, { recursive: true, dereference: true, errorOnExist: false, force: true });
  jail.lower = cwd;
}

function destroyJail(jail: WarmJail): void {
  if (jail.overlay) unmountOverlay(jail.root);
  rmSync(jail.root, { recursive: true, force: true });
}

class JailPool {
  private ready: WarmJail[] = [];
  private busy = 0;
  private refillQueued = false;

  ensure(): void {
    while (this.ready.length < POOL_SIZE) this.ready.push(primeOne());
  }

  stats() {
    return {
      ready: this.ready.length,
      busy: this.busy,
      size: POOL_SIZE,
      minReady: POOL_MIN_READY,
    };
  }

  acquire(cwd: string): JailLease {
    const started = Date.now();
    this.ensure();
    const jail = this.ready.pop() ?? primeOne();
    jail.ready = false;
    jail.inUse = true;
    this.busy += 1;
    attachProject(jail, cwd);
    this.queueRefill();
    return { jail, fromPool: true, waitMs: Date.now() - started };
  }

  release(jail: WarmJail): void {
    jail.inUse = false;
    this.busy = Math.max(0, this.busy - 1);
    destroyJail(jail);
    this.queueRefill();
  }

  private queueRefill(): void {
    if (this.refillQueued || this.ready.length >= POOL_SIZE) return;
    this.refillQueued = true;
    const kick = () => {
      this.refillQueued = false;
      while (this.ready.length < POOL_SIZE) this.ready.push(primeOne());
    };
    if (typeof setImmediate === "function") setImmediate(kick);
    else kick();
  }

  drain(): void {
    for (const j of this.ready) destroyJail(j);
    this.ready = [];
    this.busy = 0;
  }
}

const g = globalThis as unknown as { __ajWarmPool?: JailPool };
export function getJailPool(): JailPool {
  if (!g.__ajWarmPool) g.__ajWarmPool = new JailPool();
  return g.__ajWarmPool;
}

export function runPooled(cwd: string, command: string, timeoutMs = 20_000) {
  const pool = getJailPool();
  const lease = pool.acquire(cwd);
  try {
    const boxed = runSandboxed({ cwd: lease.jail.guest, command, timeoutMs, network: "none" });
    return {
      ok: boxed.ok,
      code: boxed.code,
      output: boxed.output,
      isolated: true as const,
      network: "none" as const,
      vmId: lease.jail.jailId,
      destroyed: true as const,
      hostUntouched: true as const,
      backend: "namespace-ephemeral" as const,
      overlay: lease.jail.overlay,
      waitMs: lease.waitMs,
      fromPool: true as const,
    };
  } finally {
    pool.release(lease.jail);
  }
}
