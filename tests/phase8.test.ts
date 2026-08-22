import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ARTIFACT_SANDBOX, artifactFrame, sandboxLeaksOrigin } from "../src/runtime/artifact-render.ts";
import { detectVisualDefects, visualInspect, visualDiffCaption } from "../src/runtime/visual-inspect.ts";
import { indexWorkspaceSync } from "../src/runtime/indexer.ts";
import { buildTopology, topologyIsReadOnly } from "../src/runtime/topology.ts";
import { AjDaemon } from "../src/daemon/ajd.ts";

test("artifact iframe is scripts-only and never same-origin", () => {
  const frame = artifactFrame("<button>Save</button>");
  assert.equal(frame.sandbox, "allow-scripts");
  assert.equal(frame.allowSameOrigin, false);
  assert.equal(sandboxLeaksOrigin(ARTIFACT_SANDBOX), false);
  assert.equal(sandboxLeaksOrigin("allow-scripts allow-same-origin"), true);
  assert.match(frame.srcdoc, /Content-Security-Policy/);
});

test("visual inspect flags overlapping buttons and stays air-gapped", () => {
  const html =
    '<button style="position:absolute;left:0;top:0;width:40;height:20">A</button>' +
    '<button style="position:absolute;left:10;top:4;width:40;height:20">B</button>';
  const defects = detectVisualDefects(html);
  assert.ok(defects.some((d) => d.kind === "overlap"));
  const report = visualInspect(html);
  assert.equal(report.airgapped, true);
  assert.ok(report.defects.length >= 1);
  const after = visualInspect("<button style=\"width:80;height:48\">Ok</button>");
  assert.match(visualDiffCaption(report, after), /visual-diff/);
});

test("topology is read-only and lights nodes from the ledger", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-top-"));
  writeFileSync(join(dir, "a.ts"), "export function alpha(){}\n");
  writeFileSync(join(dir, "b.ts"), "import { alpha } from './a.ts'\nexport function beta(){ return alpha() }\n");
  const idx = indexWorkspaceSync(dir);
  const map = buildTopology(idx, [
    {
      seq: 1,
      eventId: "e1",
      type: "SourceWritten",
      operatorId: "op",
      at: new Date().toISOString(),
      payload: { path: "a.ts" },
    },
    {
      seq: 2,
      eventId: "e2",
      type: "ConsensusReached",
      operatorId: "op",
      at: new Date().toISOString(),
      payload: { path: "a.ts" },
    },
  ]);
  assert.equal(topologyIsReadOnly(map), true);
  assert.ok(map.nodes.length >= 1);
  const a = map.nodes.find((n) => n.file.endsWith("a.ts"));
  assert.equal(a?.glow, "consensus");
  rmSync(dir, { recursive: true, force: true });
});

test("daemon records VisualInspected without merging", () => {
  const dir = mkdtempSync(join(tmpdir(), "aj-vis-"));
  process.env.AJ_DATA_DIR = dir;
  const ajd = new AjDaemon();
  ajd.inspectVisual("vis-op", "<button>x</button>", dir);
  const world = ajd.load("vis-op");
  assert.ok(world.events.some((e) => e.type === "VisualInspected"));
  rmSync(dir, { recursive: true, force: true });
});
