import test from "node:test";
import assert from "node:assert/strict";
import { routeModel, selectModel } from "../src/runtime/models.ts";

test("aj-local is selected when no XAI key / flag", () => {
  const prevKey = process.env.XAI_API_KEY;
  const prevFlag = process.env.AJ_USE_GROK;
  delete process.env.XAI_API_KEY;
  delete process.env.AJ_USE_GROK;
  try {
    const model = selectModel();
    assert.equal(model.provider, "aj-local");
    assert.equal(model.fallback, "aj-local");
    assert.equal(routeModel("planning").provider, "aj-local");
  } finally {
    if (prevKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = prevKey;
    if (prevFlag === undefined) delete process.env.AJ_USE_GROK;
    else process.env.AJ_USE_GROK = prevFlag;
  }
});

test("xai-grok is available only with explicit opt-in", () => {
  const prevKey = process.env.XAI_API_KEY;
  const prevFlag = process.env.AJ_USE_GROK;
  process.env.XAI_API_KEY = "test-key";
  process.env.AJ_USE_GROK = "1";
  try {
    const model = selectModel();
    assert.equal(model.provider, "xai-grok");
    assert.equal(routeModel("planning", "xai-grok").provider, "xai-grok");
    assert.equal(routeModel("planning").provider, "aj-local");
  } finally {
    if (prevKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = prevKey;
    if (prevFlag === undefined) delete process.env.AJ_USE_GROK;
    else process.env.AJ_USE_GROK = prevFlag;
  }
});
