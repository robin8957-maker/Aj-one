import type { AjEvent, Mission, WorldSnapshot } from "../protocol/index.ts";

export interface GovernanceMetrics {
  verifierCatchRate: number;
  falsePassRate: number;
  rollbackAfterMergeRate: number;
  avgCostPerSuccess: number;
  timeToFirstHumanMs: number | null;
  sampleSize: number;
  verifierRuns: number;
  verifierFails: number;
  successes: number;
  merges: number;
  rollbacks: number;
}

export function computeGovernanceMetrics(world: WorldSnapshot): GovernanceMetrics {
  const events = world.events;
  const missions = Object.values(world.missions);
  const verifierRuns = events.filter((e) => e.type === "VerificationFinished").length;
  const verifierFails = events.filter((e) => e.type === "VerificationFinished" && failedVerify(e)).length;
  const successes = missions.filter((m) => m.state === "COMPLETE" && m.verification?.result === "PASS").length;
  const merges = events.filter((e) => e.type === "WorktreeMerged").length;
  const rollbacks = events.filter((e) => e.type === "RecoveryStarted" || isRollback(e)).length;
  const falsePass = countFalsePass(missions, events);
  const firstHuman = firstHumanMs(events, missions);
  const cost = missions.filter((m) => m.state === "COMPLETE").reduce((s, m) => s + (m.budget.moneyUsed || 0), 0);
  return {
    verifierCatchRate: verifierRuns ? verifierFails / verifierRuns : 0,
    falsePassRate: successes + falsePass ? falsePass / (successes + falsePass) : 0,
    rollbackAfterMergeRate: merges ? Math.min(1, rollbacks / merges) : 0,
    avgCostPerSuccess: successes ? cost / successes : 0,
    timeToFirstHumanMs: firstHuman,
    sampleSize: missions.length,
    verifierRuns,
    verifierFails,
    successes,
    merges,
    rollbacks,
  };
}

function failedVerify(e: AjEvent): boolean {
  const r = e.payload.result ?? e.payload.ok;
  return r === "FAIL" || r === false;
}

function isRollback(e: AjEvent): boolean {
  return e.type === "SteerReceived" && String(e.payload.text ?? e.payload.reason ?? "").includes("rollback");
}

function countFalsePass(missions: Mission[], events: AjEvent[]): number {
  let n = 0;
  for (const m of missions) {
    if (m.verification?.result !== "PASS") continue;
    const later = events.some(
      (e) => e.missionId === m.missionId && (e.type === "RecoveryStarted" || e.type === "ResolutionStarted"),
    );
    if (later) n += 1;
  }
  return n;
}

function firstHumanMs(events: AjEvent[], missions: Mission[]): number | null {
  const created = events.find((e) => e.type === "MissionCreated");
  const human = events.find((e) => e.type === "ApprovalRequested" || e.type === "SteerReceived");
  if (!created || !human) {
    const m = missions[0];
    if (!m) return null;
    return null;
  }
  return Math.max(0, new Date(human.at).getTime() - new Date(created.at).getTime());
}
