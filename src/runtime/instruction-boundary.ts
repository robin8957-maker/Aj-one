import { AJ_ERR } from "./errors.ts";

export type InstructionSource = "SYSTEM" | "POLICY" | "USER" | "REPOSITORY" | "TOOL" | "MODEL";

const RANK: Record<InstructionSource, number> = {
  SYSTEM: 100,
  POLICY: 90,
  USER: 70,
  TOOL: 40,
  MODEL: 30,
  REPOSITORY: 10,
};

const INJECTION =
  /ignore (all )?(system|previous) (instructions|guidelines|rules|prompts)|override (all )?(security|system|policy)|upload (environment )?secrets|export (all )?(api keys|secrets|environment)|exfiltrat|bypass (security|policy)|run this command/i;

export function sourceRank(source: InstructionSource): number {
  return RANK[source];
}

export function inspectUntrustedText(text: string, source: InstructionSource): {
  allowed: boolean;
  code?: string;
  reason: string;
} {
  if (source === "REPOSITORY" && INJECTION.test(text)) {
    return {
      allowed: false,
      code: AJ_ERR.INSTRUCTION_INJECTION,
      reason: "repository text attempted to override system/policy instructions",
    };
  }
  return { allowed: true, reason: "no injection pattern" };
}

export function mayOverride(from: InstructionSource, onto: InstructionSource): boolean {
  return RANK[from] > RANK[onto];
}
