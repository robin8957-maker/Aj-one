/**
 * Query layer over the real knowledge graph. No fabricated edges.
 */
import type { KnowledgeGraph } from "../protocol/index.ts";
import { buildKnowledgeGraph, impactAnalysis } from "./graph.ts";

export function findSymbol(graph: KnowledgeGraph, name: string) {
  return graph.nodes.filter((n) => n.kind === "symbol" && n.label === name);
}

export function findReferences(graph: KnowledgeGraph, name: string) {
  const symbols = findSymbol(graph, name).map((n) => n.id);
  return graph.edges.filter((e) => e.kind === "references" && (symbols.includes(e.from) || symbols.includes(e.to)));
}

export function findCallers(graph: KnowledgeGraph, name: string) {
  return graph.edges.filter((e) => e.kind === "references" && e.to.includes(`:${name}`));
}

export function findCallees(graph: KnowledgeGraph, name: string) {
  return graph.edges.filter((e) => e.kind === "references" && e.from.includes(`:${name}`));
}

export function findAffectedFiles(graph: KnowledgeGraph, symbolOrFile: string): string[] {
  return impactAnalysis(graph, symbolOrFile).affectedFiles;
}

export function findAffectedTests(graph: KnowledgeGraph, symbolOrFile: string): string[] {
  return findAffectedFiles(graph, symbolOrFile).filter((f) => /test|spec/i.test(f));
}

export function findAffectedApis(graph: KnowledgeGraph, symbolOrFile: string): string[] {
  return findAffectedFiles(graph, symbolOrFile).filter((f) => /route|api|server|handler/i.test(f));
}

export function findDependencyChain(graph: KnowledgeGraph, fromId: string, max = 24): string[] {
  const chain = [fromId];
  const seen = new Set([fromId]);
  let current = fromId;
  while (chain.length < max) {
    const next = graph.edges.find(
      (e) => e.from === current && ((e.kind as string) === "imports" || (e.kind as string) === "dependsOn" || e.kind === "references" || e.kind === "affects"),
    );
    if (!next || seen.has(next.to)) break;
    seen.add(next.to);
    chain.push(next.to);
    current = next.to;
  }
  return chain;
}

export function graphFromRepository(root: string): KnowledgeGraph {
  return buildKnowledgeGraph(root);
}
