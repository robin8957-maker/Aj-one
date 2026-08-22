import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PERMISSIONS } from "../src/protocol/index.ts";
import { AjDaemon } from "../src/daemon/ajd.ts";
import { extractSymbols, renameImpact } from "../src/runtime/graph.ts";
import {
  putSecret,
  leaseSecret,
  revokeSecret,
  listSecretMeta,
  useSecret,
  withDaemonSecret,
} from "../src/runtime/secrets.ts";
import { decideIngress, signAjEvent, signOperatorEvent } from "../src/runtime/ingress.ts";
import { runAcpSessionSync, grantAcpRecord } from "../src/runtime/acp.ts";
import { authorizeTool } from "../src/runtime/policy.ts";
import { defaultAutomations } from "../src/runtime/automations.ts";
import type { AgentInstance, ExternalAgentRecord } from "../src/protocol/index.ts";

function fakeAgent(role: AgentInstance["role"], agentId = "agt_sec"): AgentInstance {
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

test("secrets broker scopes, expires, revokes, and never leases daemon hmac to agents", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-sec-"));
  process.env.AJ_DATA_DIR = dir;
  const op = "broker-op";
  try {
    const scoped = putSecret(op, {
      name: "northstar.demo",
      value: "super-secret-value-xyz",
      scope: { roles: ["security-reviewer"] },
      ttlMs: 60_000,
    });
    putSecret(op, {
      name: "aj.ingress.hmac",
      value: "ingress-hmac-key",
      scope: { tools: ["ingress.verify"] },
      ttlMs: 60_000,
    });
    const sec = fakeAgent("security-reviewer");
    const backend = fakeAgent("backend-engineer", "agt_be");
    const ok = leaseSecret(op, { name: "northstar.demo", agent: sec });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal("value" in ok, false);
      assert.equal(ok.lease.redacted.endsWith("xyz"), true);
      assert.ok(!JSON.stringify(ok.lease).includes("super-secret-value-xyz"));
      const used = useSecret(op, ok.lease.leaseId, (value) => value);
      assert.equal(used.ok, true);
      if (used.ok) assert.equal(used.result, "super-secret-value-xyz");
    }
    const deniedRole = leaseSecret(op, { name: "northstar.demo", agent: backend });
    assert.equal(deniedRole.ok, false);
    const hmac = leaseSecret(op, { name: "aj.ingress.hmac", agent: sec });
    assert.equal(hmac.ok, false);
    const daemon = withDaemonSecret(op, "aj.ingress.hmac", (value) => value === "ingress-hmac-key");
    assert.equal(daemon.ok, true);
    if (daemon.ok) assert.equal(daemon.result, true);
    revokeSecret(op, scoped.secretId);
    const after = leaseSecret(op, { name: "northstar.demo", agent: sec });
    assert.equal(after.ok, false);
    const listed = listSecretMeta(op);
    assert.ok(listed.every((s) => !JSON.stringify(s).includes("super-secret-value-xyz")));
    assert.equal(listed.find((s) => s.secretId === scoped.secretId)?.status, "revoked");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
  }
});

test("typescript parser extracts definitions and rename impact", () => {
  const src = `import { login } from "./auth.js";
export function handle() { return login("u"); }
export const health = () => ({ ok: true });
`;
  const symbols = extractSymbols("src/server.js", src);
  assert.ok(symbols.exports.includes("handle"));
  assert.ok(symbols.exports.includes("health"));
  assert.ok(symbols.functions.includes("handle"));
  assert.ok(symbols.imports.some((i) => i.from === "./auth.js" && i.names.includes("login")));
  const def = symbols.definitions.find((d) => d.name === "handle");
  assert.ok(def);
  assert.ok((def?.line ?? 0) >= 1);
  const impact = renameImpact(join(process.cwd(), "fixtures", "northstar"), "login");
  assert.ok(impact.files.length >= 1);
});

