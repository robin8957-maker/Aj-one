import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { liveFleet, routePair, completeWithEngine, type LiveEngine } from "../src/runtime/engines.ts";
import { startPty, writePty, snapshotPty, stopPty, authorizePtyInput, detectPrompt } from "../src/runtime/pty.ts";
import { healLedger, appendEvent, reconstruct, snapshotPath, ledgerPath } from "../src/daemon/store.ts";
import { makeId, nowIso, type AjEvent } from "../src/protocol/index.ts";
import { putSecret } from "../src/runtime/secrets.ts";

function ready(vendor: ConnectionRecord["vendor"], secretName: string): ConnectionRecord {
  return {
    connectionId: `cn_${vendor}`,
    family: "model",
    vendor,
    title: vendor,
    blurb: "",
    status: "ready",
    enabled: true,
    secretName,
    capabilities: ["reasoning", "code"],
  };
}

test("implementer Claude and judge GPT are different live engines", () => {
  const fleet = liveFleet([ready("anthropic", "provider.anthropic"), ready("openai", "provider.openai")], false);
  const pair = routePair(fleet, "coding", "judge");
  assert.notEqual(pair.implementer.provider, pair.judge.provider);
  assert.ok(["anthropic", "openai"].includes(pair.implementer.provider));
  assert.ok(["anthropic", "openai"].includes(pair.judge.provider));
  assert.notEqual(pair.implementer.provider, "xai-grok");
  assert.notEqual(pair.judge.provider, "xai-grok");
});

test("Grok is never auto-picked even if marked ready", () => {
  const fleet = liveFleet([ready("xai", "provider.xai")], false);
  const pair = routePair(fleet);
  assert.equal(pair.implementer.provider, "aj-local");
});

test("stub engine call does not leak the key", () => {
  process.env.AJ_ENGINE_STUB = "1";
  process.env.AJ_DATA_DIR = mkdtempSync(join(tmpdir(), "aj-eng-"));
  process.env.AJ_KEYRING_DIR = join("/dev/shm", `aj-eng-${Date.now()}`);
  const op = "eng-op";
  putSecret(op, { name: "provider.openai", value: "sk-test-must-not-leak", ttlMs: 60_000 });
  const engine: LiveEngine = {
    id: "openai",
    vendor: "openai",
    title: "OpenAI",
    capabilities: ["coding"],
    live: true,
    secretName: "provider.openai",
  };
  const out = completeWithEngine(op, engine, [{ role: "user", content: "hello" }]);
  assert.equal(out.ok, true);
  assert.equal(out.provider, "openai");
  assert.doesNotMatch(out.text, /sk-test/);
  delete process.env.AJ_ENGINE_STUB;
});

test("PTY is interactive and accepts y/n", async () => {
  assert.equal(authorizePtyInput("y").ok, true);
  assert.equal(authorizePtyInput("n").kind, "answer");
  assert.equal(detectPrompt("Continue? [y/n] "), "confirm");
  const dir = mkdtempSync(join(tmpdir(), "aj-pty-"));
  writeFileSync(join(dir, "ask.sh"), "#!/bin/sh\nprintf 'Continue? [y/n] '\nread ans\necho GOT:$ans\n");
  const id = "pty_test";
  startPty(id, dir);
  await sleep(200);
  writePty(id, "sh ask.sh");
  await sleep(250);
  writePty(id, "y");
  await sleep(250);
  const snap = snapshotPty(id);
  assert.ok(snap);
  assert.match(snap!.output, /GOT:y|Continue|aj\$/);
  stopPty(id);
  rmSync(dir, { recursive: true, force: true });
});

test("chaos: corrupt snapshot + truncated ledger still reconstructs", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-chaos-"));
  process.env.AJ_DATA_DIR = dir;
  const op = "chaos-op";
  const ev: AjEvent = {
    eventId: makeId("evt"),
    seq: 1,
    type: "MissionCreated",
    operatorId: op,
    missionId: "msn_chaos",
    at: nowIso(),
    payload: {
      mission: {
        missionId: "msn_chaos",
        operatorId: op,
        title: "heal",
        objective: "live",
        projectPath: "/tmp",
        state: "CREATED",
        requirements: [],
        constraints: [],
        tasks: [],
        budget: { tokens: 0, tokensUsed: 0, moneyUsd: 0, moneyUsed: 0, timeMs: 0, parallelAgents: 1 },
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    },
  };
  appendEvent(op, ev);
  writeFileSync(snapshotPath(op), "{not-json");
  writeFileSync(ledgerPath(op), `${readFileSync(ledgerPath(op), "utf8")}{"trunc`);
  const healed = healLedger(op);
  assert.ok(healed.kept >= 1);
  const world = reconstruct(op);
  assert.ok(world.missions.msn_chaos);
  assert.equal(existsSync(snapshotPath(op)), true);
  rmSync(dir, { recursive: true, force: true });
});
