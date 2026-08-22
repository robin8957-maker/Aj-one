import test from "node:test";
import assert from "node:assert/strict";
import { login, resetSessions, liveSessionCount, currentSession } from "../fixtures/northstar/src/auth.js";
import { handle } from "../fixtures/northstar/src/server.js";
import { resetRateLimits } from "../fixtures/northstar/src/rate-limit.js";

test("concurrent login attempts are serialized", async () => {
  resetSessions();
  const [a, b, c] = await Promise.all([login("u_ada", "x"), login("u_ada", "x"), login("u_ada", "x")]);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(liveSessionCount("u_ada"), 1);
  assert.equal(currentSession("u_ada"), a);
});

test("ten concurrent identities mint unique tokens", async () => {
  resetSessions();
  const emails = Array.from({ length: 10 }, (_, i) => `user${i}@example.com`);
  const tokens = await Promise.all(emails.map((email) => login(email, "x")));
  assert.equal(new Set(tokens).size, 10);
});

test("/health endpoint exists and is valid", async () => {
  const health = await handle("GET", "/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.status, "ok");
  assert.equal(typeof health.body.uptime, "number");
  assert.ok(health.body.activeUsers >= 0);
});

test("rate limiter rejects >5 requests in the burst window", async () => {
  resetSessions();
  resetRateLimits();
  for (let i = 0; i < 6; i += 1) {
    const res = await handle("POST", "/login", { userId: `spam${i}@test.com` }, { identity: "same-ip" });
    if (i < 5) assert.equal(res.status, 200, `request ${i + 1} accepted`);
    else assert.equal(res.status, 429, "request 6 rate-limited");
  }
});
