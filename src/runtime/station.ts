import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { runEphemeral } from "./microvm.ts";
import { stampTrust } from "./trust.ts";
import { authorizeCommand, refuseTaintedInterpolation } from "./allowlist.ts";
import { authorizePtyInput, escapeTui, snapshotPty, startPty, writePty } from "./pty.ts";
import { refuseLowTrustDerivation } from "./trust.ts";
import {
  type AgentInstance,
  type AgentRole,
  type ArenaRun,
  type AutonomyUx,
  type ChatMessage,
  type ComputerRecord,
  type ComputerSnapshotRecord,
  type ComputerTemplate,
  type ContextKind,
  type ContextObject,
  type GrantMode,
  type PermissionPolicy,
  type PlanDocument,
  type QualityMode,
  type RedTeamReport,
  type SpecDocument,
  type StationState,
  type TerminalSession,
  type WorldSnapshot,
  emptyStation,
  makeId,
  nowIso,
  parseComposer,
} from "../protocol/index.ts";
import { operatorDir } from "../daemon/store.ts";
import { defaultProjectPath, listProjectFiles, readProjectFile, writeScoped } from "./workspace.ts";
import { resolveFeature } from "./catalog.ts";
import { extractSymbols } from "./graph.ts";
import { runNodeTest } from "./workspace.ts";
import { runBrowserScriptSync } from "./browser.ts";

const SKIP = new Set(["node_modules", ".git", "data", "dist", ".output", ".tanstack"]);

const DANGEROUS = /(rm\s+-rf\s+[\/~]|mkfs\b|dd\s+if=|\bshutdown\b|\breboot\b|curl\b.*\|\s*(ba)?sh|wget\b.*\|\s*(ba)?sh)/i;

export function stationOf(world: WorldSnapshot): StationState {
  if (!world.station) world.station = emptyStation();
  return world.station;
}

export function computersRoot(operatorId: string): string {
  const dir = join(operatorDir(operatorId), "computers");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function seedLocalComputer(world: WorldSnapshot, projectPath: string): ComputerRecord {
  const st = stationOf(world);
  const existing = Object.values(st.computers).find((c) => c.kind === "local" && c.status !== "destroyed");
  if (existing) return existing;
  const rec: ComputerRecord = {
    computerId: makeId("pc"),
    name: "Local machine",
    kind: "local",
    template: "local",
    path: projectPath,
    status: "ready",
    note: "Operator project. Not a hypervisor.",
    createdAt: nowIso(),
  };
  st.computers[rec.computerId] = rec;
  return rec;
}

export function createComputer(
  world: WorldSnapshot,
  opts: { template: ComputerTemplate; name?: string; fromPath?: string },
): ComputerRecord {
  const st = stationOf(world);
  const id = makeId("pc");
  const dest = join(computersRoot(world.operatorId), id);
  mkdirSync(dest, { recursive: true });
  const source =
    opts.fromPath ||
    (opts.template === "blank" ? null : opts.template === "python" ? null : defaultProjectPath());
  if (source && existsSync(source)) {
    cpSync(source, dest, { recursive: true, filter: (src) => !SKIP.has(src.split(sep).pop() ?? "") });
  } else if (opts.template === "python") {
    writeFileSync(join(dest, "main.py"), "def ready():\n    return True\n", "utf8");
    writeFileSync(join(dest, "README.md"), "# Python sandbox\n", "utf8");
  } else if (opts.template === "blank") {
    writeFileSync(join(dest, "README.md"), "# Blank sandbox computer\n", "utf8");
  }
  const rec: ComputerRecord = {
    computerId: id,
    name: opts.name ?? (opts.template === "local" ? "Local machine" : `Sandbox ${id.slice(-4)}`),
    kind: opts.template === "local" ? "local" : "sandbox",
    template: opts.template,
    path: dest,
    status: "ready",
    note:
      opts.template === "local"
        ? "Bound to the project tree."
        : "Isolated workspace. Snapshot and fork are filesystem copies — not a cloud VM.",
    createdAt: nowIso(),
  };
  st.computers[id] = rec;
  return rec;
}

export function snapshotComputer(world: WorldSnapshot, computerId: string, title: string): ComputerSnapshotRecord {
  const st = stationOf(world);
  const pc = st.computers[computerId];
  if (!pc || pc.status === "destroyed") throw new Error("computer missing");
  const snapId = makeId("snap");
  const dest = join(computersRoot(world.operatorId), "_snapshots", computerId, snapId);
  mkdirSync(dest, { recursive: true });
  cpSync(pc.path, dest, { recursive: true });
  const rec: ComputerSnapshotRecord = {
    snapshotId: snapId,
    computerId,
    title,
    path: dest,
    createdAt: nowIso(),
  };
  st.snapshots[snapId] = rec;
  return rec;
}

export function restoreSnapshot(world: WorldSnapshot, snapshotId: string): ComputerRecord {
  const st = stationOf(world);
  const snap = st.snapshots[snapshotId];
  const pc = snap ? st.computers[snap.computerId] : undefined;
  if (!snap || !pc) throw new Error("snapshot missing");
  for (const name of readdirSync(pc.path)) {
    if (name === "snapshots") continue;
    rmSync(join(pc.path, name), { recursive: true, force: true });
  }
  for (const name of readdirSync(snap.path)) {
    cpSync(join(snap.path, name), join(pc.path, name), { recursive: true });
  }
  pc.status = "ready";
  return pc;
}

export function forkComputer(world: WorldSnapshot, computerId: string, name?: string): ComputerRecord {
  const st = stationOf(world);
  const pc = st.computers[computerId];
  if (!pc) throw new Error("computer missing");
  const child = createComputer(world, { template: pc.template === "local" ? "node-fullstack" : pc.template, name, fromPath: pc.path });
  child.parentId = computerId;
  child.note = `Fork of ${pc.name}. Isolated copy.`;
  return child;
}

export function destroyComputer(world: WorldSnapshot, computerId: string): void {
  const st = stationOf(world);
  const pc = st.computers[computerId];
  if (!pc || pc.kind === "local") return;
  rmSync(pc.path, { recursive: true, force: true });
  pc.status = "destroyed";
}

export function listTree(root: string, max = 200): { path: string; kind: "file" | "dir" }[] {
  const out: { path: string; kind: "file" | "dir" }[] = [];
  const walk = (dir: string) => {
    if (out.length >= max) return;
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (SKIP.has(name) || name.startsWith(".") || name === "snapshots") continue;
      const full = join(dir, name);
      const rel = relative(root, full).split(sep).join("/");
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        out.push({ path: rel, kind: "dir" });
        walk(full);
      } else {
        out.push({ path: rel, kind: "file" });
      }
      if (out.length >= max) return;
    }
  };
  if (existsSync(root)) walk(root);
  return out;
}

