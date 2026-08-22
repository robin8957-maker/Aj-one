/**
 * WorkspaceIndexer — local semantic RAG for the current tree.
 * Hashed 384-d vectors via ajd embed(). No OpenAI, no Chroma/Qdrant.
 * Indexing is sliced on setImmediate so the Commander is never blocked.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { extractSymbols } from "./lsp.ts";
import { listProjectFiles, readProjectFile } from "./workspace.ts";
import { cosine, embed } from "./vectors.ts";
import { operatorDir } from "../daemon/store.ts";
import { nowIso } from "../protocol/index.ts";

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SLICE = 8;

export interface IndexedSymbol {
  name: string;
  kind: string;
  file: string;
  exported: boolean;
  text: string;
  vec: number[];
}

export interface FileCard {
  file: string;
  exports: string[];
  imports: { names: string[]; from: string }[];
  functions: string[];
  callers: string[];
}

export interface WorkspaceIndex {
  root: string;
  files: Record<string, FileCard>;
  symbols: IndexedSymbol[];
  indexedAt: string;
  fileCount: number;
}

const cache = new Map<string, WorkspaceIndex>();
const pending = new Set<string>();
let ticking = false;

function persistPath(operatorId: string): string {
  return join(operatorDir(operatorId), "workspace-index.json");
}

function resolveImport(root: string, fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = join(dirname(fromFile), spec).replace(/\\/g, "/");
  const clean = base.replace(/^\.\//, "");
  const tries = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js"];
  for (const ext of tries) {
    const rel = `${clean}${ext}`.replace(/\\/g, "/");
    if (existsSync(join(root, rel))) return rel;
  }
  return clean.replace(/\\/g, "/");
}

export function indexFile(root: string, rel: string): { card: FileCard; symbols: IndexedSymbol[] } | null {
  if (!CODE.test(rel)) return null;
  const src = readProjectFile(root, rel);
  if (src == null) return null;
  const extracted = extractSymbols(rel, src);
  const extras = extraTypes(src);
  const names = new Set([...extracted.exports, ...extracted.functions, ...extras]);
  const symbols: IndexedSymbol[] = [...names].map((name) => {
    const text = `${name} ${rel} ${extracted.functions.includes(name) ? "function" : "symbol"} ${extracted.imports.map((i) => i.from).join(" ")}`;
    return {
      name,
      kind: extracted.functions.includes(name) ? "function" : extras.includes(name) ? "type" : "symbol",
      file: rel,
      exported: extracted.exports.includes(name) || extras.includes(name),
      text,
      vec: embed(text),
    };
  });
  return {
    card: {
      file: rel,
      exports: extracted.exports,
      imports: extracted.imports,
      functions: [...new Set([...extracted.functions, ...extras])],
      callers: [],
    },
    symbols,
  };
}

function extraTypes(src: string): string[] {
  const out: string[] = [];
  const re = /(?:export\s+)?(?:interface|type|enum)\s+([A-Z][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]!);
  return out;
}

function linkCallers(root: string, files: Record<string, FileCard>): void {
  for (const card of Object.values(files)) card.callers = [];
  for (const card of Object.values(files)) {
    for (const imp of card.imports) {
      const target = resolveImport(root, card.file, imp.from);
      if (target && files[target]) files[target]!.callers.push(card.file);
    }
  }
}

export function indexWorkspaceSync(root: string): WorkspaceIndex {
  const files: Record<string, FileCard> = {};
  const symbols: IndexedSymbol[] = [];
  for (const rel of listProjectFiles(root, 200)) {
    const got = indexFile(root, rel);
    if (!got) continue;
    files[rel] = got.card;
    symbols.push(...got.symbols);
  }
  linkCallers(root, files);
  const idx: WorkspaceIndex = {
    root,
    files,
    symbols,
    indexedAt: nowIso(),
    fileCount: Object.keys(files).length,
  };
  cache.set(root, idx);
  return idx;
}

/** Non-blocking: slice files across turns. */
export function scheduleWorkspaceIndex(root: string): void {
  pending.add(root);
  if (!ticking) {
    ticking = true;
    setImmediate(tick);
  }
}

function tick(): void {
  const root = pending.values().next().value as string | undefined;
  if (!root) {
    ticking = false;
    return;
  }
  pending.delete(root);
  try {
    indexWorkspaceSync(root);
  } catch {
    /* fail open — commander must not stall */
  }
  if (pending.size) setImmediate(tick);
  else ticking = false;
}

export function getWorkspaceIndex(root: string): WorkspaceIndex | null {
  return cache.get(root) ?? null;
}

export function persistWorkspaceIndex(operatorId: string, root: string): void {
  const idx = cache.get(root);
  if (!idx) return;
  mkdirSync(operatorDir(operatorId), { recursive: true });
  const slim = {
    root: idx.root,
    indexedAt: idx.indexedAt,
    fileCount: idx.fileCount,
    files: Object.fromEntries(
      Object.entries(idx.files).map(([k, v]) => [k, { file: v.file, exports: v.exports, functions: v.functions, callers: v.callers, imports: v.imports }]),
    ),
  };
  writeFileSync(persistPath(operatorId), JSON.stringify(slim), "utf8");
}

export function searchWorkspace(root: string, query: string, k = 5): { symbol: IndexedSymbol; score: number }[] {
  const idx = cache.get(root);
  if (!idx) return [];
  const q = embed(query);
  return idx.symbols
    .map((symbol) => ({ symbol, score: cosine(q, symbol.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .filter((h) => h.score > 0.12);
}

export function snippetForEdit(root: string, rel: string): string {
  let idx = cache.get(root);
  if (!idx) idx = indexWorkspaceSync(root);
  const card = idx.files[rel];
  const hits = searchWorkspace(root, rel, 4);
  const lines: string[] = [];
  if (card) {
    if (card.callers.length) {
      const fn = card.functions[0] ?? card.exports[0] ?? rel;
      lines.push(`Alert: ${fn} in ${rel} is imported by ${card.callers.slice(0, 4).join(", ")}. Do not break its signature.`);
    }
    const local = card.imports.filter((i) => i.from.startsWith(".")).slice(0, 4);
    if (local.length) {
      lines.push(`This file imports: ${local.map((i) => `${i.from} (${i.names.slice(0, 3).join(", ") || "…"})`).join("; ")}.`);
    }
  }
  const extra = hits.filter((h) => h.symbol.file !== rel).slice(0, 2);
  for (const h of extra) {
    lines.push(`Related: ${h.symbol.name} @ ${h.symbol.file}`);
  }
  return lines.join(" ").slice(0, 400);
}

export function isIndexing(): boolean {
  return ticking;
}
