/**
 * Firecracker MicroVM launch path.
 * Boots only when kernel + rootfs exist. KVM is required.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

export function firecrackerBin(): string {
  return (
    process.env.AJ_FIRECRACKER ||
    ["/usr/bin/firecracker", "/usr/local/bin/firecracker", join(process.cwd(), "services/microvm/firecracker")].find((p) =>
      existsSync(p),
    ) ||
    join(process.cwd(), "services/microvm/firecracker")
  );
}

export function kernelPath(): string {
  return process.env.AJ_FC_KERNEL || join(process.cwd(), "services/microvm/vmlinux.bin");
}

export function rootfsPath(): string {
  return process.env.AJ_FC_ROOTFS || join(process.cwd(), "services/microvm/rootfs.ext4");
}

export function canBootFirecracker(): { ok: boolean; reason: string } {
  if (!existsSync("/dev/kvm")) return { ok: false, reason: "KVM missing" };
  if (!existsSync(firecrackerBin())) return { ok: false, reason: "firecracker binary missing" };
  if (!existsSync(kernelPath())) return { ok: false, reason: "kernel image missing" };
  if (!existsSync(rootfsPath())) return { ok: false, reason: "rootfs missing" };
  return { ok: true, reason: "ready" };
}

export function writeVmConfig(vmId: string, extraCmd = "reboot -f"): string {
  const dir = join(tmpdir(), "aj-fc", vmId);
  mkdirSync(dir, { recursive: true });
  const cfg = {
    "boot-source": {
      kernel_image_path: kernelPath(),
      boot_args: `console=ttyS0 reboot=k panic=1 pci=off init=/bin/sh -- -c ${JSON.stringify(extraCmd)}`,
    },
    drives: [{ drive_id: "rootfs", path_on_host: rootfsPath(), is_root_device: true, is_read_only: true }],
    "machine-config": { vcpu_count: 1, mem_size_mib: 128 },
  };
  const path = join(dir, "vm.json");
  writeFileSync(path, JSON.stringify(cfg));
  return path;
}

export function bootFirecracker(vmId: string, extraCmd = "echo aj-fc-ok"): {
  ok: boolean;
  output: string;
  backend: "firecracker" | "unavailable";
} {
  const ready = canBootFirecracker();
  if (!ready.ok) return { ok: false, output: ready.reason, backend: "unavailable" };
  const cfg = writeVmConfig(vmId, extraCmd);
  const sock = join(tmpdir(), "aj-fc", vmId, "api.sock");
  const res = spawnSync(firecrackerBin(), ["--api-sock", sock, "--config-file", cfg], {
    encoding: "utf8",
    timeout: 8_000,
  });
  return {
    ok: res.status === 0,
    output: `${res.stdout || ""}${res.stderr || ""}`.slice(0, 800),
    backend: "firecracker",
  };
}
