import type { ContextObject } from "../protocol/station.ts";

export type TrustOrigin = "user" | "repo" | "browser" | "webhook" | "mcp" | "agent";

export const TRUST_SCORE: Record<TrustOrigin, number> = {
  user: 1,
  repo: 0.75,
  agent: 0.55,
  mcp: 0.35,
  browser: 0.2,
  webhook: 0.15,
};

export const TOOL_DERIVE_FLOOR = 0.7;

export function inferOrigin(kind: string, explicit?: TrustOrigin): TrustOrigin {
  if (explicit) return explicit;
  if (kind === "browser" || kind === "screenshot" || kind === "url") return "browser";
  if (kind === "mcp") return "mcp";
  if (kind === "issue" || kind === "logs") return "webhook";
  if (kind === "git" || kind === "file" || kind === "folder" || kind === "symbol") return "repo";
  if (kind === "agent" || kind === "decision" || kind === "memory") return "agent";
  return "user";
}

export function stampTrust(
  ctx: Omit<ContextObject, "trustScore" | "trustOrigin"> & { origin?: ContextObject["origin"] },
  explicit?: TrustOrigin,
): ContextObject {
  const trustOrigin = inferOrigin(ctx.kind, explicit ?? (ctx.origin as TrustOrigin | undefined));
  const trustScore = TRUST_SCORE[trustOrigin];
  return {
    ...ctx,
    origin: trustOrigin === "repo" ? "user" : trustOrigin === "webhook" ? "webhook" : trustOrigin,
    trustOrigin,
    trustScore,
    trusted: trustScore >= TOOL_DERIVE_FLOOR,
    tainted: trustScore < TOOL_DERIVE_FLOOR ? true : ctx.tainted,
  };
}

export function mayDeriveTools(ctx: Pick<ContextObject, "trustScore" | "trusted">): boolean {
  const score = ctx.trustScore ?? (ctx.trusted ? 1 : 0);
  return score >= TOOL_DERIVE_FLOOR;
}

export function refuseLowTrustDerivation(
  command: string,
  contexts: Array<Pick<ContextObject, "preview" | "trustScore" | "trusted" | "title" | "kind">>,
): { ok: true } | { ok: false; reason: string } {
  for (const ctx of contexts) {
    if (mayDeriveTools(ctx)) continue;
    const preview = ctx.preview?.trim();
    if (preview && preview.length >= 4 && command.includes(preview)) {
      return {
        ok: false,
        reason: `low-trust context '${ctx.title}' (${ctx.kind}) cannot derive tool commands — data only`,
      };
    }
  }
  return { ok: true };
}

export function decayTrust(parentScore: number, incoming: TrustOrigin): number {
  return Math.min(parentScore, TRUST_SCORE[incoming]);
}

export function inferSupplyChainOrigin(ref: string, preview = ""): TrustOrigin {
  const hay = `${ref} ${preview}`.toLowerCase();
  if (/node_modules|registry.npmjs|unpkg|jsdelivr|https?:\/\//.test(hay)) return "webhook";
  if (/\brequire\(|from ['"]https?:|import\.meta\.url/.test(hay) && /http/.test(hay)) return "mcp";
  return "repo";
}

export function stampDecayed(
  ctx: Parameters<typeof stampTrust>[0],
  parentScore: number,
  incoming?: TrustOrigin,
): ReturnType<typeof stampTrust> {
  const origin = incoming ?? inferSupplyChainOrigin(ctx.ref, ctx.preview);
  const stamped = stampTrust(ctx, origin);
  const trustScore = decayTrust(parentScore, origin);
  return {
    ...stamped,
    trustScore,
    trusted: trustScore >= TOOL_DERIVE_FLOOR,
    tainted: trustScore < TOOL_DERIVE_FLOOR,
  };
}
