import test from "node:test";
import assert from "node:assert/strict";
import { FEATURES, resolveFeature } from "../src/runtime/catalog.ts";
import { resolvePlaybookKey } from "../src/runtime/catalog-playbooks.ts";

test("catalogue ships at least 20 production playbooks", () => {
  assert.ok(FEATURES.length >= 20, `got ${FEATURES.length}`);
  for (const f of FEATURES) {
    assert.ok(f.crew.length >= 2, f.key);
    assert.ok(f.requirements.length >= 1, f.key);
    assert.ok(!JSON.stringify(f).includes("AWS Lambda"), f.key);
  }
});

test("resolver keeps northstar health/auth/rate-limit playbooks", () => {
  assert.equal(resolveFeature("Add GET /health that returns ok").key, "health");
  assert.equal(resolveFeature("Fix the authentication race condition").key, "auth-race");
  assert.equal(resolveFeature("Add a token-bucket rate limiter").key, "rate-limit");
});

test("resolver maps engineering intents onto extra playbooks", () => {
  assert.equal(resolvePlaybookKey("implement a new billing feature"), "feature-implement");
  assert.equal(resolvePlaybookKey("security audit of secrets"), "security-audit");
  assert.equal(resolveFeature("Create OpenAPI specification for the service").key, "api-specification");
  assert.equal(resolveFeature("accessibility audit of the console").key, "accessibility-audit");
});
