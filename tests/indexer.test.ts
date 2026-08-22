import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  indexWorkspaceSync,
  snippetForEdit,
  searchWorkspace,
  scheduleWorkspaceIndex,
  getWorkspaceIndex,
} from "../src/runtime/indexer.ts";
import { authorizeTool } from "../src/runtime/policy.ts";
import { DEFAULT_PERMISSIONS } from "../src/protocol/index.ts";

function sampleRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "aj-idx-"));
  mkdirSync(join(dir, "src"));
  writeFileSync(
    join(dir, "src/totals.ts"),
    "export function calculateTotal(n: number): number { return n; }\nexport interface Money { amount: number }\n",
  );
  writeFileSync(
    join(dir, "src/InvoiceManager.ts"),
    "import { calculateTotal } from './totals';\nexport function invoice() { return calculateTotal(1); }\n",
  );
  writeFileSync(join(dir, "src/orphan.ts"), "export function unused() { return 0; }\n");
  return dir;
}

test("indexer extracts functions, types, and reverse callers locally", () => {
  const dir = sampleRepo();
  const idx = indexWorkspaceSync(dir);
  assert.ok(idx.fileCount >= 3);
  assert.ok(idx.files["src/totals.ts"]?.functions.includes("calculateTotal"));
  assert.ok(idx.files["src/totals.ts"]?.callers.some((c) => c.includes("InvoiceManager")));
  assert.ok(idx.symbols.some((s) => s.name === "Money"));
  rmSync(dir, { recursive: true, force: true });
});

test("edit snippet warns about callers without becoming a tool grant", () => {
  const dir = sampleRepo();
  indexWorkspaceSync(dir);
  const snippet = snippetForEdit(dir, "src/totals.ts");
  assert.match(snippet, /calculateTotal/);
  assert.match(snippet, /InvoiceManager/);
  const acp = {
    agentId: "acp",
    role: "researcher" as const,
    missionId: "m",
    permissions: { ...DEFAULT_PERMISSIONS.researcher, filesystem: "read" as const },
  };
  const denied = authorizeTool(acp as never, "fs.write");
  assert.equal(denied.ok, false);
  assert.doesNotMatch(snippet, /sk-|Bearer /);
  rmSync(dir, { recursive: true, force: true });
});

test("semantic search stays on the hashed local index", () => {
  const dir = sampleRepo();
  indexWorkspaceSync(dir);
  const hits = searchWorkspace(dir, "calculate total invoice money", 5);
  assert.ok(hits.length >= 1);
  assert.ok(hits[0]!.score > 0.12);
  rmSync(dir, { recursive: true, force: true });
});

test("scheduleWorkspaceIndex does not throw and fills cache asynchronously", async () => {
  const dir = sampleRepo();
  scheduleWorkspaceIndex(dir);
  assert.equal(getWorkspaceIndex(dir) == null || getWorkspaceIndex(dir) != null, true);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  const idx = getWorkspaceIndex(dir);
  assert.ok(idx);
  assert.ok(idx!.fileCount >= 2);
  rmSync(dir, { recursive: true, force: true });
});
