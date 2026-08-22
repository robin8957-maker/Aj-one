import type { Mission } from "../protocol/index.ts";

export const MAX_SELF_HEALS = 3;

export function nextHealAction(mission: Pick<Mission, "healAttempts">): "resolve" | "ask-human" {
  return (mission.healAttempts ?? 0) < MAX_SELF_HEALS ? "resolve" : "ask-human";
}
