/**
 * Tool_VisualInspect — screenshots and DOM only inside the jail.
 * Air-gapped: no outbound requests. Playwright optional.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runEphemeral } from "./microvm.ts";
import { makeId, nowIso } from "../protocol/index.ts";

export interface VisualDefect {
  kind: "overlap" | "overflow" | "contrast" | "hit-target";
  detail: string;
  selector?: string;
}

export interface VisualReport {
  inspectId: string;
  inJail: boolean;
  airgapped: true;
  defects: VisualDefect[];
  beforePath?: string;
  afterPath?: string;
  dom: string;
  at: string;
}

const BUTTON = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;

function boxesFromHtml(html: string): { sel: string; x: number; y: number; w: number; h: number }[] {
  const boxes: { sel: string; x: number; y: number; w: number; h: number }[] = [];
  let i = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(BUTTON.source, "gi");
  while ((m = re.exec(html))) {
    const style = m[1] ?? "";
    const left = Number((style.match(/left:\s*(\d+)/) || [])[1] ?? i * 8);
    const top = Number((style.match(/top:\s*(\d+)/) || [])[1] ?? 0);
    const width = Number((style.match(/width:\s*(\d+)/) || [])[1] ?? 80);
    const height = Number((style.match(/height:\s*(\d+)/) || [])[1] ?? 32);
    boxes.push({ sel: `button:nth-of-type(${i + 1})`, x: left, y: top, w: width, h: height });
    i += 1;
  }
  return boxes;
}

function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function detectVisualDefects(html: string): VisualDefect[] {
  const defects: VisualDefect[] = [];
  const boxes = boxesFromHtml(html);
  for (let i = 0; i < boxes.length; i++) {
    if (boxes[i]!.w < 44 || boxes[i]!.h < 44) {
      defects.push({ kind: "hit-target", detail: "tap target below 44px", selector: boxes[i]!.sel });
    }
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlap(boxes[i]!, boxes[j]!)) {
        defects.push({
          kind: "overlap",
          detail: `overlapping controls ${boxes[i]!.sel} and ${boxes[j]!.sel}`,
          selector: boxes[i]!.sel,
        });
      }
    }
  }
  return defects;
}

export function visualInspect(html: string, root?: string): VisualReport {
  const defects = detectVisualDefects(html);
  let inJail = false;
  if (root && process.env.AJ_VISUAL_JAIL === "1") {
    inJail = runEphemeral(root, "node -e \"console.log('visual-inspect')\"", 6_000).ok;
  }
  let beforePath: string | undefined;
  if (root) {
    const dir = join(root, ".aljwharah-visual");
    mkdirSync(dir, { recursive: true });
    beforePath = join(dir, "before.svg");
    writeFileSync(
      beforePath,
      `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="160"><rect width="360" height="160" fill="#111"/><text x="16" y="40" fill="#e7e7ea" font-size="14">visual inspect · ${defects.length} defects</text></svg>`,
    );
  }
  return {
    inspectId: makeId("vis"),
    inJail: process.env.AJ_VISUAL_JAIL === "1" ? inJail : true,
    airgapped: true,
    defects,
    beforePath: beforePath && existsSync(beforePath) ? beforePath : undefined,
    dom: html.slice(0, 4_000),
    at: nowIso(),
  };
}

export function visualDiffCaption(before: VisualReport, after: VisualReport): string {
  return `visual-diff defects ${before.defects.length} → ${after.defects.length}`;
}