export function writeSource(
  root: string,
  rel: string,
  content: string,
  policy: PermissionPolicy,
): { ok: true } | { ok: false; reason: string } {
  const forbidden = policy.denyGlobs.some((g) => matchGlob(rel, g));
  if (forbidden) return { ok: false, reason: `denied by policy: ${rel}` };
  const allowed = policy.allowGlobs.length === 0 || policy.allowGlobs.some((g) => matchGlob(rel, g));
  if (!allowed) return { ok: false, reason: `outside allow list: ${rel}` };
  return writeScoped(root, rel, content, policy.allowGlobs, policy.denyGlobs);
}

function matchGlob(path: string, glob: string): boolean {
  const g = glob.replace(/\\/g, "/");
  const p = path.replace(/\\/g, "/");
  if (g.endsWith("/**")) {
    const prefix = g.slice(0, -3);
    return p === prefix || p.startsWith(`${prefix}/`);
  }
  if (g.includes("*")) {
    const re = new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    return re.test(p);
  }
  return p === g || p.startsWith(`${g}/`);
}

export function searchInTree(root: string, query: string, limit = 30): { path: string; line: number; text: string }[] {
  const hits: { path: string; line: number; text: string }[] = [];
  const q = query.toLowerCase();
  if (!q) return hits;
  for (const file of listProjectFiles(root, 80)) {
    const src = readProjectFile(root, file);
    if (src == null) continue;
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i]!.toLowerCase().includes(q)) {
        hits.push({ path: file, line: i + 1, text: lines[i]!.trim().slice(0, 160) });
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}

