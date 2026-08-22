import assert from "node:assert/strict";
import test from "node:test";
import { connectVendor, disconnectVendor, refreshConnection, seedConnections } from "../src/runtime/connections.ts";

test("catalog seeds local governor ready and others disconnected", () => {
  const map = seedConnections("op", {});
  const local = Object.values(map).find((c) => c.vendor === "aj-local");
  const openai = Object.values(map).find((c) => c.vendor === "openai");
  assert.equal(local?.status, "ready");
  assert.equal(openai?.status, "disconnected");
});

test("local-only denies cloud connectors", () => {
  const map = seedConnections("op", {});
  const azure = Object.values(map).find((c) => c.vendor === "azure")!;
  const next = refreshConnection("op", azure, true);
  assert.equal(next.status, "denied");
});

test("disconnect cannot drop the local governor", () => {
  const map = seedConnections("op", {});
  disconnectVendor("op", map, "aj-local");
  const local = Object.values(map).find((c) => c.vendor === "aj-local");
  assert.equal(local?.enabled, true);
});

test("connect without secret leaves cloud disconnected or denied honestly", () => {
  let map = seedConnections("op", {});
  map = connectVendor("op", map, "openai", undefined, false);
  const openai = Object.values(map).find((c) => c.vendor === "openai")!;
  assert.notEqual(openai.status, "ready");
});
