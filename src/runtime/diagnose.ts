import { classifyFailure, type FailureKind } from "./failures.ts";
import { AJ_ERR } from "./errors.ts";

export type DiagnoseClass =
  | FailureKind
  | "compile"
  | "type"
  | "runtime"
  | "dependency"
  | "environment"
  | "permission"
  | "network"
  | "security";

export interface RepairHypothesis {
  id: string;
  klass: DiagnoseClass;
  hypothesis: string;
  evidence: string;
}

const SEEN = new Map<string, string[]>();

export function diagnoseOutput(output: string): DiagnoseClass {
  const t = output.toLowerCase();
  if (/cannot find module|err_module_not_found|modulenotfound/.test(t)) return "dependency";
  if (/referenceerror|is not defined/.test(t)) return "runtime";
  if (/eacces|permission denied|not granted/.test(t)) return "permission";
  if (/enotfound|econnreset|429|timeout/.test(t) && /http|fetch|socket/.test(t)) return "network";
  if (/syntaxerror|unexpected token/.test(t)) return "compile";
  if (/error ts\d+|typeerror/.test(t)) return "type";
  if (/sandbox unavailable|code 126/.test(t)) return "environment";
  if (/secret|injection|ssrf/.test(t)) return "security";
  if (/assertionerror|assert\.|\bfail\b|expected|diff:/.test(t)) return "test";
  return classifyFailure(output);
}

export function nextHypothesis(missionId: string, output: string): RepairHypothesis | { exhausted: true; code: string } {
  const klass = diagnoseOutput(output);
  const hypothesis =
    klass === "compile"
      ? "syntax error — close unclosed token / restore export"
      : klass === "dependency"
        ? "missing module — do not invent a package; fail if undeclared"
        : klass === "runtime"
          ? "runtime reference error — check missing imports or undefined variables"
          : klass === "type"
            ? "type error — align function signature and types"
            : klass === "test"
              ? "assertion mismatch — align implementation with test contract"
              : klass === "permission"
                ? "capability missing — do not escalate"
                : klass === "security"
                  ? "security violation — refuse insecure payload"
                  : "re-read failing file and apply a scoped patch";
  const key = `${missionId}:${klass}:${hypothesis}`;
  const used = SEEN.get(missionId) ?? [];
  if (used.includes(key)) {
    return { exhausted: true, code: AJ_ERR.REPAIR_EXHAUSTED };
  }
  used.push(key);
  SEEN.set(missionId, used);
  return { id: `hyp-${used.length}`, klass, hypothesis, evidence: output.slice(0, 240) };
}

export function resetHypotheses(missionId?: string): void {
  if (missionId) SEEN.delete(missionId);
  else SEEN.clear();
}
