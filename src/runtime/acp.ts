import { join } from "node:path";
import type { ExternalAgentRecord } from "../protocol/index.ts";
import { makeId } from "../protocol/index.ts";
import { runSandboxed } from "./sandbox.ts";

export interface AcpSessionResult {
  ok: boolean;
  externalId: string;
  manifest?: { name: string; version: string; capabilities: string[]; cannotCertify?: boolean };
  heartbeats: { note: string; progress: number }[];
  toolsUsed: string[];
  toolsDenied: string[];
  artifact?: string;
  summary?: string;
  reason?: string;
}

export function defaultAcpWorker(): string {
  return join(process.cwd(), "services", "acp", "worker.mjs");
}

export function grantAcpRecord(record: ExternalAgentRecord): ExternalAgentRecord {
  if (record.kind !== "acp") return record;
  return {
    ...record,
    requested: ["fs.read", "fs.write", "network.internet", "secrets.broker"],
    granted: ["fs.read"],
    status: "granted",
    session: record.session ?? { status: "idle" },
  };
}

export function runAcpSessionSync(opts: {
  record: ExternalAgentRecord;
  projectPath: string;
  objective: string;
  timeoutMs?: number;
}): AcpSessionResult {
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  const command = [
    "node",
    "/opt/extra/run-session.mjs",
    "/opt/extra/worker.mjs",
    "/work",
    q(JSON.stringify(opts.record.granted)),
    q(opts.objective),
    q(opts.record.externalId),
    String(opts.timeoutMs ?? 8000),
  ].join(" ");
  const boxed = runSandboxed({
    cwd: opts.projectPath,
    command,
    timeoutMs: (opts.timeoutMs ?? 8000) + 2500,
    network: "none",
    extraRo: join(process.cwd(), "services", "acp"),
  });
  const lines = boxed.output.split("\n").filter(Boolean);
  const last = lines.at(-1);
  if (!last) {
    return {
      ok: false,
      externalId: opts.record.externalId,
      heartbeats: [],
      toolsUsed: [],
      toolsDenied: [],
      reason: boxed.output.slice(0, 400) || "ACP driver produced no output",
    };
  }
  try {
    return JSON.parse(last) as AcpSessionResult;
  } catch {
    return {
      ok: false,
      externalId: opts.record.externalId,
      heartbeats: [],
      toolsUsed: [],
      toolsDenied: [],
      reason: "ACP driver returned invalid JSON",
    };
  }
}

export function newExternalSessionId(): string {
  return makeId("acp");
}
