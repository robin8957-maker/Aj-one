import test from "node:test";
import assert from "node:assert/strict";
import {
  cosineSimilarity,
  embed,
  getEmbeddingMetadata,
  initializeEmbeddings,
} from "../src/runtime/embeddings.ts";

test("embeddings initialized with correct dimensions", () => {
  const config = initializeEmbeddings();
  assert.ok(config.dimensions >= 384);
  const vec = embed("hello world");
  assert.equal(vec.length, config.dimensions);
});

test("semantic similarity ranks related text above pizza", () => {
  const similar1 = "The quick brown fox jumps";
  const similar2 = "A fast russet fox leaps";
  const dissimilar = "Pizza toppings include pepperoni";
  const e1 = embed(similar1);
  const e2 = embed(similar2);
  const e3 = embed(dissimilar);
  const sim12 = cosineSimilarity(e1, e2);
  const sim13 = cosineSimilarity(e1, e3);
  assert.ok(sim12 > sim13, `similar ${sim12} should beat dissimilar ${sim13}`);
});

test("metadata exposes provider and dimensions", () => {
  const meta = getEmbeddingMetadata();
  assert.equal(meta.provider, "aj-local");
  assert.equal(meta.dimensions, 384);
  assert.equal(meta.normalized, true);
});