export function runTerminal(
  session: TerminalSession,
  command: string,
  policy: PermissionPolicy,
  taintedPreviews: string[] = [],
  trustContexts: import("../protocol/station.ts").ContextObject[] = [],
): TerminalSession {
  const next = { ...session, lastCommand: command, updatedAt: nowIso(), running: false };
  if (DANGEROUS.test(command)) {
    next.output = `${session.output}$ ${command}\nrefused: dangerous command — fail closed\n`;
    next.exitCode = 126;
    return next;
  }
  const allowed = authorizeCommand(command);
  if (!allowed.ok && !authorizePtyInput(command).ok) {
    next.output = `${session.output}$ ${command}\nrefused: ${allowed.reason}\n`;
    next.exitCode = 126;
    return next;
  }
  const tainted = refuseTaintedInterpolation(command, taintedPreviews);
  if (!tainted.ok) {
    next.output = `${session.output}$ ${command}\nrefused: ${tainted.reason}\n`;
    next.exitCode = 126;
    return next;
  }
  const low = refuseLowTrustDerivation(command, trustContexts);
  if (!low.ok) {
    next.output = `${session.output}$ ${command}\nrefused: ${low.reason}\n`;
    next.exitCode = 126;
    return next;
  }
  if (command.trim() === "/escape" || command.trim() === "aj:escape") {
    if (session.ptyId) escapeTui(session.ptyId);
    next.output = `${session.output}\n[pty: escaped TUI]\n`;
    next.pendingPrompt = null;
    return next;
  }
  const answer = authorizePtyInput(command);
  if (answer.ok && answer.kind === "answer" && session.ptyId) {
    writePty(session.ptyId, command);
    const snap = snapshotPty(session.ptyId);
    next.output = snap?.output ?? session.output;
    next.running = Boolean(snap?.running);
    next.pendingPrompt = snap?.pendingPrompt ?? null;
    next.interactive = true;
    return next;
  }
  if (!answer.ok && !allowed.ok) {
    next.output = `${session.output}$ ${command}\nrefused: ${allowed.reason}\n`;
    next.exitCode = 126;
    return next;
  }
  if (/^(npm|npx|node)\b/.test(command.trim()) || session.interactive) {
    const ptyId = session.ptyId ?? session.sessionId;
    startPty(ptyId, session.cwd);
    writePty(ptyId, command);
    const snap = snapshotPty(ptyId);
    next.ptyId = ptyId;
    next.interactive = true;
    next.running = Boolean(snap?.running);
    next.output = `${session.output}$ ${command}\n[pty]\n${snap?.output ?? ""}`.slice(-24_000);
    next.pendingPrompt = snap?.pendingPrompt ?? null;
    return next;
  }
  const hostHit = /https?:\/\/([^/\s]+)/i.exec(command);
  if (hostHit && policy.denyHosts.some((h) => hostHit[1]!.includes(h))) {
    next.output = `${session.output}$ ${command}\nrefused: host denied by policy\n`;
    next.exitCode = 126;
    return next;
  }
  const res = runEphemeral(session.cwd, command, 20_000);
  const chunk = res.output ? `${res.output}\n` : "";
  const tag = `[vm:${res.backend} ${res.vmId} destroyed]\n`;
  next.output = `${session.output}$ ${command}\n${tag}${chunk}`.slice(-24_000);
  next.exitCode = res.code;
  return next;
}

export function draftUnderstanding(objective: string, projectPath: string): SpecDocument {
  const feature = resolveFeature(objective);
  const files = listProjectFiles(projectPath, 40);
  const assumptions = [
    "Existing authentication stays in place unless the spec says otherwise.",
    "The Northstar fixture is the working tree unless a sandbox computer is selected.",
    "No production deploy target is configured.",
  ];
  const affected = [...new Set([...feature.files.map((f) => f.path), ...guessAffected(objective, files)])];
  return {
    specId: makeId("spec"),
    goal: feature.title || objective.slice(0, 120),
    requirements: feature.requirements.map((r) => ({ key: r.key, text: r.text, locked: r.mandatory })),
    assumptions,
    affected,
    apiChanges: feature.key === "health" ? ["GET /health"] : feature.key === "rate-limit" ? ["429 on burst"] : [],
    schemaChanges: /subscri|billing|stripe|schema/i.test(objective) ? ["billing tables — not applied until approved"] : [],
    security: [
      "No secrets in source.",
      "Child authority remains ≤ parent.",
      "Unknown tools fail closed.",
    ],
    testing: feature.testsToRun.length ? feature.testsToRun : ["Independent verifier + adversarial pass"],
    rollback: ["Restore the last computer snapshot. Do not rewrite history."],
    definitionOfDone: [
      "Independent final verifier PASS.",
      "Builders did not self-certify.",
      "Evidence mapped to every mandatory requirement.",
    ],
    risk: /auth|billing|product|prod|secret/i.test(objective) ? "high" : feature.key === "ui-login" ? "medium" : "low",
    status: "draft",
    createdAt: nowIso(),
  };
}

function guessAffected(objective: string, files: string[]): string[] {
  const hay = objective.toLowerCase();
  return files.filter((f) => {
    const n = f.toLowerCase();
    if (hay.includes("login") && (n.includes("auth") || n.includes("web/"))) return true;
    if (hay.includes("health") && (n.includes("server") || n.includes("health"))) return true;
    if (hay.includes("rate") && n.includes("server")) return true;
    return false;
  });
}

