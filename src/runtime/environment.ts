/**
 * Execution environment abstraction.
 * v1 ships local + local-sandbox only. Heavy work still runs in the
 * Linux namespace jail. Cloud / remote / Firecracker are research notes,
 * never a live placement the scheduler can return as intended work.
 */
import type { ExecutionPlacement } from "../protocol/index.ts";
import type { ComputeBand, RiskBand } from "./reputation.ts";

export type EnvironmentKind = ExecutionPlacement["kind"];

export interface PlacementInput {
  domain: string;
  risk: RiskBand;
  compute: ComputeBand;
  touchesSecrets: boolean;
  browser: boolean;
}

export function schedulePlacement(input: PlacementInput): ExecutionPlacement {
  if (input.touchesSecrets || input.risk === "critical") {
    return {
      kind: "local",
      location: "operator-host",
      reason: "Sensitive work stays on the operator host.",
      intended: true,
    };
  }
  if (input.browser) {
    return {
      kind: "local-sandbox",
      location: "playwright-sandbox",
      reason: "Browser QA is isolated Computer Use, not a remote VM yet.",
      intended: true,
    };
  }
  if (input.compute === "heavy") {
    return {
      kind: "local-sandbox",
      location: "worktree",
      reason: "Heavy compute stays in the local namespace jail. No remote runtime in v1.",
      intended: true,
    };
  }
  if (input.risk === "low" && input.compute === "tiny") {
    return {
      kind: "local",
      location: "operator-host",
      reason: "Small edit — local is cheaper and faster.",
      intended: true,
    };
  }
  return {
    kind: "local-sandbox",
    location: "worktree",
    reason: "Default: Linux namespace jail around the isolated worktree.",
    intended: true,
  };
}

export function environmentForRole(
  role: string,
  placement: ExecutionPlacement,
): "local" | "sandbox" {
  if (role === "browser-verifier") return "local";
  if (placement.kind === "local-sandbox") return "sandbox";
  return "local";
}

export const EXECUTION_ENVIRONMENTS = {
  local: {
    type: "host",
    isolation: "operator process + policy",
    default: false,
  },
  "local-sandbox": {
    type: "sandbox",
    isolation: "Linux namespaces + chroot + OverlayFS",
    default: true,
  },
} as const;
