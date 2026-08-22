import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { operatorDir } from "../daemon/store.ts";
import { runSandboxed } from "./sandbox.ts";

const SKIP = new Set(["node_modules", ".git", "data", "dist", ".output", ".tanstack"]);

/** Fixture default only. Callers MUST pass an inspected project path for real work. */
export function defaultProjectPath(): string {
  return process.env.AJ_PROJECT_PATH || join(process.cwd(), "fixtures", "northstar");
}

export function listProjectFiles(root: string, max = 80): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (out.length >= max) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP.has(name) || name.startsWith(".")) continue;
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full);
      else out.push(relative(root, full).split(sep).join("/"));
      if (out.length >= max) return;
    }
  };
  if (existsSync(root)) walk(root);
  return out;
}

export function readProjectFile(root: string, rel: string): string | null {
  const full = resolve(root, rel);
  if (!full.startsWith(resolve(root))) return null;
  if (!existsSync(full)) return null;
  try {
    return readFileSync(full, "utf8");
  } catch {
    return null;
  }
}

export function detectRuntime(root: string): string {
  if (existsSync(join(root, "package.json"))) return "node";
  if (existsSync(join(root, "pyproject.toml")) || existsSync(join(root, "requirements.txt")))
    return "python";
  if (existsSync(join(root, "Cargo.toml"))) return "rust";
  if (existsSync(join(root, "go.mod"))) return "go";
  if (existsSync(join(root, "pom.xml"))) return "java";
  return "unknown";
}

export function createWorktree(
  operatorId: string,
  missionId: string,
  agentId: string,
  projectPath: string,
): { path: string; copied: number } {
  const dest = join(operatorDir(operatorId), "worktrees", missionId, agentId);
  mkdirSync(dest, { recursive: true });
  let copied = 0;
  const walk = (from: string, to: string) => {
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from)) {
      if (SKIP.has(name) || name.startsWith(".")) continue;
      const src = join(from, name);
      const dst = join(to, name);
      const st = statSync(src);
      if (st.isDirectory()) walk(src, dst);
      else {
        cpSync(src, dst);
        copied += 1;
      }
    }
  };
  if (existsSync(projectPath)) walk(projectPath, dest);
  return { path: dest, copied };
}

export function writeScoped(
  worktreePath: string,
  rel: string,
  content: string,
  allowed: string[],
  forbidden: string[],
): { ok: true; path: string } | { ok: false; reason: string } {
  const normalized = rel.split(sep).join("/");
  const full = resolve(worktreePath, normalized);
  if (!full.startsWith(resolve(worktreePath))) {
    return { ok: false, reason: "path escape blocked" };
  }
  if (forbidden.some((g) => matchScope(normalized, g))) {
    return { ok: false, reason: `forbidden scope: ${normalized}` };
  }
  if (allowed.length > 0 && !allowed.some((g) => matchScope(normalized, g))) {
    return { ok: false, reason: `outside allowed scope: ${normalized}` };
  }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, "utf8");
  return { ok: true, path: full };
}

export function matchScope(path: string, glob: string): boolean {
  const g = glob.replace(/\\/g, "/");
  const p = path.replace(/\\/g, "/");
  if (g.endsWith("/**")) {
    const prefix = g.slice(0, -3);
    return p === prefix.replace(/\/$/, "") || p.startsWith(prefix.replace(/\/$/, "") + "/");
  }
  if (g.endsWith("/*")) {
    const prefix = g.slice(0, -2);
    const rest = p.startsWith(prefix + "/") ? p.slice(prefix.length + 1) : "";
    return p === prefix || (rest.length > 0 && !rest.includes("/"));
  }
  if (g.includes("*")) {
    const re = new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    return re.test(p);
  }
  return p === g || p.startsWith(g.replace(/\/$/, "") + "/");
}

export function changedFiles(worktreePath: string, projectPath: string): string[] {
  const files = listProjectFiles(worktreePath, 200);
  const changed: string[] = [];
  for (const rel of files) {
    const a = readProjectFile(worktreePath, rel);
    const b = readProjectFile(projectPath, rel);
    if (a !== b) changed.push(rel);
  }
  return changed;
}

export function mergeWorktree(
  worktreePath: string,
  projectPath: string,
  files: string[],
): { merged: string[]; conflicts: string[] } {
  const merged: string[] = [];
  const conflicts: string[] = [];
  for (const rel of files) {
    const next = readProjectFile(worktreePath, rel);
    if (next == null) continue;
    const dest = resolve(projectPath, rel);
    if (!dest.startsWith(resolve(projectPath))) {
      conflicts.push(rel);
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, next, "utf8");
    merged.push(rel);
  }
  return { merged, conflicts };
}

export function runNodeTest(
  cwd: string,
  files: string[],
): { ok: boolean; output: string; code: number } {
  const args = files.length ? files.map((f) => JSON.stringify(f)).join(" ") : "tests";
  const command = `node --test ${args}`;
  const res = runSandboxed({ cwd, command, timeoutMs: 20_000, network: "none" });
  return { ok: res.ok, output: res.output.slice(0, 8000), code: res.code };
}

export function scanKnowledge(projectPath: string): {
  runtime: string;
  files: string[];
  notes: string[];
} {
  const files = listProjectFiles(projectPath);
  const runtime = detectRuntime(projectPath);
  const notes: string[] = [];
  const pkg = readProjectFile(projectPath, "package.json");
  if (pkg) notes.push("Node package manifest present.");
  if (files.includes("src/auth.js")) notes.push("Auth module at src/auth.js.");
  if (files.includes("src/server.js")) notes.push("HTTP handler at src/server.js.");
  if (!files.some((f) => f.includes("health"))) notes.push("No health endpoint module found.");
  if (files.includes("src/auth.js")) {
    const auth = readProjectFile(projectPath, "src/auth.js") ?? "";
    if (auth.includes("INTENTIONAL DEFECT") || auth.includes("sessions.get(userId)")) {
      notes.push("Auth issuer uses check-then-set without single-flight.");
    }
  }
  return { runtime, files, notes };
}
