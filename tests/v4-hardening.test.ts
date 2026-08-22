import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PERMISSIONS } from "../src/protocol/index.ts";
import { AjDaemon } from "../src/daemon/ajd.ts";
import {
  applyAgentSample,
  classifyTask,
  emptyAgentProfile,
  fitness,
  pickAgentProfile,
  pickModelProvider,
} from "../src/runtime/reputation.ts";
import { schedulePlacement } from "../src/runtime/environment.ts";
import {
  putSecret,
  leaseSecret,
  useSecret,
  rotateMasterKey,
  redactSecretsFromText,
  currentKeyId,
} from "../src/runtime/secrets.ts";
import {
  decideIngress,
  signAjEvent,
  signOperatorEvent,
  MAX_INGRESS_BODY_BYTES,
  INGRESS_RATE_MAX,
} from "../src/runtime/ingress.ts";
import { defaultAutomations } from "../src/runtime/automations.ts";
import type { AgentInstance, AgentPerformanceProfile } from "../src/protocol/index.ts";

function profile(
  role: AgentPerformanceProfile["role"],
  domain: string,
  language: string,
  stats: Partial<AgentPerformanceProfile>,
): AgentPerformanceProfile {
  return {
    ...emptyAgentProfile(role, domain, language),
    sampleSize: 12,
    ...stats,
  };
}

test("fitness prefers first-pass on critical and cost on low risk", () => {
  const a = profile("backend-engineer", "auth", "javascript", {
    successRate: 0.96,
    firstPassSuccess: 0.88,
    verifierRejectRate: 0.06,
    avgCost: 0.37,
  });
  const b = profile("backend-engineer", "auth", "javascript", {
    successRate: 0.91,
    firstPassSuccess: 0.79,
    verifierRejectRate: 0.14,
    avgCost: 0.12,
  });
  const critical = pickAgentProfile([a, b], "backend-engineer", "auth", "javascript", "critical", 1);
  const cheap = pickAgentProfile([a, b], "backend-engineer", "auth", "javascript", "low", 1);
  assert.equal(critical.profile?.avgCost, 0.37);
  assert.equal(cheap.profile?.avgCost, 0.12);
  assert.ok(fitness(a, "critical", 1).value > fitness(b, "critical", 1).value);
});

test("model picker never auto-selects Grok", () => {
  const pick = pickModelProvider(
    [
      {
        profileId: "m1",
        provider: "xai-grok",
        capability: "planning",
        taskDomain: "auth",
        successRate: 0.99,
        avgCost: 0.01,
        avgLatencyMs: 10,
        sampleSize: 40,
        updatedAt: new Date().toISOString(),
      },
    ],
    "planning",
    "auth",
    false,
  );
  assert.equal(pick.provider, "aj-local");
  const forced = pickModelProvider([], "planning", "auth", true);
  assert.equal(forced.provider, "xai-grok");
});

test("hybrid scheduler keeps secrets local and never claims a live cloud runtime", () => {
  const secret = schedulePlacement({
    domain: "security",
    risk: "high",
    compute: "normal",
    touchesSecrets: true,
    browser: false,
  });
  assert.equal(secret.kind, "local");
  assert.equal(secret.intended, true);
  const heavy = schedulePlacement({
    domain: "backend",
    risk: "medium",
    compute: "heavy",
    touchesSecrets: false,
    browser: false,
  });
  assert.equal(heavy.kind, "local-sandbox");
  assert.equal(heavy.intended, true);
  const browser = schedulePlacement({
    domain: "frontend",
    risk: "medium",
    compute: "normal",
    touchesSecrets: false,
    browser: true,
  });
  assert.equal(browser.kind, "local-sandbox");
});