test("ACP worker is a live process under AJ grants", () => {
  const record: ExternalAgentRecord = grantAcpRecord({
    externalId: "ext_test",
    kind: "acp",
    name: "ACP-compatible worker",
    requested: ["fs.read", "fs.write", "secrets.broker"],
    granted: [],
    status: "declared",
  });
  assert.deepEqual(record.granted, ["fs.read"]);
  const session = runAcpSessionSync({
    record,
    projectPath: join(process.cwd(), "fixtures", "northstar"),
    objective: "Review Northstar auth",
    timeoutMs: 8000,
  });
  assert.equal(session.ok, true, session.reason);
  assert.ok(session.toolsUsed.includes("fs.read"));
  assert.ok(session.toolsDenied.includes("fs.write"));
  assert.ok(session.toolsDenied.includes("secret.read"));
  assert.ok(session.artifact && session.artifact.includes("cannot certify"));
  assert.ok((session.heartbeats?.length ?? 0) >= 1);
});

test("unsigned or bad webhook is rejected before Commander", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-ing-"));
  process.env.AJ_DATA_DIR = dir;
  const op = "ing-op";
  try {
    const ajd = new AjDaemon();
    ajd.view(op);
    const bad = ajd.ingestExternalEvent(op, {
      source: "github",
      event: "ci-failure",
      timestamp: new Date().toISOString(),
      signature: "sha256=deadbeef",
      rawBody: JSON.stringify({ conclusion: "failure" }),
      mode: "aj",
    });
    assert.equal(bad.accepted, false);
    assert.match(bad.reason, /signature/);
    const missing = ajd.ingestExternalEvent(op, {
      source: "github",
      event: "ci-failure",
      timestamp: new Date().toISOString(),
      signature: "",
      rawBody: "{}",
      mode: "aj",
    });
    assert.equal(missing.accepted, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
  }
});

test("signed ingress maps to an automation and starts a mission", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-ing2-"));
  process.env.AJ_DATA_DIR = dir;
  process.env.AJ_INGRESS_SECRET = "unit-test-ingress-secret";
  const op = "ing-ok";
  try {
    const ajd = new AjDaemon();
    const view = ajd.view(op);
    assert.ok(view.secrets.some((s) => s.name === "aj.ingress.hmac"));
    const timestamp = new Date().toISOString();
    const rawBody = JSON.stringify({ conclusion: "failure" });
    const signed = signOperatorEvent(op, timestamp, rawBody);
    assert.equal(signed.ok, true);
    if (!signed.ok) return;
    const ok = ajd.ingestExternalEvent(op, {
      source: "github",
      event: "ci-failure",
      timestamp,
      signature: signed.signature,
      rawBody,
      mode: "aj",
    });
    assert.equal(ok.accepted, true, ok.reason);
    assert.ok(ok.missionId);
    const later = ajd.view(op);
    assert.ok(later.missions.some((m) => m.missionId === ok.missionId));
    assert.ok(later.ingress.some((i) => i.accepted));
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
    delete process.env.AJ_INGRESS_SECRET;
  }
});

test("policy still fail-closes raw secret.read for implementers", () => {
  const backend = fakeAgent("backend-engineer");
  const sec = fakeAgent("security-reviewer");
  assert.equal(authorizeTool(backend, "secret.read").ok, false);
  assert.equal(authorizeTool(sec, "secret.read").ok, true);
  assert.equal(authorizeTool(backend, "secret.request").ok, true);
  assert.equal(authorizeTool(sec, "secret.revoke").ok, false);
});

test("decideIngress refuses unmapped events even with a valid signature", () => {
  const autos = defaultAutomations();
  const dir = mkdtempSync(join(tmpdir(), "aj-ing3-"));
  process.env.AJ_DATA_DIR = dir;
  try {
    putSecret("x", { name: "aj.ingress.hmac", value: "k", scope: { tools: ["ingress.verify"] } });
    const timestamp = new Date().toISOString();
    const rawBody = "{}";
    const signature = signAjEvent("k", timestamp, rawBody);
    const decision = decideIngress(
      "x",
      { source: "github", event: "party.emoji", timestamp, signature, rawBody, mode: "aj" },
      autos,
    );
    assert.equal(decision.record.accepted, false);
    assert.match(decision.record.reason, /not mapped/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.AJ_DATA_DIR;
  }
});
