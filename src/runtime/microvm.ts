/**
 * Disposable isolation. OverlayFS when the kernel allows it (CoW, ~instant).
 * Fallback: copy then destroy. Host worktree is never the guest root.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { runSandboxed } from "./sandbox.ts";
import { runPooled } from "./jail-pool.ts";

export type VmBackend = "firecracker" | "namespace-ephemeral";

export function firecrackerPath(): string {
  return process.env.AJ_FIRECRACKER || join(process.cwd(), "services/microvm/firecracker");
}

export function detectVmBackend(): { backend: VmBackend; kvm: boolean; firecracker: boolean } {
  const kvm = existsSync("/dev/kvm");
  const fc = existsSync(firecrackerPath());
  return {
    backend: kvm && fc ? "firecracker" : "namespace-ephemeral",
    kvm,
    firecracker: fc,
  };
}

export interface MicrovmResult {
  ok: boolean;
  code: number;
  output: string;
  isolated: true;
  network: "none";
  vmId: string;
  destroyed: true;
  hostUntouched: true;
  backend: VmBackend;
  overlay: boolean;
}

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

export function runEphemeral(cwd: string, command: string, timeoutMs = 20_000): MicrovmResult {
  const pooled = runPooled(cwd, command, timeoutMs);
  return {
    ok: pooled.ok,
    code: pooled.code,
    output: pooled.output,
    isolated: true,
    network: "none",
    vmId: pooled.vmId,
    destroyed: true,
    hostUntouched: true,
    backend: pooled.backend,
    overlay: pooled.overlay,
  };
}

export function describeMicrovm(): { backend: VmBackend; kvm: boolean; notes: string[] } {
  const d = detectVmBackend();
  return {
    backend: d.backend,
    kvm: d.kvm,
    notes: [
      d.kvm ? "KVM present" : "KVM missing",
      d.firecracker ? "Firecracker binary present" : "Firecracker binary not installed — ephemeral namespace used",
      "OverlayFS copy-on-write when the kernel allows it",
      "Warm pool keeps 2–3 jails pre-mounted — acquire is a pop, refill is background",
      "Host worktree cannot be deleted by the guest",
    ],
  };
}

export function firecrackerVersion(): string | null {
  const bin = firecrackerPath();
  if (!existsSync(bin)) return null;
  const res = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 3000 });
  return (res.stdout || res.stderr || "").trim().slice(0, 120) || null;
}
