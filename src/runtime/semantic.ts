import type { SemanticConflictRecord } from "../protocol/index.ts";
import { makeId, nowIso } from "../protocol/index.ts";
import { extractSymbols } from "./graph.ts";
import { readProjectFile } from "./workspace.ts";

export interface WorktreeDelta {
  agentId: string;
  path: string;
  changedFiles: string[];
}

export function detectSemanticConflicts(
  missionId: string,
  projectPath: string,
  trees: WorktreeDelta[],
): SemanticConflictRecord {
  const perAgent = new Map<string, Map<string, string[]>>();
  for (const tree of trees) {
    const symbols = new Map<string, string[]>();
    for (const file of tree.changedFiles) {
      const next = readProjectFile(tree.path, file) ?? "";
      const base = readProjectFile(projectPath, file) ?? "";
      const nextSym = extractSymbols(file, next);
      const baseSym = extractSymbols(file, base);
      const changed = [
        ...nextSym.exports.filter((s) => !baseSym.exports.includes(s)),
        ...baseSym.exports.filter((s) => !nextSym.exports.includes(s)),
        ...nextSym.exports.filter((s) => {
          if (!baseSym.exports.includes(s)) return false;
          const a = fnBody(base, s);
          const b = fnBody(next, s);
          return a !== b && a !== null && b !== null;
        }),
      ];
      if (changed.length) symbols.set(file, changed);
    }
    perAgent.set(tree.agentId, symbols);
  }

  const owners = new Map<string, string[]>();
  for (const [agentId, files] of perAgent) {
    for (const syms of files.values()) {
      for (const s of syms) {
        const list = owners.get(s) ?? [];
        list.push(agentId);
        owners.set(s, list);
      }
    }
  }

  const overlapping = [...owners.entries()].filter(([, agents]) => new Set(agents).size > 1);
  const producerConsumer: string[] = [];
  const agentList = [...perAgent.keys()];
  for (let i = 0; i < agentList.length; i += 1) {
    for (let j = i + 1; j < agentList.length; j += 1) {
      const a = perAgent.get(agentList[i]!)!;
      const b = perAgent.get(agentList[j]!)!;
      const aExports = new Set([...a.values()].flat());
      for (const file of b.keys()) {
        const src = readProjectFile(trees.find((t) => t.agentId === agentList[j])!.path, file) ?? "";
        for (const exp of aExports) {
          if (src.includes(exp)) producerConsumer.push(`${exp} consumed across isolated worktrees`);
        }
      }
    }
  }

  let verdict: SemanticConflictRecord["verdict"] = "SAFE";
  const symbols = overlapping.map(([s]) => s);
  if (overlapping.length) verdict = "CONFLICT";
  else if (producerConsumer.length) verdict = "REVIEW";

  return {
    conflictId: makeId("sem"),
    missionId,
    verdict,
    summary:
      verdict === "SAFE"
        ? "No semantic overlap across worktrees."
        : verdict === "CONFLICT"
          ? `Shared symbol edits: ${symbols.join(", ")}`
          : producerConsumer[0] ?? "Cross-tree API consumption needs review.",
    symbols,
    agents: agentList,
    createdAt: nowIso(),
  };
}

function fnBody(source: string, name: string): string | null {
  const re = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = re.exec(source);
  if (!m || m.index == null) return null;
  return source.slice(m.index, Math.min(source.length, m.index + 280));
}
