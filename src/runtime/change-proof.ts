import { createHash } from "node:crypto";
import { nowIso } from "../protocol/index.ts";
import type { RepositorySnapshot } from "./repository.ts";
import type { RedTeamReport } from "./red-team.ts";
import type { SecurityFinding } from "./security-watch.ts";

export interface ChangeProof {
  missionId: string;
  baseCommit: string | null;
  finalCommit: string | null;
  changedFiles: string[];
  testsRun: string[];
  testsPassed: boolean;
  testsFailed: string[];
  buildResult: "UNKNOWN" | "ok" | "failed";
  typecheckResult: "UNKNOWN" | "ok" | "failed";
  securityResult: "UNKNOWN" | "ok" | "failed";
  verifierResult: "ok" | "failed";
  redTeamPassed: boolean;
  artifactHashes: Record<string, string>;
  at: string;
}

export function buildChangeProof(input: {
  missionId: string;
  snapshot: RepositorySnapshot;
  changedFiles: string[];
  testsRun: string[];
  testsPassed: boolean;
  testsFailed: string[];
  verifierOk: boolean;
  redTeam: RedTeamReport;
  findings: SecurityFinding[];
}): ChangeProof {
  const hashes: Record<string, string> = {};
  for (const f of input.changedFiles) {
    hashes[f] = createHash("sha256").update(f).digest("hex").slice(0, 12);
  }
  return {
    missionId: input.missionId,
    baseCommit: input.snapshot.commit,
    finalCommit: input.snapshot.commit,
    changedFiles: input.changedFiles,
    testsRun: input.testsRun,
    testsPassed: input.testsPassed,
    testsFailed: input.testsFailed,
    buildResult: "UNKNOWN",
    typecheckResult: "UNKNOWN",
    securityResult: input.findings.some((f) => f.severity === "critical") ? "failed" : input.findings.length ? "UNKNOWN" : "ok",
    verifierResult: input.verifierOk ? "ok" : "failed",
    redTeamPassed: input.redTeam.passed,
    artifactHashes: hashes,
    at: nowIso(),
  };
}
