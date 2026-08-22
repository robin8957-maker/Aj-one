/**
 * Local hashed-vector memory. No external Chroma/Qdrant process —
 * cosine search over a JSONL index owned by ajd.
 * Vectors are 384-D (see embeddings.ts). Older 64-D rows still load;
 * cosine compares the overlapping prefix so recall degrades instead of crashing.
 */
import { appendFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { operatorDir } from "../daemon/store.ts";
import { makeId, nowIso } from "../protocol/index.ts";
import { cosineSimilarity, embed as embed384 } from "./embeddings.ts";

export const DIM = 384;

export interface VectorDoc {
  vectorId: string;
  missionId?: string;
  kind: "failure" | "fix" | "fact" | "note";
  text: string;
  vec: number[];
  at: string;
}

function pathFor(operatorId: string): string {
  return join(operatorDir(operatorId), "vectors.jsonl");
}

export function embed(text: string): number[] {
  return embed384(text);
}

export function cosine(a: number[], b: number[]): number {
  return cosineSimilarity(a, b);
}

export function rememberVector(
  operatorId: string,
  input: { text: string; kind: VectorDoc["kind"]; missionId?: string },
): VectorDoc {
  mkdirSync(operatorDir(operatorId), { recursive: true });
  const doc: VectorDoc = {
    vectorId: makeId("vec"),
    missionId: input.missionId,
    kind: input.kind,
    text: input.text.slice(0, 2000),
    vec: embed(input.text),
    at: nowIso(),
  };
  appendFileSync(pathFor(operatorId), `${JSON.stringify(doc)}\n`, "utf8");
  return doc;
}

export function loadVectors(operatorId: string): VectorDoc[] {
  const path = pathFor(operatorId);
  if (!existsSync(path)) return [];
  const out: VectorDoc[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as VectorDoc);
    } catch {
      /* skip */
    }
  }
  return out;
}

export function searchSimilar(
  operatorId: string,
  query: string,
  opts: { k?: number; kind?: VectorDoc["kind"] } = {},
): { doc: VectorDoc; score: number }[] {
  const q = embed(query);
  const k = opts.k ?? 5;
  return loadVectors(operatorId)
    .filter((d) => !opts.kind || d.kind === opts.kind)
    .map((doc) => ({ doc, score: cosine(q, doc.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .filter((h) => h.score > 0.15);
}