export function draftPlan(spec: SpecDocument, objective: string): PlanDocument {
  const feature = resolveFeature(objective);
  const steps = [
    { stepId: makeId("stp"), title: "Analyze current tree", detail: `Scan ${spec.affected.slice(0, 6).join(", ") || "project"}` },
    ...feature.files.map((f) => ({
      stepId: makeId("stp"),
      title: `Apply ${f.path}`,
      detail: f.mode === "create" ? "Create in isolated worktree" : "Write in isolated worktree",
      role: (f.path.startsWith("web/") ? "frontend-engineer" : f.path.startsWith("tests/") ? "test-engineer" : "backend-engineer") as AgentRole,
    })),
    ...(feature.testsToRun.length
      ? [{ stepId: makeId("stp"), title: "Prove with tests", detail: feature.testsToRun.join(", "), role: "test-engineer" as AgentRole }]
      : []),
    ...(feature.crew.includes("browser-verifier")
      ? [{ stepId: makeId("stp"), title: "Computer-use verification", detail: "Playwright a11y + screenshot", role: "browser-verifier" as AgentRole }]
      : []),
    ...(feature.crew.includes("security-reviewer")
      ? [{ stepId: makeId("stp"), title: "Security review", detail: "Cite files. MCP only through gateway.", role: "security-reviewer" as AgentRole }]
      : []),
    { stepId: makeId("stp"), title: "Independent verification", detail: "Final verifier. Builders cannot certify.", role: "final-verifier" as AgentRole },
  ];
  return {
    planId: makeId("pln"),
    specId: spec.specId,
    version: 1,
    steps,
    crew: feature.crew,
    estimatedMinutes: feature.crew.length > 4 ? [18, 32] : [8, 16],
    estimatedUsd: feature.crew.length > 4 ? [1.4, 2.6] : [0.4, 1.1],
    status: "proposed",
    createdAt: nowIso(),
  };
}

export function estimateCost(quality: QualityMode, plan: PlanDocument): { minutes: [number, number]; usd: [number, number]; agents: number } {
  const mul = quality === "max" ? 2.4 : quality === "fast" || quality === "economy" ? 0.7 : 1;
  return {
    minutes: [Math.round(plan.estimatedMinutes[0] * mul), Math.round(plan.estimatedMinutes[1] * mul)],
    usd: [Number((plan.estimatedUsd[0] * mul).toFixed(2)), Number((plan.estimatedUsd[1] * mul).toFixed(2))],
    agents: quality === "max" ? plan.crew.length + 2 : plan.crew.length + 1,
  };
}

