import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export type SandboxNetwork = "none" | "open";

export interface SandboxRequest {
  cwd: string;
  command: string;
  timeoutMs?: number;
  network?: SandboxNetwork;
  /** Optional host directory bind-mounted read-only at /opt/extra inside the jail. */
  extraRo?: string;
}

export interface SandboxResult {
  ok: boolean;
  code: number;
  output: string;
  backend: "linux-namespaces";
  isolated: true;
  network: SandboxNetwork;
}

const ENTER = resolve(process.cwd(), "services/sandbox/enter.sh");

const STRIP_ENV = [
  "XAI_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_ACCESS_KEY_ID",
  "AZURE_OPENAI_API_KEY",
  "GITHUB_TOKEN",
  "AJ_MASTER_KEY",
  "DATABASE_URL",
  "NEON_DATABASE_URL",
  "PGUSER",
  "PGPASSWORD",
  "PGHOST",
];

export function sandboxAvailable(): boolean {
  return existsSync("/usr/bin/unshare") && existsSync("/usr/sbin/chroot") && existsSync(ENTER);
}

export function describeSandbox(): { backend: string; networkDefault: string; notes: string[] } {
  return {
    backend: sandboxAvailable() ? "linux-namespaces" : "unavailable",
    networkDefault: "none",
    notes: [
      "PID / mount / UTS / IPC namespaces",
      "Empty net namespace unless policy grants network",
      "chroot jail — host /workspace and secrets are not mounted",
      "Dropped uid when the host allows it; this nest often maps only uid 0 — chroot still hides the host",
      "prlimit: 25s CPU · 64 procs · 64MB file — V8 address space left intact",
      "Not Docker / Firecracker / a hypervisor — real Linux isolation on this host",
    ],
  };
}

function sanitizedEnv(extraRo?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: "/usr/bin:/bin",
    HOME: "/work",
    USER: "sandbox",
    LANG: process.env.LANG ?? "C.UTF-8",
    NODE_DISABLE_COLORS: "1",
  };
  if (extraRo) env.AJ_RO_BIND = extraRo;
  for (const key of STRIP_ENV) delete env[key];
  return env;
}

export function runSandboxed(req: SandboxRequest): SandboxResult {
  const cwd = resolve(req.cwd);
  const network: SandboxNetwork = req.network ?? "none";
  if (!sandboxAvailable()) {
    return {
      ok: false,
      code: 126,
      output: "sandbox unavailable — refuse to run on the host",
      backend: "linux-namespaces",
      isolated: true,
      network,
    };
  }
  if (!existsSync(cwd)) {
    return {
      ok: false,
      code: 126,
      output: "sandbox work root missing — fail closed",
      backend: "linux-namespaces",
      isolated: true,
      network,
    };
  }

  const args = [
    "--mount",
    "--uts",
    "--ipc",
    "--pid",
    "--fork",
    "--mount-proc",
    "--propagation=private",
    ...(network === "none" ? ["--net"] : []),
    ENTER,
    cwd,
    network,
    req.command,
  ];

  const res = spawnSync("unshare", args, {
    encoding: "utf8",
    timeout: req.timeoutMs ?? 22_000,
    maxBuffer: 800_000,
    env: sanitizedEnv(req.extraRo),
  });

  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
  const code = res.status ?? (res.error ? 1 : 0);
  return {
    ok: code === 0,
    code,
    output: output.slice(0, 8000),
    backend: "linux-namespaces",
    isolated: true,
    network,
  };
}
