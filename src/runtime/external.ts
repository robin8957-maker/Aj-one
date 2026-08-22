import type { ExternalAgentRecord } from "../protocol/index.ts";
import { makeId } from "../protocol/index.ts";

export function seedExternalAgents(): ExternalAgentRecord[] {
  return [
    {
      externalId: makeId("ext"),
      kind: "native",
      name: "AJ Native Engineer",
      requested: ["fs.scoped-write", "worktree", "terminal.sandbox"],
      granted: ["fs.scoped-write", "worktree", "terminal.sandbox"],
      status: "granted",
    },
    {
      externalId: makeId("ext"),
      kind: "acp",
      name: "ACP-compatible worker",
      requested: ["fs.read", "fs.write", "network.internet", "secrets.broker"],
      granted: ["fs.read"],
      status: "granted",
      session: { status: "idle" },
    },
    {
      externalId: makeId("ext"),
      kind: "external",
      name: "External coding agent",
      requested: ["fs.write", "git.merge", "browser.interact"],
      granted: ["browser.interact"],
      status: "granted",
    },
    {
      externalId: makeId("ext"),
      kind: "enterprise",
      name: "Custom enterprise agent",
      requested: ["network.internet", "secrets.broker", "spawnAgents"],
      granted: [],
      status: "denied",
    },
  ];
}

export function grantCapabilities(
  agent: ExternalAgentRecord,
  requested: string[],
  ceiling: string[],
): ExternalAgentRecord {
  const granted = requested.filter((cap) => ceiling.includes(cap));
  return {
    ...agent,
    requested,
    granted,
    status: granted.length ? "granted" : "denied",
  };
}