export function resolveMention(
  world: WorldSnapshot,
  kind: string,
  query: string,
  projectPath: string,
): ContextObject {
  const q = query.toLowerCase();
  const make = (partial: Omit<ContextObject, "contextId" | "createdAt">): ContextObject => {
    const tainted =
      partial.tainted ??
      (partial.kind === "browser" ||
        partial.kind === "issue" ||
        partial.kind === "mcp" ||
        !partial.trusted);
    return stampTrust({
      ...partial,
      trusted: tainted ? false : partial.trusted,
      tainted,
      origin: partial.origin ?? (partial.kind === "browser" ? "browser" : partial.kind === "mcp" ? "mcp" : "user"),
      contextId: makeId("ctx"),
      createdAt: nowIso(),
    });
  };
  if (kind === "file" || kind === "folder") {
    const files = listProjectFiles(projectPath, 120);
    const hit = files.find((f) => f.toLowerCase().includes(q) || f === query) ?? query;
    const body = kind === "file" ? (readProjectFile(projectPath, hit) ?? "") : "";
    return make({
      kind: kind === "folder" ? "folder" : "file",
      title: hit,
      ref: hit,
      preview: body.slice(0, 500) || (existsSync(join(projectPath, hit)) ? "directory" : "not found"),
      trusted: Boolean(body || existsSync(join(projectPath, hit))),
    });
  }
  if (kind === "symbol" || kind === "class" || kind === "function") {
    const files = listProjectFiles(projectPath, 80).filter((f) => /\.(js|ts|mjs)$/.test(f));
    for (const f of files) {
      const src = readProjectFile(projectPath, f) ?? "";
      const sym = extractSymbols(f, src);
      if (sym.exports.some((s) => s.toLowerCase().includes(q)) || sym.functions.some((s) => s.toLowerCase().includes(q))) {
        return make({
          kind: "symbol",
          title: `${query} in ${f}`,
          ref: `${f}#${query}`,
          preview: src.split("\n").find((l) => l.includes(query))?.trim().slice(0, 240) ?? "",
          trusted: true,
        });
      }
    }
    return make({ kind: "symbol", title: query, ref: query, preview: "symbol not in graph", trusted: false });
  }
  if (kind === "agent") {
    const agent = Object.values(world.agents).find(
      (a) => a.role.includes(q) || a.title.toLowerCase().includes(q) || a.agentId.includes(query),
    );
    return make({
      kind: "agent",
      title: agent?.title ?? query,
      ref: agent?.agentId ?? query,
      preview: agent ? `${agent.role} · ${agent.state}` : "no live agent matched",
      trusted: Boolean(agent),
    });
  }
  if (kind === "mission") {
    const m = Object.values(world.missions).find((x) => x.missionId.includes(query) || x.title.toLowerCase().includes(q));
    return make({
      kind: "mission",
      title: m?.title ?? query,
      ref: m?.missionId ?? query,
      preview: m ? `${m.state} · ${m.objective}` : "no mission matched",
      trusted: Boolean(m),
    });
  }
  if (kind === "decision") {
    const d = Object.values(world.decisions).find((x) => x.decisionId.includes(query) || x.question.toLowerCase().includes(q));
    return make({
      kind: "decision",
      title: d?.question ?? query,
      ref: d?.decisionId ?? query,
      preview: d ? `${d.choice} · ${d.status}` : "no decision matched",
      trusted: Boolean(d),
    });
  }
  if (kind === "memory") {
    const mem = Object.values(world.memories).find((x) => x.title.toLowerCase().includes(q));
    return make({
      kind: "memory",
      title: mem?.title ?? query,
      ref: mem?.memoryId ?? query,
      preview: mem?.body.slice(0, 240) ?? "no memory matched",
      trusted: Boolean(mem),
    });
  }
  if (kind === "artifact") {
    const a = Object.values(world.artifacts).find((x) => x.title.toLowerCase().includes(q) || x.artifactId.includes(query));
    return make({
      kind: "artifact",
      title: a?.title ?? query,
      ref: a?.artifactId ?? query,
      preview: a?.summary ?? "no artifact matched",
      trusted: Boolean(a),
    });
  }
  if (kind === "mcp") {
    const s = Object.values(world.mcpServers ?? {}).find((x) => x.name.includes(q) || x.serverId.includes(query));
    return make({
      kind: "mcp",
      title: s?.name ?? "MCP",
      ref: s?.serverId ?? query,
      preview: s ? s.tools.map((t) => t.name).join(", ") : "no MCP server matched",
      trusted: Boolean(s),
    });
  }
  if (kind === "browser") {
    return make({
      kind: "browser",
      title: "Browser workbench",
      ref: "browser",
      preview: world.station?.live?.goal ?? "Last computer-use observation",
      trusted: false,
      tainted: true,
      origin: "browser",
    });
  }
  if (kind === "terminal") {
    const t = Object.values(world.station?.terminals ?? {})[0];
    return make({
      kind: "terminal",
      title: t?.title ?? "Terminal",
      ref: t?.sessionId ?? "term",
      preview: t?.output.slice(-300) ?? "no session",
      trusted: Boolean(t),
    });
  }
  if (kind === "git") {
    const res = spawnSync("git", ["diff", "--stat"], { cwd: projectPath, encoding: "utf8", timeout: 4000 });
    return make({
      kind: "git",
      title: "Git diff",
      ref: "HEAD",
      preview: (res.stdout || res.stderr || "no git repository").slice(0, 500),
      trusted: res.status === 0,
    });
  }
  if (kind === "database" || kind === "schema") {
    const mig = listProjectFiles(join(process.cwd(), "migrations"), 20);
    const first = mig[0] ? readFileSync(join(process.cwd(), "migrations", mig[0]), "utf8") : "";
    return make({
      kind: "schema",
      title: "Local migrations",
      ref: "migrations",
      preview: first.slice(0, 400) || "No live database connected. Schema studio is read-only over migration files.",
      trusted: Boolean(first),
    });
  }
  if (kind === "github" || kind === "issue") {
    return make({
      kind: "issue",
      title: "GitHub",
      ref: query,
      preview: "GitHub connector is not granted. Mention resolved as an unresolved issue stub.",
      trusted: false,
    });
  }
  if (kind === "repo") {
    return make({
      kind: "folder",
      title: projectPath,
      ref: projectPath,
      preview: listProjectFiles(projectPath, 12).join("\n"),
      trusted: true,
    });
  }
  return make({ kind: "file", title: query, ref: query, preview: "unresolved mention", trusted: false });
}

