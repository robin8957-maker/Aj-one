import { spawnSync } from "node:child_process";
import {
  type ConnectionRecord,
  type ConnectionVendor,
  CONNECTOR_CATALOG,
} from "../protocol/connections.ts";
import { listSecretMeta, putSecret, revokeSecret } from "./secrets.ts";
import { makeId, nowIso } from "../protocol/index.ts";

export function seedConnections(operatorId: string, existing?: Record<string, ConnectionRecord>): Record<string, ConnectionRecord> {
  const next = { ...(existing ?? {}) };
  for (const item of CONNECTOR_CATALOG) {
    const found = Object.values(next).find((c) => c.vendor === item.vendor);
    if (found) continue;
    const rec: ConnectionRecord = {
      connectionId: makeId("cn"),
      family: item.family,
      vendor: item.vendor,
      title: item.title,
      blurb: item.blurb,
      status: item.vendor === "aj-local" ? "ready" : "disconnected",
      enabled: item.vendor === "aj-local",
      endpoint: item.defaultEndpoint,
      secretName: item.secretName,
      capabilities: item.capabilities,
    };
    next[rec.connectionId] = rec;
  }
  void operatorId;
  return next;
}

export function probeEndpoint(url: string): { ok: boolean; detail: string } {
  const res = spawnSync("curl", ["-sS", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "1", url], {
    encoding: "utf8",
  });
  const code = (res.stdout || "").trim();
  if (res.status === 0 && /^[23]/.test(code)) return { ok: true, detail: `HTTP ${code}` };
  return { ok: false, detail: res.stderr?.slice(0, 160) || `HTTP ${code || "unreachable"}` };
}

export function refreshConnection(
  operatorId: string,
  rec: ConnectionRecord,
  localOnly: boolean,
): ConnectionRecord {
  const item = CONNECTOR_CATALOG.find((c) => c.vendor === rec.vendor);
  if (!item) return rec;
  if (localOnly && !item.local) {
    return { ...rec, status: "denied", lastError: "Local-only mode forbids cloud connectors", lastProbeAt: nowIso() };
  }
  if (item.vendor === "aj-local") {
    return { ...rec, status: "ready", enabled: true, lastError: undefined, lastProbeAt: nowIso() };
  }
  if (item.local && rec.endpoint) {
    const probe = probeEndpoint(rec.endpoint);
    return {
      ...rec,
      status: probe.ok ? "ready" : "error",
      enabled: probe.ok ? rec.enabled || probe.ok : rec.enabled,
      lastError: probe.ok ? undefined : probe.detail,
      lastProbeAt: nowIso(),
    };
  }
  const secret = rec.secretName
    ? listSecretMeta(operatorId).find((s) => s.name === rec.secretName && s.status === "active")
    : undefined;
  if (rec.vendor === "xai") {
    const flagged = process.env.AJ_USE_GROK === "1" && Boolean(process.env.XAI_API_KEY || secret);
    return {
      ...rec,
      status: flagged ? "ready" : "disconnected",
      lastError: flagged ? undefined : "Needs broker secret and AJ_USE_GROK=1. Never auto-selected.",
      lastProbeAt: nowIso(),
    };
  }
  if (secret) {
    return { ...rec, status: rec.enabled ? "ready" : "disconnected", lastError: undefined, lastProbeAt: nowIso() };
  }
  return { ...rec, status: "disconnected", lastError: rec.secretName ? "No sealed credential" : "Not connected", lastProbeAt: nowIso() };
}

export function connectVendor(
  operatorId: string,
  connections: Record<string, ConnectionRecord>,
  vendor: ConnectionVendor,
  secretValue?: string,
  localOnly = false,
): Record<string, ConnectionRecord> {
  const rec = Object.values(connections).find((c) => c.vendor === vendor);
  if (!rec) return connections;
  const item = CONNECTOR_CATALOG.find((c) => c.vendor === vendor)!;
  if (localOnly && !item.local) {
    rec.status = "denied";
    rec.lastError = "Local-only mode";
    return connections;
  }
  if (secretValue && rec.secretName) {
    putSecret(operatorId, { name: rec.secretName, value: secretValue, ttlMs: 30 * 24 * 60 * 60 * 1000 });
  }
  rec.enabled = true;
  const next = refreshConnection(operatorId, rec, localOnly);
  connections[rec.connectionId] = next;
  return connections;
}

export function disconnectVendor(
  operatorId: string,
  connections: Record<string, ConnectionRecord>,
  vendor: ConnectionVendor,
): Record<string, ConnectionRecord> {
  const rec = Object.values(connections).find((c) => c.vendor === vendor);
  if (!rec || rec.vendor === "aj-local") return connections;
  if (rec.secretName) {
    const meta = listSecretMeta(operatorId).find((s) => s.name === rec.secretName);
    if (meta) revokeSecret(operatorId, meta.secretId);
  }
  rec.enabled = false;
  rec.status = "disconnected";
  rec.lastError = undefined;
  rec.lastProbeAt = nowIso();
  return connections;
}

export function readyProviders(connections: Record<string, ConnectionRecord>, localOnly: boolean): ConnectionVendor[] {
  return Object.values(connections)
    .filter((c) => c.status === "ready" && c.enabled && (!localOnly || CONNECTOR_CATALOG.find((x) => x.vendor === c.vendor)?.local))
    .map((c) => c.vendor);
}
