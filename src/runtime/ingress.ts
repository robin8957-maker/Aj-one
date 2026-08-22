/**
 * Authenticated external event ingress.
 * Nothing reaches Commander until signature, skew, size, source policy,
 * rate limit, dedup, mapping, and automation policy pass.
 */
import { createHash } from "node:crypto";
import type { AutomationRecord, IngressRecord } from "../protocol/index.ts";
import { makeId, nowIso } from "../protocol/index.ts";
import { hmacHex, kmsHmac, signaturesMatch } from "./secrets.ts";

const SKEW_MS = 5 * 60_000;
export const MAX_INGRESS_BODY_BYTES = 64 * 1024;
export const INGRESS_RATE_WINDOW_MS = 60_000;
export const INGRESS_RATE_MAX = 12;

export const ALLOWED_INGRESS_SOURCES = new Set([
  "github",
  "gitlab",
  "ci",
  "mission-control",
  "aj-cli",
  "dependabot",
]);

export interface IngressInput {
  source: string;
  event: string;
  timestamp: string;
  signature: string;
  rawBody: string;
  mode?: "aj" | "github";
  deliveryId?: string;
}

export interface IngressContext {
  deliveries?: Record<string, { at: string; ingressId: string; missionId?: string }>;
  recent?: IngressRecord[];
}

export interface IngressDecision {
  record: IngressRecord;
  trigger?: AutomationRecord["trigger"];
  automation?: AutomationRecord;
  duplicate?: boolean;
}

const EVENT_MAP: Record<string, AutomationRecord["trigger"]> = {
  "ci-failure": "ci-failure",
  workflow_run: "ci-failure",
  check_suite: "ci-failure",
  check_run: "ci-failure",
  "security-alert": "security-alert",
  dependabot_alert: "security-alert",
  secret_scanning_alert: "security-alert",
  schedule: "schedule",
  "dependency-update": "dependency-update",
  dependabot: "dependency-update",
};

export function computeDeliveryId(input: IngressInput): string {
  if (input.deliveryId) return `ext:${input.deliveryId}`;
  return `sig:${createHash("sha256")
    .update(input.source)
    .update("\n")
    .update(input.event)
    .update("\n")
    .update(input.timestamp)
    .update("\n")
    .update(input.signature ?? "")
    .update("\n")
    .update(input.rawBody ?? "")
    .digest("hex")
    .slice(0, 32)}`;
}

export function mapIngressEvent(event: string, body: unknown): AutomationRecord["trigger"] | null {
  const key = event.toLowerCase();
  if (key === "workflow_run" || key === "check_suite" || key === "check_run") {
    const conclusion =
      (body && typeof body === "object" && "conclusion" in body
        ? String((body as { conclusion?: string }).conclusion)
        : "") ||
      (body && typeof body === "object" && "workflow_run" in body
        ? String((body as { workflow_run?: { conclusion?: string } }).workflow_run?.conclusion ?? "")
        : "");
    if (conclusion && conclusion !== "failure" && conclusion !== "timed_out") return null;
  }
  return EVENT_MAP[key] ?? null;
}

function sourcePolicyReason(input: IngressInput): string | null {
  const source = (input.source || "").toLowerCase();
  if (!source || !ALLOWED_INGRESS_SOURCES.has(source)) return "unknown source — fail closed";
  if ((source === "mission-control" || source === "aj-cli") && input.mode === "github") {
    return "source policy: operator sources use AJ signature mode";
  }
  if (source === "github" && input.mode && input.mode !== "github" && input.mode !== "aj") {
    return "source policy: github accepts github or AJ signatures only";
  }
  return null;
}

export function decideIngress(
  operatorId: string,
  input: IngressInput,
  automations: AutomationRecord[],
  ctx: IngressContext = {},
): IngressDecision {
  const ingressId = makeId("ing");
  const at = nowIso();
  const deliveryId = computeDeliveryId(input);
  const deny = (reason: string, extra?: Partial<IngressRecord>): IngressDecision => ({
    record: {
      ingressId,
      source: input.source || "unknown",
      event: input.event || "unknown",
      accepted: false,
      reason,
      deliveryId,
      at,
      ...extra,
    },
  });

  const sourceDenied = sourcePolicyReason(input);
  if (sourceDenied) return deny(sourceDenied);

  if (!input.signature) return deny("missing signature — fail closed");
  if (!input.event) return deny("missing event — fail closed");

  const bodyBytes = Buffer.byteLength(input.rawBody ?? "", "utf8");
  if (bodyBytes > MAX_INGRESS_BODY_BYTES) {
    return deny(`body exceeds ${MAX_INGRESS_BODY_BYTES} byte limit`);
  }

  const ts = Date.parse(input.timestamp);
  if (!Number.isFinite(ts)) return deny("missing or invalid timestamp");
  if (Math.abs(Date.now() - ts) > SKEW_MS) return deny("timestamp outside 5m skew window");

  const windowStart = Date.now() - INGRESS_RATE_WINDOW_MS;
  const recentForSource = (ctx.recent ?? []).filter(
    (r) => r.source === input.source && Date.parse(r.at) >= windowStart,
  );
  if (recentForSource.length >= INGRESS_RATE_MAX) {
    return deny(`rate limited for source ${input.source}`);
  }

  const signedPayload = input.mode === "github" ? input.rawBody : `${input.timestamp}.${input.rawBody}`;
  const hmac = kmsHmac(operatorId, "aj.ingress.hmac", signedPayload);
  if (!hmac.ok) return deny(`ingress hmac unavailable: ${hmac.reason}`);
  if (!signaturesMatch(hmac.hex, input.signature)) return deny("signature mismatch — fail closed");

  const prior = ctx.deliveries?.[deliveryId];
  if (prior) {
    return {
      record: {
        ingressId,
        source: input.source,
        event: input.event,
        accepted: false,
        reason: "duplicate delivery — same signed event will not start a second mission",
        deliveryId,
        automationId: undefined,
        missionId: prior.missionId,
        at,
      },
      duplicate: true,
    };
  }

  let body: unknown = {};
  try {
    body = input.rawBody ? JSON.parse(input.rawBody) : {};
  } catch {
    return deny("body is not JSON");
  }

  const trigger = mapIngressEvent(input.event, body);
  if (!trigger) return deny(`event '${input.event}' is not mapped to an automation`);

  const automation = automations.find((a) => a.trigger === trigger && a.enabled);
  if (!automation) return deny(`no enabled automation for trigger ${trigger}`);
  if (automation.permissionCeiling <= 0) return deny("automation permission ceiling is zero");
  if (automation.budgetUsd < 0) return deny("automation budget invalid");

  return {
    record: {
      ingressId,
      source: input.source || "external",
      event: input.event,
      accepted: true,
      reason: `policy passed → ${automation.title}`,
      automationId: automation.automationId,
      deliveryId,
      at,
    },
    trigger,
    automation,
  };
}

export function signAjEvent(secret: string, timestamp: string, rawBody: string): string {
  return `sha256=${hmacHex(secret, `${timestamp}.${rawBody}`)}`;
}

export function signOperatorEvent(
  operatorId: string,
  timestamp: string,
  rawBody: string,
): { ok: true; signature: string } | { ok: false; reason: string } {
  const signed = kmsHmac(operatorId, "aj.ingress.hmac", `${timestamp}.${rawBody}`);
  if (!signed.ok) return signed;
  return { ok: true, signature: `sha256=${signed.hex}` };
}
