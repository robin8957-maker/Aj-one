import test from "node:test";
import assert from "node:assert/strict";
import { allow, resetRateLimits } from "../src/rate-limit.js";

test("token bucket exhausts then rejects", () => {
  resetRateLimits();
  const id = "burst";
  let accepted = 0;
  let denied = 0;
  for (let i = 0; i < 8; i += 1) {
    if (allow(id, { capacity: 5, refillPerSec: 0 })) accepted += 1;
    else denied += 1;
  }
  assert.equal(accepted, 5);
  assert.equal(denied, 3);
});
