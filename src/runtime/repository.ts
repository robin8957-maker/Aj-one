/**
 * RepositoryRuntime — inspect ANY supported tree. Northstar is a fixture, not the OS.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { nowIso } from "../protocol/index.ts";

const SKIP = new Set(["node_modules", ".git", "data", "dist", ".output", ".tanstack", "coverage"]);

export interface RepositorySnapshot {
  snapshotId: string;
  repositoryId: string;
  root: string;
  commit: string | null;
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  buildSystems: string[];
  testSystems: string[];
  files: string[];
  entryPoints: string[];
  services: string[];
  databases: string[];
  apis: string[];
  ci: string[];
  hasGit: boolean;
  generatedAt: string;
  contentHash: string;
}

export function discoverRepository(root: string): { ok: true; root: string } | { ok: false; reason: string } {
  if (!root) return { ok: false, reason: "empty path" };
  if (!existsSync(root)) return { ok: false, reason: "path does not exist" };
  try {
    if (!statSync(root).isDirectory()) return { ok: false, reason: "not a directory" };
  } catch {
    return { ok: false, reason: "stat failed" };
  }
  return { ok: true, root };
}

export function listRepoFiles(root: string, max = 400): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (out.length >= max) return;
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
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

export function readRepoFile(root: string, rel: string): string | null {
  const full = join(root, rel);
  if (!full.startsWith(root)) return null;
  if (!existsSync(full)) return null;
  try {
    return readFileSync(full, "utf8");
  } catch {
    return null;
  }
}

function gitCommit(root: string): string | null {
  if (!existsSync(join(root, ".git"))) return null;
  const r = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (r.status !== 0) return null;
  return r.stdout.trim() || null;
}

export function inspectRepository(root: string): RepositorySnapshot {
  const discovered = discoverRepository(root);
  if (!discovered.ok) {
    return {
      snapshotId: "snap-missing",
      repositoryId: "missing",
      root,
      commit: null,
      languages: [],
      frameworks: [],
      packageManagers: [],
      buildSystems: [],
      testSystems: [],
      files: [],
      entryPoints: [],
      services: [],
      databases: [],
      apis: [],
      ci: [],
      hasGit: false,
      generatedAt: nowIso(),
      contentHash: "0",
    };
  }
  const files = listRepoFiles(root);
  const languages = detectLanguages(files);
  const packageManagers = detectPackageManagers(root);
  const frameworks = detectFrameworks(root, files);
  const buildSystems = detectBuildSystems(root);
  const testSystems = detectTestSystems(root, files);
  const entryPoints = detectEntryPoints(root, files);
  const services = detectServices(files);
  const databases = detectDatabases(root, files);
  const apis = detectApis(files);
  const ci = detectCI(root, files);
  const hasGit = existsSync(join(root, ".git"));
  const commit = gitCommit(root);
  const contentHash = createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 16);
  return {
    snapshotId: `snap-${contentHash}`,
    repositoryId: contentHash,
    root,
    commit,
    languages,
    frameworks,
    packageManagers,
    buildSystems,
    testSystems,
    files,
    entryPoints,
    services,
    databases,
    apis,
    ci,
    hasGit,
    generatedAt: nowIso(),
    contentHash,
  };
}

export function detectLanguages(files: string[]): string[] {
  const langs = new Set<string>();
  for (const f of files) {
    if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f)) langs.add("javascript");
    if (/\.(ts|tsx)$/.test(f)) langs.add("typescript");
    if (/\.py$/.test(f)) langs.add("python");
    if (/\.rs$/.test(f)) langs.add("rust");
    if (/\.go$/.test(f)) langs.add("go");
    if (/\.java$/.test(f)) langs.add("java");
    if (/\.(c|h|cc|cpp)$/.test(f)) langs.add("c-family");
  }
  return [...langs];
}

export function detectPackageManagers(root: string): string[] {
  const out: string[] = [];
  if (existsSync(join(root, "pnpm-lock.yaml"))) out.push("pnpm");
  if (existsSync(join(root, "yarn.lock"))) out.push("yarn");
  if (existsSync(join(root, "package-lock.json")) || existsSync(join(root, "package.json"))) out.push("npm");
  if (existsSync(join(root, "requirements.txt")) || existsSync(join(root, "pyproject.toml"))) out.push("pip");
  if (existsSync(join(root, "Cargo.toml"))) out.push("cargo");
  if (existsSync(join(root, "go.mod"))) out.push("go");
  return [...new Set(out)];
}

export function detectFrameworks(root: string, files: string[]): string[] {
  const out: string[] = [];
  const pkgRaw = readRepoFile(root, "package.json");
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.react) out.push("react");
      if (deps.express) out.push("express");
      if (deps.fastify) out.push("fastify");
      if (deps.next) out.push("next");
      if (deps.vite) out.push("vite");
      if (deps["@tanstack/react-router"]) out.push("tanstack-router");
    } catch {
      /* invalid package.json is not a framework */
    }
  }
  if (files.some((f) => f.endsWith("Cargo.toml"))) out.push("rust");
  return [...new Set(out)];
}

export function detectBuildSystems(root: string): string[] {
  const out: string[] = [];
  if (existsSync(join(root, "package.json"))) out.push("npm-scripts");
  if (existsSync(join(root, "Makefile"))) out.push("make");
  if (existsSync(join(root, "Cargo.toml"))) out.push("cargo");
  if (existsSync(join(root, "go.mod"))) out.push("go");
  return out;
}

export function detectTestSystems(root: string, files: string[]): string[] {
  const out: string[] = [];
  if (files.some((f) => f.startsWith("tests/") || f.includes(".test."))) out.push("node:test");
  const pkg = readRepoFile(root, "package.json");
  if (pkg?.includes("playwright")) out.push("playwright");
  if (pkg?.includes("vitest")) out.push("vitest");
  if (existsSync(join(root, "pytest.ini")) || files.some((f) => f.startsWith("tests/") && f.endsWith(".py"))) {
    out.push("pytest");
  }
  return [...new Set(out)];
}

export function detectEntryPoints(root: string, files: string[]): string[] {
  const hits = files.filter((f) =>
    /^(src\/)?(index|main|server|app|cli)\.(js|ts|mjs|cjs)$/.test(f) || f === "src/server.js" || f === "src/auth.js",
  );
  return hits.slice(0, 20);
}

export function detectServices(files: string[]): string[] {
  return files.filter((f) => /server|service|gateway|handler/i.test(f)).slice(0, 20);
}

export function detectDatabases(root: string, files: string[]): string[] {
  const out: string[] = [];
  if (files.some((f) => f.includes("migrations") && f.endsWith(".sql"))) out.push("sql-migrations");
  const pkg = readRepoFile(root, "package.json") ?? "";
  if (pkg.includes("\"pg\"") || pkg.includes("postgres")) out.push("postgres");
  if (pkg.includes("pglite")) out.push("pglite");
  return out;
}

export function detectApis(files: string[]): string[] {
  return files.filter((f) => /route|api|openapi|swagger/i.test(f)).slice(0, 20);
}

export function detectCI(root: string, files: string[]): string[] {
  const out: string[] = [];
  if (existsSync(join(root, ".github", "workflows"))) out.push("github-actions");
  if (files.some((f) => f.includes(".gitlab-ci"))) out.push("gitlab-ci");
  return out;
}

export function detectGit(root: string): boolean {
  return existsSync(join(root, ".git"));
}
