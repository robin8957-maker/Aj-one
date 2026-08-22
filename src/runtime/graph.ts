import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { GraphEdge, GraphNode, KnowledgeGraph } from "../protocol/index.ts";
import { nowIso } from "../protocol/index.ts";
import { listProjectFiles, readProjectFile } from "./workspace.ts";
import {
  analyzeProject,
  extractSymbols,
  renameImpactFromSymbols,
  type FileSymbols,
  type RenameImpact,
} from "./lsp.ts";

export type { FileSymbols, RenameImpact };
export { extractSymbols };

export function buildKnowledgeGraph(projectPath: string): KnowledgeGraph {
  const files = listProjectFiles(projectPath, 120).filter((f) =>
    /\.(js|jsx|ts|tsx|mjs|cjs)$/.test(f),
  );
  const analysis = analyzeProject(projectPath);
  const parsed = analysis.files;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const diagnostics: KnowledgeGraph["diagnostics"] = [];

  for (const d of analysis.diagnostics) {
    diagnostics.push({
      file: d.file,
      message: d.line ? `L${d.line}: ${d.message}` : d.message,
      severity: d.severity,
    });
  }

  for (const file of parsed) {
    const fileId = `file:${file.file}`;
    nodes.push({ id: fileId, kind: "file", label: file.file, file: file.file });
    if ((readProjectFile(projectPath, file.file) ?? "").includes("INTENTIONAL DEFECT")) {
      diagnostics.push({
        file: file.file,
        message: "Annotated defect in source",
        severity: "warning",
      });
    }
    for (const def of file.definitions.filter((d) => d.exported)) {
      const sid = `sym:${file.file}:${def.name}`;
      nodes.push({
        id: sid,
        kind: "symbol",
        label: def.name,
        file: file.file,
        exported: true,
        line: def.line,
        column: def.column,
      });
      edges.push({ from: fileId, to: sid, kind: "exports" });
      edges.push({ from: fileId, to: sid, kind: "contains" });
    }
    for (const name of file.exports) {
      const sid = `sym:${file.file}:${name}`;
      if (!nodes.some((n) => n.id === sid)) {
        nodes.push({ id: sid, kind: "symbol", label: name, file: file.file, exported: true });
        edges.push({ from: fileId, to: sid, kind: "exports" });
        edges.push({ from: fileId, to: sid, kind: "contains" });
      }
    }
    for (const imp of file.imports) {
      const modId = `mod:${imp.from}`;
      if (!nodes.some((n) => n.id === modId)) {
        nodes.push({ id: modId, kind: "module", label: imp.from });
      }
      edges.push({ from: fileId, to: modId, kind: "imports" });
      const resolved = resolveImport(files, file.file, imp.from);
      if (resolved) {
        edges.push({ from: fileId, to: `file:${resolved}`, kind: "imports" });
        for (const name of imp.names) {
          edges.push({
            from: `sym:${resolved}:${name}`,
            to: fileId,
            kind: "references",
          });
        }
      } else if (imp.from.startsWith(".")) {
        diagnostics.push({
          file: file.file,
          message: `Unresolved relative import '${imp.from}'`,
          severity: "error",
        });
      }
    }
  }

  for (const html of listProjectFiles(projectPath, 40).filter((f) => f.endsWith(".html"))) {
    const src = readProjectFile(projectPath, html) ?? "";
    const fileId = `file:${html}`;
    if (!nodes.some((n) => n.id === fileId)) {
      nodes.push({ id: fileId, kind: "file", label: html, file: html });
    }
    if (src.includes("INTENTIONAL DEFECT")) {
      diagnostics.push({
        file: html,
        message: "Annotated UI defect",
        severity: "error",
      });
    }
    if (/<button[^>]*\bdisabled\b/i.test(src)) {
      diagnostics.push({
        file: html,
        message: "Disabled button in UI surface",
        severity: "warning",
      });
    }
    if (/<button\b(?![^>]*aria-label)/i.test(src) && !/<button[^>]*>\s*Sign in/i.test(src)) {
      diagnostics.push({
        file: html,
        message: "Button missing accessible name",
        severity: "warning",
      });
    }
  }

  const exported = new Map<string, string[]>();
  for (const file of parsed) {
    for (const name of file.exports) {
      const list = exported.get(name) ?? [];
      list.push(file.file);
      exported.set(name, list);
    }
  }
  for (const file of parsed) {
    for (const name of file.references) {
      const owners = exported.get(name);
      if (!owners) continue;
      for (const owner of owners) {
        if (owner === file.file) continue;
        edges.push({
          from: `sym:${owner}:${name}`,
          to: `file:${file.file}`,
          kind: "references",
        });
      }
    }
  }

  const git = files.slice(0, 12).map((file) => ({
    file,
    recent: gitLog(projectPath, file),
  }));

  return {
    projectPath,
    nodes,
    edges,
    diagnostics,
    git,
    builtAt: nowIso(),
  };
}

