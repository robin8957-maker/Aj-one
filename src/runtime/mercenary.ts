/**
 * External mercenary agents. Snippet in, tainted payload out.
 * Never workspace, never secrets, never certify, never fs.write.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { stampTrust, refuseLowTrustDerivation, TRUST_SCORE } from "./trust.ts";
import { nowIso, makeId } from "../protocol/index.ts";
import type { ContextObject } from "../protocol/station.ts";

export const MERCENARY_TRUST = TRUST_SCORE.webhook; // 0.15
export const CANNOT_CERTIFY = true as const;

export interface MercenaryFrame {
  frameId: string;
  token: string;
  snippet: string;
  question: string;
}

export interface MercenaryReply {
  frameId: string;
  payload: string;
  cannotCertify: true;
  tainted: true;
  trustScore: number;
  context: ContextObject;
}

export function mintMercenaryToken(secret: Buffer, nonce: string): string {
  return createHmac("sha256", secret).update(nonce).digest("hex");
}

export function tokensMatch(expectedHex: string, provided: string): boolean {
  try {
    const a = Buffer.from(expectedHex, "hex");
    const b = Buffer.from(provided.replace(/^sha256=/i, "").trim(), "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const SECRETISH = /(sk-|pk-|ghp_|xai-|Bearer\s+\S+|BEGIN [A-Z ]*PRIVATE KEY)/i;

export function authorizeMercenaryFrame(frame: MercenaryFrame, expectedToken: string): { ok: true } | { ok: false; reason: string } {
  if (!tokensMatch(expectedToken, frame.token)) return { ok: false, reason: "mercenary auth failed" };
  if (!frame.snippet || frame.snippet.length > 2_000) return { ok: false, reason: "snippet missing or too large" };
  if (SECRETISH.test(frame.snippet) || SECRETISH.test(frame.question)) {
    return { ok: false, reason: "refused: secrets must not leave the vault toward a mercenary" };
  }
  return { ok: true };
}

export function receiveMercenaryPayload(frame: MercenaryFrame, raw: string): MercenaryReply {
  const payload = raw.slice(0, 1_500);
  const context = stampTrust(
    {
      contextId: makeId("ctx"),
      kind: "agent",
      title: "mercenary-reply",
      ref: frame.frameId,
      preview: payload.slice(0, 240),
      trusted: false,
      tainted: true,
      createdAt: nowIso(),
    },
    "webhook",
  );
  return {
    frameId: frame.frameId,
    payload,
    cannotCertify: CANNOT_CERTIFY,
    tainted: true,
    trustScore: context.trustScore ?? MERCENARY_TRUST,
    context: { ...context, trustScore: MERCENARY_TRUST, tainted: true, trusted: false },
  };
}

export function mercenaryMay(tool: string): { ok: boolean; reason: string } {
  if (tool === "fs.write" || tool === "git.merge" || tool === "term.exec") {
    return { ok: false, reason: "mercenary cannot write, merge, or exec" };
  }
  if (tool.startsWith("secret")) return { ok: false, reason: "mercenary cannot touch secrets" };
  if (tool === "mission.certify" || tool === "rewind.self") {
    return { ok: false, reason: "mercenary cannotCertify and cannot rewind" };
  }
  return { ok: false, reason: "mercenary has no host tools — snippet in, payload out" };
}

export function refuseMercenaryCommand(command: string, reply: MercenaryReply): { ok: true } | { ok: false; reason: string } {
  return refuseLowTrustDerivation(command, [reply.context]);
}
