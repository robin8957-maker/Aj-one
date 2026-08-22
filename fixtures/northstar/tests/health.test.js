import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../src/server.js";
import { resetSessions } from "../src/auth.js";
import { resetRateLimits } from "../src/rate-limit.js";

test("GET /health reports ok with uptime", async () => {
  const res = await handle("GET", "/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.status, "ok");
  assert.equal(res.body.service, "northstar");
  assert.equal(typeof res.body.uptime, "number");
  assert.ok(res.body.activeUsers >= 0);
});

test("POST /login is rate limited after five bursts", async () => {
  resetSessions();
  resetRateLimits();
  const statuses = [];
  for (let i = 0; i < 6; i += 1) {
    const res = await handle("POST", "/login", { userId: `spam${i}@test.com` }, { identity: "same-ip" });
    statuses.push(res.status);
  }
  assert.deepEqual(statuses.slice(0, 5), [200, 200, 200, 200, 200]);
  assert.equal(statuses[5], 429);
});