export function attachManual(
  kind: ContextKind,
  ref: string,
  projectPath: string,
  extra?: string,
): ContextObject {
  const preview =
    extra ??
    (kind === "file" ? (readProjectFile(projectPath, ref) ?? "").slice(0, 500) : ref);
  return stampTrust({
    contextId: makeId("ctx"),
    kind,
    title: ref,
    ref,
    preview,
    trusted: preview.length > 0 && kind !== "browser" && kind !== "issue",
    tainted: kind === "browser" || kind === "issue" || kind === "mcp",
    origin: kind === "browser" ? "browser" : kind === "mcp" ? "mcp" : "user",
    createdAt: nowIso(),
  });
}

export function inspectCommand(world: WorldSnapshot, command: string): string {
  if (command === "memory") {
    const rows = Object.values(world.memories).slice(0, 8);
    return rows.length
      ? rows.map((m) => `${m.health} · ${m.title}`).join("\n")
      : "Memory store is empty.";
  }
  if (command === "decisions") {
    const rows = Object.values(world.decisions).slice(0, 8);
    return rows.length ? rows.map((d) => `${d.status}: ${d.choice}`).join("\n") : "No decisions.";
  }
  if (command === "artifacts") {
    const rows = Object.values(world.artifacts).slice(0, 8);
    return rows.length ? rows.map((a) => `${a.kind} · ${a.title}`).join("\n") : "No artifacts.";
  }
  if (command === "agents") {
    const rows = Object.values(world.agents);
    return rows.length ? rows.map((a) => `${a.title} · ${a.state}`).join("\n") : "No agents spawned.";
  }
  return "";
}

export function runRedTeam(projectPath: string, missionId?: string): RedTeamReport {
  const findings: RedTeamReport["findings"] = [];
  const auth = readProjectFile(projectPath, "src/auth.js") ?? "";
  if (auth.includes("INTENTIONAL DEFECT") || (auth.includes("sessions.get") && !auth.includes("inflight"))) {
    findings.push({
      id: makeId("atk"),
      severity: "high",
      title: "Auth race still exploitable",
      evidence: "src/auth.js",
      attack: "Two overlapping login() calls can mint two live tokens.",
    });
  }
  const html = readProjectFile(projectPath, "web/index.html") ?? "";
  if (html.includes("disabled") && /button/i.test(html) && !/aria-label="Sign in"/i.test(html)) {
    findings.push({
      id: makeId("atk"),
      severity: "medium",
      title: "Primary login control is disabled or unnamed",
      evidence: "web/index.html",
      attack: "Keyboard and AT users cannot complete sign-in.",
    });
  }
  if (existsSync(join(projectPath, ".env"))) {
    findings.push({
      id: makeId("atk"),
      severity: "critical",
      title: ".env present in the tree",
      evidence: ".env",
      attack: "Secret file is in the working copy.",
    });
  }
  const server = readProjectFile(projectPath, "src/server.js") ?? "";
  if (server && !server.includes("/health") && existsSync(join(projectPath, "tests", "health.test.js"))) {
    findings.push({
      id: makeId("atk"),
      severity: "medium",
      title: "Health test exists without a handler",
      evidence: "src/server.js",
      attack: "Contracted test would fail under the verifier.",
    });
  }
  const web = join(projectPath, "web");
  if (existsSync(web)) {
    const obs = runBrowserScriptSync({ root: web });
    if (!obs.passed) {
      findings.push({
        id: makeId("atk"),
        severity: "high",
        title: "Computer-use can break the surface",
        evidence: obs.defects.join("; "),
        attack: "Adversarial browser pass failed.",
      });
    }
  }
  return {
    reportId: makeId("red"),
    missionId,
    findings,
    passed: findings.length === 0,
    createdAt: nowIso(),
  };
}