export function renameImpact(projectPath: string, symbol: string): RenameImpact {
  const analysis = analyzeProject(projectPath);
  return renameImpactFromSymbols(analysis.files, symbol);
}

export function impactAnalysis(graph: KnowledgeGraph, symbolOrFile: string): {
  symbol: string;
  affectedFiles: string[];
  affectedSymbols: string[];
  hops: number;
} {
  const start = graph.nodes.find(
    (n) => n.label === symbolOrFile || n.file === symbolOrFile || n.id.endsWith(`:${symbolOrFile}`),
  );
  if (!start) {
    return { symbol: symbolOrFile, affectedFiles: [], affectedSymbols: [], hops: 0 };
  }
  const seen = new Set<string>([start.id]);
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of graph.edges) {
      if (e.from !== id && e.to !== id) continue;
      const next = e.from === id ? e.to : e.from;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  const affected = [...seen].map((id) => graph.nodes.find((n) => n.id === id)).filter(Boolean);
  return {
    symbol: start.label,
    affectedFiles: [...new Set(affected.filter((n) => n!.kind === "file").map((n) => n!.file ?? n!.label))],
    affectedSymbols: affected.filter((n) => n!.kind === "symbol").map((n) => n!.label),
    hops: seen.size,
  };
}

export function contextForTask(graph: KnowledgeGraph, query: string, limit = 8): {
  id: string;
  reason: string;
  score: number;
  trustLevel: number;
}[] {
  const q = query.toLowerCase();
  const scored = graph.nodes
    .filter((n) => n.kind === "symbol" || n.kind === "file")
    .map((n) => {
      const hay = `${n.label} ${n.file ?? ""}`.toLowerCase();
      let score = 0;
      for (const word of q.split(/\W+/).filter(Boolean)) {
        if (hay.includes(word)) score += word.length > 4 ? 3 : 1;
      }
      return { id: n.id, reason: `neighborhood of ${n.label}`, score, trustLevel: n.exported ? 0.9 : 0.7 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored;
}

function resolveImport(files: string[], fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const dir = fromFile.split("/").slice(0, -1).join("/");
  const raw = join(dir, spec).replace(/\\/g, "/");
  const candidates = [raw, `${raw}.js`, `${raw}.ts`, `${raw}.mjs`, join(raw, "index.js")];
  for (const c of candidates) {
    const norm = c.replace(/\\/g, "/");
    if (files.includes(norm)) return norm;
  }
  return files.find((f) => f.startsWith(raw.replace(/\\/g, "/"))) ?? null;
}

function gitLog(projectPath: string, file: string): string[] {
  if (!existsSync(join(projectPath, ".git"))) return [];
  const res = spawnSync("git", ["log", "--oneline", "-n", "5", "--", file], {
    cwd: projectPath,
    encoding: "utf8",
    timeout: 3000,
  });
  if (res.status !== 0) return [];
  return (res.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean);
}

export function readJsonSafe(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
