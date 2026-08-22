/**
 * Interactive PTY. TERM=dumb, ANSI stripped, TUI escape hatch.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { authorizeCommand } from "./allowlist.ts";

export interface PtySession {
  ptyId: string;
  cwd: string;
  output: string;
  running: boolean;
  pendingPrompt?: "confirm" | "secret" | "tui" | null;
}

interface Live {
  child: ChildProcessWithoutNullStreams;
  session: PtySession;
}

const live = new Map<string, Live>();
const HOST = resolve(process.cwd(), "services/pty/host.py");
const ANSWER = /^(y|n|yes|no)$/i;
const CONFIRM = /(\[y\/n\]|yes\/no|\(y\/N\)|\(Y\/n\)|continue\?)/i;
const SECRET = /(password|passphrase|token)[: ]/i;
const TUI = /\b(vim|nvim|nano|htop|top|less|more|emacs)\b/;
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

export function isInteractiveAnswer(text: string): boolean {
  return ANSWER.test(text.trim());
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

export function isTuiCommand(text: string): boolean {
  return TUI.test(text);
}

export function detectPrompt(chunk: string): "confirm" | "secret" | "tui" | null {
  const plain = stripAnsi(chunk);
  if (TUI.test(plain) || /\x1b\[\?1049h/.test(chunk)) return "tui";
  if (SECRET.test(plain)) return "secret";
  if (CONFIRM.test(plain)) return "confirm";
  return null;
}

export function startPty(ptyId: string, cwd: string): PtySession {
  stopPty(ptyId);
  if (!existsSync(HOST)) {
    return { ptyId, cwd, output: "pty host missing\n", running: false };
  }
  const child = spawn("python3", ["-u", HOST, cwd], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, TERM: "dumb", NO_COLOR: "1" },
  });
  const session: PtySession = { ptyId, cwd, output: "", running: true, pendingPrompt: null };
  const rec: Live = { child, session };
  live.set(ptyId, rec);
  const onData = (buf: Buffer | string) => {
    const text = typeof buf === "string" ? buf : buf.toString("utf8");
    session.output = stripAnsi(session.output + text).slice(-24_000);
    session.pendingPrompt = detectPrompt(session.output.slice(-400));
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("exit", () => {
    session.running = false;
    live.delete(ptyId);
  });
  return session;
}

export function writePty(ptyId: string, data: string): PtySession | null {
  const rec = live.get(ptyId);
  if (!rec) return null;
  rec.child.stdin.write(data.endsWith("\n") ? data : `${data}\n`);
  return rec.session;
}

export function snapshotPty(ptyId: string): PtySession | null {
  return live.get(ptyId)?.session ?? null;
}

export function stopPty(ptyId: string): void {
  const rec = live.get(ptyId);
  if (!rec) return;
  rec.child.kill("SIGTERM");
  live.delete(ptyId);
}

export function escapeTui(ptyId: string): PtySession | null {
  const rec = live.get(ptyId);
  if (!rec) return null;
  rec.child.stdin.write("\u0003");
  rec.child.stdin.write("q\n");
  rec.child.stdin.write(":q!\n");
  rec.session.pendingPrompt = null;
  rec.session.output = `${rec.session.output}\n[pty: escaped TUI]\n`.slice(-24_000);
  return rec.session;
}

export function authorizePtyInput(text: string): { ok: true; kind: "answer" | "command" } | { ok: false; reason: string } {
  const trimmed = text.trim();
  if (isInteractiveAnswer(trimmed)) return { ok: true, kind: "answer" };
  if (trimmed === "/escape" || trimmed === "aj:escape") return { ok: true, kind: "answer" };
  const cmd = authorizeCommand(trimmed);
  if (!cmd.ok) return cmd;
  return { ok: true, kind: "command" };
}