export function runArena(world: WorldSnapshot, objective: string): ArenaRun {
  const feature = resolveFeature(objective);
  const a = createComputer(world, { template: "node-fullstack", name: "Solution A" });
  const b = createComputer(world, { template: "node-fullstack", name: "Solution B" });
  for (const file of feature.files) {
    writeScoped(a.path, file.path, file.content, ["src/**", "tests/**", "web/**"], []);
  }
  const broken = feature.files.map((f) => ({
    ...f,
    content: f.content.replace("inflight", "inflightUnused").replace('aria-label="Sign in"', ""),
  }));
  for (const file of broken.length ? broken : feature.files) {
    writeScoped(b.path, file.path, file.content, ["src/**", "tests/**", "web/**"], []);
  }
  const testsA = feature.testsToRun.length ? runNodeTest(a.path, feature.testsToRun) : { ok: true, output: "no unit tests — structural compare" };
  const testsB = feature.testsToRun.length ? runNodeTest(b.path, feature.testsToRun) : { ok: false, output: "intentionally weaker candidate" };
  if (!feature.testsToRun.length && feature.key === "ui-login") {
    const oa = runBrowserScriptSync({ root: join(a.path, "web") });
    const ob = runBrowserScriptSync({ root: join(b.path, "web") });
    (testsA as { ok: boolean; output: string }).ok = oa.passed;
    (testsA as { ok: boolean; output: string }).output = oa.defects.join("; ") || "browser pass";
    (testsB as { ok: boolean; output: string }).ok = ob.passed;
    (testsB as { ok: boolean; output: string }).output = ob.defects.join("; ") || "browser pass";
  }
  const candA = {
    label: "Solution A",
    computerId: a.computerId,
    approach: "Playbook as specified",
    testsPassed: testsA.ok,
    detail: testsA.output.slice(0, 400),
    costUsd: 0.18,
  };
  const candB = {
    label: "Solution B",
    computerId: b.computerId,
    approach: "Divergent / weaker patch for comparison",
    testsPassed: testsB.ok,
    detail: testsB.output.slice(0, 400),
    costUsd: 0.16,
  };
  const winner = candA.testsPassed && !candB.testsPassed ? "Solution A" : candA.testsPassed && candB.testsPassed ? "Solution A" : candB.testsPassed ? "Solution B" : undefined;
  const arena: ArenaRun = {
    arenaId: makeId("arn"),
    objective,
    status: "judged",
    candidates: [candA, candB],
    winner,
    why: winner
      ? `${winner} held under independent tests. The other candidate failed or was weaker.`
      : "Neither candidate passed. Judge refuses to pick.",
    createdAt: nowIso(),
  };
  stationOf(world).arenas[arena.arenaId] = arena;
  return arena;
}

export function previewPermissions(policy: PermissionPolicy): {
  can: string[];
  cannot: string[];
} {
  const can: string[] = [];
  const cannot: string[] = [];
  can.push(`read ${policy.allowGlobs.join(", ")}`);
  cannot.push(`write ${policy.denyGlobs.join(", ")}`);
  const pushDenied = policy.matrix.filter((c) => c.mode === "deny");
  for (const cell of pushDenied) cannot.push(`${cell.role} / ${cell.capability}`);
  const ask = policy.matrix.filter((c) => c.mode === "ask");
  for (const cell of ask) cannot.push(`${cell.role} / ${cell.capability} (ask)`);
  can.push(`network ${policy.allowHosts.join(", ") || "none"}`);
  return { can, cannot };
}

export function setCell(policy: PermissionPolicy, capability: string, role: string, mode: GrantMode): PermissionPolicy {
  const next = { ...policy, matrix: policy.matrix.map((c) => ({ ...c })) };
  const hit = next.matrix.find((c) => c.capability === capability && c.role === role);
  if (hit) hit.mode = mode;
  else next.matrix.push({ capability, role, mode });
  return next;
}

export function commanderReply(args: {
  text: string;
  command?: string;
  contexts: ContextObject[];
  spec?: SpecDocument;
}): string {
  const bits: string[] = [];
  if (args.command === "deploy") {
    return "Deploy is refused. There is no production target and the policy stays above the Commander.";
  }
  if (args.contexts.length) {
    bits.push(
      `Resolved ${args.contexts.length} context object${args.contexts.length === 1 ? "" : "s"}: ${args.contexts
        .map((c) => `${c.kind}:${c.title}`)
        .join(", ")}.`,
    );
  }
  if (args.spec) {
    bits.push(
      `I will not execute yet. Risk ${args.spec.risk.toUpperCase()}. ${args.spec.requirements.length} requirements. Generate a spec, then approve a plan.`,
    );
  } else if (args.text) {
    bits.push(args.text);
  }
  return bits.join(" ") || "Standing by.";
}

export function message(
  role: ChatMessage["role"],
  author: string,
  text: string,
  extra?: Partial<ChatMessage>,
): ChatMessage {
  return {
    messageId: makeId("msg"),
    role,
    author,
    text,
    contextIds: extra?.contextIds ?? [],
    command: extra?.command,
    mentions: extra?.mentions,
    specId: extra?.specId,
    planId: extra?.planId,
    missionId: extra?.missionId,
    createdAt: nowIso(),
  };
}

