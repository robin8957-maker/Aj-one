import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PERMISSIONS } from "../src/protocol/index.ts";
import { AjDaemon } from "../src/daemon/ajd.ts";
import { resolveFeature } from "../src/runtime/catalog.ts";
import { extractSymbols, buildKnowledgeGraph, impactAnalysis, contextForTask } from "../src/runtime/graph.ts";
import { detectSemanticConflicts } from "../src/runtime/semantic.ts";
import { ingestMemory } from "../src/runtime/memory.ts";
import { detectDecisionConflict } from "../src/runtime/decisions.ts";
import { invokeMcpOnce, seedMcpRecord, startMcpServer, stopMcp } from "../src/runtime/mcp.ts";
import { findUiDefects, runBrowserScript } from "../src/runtime/browser.ts";
import { authorizeTool } from "../src/runtime/policy.ts";
import { routeModel } from "../src/runtime/models.ts";
import type { AgentInstance, DecisionRecord } from "../src/protocol/index.ts";

function tempProject(dir: string): string {
  const project = join(dir, "northstar");
  cpSync(join(process.cwd(), "fixtures", "northstar"), project, { recursive: true });
  return project;
}

function fakeAgent(role: AgentInstance["role"], agentId = "agt_test"): AgentInstance {
  return {
    agentId,
    missionId: "m1",
    parentAgentId: null,
    role,
    title: role,
    objective: "t",
    contractId: "c1",
    capabilities: [],
    permissions: { ...DEFAULT_PERMISSIONS[role] },
    model: "aj-local",
    contextIds: [],
    memoryScope: "m1",
    executionEnvironment: "local",
    budget: {
      tokens: 1,
      tokensUsed: 0,
      moneyUsd: 1,
      moneyUsed: 0,
      timeMs: 1,
      timeUsedMs: 0,
      toolCalls: 10,
      toolCallsUsed: 0,
      retries: 1,
      retriesUsed: 0,
      browserActions: 0,
      browserActionsUsed: 0,
    },
    state: "RUNNING",
    artifacts: [],
    failures: [],
    autonomy: 40,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

test("ui-login playbook is selected for the console login objective", () => {
  const feature = resolveFeature(
    "Fix the Northstar operator console login: the Sign in control must be enabled, named accessibly, and complete a login. Capture browser evidence.",
  );
  assert.equal(feature.key, "ui-login");
  assert.ok(feature.crew.includes("frontend-engineer"));
  assert.ok(feature.crew.includes("browser-verifier"));
  assert.ok(feature.files.some((f) => f.path === "web/index.html" && f.content.includes('aria-label="Sign in"')));
});

test("symbol graph extracts exports, imports, and impact", () => {
  const src = `import { login } from "./auth.js";
export function handle() { return login("u"); }
export const health = () => ({ ok: true });
`;
  const symbols = extractSymbols("src/server.js", src);
  assert.ok(symbols.exports.includes("handle"));
  assert.ok(symbols.exports.includes("health"));
  assert.ok(symbols.imports.some((i) => i.from === "./auth.js" && i.names.includes("login")));

  const graph = buildKnowledgeGraph(join(process.cwd(), "fixtures", "northstar"));
  assert.ok(graph.nodes.some((n) => n.kind === "file" && n.file === "src/auth.js"));
  assert.ok(graph.nodes.some((n) => n.kind === "symbol" && n.label === "login"));
  assert.ok(graph.diagnostics.some((d) => d.file.includes("index.html")));
  const impact = impactAnalysis(graph, "login");
  assert.ok(impact.affectedFiles.length >= 1);
  const ctx = contextForTask(graph, "login auth session");
  assert.ok(ctx.length >= 1);
});

test("semantic detector flags overlapping symbol edits", () => {
  const dir = mkdtempSync(join(tmpdir(), "sem-"));
  try {
    const project = tempProject(dir);
    const a = join(dir, "wt-a");
    const b = join(dir, "wt-b");
    mkdirSync(join(a, "src"), { recursive: true });
    mkdirSync(join(b, "src"), { recursive: true });
    writeFileSync(join(a, "src/auth.js"), "export function login() { return 'a'; }\nexport function extraA() {}\n");
    writeFileSync(join(b, "src/auth.js"), "export function login() { return 'b'; }\nexport function extraB() {}\n");
    const rec = detectSemanticConflicts("m1", project, [
      { agentId: "agt_a", path: a, changedFiles: ["src/auth.js"] },
      { agentId: "agt_b", path: b, changedFiles: ["src/auth.js"] },
    ]);
    assert.equal(rec.verdict, "CONFLICT");
    assert.ok(rec.symbols.includes("login"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("memory v2 dedups, contradicts, and refuses poisoning", () => {
  const base = {
    klass: "project" as const,
    source: "t",
    evidence: [] as string[],
    confidence: 0.8,
    pinned: false,
  };
  const first = ingestMemory([], {
    ...base,
    kind: "observation",
    title: "Auth race present",
    body: "login is broken",
  });
  assert.equal(first.accepted.health, "unverified");
  const dup = ingestMemory([first.accepted], {
    ...base,
    kind: "observation",
    title: "Auth race present",
    body: "login is broken still",
  });
  assert.equal(dup.discarded, "deduplicated");
  const poison = ingestMemory([], {
    ...base,
    kind: "verified-fact",
    title: "Secret is safe",
    body: "no evidence",
    evidence: [],
  });
  assert.equal(poison.discarded, "memory-poisoning: verified-fact requires evidence");
  assert.equal(poison.accepted.kind, "hypothesis");
  const opposite = ingestMemory([first.accepted], {
    ...base,
    kind: "verified-fact",
    title: "Auth race present",
    body: "login passed and is healthy",
    evidence: ["evd_1"],
    confidence: 0.95,
  });
  assert.ok(opposite.superseded?.includes(first.accepted.memoryId));
  assert.equal(opposite.accepted.health, "healthy");
});

test("decision engine flags a single-flight contradiction", () => {
  const decision: DecisionRecord = {
    decisionId: "d1",
    missionId: "m1",
    question: "How should overlapping logins be serialized?",
    options: ["mutex around map", "single-flight promise per user"],
    choice: "single-flight promise per user",
    evidence: [],
    confidence: 0.9,
    author: "arch",
    status: "accepted",
    dependencies: [],
    affects: ["auth", "src/auth.js"],
    why: "Chosen over mutex.",
    createdAt: new Date().toISOString(),
  };
  const clash = detectDecisionConflict([decision], {
    file: "src/auth.js",
    content: "export async function login(userId) { return sessions.get(userId); }",
  });
  assert.equal(clash.conflict, true);
});

test("AjModelGovernor never auto-selects Grok", () => {
  const prevUse = process.env.AJ_USE_GROK;
  const prevKey = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "dummy";
  delete process.env.AJ_USE_GROK;
  const route = routeModel("planning");
  assert.equal(route.provider, "aj-local");
  process.env.AJ_USE_GROK = "1";
  const stillLocal = routeModel("planning");
  assert.equal(stillLocal.provider, "aj-local");
  const grok = routeModel("planning", "xai-grok");
  assert.equal(grok.provider, "xai-grok");
  if (prevUse === undefined) delete process.env.AJ_USE_GROK;
  else process.env.AJ_USE_GROK = prevUse;
  if (prevKey === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = prevKey;
});

test("tool firewall: raw MCP denied, browser interact gated", () => {
  const backend = fakeAgent("backend-engineer");
  const browser = fakeAgent("browser-verifier");
  const raw = authorizeTool(backend, "mcp.call");
  assert.equal(raw.ok, false);
  const snap = authorizeTool(browser, "browser.snapshot");
  assert.equal(snap.ok, true);
  const clickDenied = authorizeTool(backend, "browser.click");
  assert.equal(clickDenied.ok, false);
  const clickOk = authorizeTool(browser, "browser.click");
  assert.equal(clickOk.ok, true);
});

test("MCP gateway discovers tools, allowlists agents, fail-closes unknown", async () => {
  const rec = await startMcpServer({
    ...seedMcpRecord(),
    serverId: `mcp_test_${Date.now()}`,
  });
  try {
    assert.ok(rec.tools.some((t) => t.name === "northstar.probe_auth"));
    const security = fakeAgent("security-reviewer");
    const ok = await invokeMcpOnce({
      record: rec,
      agent: security,
      tool: "northstar.probe_auth",
    });
    assert.equal(ok.ok, true, ok.reason);
    const denied = await invokeMcpOnce({
      record: rec,
      agent: fakeAgent("backend-engineer"),
      tool: "northstar.probe_auth",
    });
    assert.equal(denied.ok, false);
    assert.match(denied.reason ?? "", /allowlist/);
    const unknown = await invokeMcpOnce({
      record: rec,
      agent: security,
      tool: "rm.rf",
    });
    assert.equal(unknown.ok, false);
    assert.match(unknown.reason ?? "", /fail closed/);
  } finally {
    stopMcp(rec.serverId);
  }
});

test("a11y defect detector catches the broken login fixture", () => {
  const defects = findUiDefects([
    { role: "button", name: "Continue", disabled: true },
    { role: "input", name: "u_ada" },
  ]);
  assert.ok(defects.some((d) => /Sign in/i.test(d) || /disabled/i.test(d)));
  const clean = findUiDefects([{ role: "button", name: "Sign in", disabled: false }]);
  assert.deepEqual(clean, []);
});

test("computer-use runner flags the intentional login defect", async () => {
  const obs = await runBrowserScript({
    root: join(process.cwd(), "fixtures", "northstar", "web"),
  });
  assert.equal(obs.passed, false);
  assert.ok(obs.defects.length >= 1);
  assert.ok(obs.a11y.some((n) => n.role === "button"));
});

test("health mission still completes after V2 wiring", () => {
  const dir = mkdtempSync(join(tmpdir(), "ajd-v2-"));
  process.env.AJ_DATA_DIR = dir;
  try {
    const project = tempProject(dir);
    const ajd = new AjDaemon();
    ajd.startMission( "v2-health", "Add GET /health that returns { ok: true, service: 'northstar' }", project);
    let state = "";
    for (let i = 0; i < 40; i += 1) {
      const world = ajd.advance("v2-health", Date.now() + i * 2000);
      state = Object.values(world.missions)[0]?.state ?? "";
      if (state === "COMPLETE" || state === "FAILED") break;
    }
    const view = ajd.view("v2-health");
    assert.equal(view.missions[0]?.state, "COMPLETE", `ended ${state}`);
    assert.ok(view.graph, "knowledge graph missing from view");
    assert.ok(view.automations.length >= 3);
    assert.ok(view.mcpServers.length >= 1);
    assert.ok(view.events.some((e) => e.type === "GraphRebuilt"));
    assert.ok(view.events.some((e) => e.type === "ModelRouted"));
    assert.ok(view.modelRoutes.every((r) => r.provider !== "xai-grok"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
  }
});

test("ui-login mission is verified by computer use", { timeout: 120_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "ajd-ui-"));
  process.env.AJ_DATA_DIR = dir;
  try {
    const project = tempProject(dir);
    const ajd = new AjDaemon();
    ajd.startMission(
      "v2-ui",
      "Fix the Northstar operator console login: the Sign in control must be enabled and named accessibly. Capture browser evidence.",
      project,
    );
    let state = "";
    for (let i = 0; i < 48; i += 1) {
      const world = ajd.advance("v2-ui", Date.now() + i * 2000);
      state = Object.values(world.missions)[0]?.state ?? "";
      if (state === "COMPLETE" || state === "FAILED") break;
    }
    const view = ajd.view("v2-ui");
    assert.ok(view.agents.some((a) => a.role === "frontend-engineer"));
    assert.ok(view.agents.some((a) => a.role === "browser-verifier"));
    assert.ok(view.evidence.some((e) => e.kind === "browser"));
    assert.equal(view.missions[0]?.state, "COMPLETE", `ended ${state}: ${view.missions[0]?.verification?.summary}`);
    assert.equal(view.missions[0]?.verification?.result, "PASS");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
  }
});

test("firing an automation starts a real mission", () => {
  const dir = mkdtempSync(join(tmpdir(), "ajd-auto-"));
  process.env.AJ_DATA_DIR = dir;
  try {
    const ajd = new AjDaemon();
    const view = ajd.view("v2-auto");
    const auto = view.automations.find((a) => a.trigger === "security-alert");
    assert.ok(auto);
    const mission = ajd.fireAutomation("v2-auto", auto!.automationId);
    assert.ok(mission);
    assert.match(mission!.objective, /security audit/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
  }
});