test("lease is a handle; useSecret yields the value once and JSON never contains it", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-lease-"));
  process.env.AJ_DATA_DIR = dir;
  const op = "lease-op";
  try {
    putSecret(op, { name: "northstar.demo", value: "super-secret-value-xyz", scope: { roles: ["security-reviewer"] } });
    const agent: AgentInstance = {
      agentId: "agt_sec",
      missionId: "m1",
      parentAgentId: null,
      role: "security-reviewer",
      title: "sec",
      objective: "t",
      contractId: "c1",
      capabilities: [],
      permissions: { ...DEFAULT_PERMISSIONS["security-reviewer"] },
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
    const leased = leaseSecret(op, { name: "northstar.demo", agent });
    assert.equal(leased.ok, true);
    if (!leased.ok) return;
    assert.equal("value" in leased, false);
    assert.ok(!JSON.stringify(leased).includes("super-secret-value-xyz"));
    const used = useSecret(op, leased.lease.leaseId, (v) => v.toUpperCase());
    assert.equal(used.ok, true);
    if (used.ok) assert.equal(used.result, "SUPER-SECRET-VALUE-XYZ");
    const redacted = redactSecretsFromText("token=super-secret-value-xyz nst_demo_not_a_production_secret");
    assert.ok(!redacted.includes("super-secret-value-xyz"));
    assert.ok(!redacted.includes("nst_demo_not_a_production_secret"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
  }
});

test("rotateMasterKey reseals and still opens after rotation", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-rot-"));
  process.env.AJ_DATA_DIR = dir;
  const op = "rot-op";
  try {
    putSecret(op, { name: "northstar.demo", value: "keep-me-please-secret", scope: { roles: ["security-reviewer"] } });
    const before = currentKeyId(op);
    const rotated = rotateMasterKey(op);
    assert.notEqual(rotated.keyId, before);
    assert.ok(rotated.resealed >= 1);
    const agent = {
      agentId: "agt_sec",
      missionId: "m1",
      parentAgentId: null,
      role: "security-reviewer" as const,
      title: "sec",
      objective: "t",
      contractId: "c1",
      capabilities: [],
      permissions: { ...DEFAULT_PERMISSIONS["security-reviewer"] },
      model: "aj-local",
      contextIds: [],
      memoryScope: "m1",
      executionEnvironment: "local" as const,
      budget: {
        tokens: 1,
        tokensUsed: 0,
        moneyUsd: 1,
        moneyUsed: 0,
        timeMs: 1,
        timeUsedMs: 0,
        toolCalls: 1,
        toolCallsUsed: 0,
        retries: 1,
        retriesUsed: 0,
        browserActions: 0,
        browserActionsUsed: 0,
      },
      state: "RUNNING" as const,
      artifacts: [],
      failures: [],
      autonomy: 40,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const leased = leaseSecret(op, { name: "northstar.demo", agent });
    assert.equal(leased.ok, true);
    if (!leased.ok) return;
    const used = useSecret(op, leased.lease.leaseId, (v) => v);
    assert.equal(used.ok, true);
    if (used.ok) assert.equal(used.result, "keep-me-please-secret");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
  }
});

test("same signed webhook does not start a second mission", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-dup-"));
  process.env.AJ_DATA_DIR = dir;
  process.env.AJ_INGRESS_SECRET = "dup-secret";
  const op = "dup-op";
  try {
    const ajd = new AjDaemon();
    ajd.view(op);
    const timestamp = new Date().toISOString();
    const rawBody = JSON.stringify({ conclusion: "failure" });
    const signed = signOperatorEvent(op, timestamp, rawBody);
    assert.equal(signed.ok, true);
    if (!signed.ok) return;
    const input = {
      source: "github",
      event: "ci-failure",
      timestamp,
      signature: signed.signature,
      rawBody,
      mode: "aj" as const,
    };
    const first = ajd.ingestExternalEvent(op, input);
    assert.equal(first.accepted, true, first.reason);
    const before = ajd.view(op).missions.length;
    const second = ajd.ingestExternalEvent(op, input);
    assert.equal(second.accepted, false);
    assert.match(second.reason, /duplicate/);
    assert.equal(ajd.view(op).missions.length, before);
    assert.ok(ajd.view(op).events.some((e) => e.type === "IngressDuplicate"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
    delete process.env.AJ_INGRESS_SECRET;
  }
});

test("ingress denies unknown source, oversized body, and rate floods", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-rl-"));
  process.env.AJ_DATA_DIR = dir;
  const op = "rl-op";
  try {
    putSecret(op, { name: "aj.ingress.hmac", value: "k", scope: { tools: ["ingress.verify"] } });
    const autos = defaultAutomations();
    const timestamp = new Date().toISOString();
    const rawBody = JSON.stringify({ conclusion: "failure" });
    const signature = signAjEvent("k", timestamp, rawBody);
    const unknown = decideIngress(op, { source: "random-bot", event: "ci-failure", timestamp, signature, rawBody, mode: "aj" }, autos);
    assert.equal(unknown.record.accepted, false);
    assert.match(unknown.record.reason, /unknown source/);
    const huge = "x".repeat(MAX_INGRESS_BODY_BYTES + 8);
    const big = decideIngress(
      op,
      { source: "github", event: "ci-failure", timestamp, signature: signAjEvent("k", timestamp, huge), rawBody: huge, mode: "aj" },
      autos,
    );
    assert.equal(big.record.accepted, false);
    assert.match(big.record.reason, /byte limit/);
    const recent = Array.from({ length: INGRESS_RATE_MAX }, (_, i) => ({
      ingressId: `ing_${i}`,
      source: "github",
      event: "ci-failure",
      accepted: false,
      reason: "prior",
      at: new Date().toISOString(),
    }));
    const limited = decideIngress(
      op,
      { source: "github", event: "ci-failure", timestamp, signature, rawBody, mode: "aj" },
      autos,
      { recent },
    );
    assert.equal(limited.record.accepted, false);
    assert.match(limited.record.reason, /rate limited/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
  }
});

test("commander emits WorkerRouted and EnvironmentRouted and records profiles", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-rep-"));
  process.env.AJ_DATA_DIR = dir;
  const op = "rep-op";
  try {
    const ajd = new AjDaemon();
    const project = join(process.cwd(), "fixtures", "northstar");
    ajd.startMission(op, "Add GET /health that returns ok", project);
    let state = "";
    for (let i = 0; i < 40; i += 1) {
      const world = ajd.advance(op, Date.now() + i * 2000);
      state = Object.values(world.missions)[0]?.state ?? "";
      if (state === "COMPLETE" || state === "FAILED") break;
    }
    const view = ajd.view(op);
    assert.ok(view.events.some((e) => e.type === "EnvironmentRouted"));
    assert.ok(view.events.some((e) => e.type === "WorkerRouted"));
    assert.ok(view.events.some((e) => e.type === "ReputationUpdated"));
    assert.ok(view.performance.agents.length >= 1);
    assert.ok(Object.keys(view.placements).length >= 1);
    assert.ok(view.modelRoutes.some((r) => r.provider === "aj-local"));
    assert.ok(!view.modelRoutes.some((r) => r.provider === "xai-grok"));
    assert.ok(classifyTask("Add GET /health", "health").risk === "low");
    void applyAgentSample;
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
  }
});