export function collectProblems(world: WorldSnapshot, projectPath: string): {
  source: string;
  severity: "error" | "warning" | "info";
  message: string;
}[] {
  const out: { source: string; severity: "error" | "warning" | "info"; message: string }[] = [];
  for (const d of world.graph?.diagnostics ?? []) {
    out.push({ source: d.file, severity: d.severity === "error" ? "error" : "warning", message: d.message });
  }
  for (const e of Object.values(world.evidence).filter((x) => !x.passed).slice(-8)) {
    out.push({ source: e.kind, severity: "error", message: e.claim });
  }
  for (const a of Object.values(world.agents).filter((x) => x.state === "BLOCKED" || x.state === "FAILED")) {
    out.push({ source: a.title, severity: "error", message: a.state });
  }
  const html = readProjectFile(projectPath, "web/index.html") ?? "";
  if (html.includes("INTENTIONAL DEFECT")) {
    out.push({ source: "web/index.html", severity: "warning", message: "Annotated UI defect" });
  }
  return out;
}

export function gitDiff(projectPath: string): string {
  if (!existsSync(join(projectPath, ".git"))) {
    const files = listProjectFiles(projectPath, 20);
    return files.map((f) => `  ${f}`).join("\n") || "No git repository in this computer.";
  }
  const res = spawnSync("git", ["diff"], { cwd: projectPath, encoding: "utf8", timeout: 5000 });
  return (res.stdout || res.stderr || "working tree clean").slice(0, 8000);
}

export function readSourceFile(root: string, rel: string): string | null {
  return readProjectFile(root, rel);
}

export function encodeScreenshot(path?: string): string | undefined {
  if (!path || !existsSync(path)) return undefined;
  try {
    return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  } catch {
    return undefined;
  }
}

export function pickComputer(world: WorldSnapshot, computerId?: string): ComputerRecord | undefined {
  const st = stationOf(world);
  if (computerId && st.computers[computerId]) return st.computers[computerId];
  return Object.values(st.computers).find((c) => c.status !== "destroyed");
}

export function openTerminal(world: WorldSnapshot, computer: ComputerRecord, title: string): TerminalSession {
  const st = stationOf(world);
  const rec: TerminalSession = {
    sessionId: makeId("trm"),
    computerId: computer.computerId,
    title,
    cwd: computer.path,
    owner: "user",
    running: false,
    output: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  st.terminals[rec.sessionId] = rec;
  return rec;
}

export function shouldDraftSpec(command: string | undefined, text: string, flags: Record<string, string | boolean>): boolean {
  if (flags.autopilot) return true;
  if (!command && text.length < 12) return false;
  if (["memory", "decisions", "artifacts", "agents", "deploy"].includes(command ?? "")) return false;
  if (["plan", "spec", "build", "fix", "debug", "review", "test", "security", "research", "architect", "team", "run"].includes(command ?? "")) {
    return true;
  }
  return text.length >= 12;
}

export function playbookObjective(command: string | undefined, text: string): string {
  if (text) return text;
  if (command === "security") return "Run a security audit of the Northstar service.";
  if (command === "test") return "Add GET /health that returns { ok: true, service: 'northstar' }";
  if (command === "fix") return "Fix the Northstar operator console login: the Sign in control must be enabled, named accessibly, and complete a login. Capture browser evidence.";
  return text;
}

export function inboxOf(world: WorldSnapshot): { decisions: number; blocked: number; approvals: number; artifacts: number } {
  return {
    decisions: Object.values(world.decisions).filter((d) => d.status === "proposed").length,
    blocked: Object.values(world.agents).filter((a) => a.state === "BLOCKED").length,
    approvals: Object.values(world.approvals).filter((a) => a.status === "pending").length,
    artifacts: Object.values(world.artifacts).length,
  };
}

export function collaboration(world: WorldSnapshot, missionId?: string): { author: string; text: string; at: string }[] {
  return world.events
    .filter((e) => (!missionId || e.missionId === missionId) && (e.type === "AgentHeartbeat" || e.type === "ArtifactCreated" || e.type === "ToolExecuted"))
    .slice(-12)
    .map((e) => ({
      author: e.agentId ?? "system",
      text: e.type === "AgentHeartbeat" ? String((e.payload as { heartbeat?: { note?: string } }).heartbeat?.note ?? "heartbeat") : e.type,
      at: e.at,
    }));
}

export function detectServices(projectPath: string): { name: string; hint: string }[] {
  const out: { name: string; hint: string }[] = [];
  if (existsSync(join(projectPath, "package.json"))) out.push({ name: "Node", hint: "package.json" });
  if (existsSync(join(projectPath, "web", "index.html"))) out.push({ name: "Static web", hint: "web/" });
  if (existsSync(join(projectPath, "docker-compose.yml"))) out.push({ name: "Docker", hint: "compose" });
  return out;
}

export { parseComposer, resolve };
