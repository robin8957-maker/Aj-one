import type { AutomationRecord } from "../protocol/index.ts";
import { makeId } from "../protocol/index.ts";

export function defaultAutomations(): AutomationRecord[] {
  return [
    {
      automationId: makeId("auto"),
      trigger: "ci-failure",
      title: "CI failure → incident mission",
      objective:
        "Investigate the latest CI failure on Northstar. Prefer a debugger plus tests. Do not mark complete without evidence.",
      enabled: true,
      permissionCeiling: 55,
      budgetUsd: 3,
      runs: 0,
    },
    {
      automationId: makeId("auto"),
      trigger: "security-alert",
      title: "Security alert → audit mission",
      objective:
        "Run a security audit of the Northstar service. Produce a security artifact covering auth, secrets, and input trust.",
      enabled: true,
      permissionCeiling: 60,
      budgetUsd: 2,
      runs: 0,
    },
    {
      automationId: makeId("auto"),
      title: "Nightly knowledge refresh",
      trigger: "schedule",
      objective: "Scan Northstar, rebuild the knowledge graph, and record stale cards.",
      enabled: true,
      permissionCeiling: 40,
      budgetUsd: 1,
      runs: 0,
    },
    {
      automationId: makeId("auto"),
      trigger: "dependency-update",
      title: "Dependency update → review mission",
      objective: "Review a dependency change on Northstar. Map impact through the knowledge graph before editing.",
      enabled: true,
      permissionCeiling: 50,
      budgetUsd: 2,
      runs: 0,
    },
  ];
}
