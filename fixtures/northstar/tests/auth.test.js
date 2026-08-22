import test from "node:test";
import assert from "node:assert/strict";
import { login, resetSessions, liveSessionCount } from "../src/auth.js";

test("concurrent login issues a single live session", async () => {
  resetSessions();
  const [a, b] = await Promise.all([login("u_ada", "x"), login("u_ada", "x")]);
  assert.equal(a, b, "overlapping logins must reuse one session token");
  assert.equal(liveSessionCount("u_ada"), 1);
});

test("ten concurrent distinct identities mint unique tokens", async () => {
  resetSessions();
  const ids = Array.from({ length: 10 }, (_, i) => `user${i}@example.com`);
  const tokens = await Promise.all(ids.map((id) => login(id, "x")));
  assert.equal(new Set(tokens).size, 10);
});
