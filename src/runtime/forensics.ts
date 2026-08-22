import type { WorldSnapshot } from "../protocol/index.ts";
import { writeArtifactFile } from "../daemon/store.ts";

export function writeForensicReport(world: WorldSnapshot, missionId: string, summary: string): string {
  const events = world.events.filter((e) => e.missionId === missionId);
  const resolutions = events.filter((e) => e.type === "ResolutionStarted");
  const verifies = events.filter((e) => e.type === "VerificationFinished");
  const body = [
    `# Forensic report — ${missionId}`,
    "",
    `Verifier rejected after ${resolutions.length} self-heal attempt(s).`,
    "",
    "## Final rejection",
    summary,
    "",
    "## Strategies tried",
    ...(resolutions.length
      ? resolutions.map((e, i) => `${i + 1}. attempt ${e.payload.attempt ?? i + 1} — ${String(e.payload.agentId ?? "debugger")}`)
      : ["(none recorded)"]),
    "",
    "## Verifier verdicts",
    ...(verifies.length
      ? verifies.map((e) => `- ${e.payload.result ?? "?"} @ ${e.at}`)
      : ["(none recorded)"]),
    "",
    "Human approval is required. Implementation agents cannot certify.",
  ].join("\n");
  return writeArtifactFile(world.operatorId, `forensic_${missionId}`, body);
}
