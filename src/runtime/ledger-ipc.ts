import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT = resolve(process.cwd(), "services/ledger/writer.mjs");

let child: ChildProcessWithoutNullStreams | null = null;

function ensureWriter(): ChildProcessWithoutNullStreams | null {
  if (child && !child.killed) return child;
  if (!existsSync(SCRIPT)) return null;
  child = spawn("node", [SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
  child.unref();
  (child.stdin as { unref?: () => void }).unref?.();
  (child.stdout as { unref?: () => void }).unref?.();
  (child.stderr as { unref?: () => void }).unref?.();
  child.on("exit", () => {
    child = null;
  });
  return child;
}

export function ipcAppend(path: string, line: string): boolean {
  const w = ensureWriter();
  if (!w) return false;
  try {
    w.stdin.write(`${JSON.stringify({ op: "append", path, line })}\n`);
    return true;
  } catch {
    return false;
  }
}

export function ipcCrashNote(path: string, note: string): boolean {
  const w = ensureWriter();
  if (!w) return false;
  try {
    w.stdin.write(`${JSON.stringify({ op: "crash", path, note })}\n`);
    return true;
  } catch {
    return false;
  }
}
