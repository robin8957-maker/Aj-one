/**
 * AjSecretsBroker — sealed vault, isolated keyring, short leases.
 * Agents get a lease handle, not a raw secret forever.
 * Use: Agent → lease → scoped capability → useSecret() → expire/revoke.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentInstance, AgentRole, SecretLeaseMeta, SecretMeta, SecretScope } from "../protocol/index.ts";
import { makeId, nowIso } from "../protocol/index.ts";
import { ensureOperatorDir, operatorDir } from "../daemon/store.ts";
import { dropKeyFile, loadOrCreateKey, migrateLegacyKey, mintKey, zeroBuffer } from "./keyring.ts";

const ALGO = "aes-256-gcm";
const DEFAULT_LEASE_MS = 5 * 60_000;

interface VaultEntry {
  meta: SecretMeta;
  iv: string;
  tag: string;
  data: string;
}

interface VaultFile {
  version: 2;
  keyId: string;
  secrets: Record<string, VaultEntry>;
  leases: SecretLeaseMeta[];
}

function vaultPath(operatorId: string): string {
  return join(operatorDir(operatorId), "secrets.vault.json");
}

function legacyKeyPath(operatorId: string): string {
  return join(operatorDir(operatorId), ".broker-key");
}

function loadVault(operatorId: string): VaultFile {
  const path = vaultPath(operatorId);
  if (!existsSync(path)) {
    const handle = loadOrCreateKey(operatorId);
    const keyId = handle.keyId;
    zeroBuffer(handle.key);
    return { version: 2, keyId, secrets: {}, leases: [] };
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as VaultFile & { version?: number; keyId?: string };
    if (!raw.keyId) {
      const migrated = migrateLegacyKey(operatorId, legacyKeyPath(operatorId));
      const handle = migrated ?? loadOrCreateKey(operatorId);
      raw.keyId = handle.keyId;
      raw.version = 2;
      zeroBuffer(handle.key);
    }
    return { version: 2, keyId: raw.keyId, secrets: raw.secrets ?? {}, leases: raw.leases ?? [] };
  } catch {
    const handle = loadOrCreateKey(operatorId);
    const keyId = handle.keyId;
    zeroBuffer(handle.key);
    return { version: 2, keyId, secrets: {}, leases: [] };
  }
}

function saveVault(operatorId: string, vault: VaultFile): void {
  ensureOperatorDir(operatorId);
  mkdirSync(operatorDir(operatorId), { recursive: true });
  writeFileSync(vaultPath(operatorId), JSON.stringify(vault), { mode: 0o600 });
}

function openKey(operatorId: string, vault: VaultFile) {
  if (existsSync(legacyKeyPath(operatorId)) && !vault.keyId) {
    migrateLegacyKey(operatorId, legacyKeyPath(operatorId));
  }
  return loadOrCreateKey(operatorId, vault.keyId);
}

function seal(key: Buffer, plaintext: string): { iv: string; tag: string; data: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString("hex"), tag: tag.toString("hex"), data: enc.toString("hex") };
}

function openToBuffer(key: Buffer, entry: VaultEntry): Buffer {
  const dec = createDecipheriv(ALGO, key, Buffer.from(entry.iv, "hex"));
  dec.setAuthTag(Buffer.from(entry.tag, "hex"));
  return Buffer.concat([dec.update(Buffer.from(entry.data, "hex")), dec.final()]);
}

function redact(value: string): string {
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

function refreshStatus(meta: SecretMeta, now = Date.now()): SecretMeta {
  if (meta.revokedAt) return { ...meta, status: "revoked" };
  if (Date.parse(meta.expiresAt) <= now) return { ...meta, status: "expired" };
  return { ...meta, status: "active" };
}

export function listSecretMeta(operatorId: string): SecretMeta[] {
  const vault = loadVault(operatorId);
  return Object.values(vault.secrets).map((e) => refreshStatus(e.meta));
}

export function putSecret(
  operatorId: string,
  input: { name: string; value: string; ttlMs?: number; scope?: SecretScope; secretId?: string },
): SecretMeta {
  const vault = loadVault(operatorId);
  const handle = openKey(operatorId, vault);
  try {
    const existing = Object.values(vault.secrets).find((e) => e.meta.name === input.name && e.meta.status !== "revoked");
    const secretId = input.secretId ?? existing?.meta.secretId ?? makeId("sec");
    const ttlMs = input.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
    const meta: SecretMeta = {
      secretId,
      name: input.name,
      status: "active",
      scope: input.scope ?? {},
      ttlMs,
      createdAt: existing?.meta.createdAt ?? nowIso(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      leaseCount: existing?.meta.leaseCount ?? 0,
      lastLeaseAt: existing?.meta.lastLeaseAt,
    };
    vault.keyId = handle.keyId;
    vault.secrets[secretId] = { meta, ...seal(handle.key, input.value) };
    saveVault(operatorId, vault);
    return meta;
  } finally {
    zeroBuffer(handle.key);
  }
}

export function revokeSecret(operatorId: string, secretId: string): SecretMeta | null {
  const vault = loadVault(operatorId);
  const entry = vault.secrets[secretId];
  if (!entry) return null;
  entry.meta.revokedAt = nowIso();
  entry.meta.status = "revoked";
  for (const lease of vault.leases) {
    if (lease.secretId === secretId && !lease.revokedAt) lease.revokedAt = entry.meta.revokedAt;
  }
  saveVault(operatorId, vault);
  return entry.meta;
}

export function revokeLease(operatorId: string, leaseId: string): boolean {
  const vault = loadVault(operatorId);
  const lease = vault.leases.find((l) => l.leaseId === leaseId);
  if (!lease) return false;
  lease.revokedAt = nowIso();
  saveVault(operatorId, vault);
  return true;
}

export type LeaseResult = { ok: true; lease: SecretLeaseMeta } | { ok: false; reason: string };

function authorizeLease(
  opts: {
    name: string;
    agent: Pick<AgentInstance, "agentId" | "role" | "missionId" | "permissions">;
    asDaemon?: boolean;
  },
  meta: SecretMeta,
): string | null {
  const scope = meta.scope ?? {};
  if (opts.asDaemon) return null;
  if (scope.tools?.includes("ingress.verify") && (scope.roles?.length ?? 0) === 0 && (scope.agents?.length ?? 0) === 0) {
    return "secret is daemon-only (ingress)";
  }
  if (scope.roles?.length && !scope.roles.includes(opts.agent.role as AgentRole)) {
    return `role ${opts.agent.role} not in secret scope`;
  }
  if (scope.agents?.length && !scope.agents.includes(opts.agent.agentId)) return "agent not in secret scope";
  if (scope.missions?.length && !scope.missions.includes(opts.agent.missionId)) return "mission not in secret scope";
  if (!scope.roles?.length && !scope.agents?.length && !scope.missions?.length && opts.agent.permissions.secrets !== "broker") {
    return "unscoped secret requires broker permission";
  }
  return null;
}

export function leaseSecret(
  operatorId: string,
  opts: {
    name: string;
    agent: Pick<AgentInstance, "agentId" | "role" | "missionId" | "permissions">;
    ttlMs?: number;
    asDaemon?: boolean;
  },
): LeaseResult {
  const vault = loadVault(operatorId);
  const entry = Object.values(vault.secrets).find((e) => e.meta.name === opts.name);
  if (!entry) return { ok: false, reason: `unknown secret '${opts.name}'` };
  const meta = refreshStatus(entry.meta);
  entry.meta = meta;
  if (meta.status === "revoked") return { ok: false, reason: "secret revoked" };
  if (meta.status === "expired") return { ok: false, reason: "secret expired" };
  const denied = authorizeLease(opts, meta);
  if (denied) return { ok: false, reason: denied };

  const handle = openKey(operatorId, vault);
  let redacted = "••••";
  try {
    const buf = openToBuffer(handle.key, entry);
    redacted = redact(buf.toString("utf8"));
    zeroBuffer(buf);
  } catch {
    zeroBuffer(handle.key);
    return { ok: false, reason: "vault unseal failed" };
  }
  zeroBuffer(handle.key);

  const remaining = Date.parse(meta.expiresAt) - Date.now();
  const leaseMs = Math.min(opts.ttlMs ?? DEFAULT_LEASE_MS, Math.max(1_000, remaining));
  const lease: SecretLeaseMeta = {
    leaseId: makeId("lease"),
    secretId: meta.secretId,
    secretName: meta.name,
    agentId: opts.asDaemon ? "ajd" : opts.agent.agentId,
    missionId: opts.agent.missionId,
    expiresAt: new Date(Date.now() + leaseMs).toISOString(),
    redacted,
    useCount: 0,
  };
  vault.leases.push(lease);
  entry.meta.leaseCount += 1;
  entry.meta.lastLeaseAt = nowIso();
  saveVault(operatorId, vault);
  return { ok: true, lease };
}

/** Decrypt for one callback, then wipe. Never log the value. */
export function useSecret<T>(
  operatorId: string,
  leaseId: string,
  fn: (value: string) => T,
): { ok: true; result: T } | { ok: false; reason: string } {
  const vault = loadVault(operatorId);
  const lease = vault.leases.find((l) => l.leaseId === leaseId);
  if (!lease) return { ok: false, reason: "unknown lease" };
  if (lease.revokedAt) return { ok: false, reason: "lease revoked" };
  if (Date.parse(lease.expiresAt) <= Date.now()) return { ok: false, reason: "lease expired" };
  const entry = vault.secrets[lease.secretId];
  if (!entry) return { ok: false, reason: "secret missing" };
  if (refreshStatus(entry.meta).status !== "active") return { ok: false, reason: "secret not active" };
  const handle = openKey(operatorId, vault);
  let buf: Buffer | null = null;
  try {
    buf = openToBuffer(handle.key, entry);
    const value = buf.toString("utf8");
    const result = fn(value);
    lease.useCount = (lease.useCount ?? 0) + 1;
    lease.lastUsedAt = nowIso();
    saveVault(operatorId, vault);
    return { ok: true, result };
  } catch {
    return { ok: false, reason: "useSecret failed" };
  } finally {
    if (buf) zeroBuffer(buf);
    zeroBuffer(handle.key);
  }
}

/** Decrypt into a Buffer, never a JS string. Caller must zero the buffer. */
export function useSecretBuffer(
  operatorId: string,
  leaseId: string,
  fn: (value: Buffer) => void,
): { ok: true } | { ok: false; reason: string } {
  const vault = loadVault(operatorId);
  const lease = vault.leases.find((l) => l.leaseId === leaseId);
  if (!lease) return { ok: false, reason: "unknown lease" };
  if (lease.revokedAt) return { ok: false, reason: "lease revoked" };
  if (Date.parse(lease.expiresAt) <= Date.now()) return { ok: false, reason: "lease expired" };
  const entry = vault.secrets[lease.secretId];
  if (!entry) return { ok: false, reason: "secret missing" };
  if (refreshStatus(entry.meta).status !== "active") return { ok: false, reason: "secret not active" };
  const handle = openKey(operatorId, vault);
  let buf: Buffer | null = null;
  try {
    buf = openToBuffer(handle.key, entry);
    fn(buf);
    lease.useCount = (lease.useCount ?? 0) + 1;
    lease.lastUsedAt = nowIso();
    saveVault(operatorId, vault);
    return { ok: true };
  } catch {
    return { ok: false, reason: "useSecretBuffer failed" };
  } finally {
    if (buf) zeroBuffer(buf);
    zeroBuffer(handle.key);
  }
}

export function withDaemonSecret<T>(
  operatorId: string,
  name: string,
  fn: (value: string) => T,
): { ok: true; result: T } | { ok: false; reason: string } {
  const dummy = {
    agentId: "ajd",
    role: "commander" as AgentRole,
    missionId: "daemon",
    permissions: {
      filesystem: "none" as const,
      terminal: "none" as const,
      browser: "none" as const,
      network: "none" as const,
      git: "none" as const,
      secrets: "broker" as const,
      spawnAgents: false,
      maxChildAutonomy: 0,
    },
  };
  const leased = leaseSecret(operatorId, { name, agent: dummy, asDaemon: true, ttlMs: 15_000 });
  if (!leased.ok) return leased;
  const used = useSecret(operatorId, leased.lease.leaseId, fn);
  revokeLease(operatorId, leased.lease.leaseId);
  return used;
}

export function rotateMasterKey(operatorId: string): { keyId: string; resealed: number } {
  const vault = loadVault(operatorId);
  const old = openKey(operatorId, vault);
  const next = mintKey(operatorId);
  let resealed = 0;
  try {
    for (const entry of Object.values(vault.secrets)) {
      if (refreshStatus(entry.meta).status === "revoked") continue;
      const buf = openToBuffer(old.key, entry);
      const sealed = seal(next.key, buf.toString("utf8"));
      zeroBuffer(buf);
      vault.secrets[entry.meta.secretId] = { meta: entry.meta, ...sealed };
      resealed += 1;
    }
    const oldId = vault.keyId;
    vault.keyId = next.keyId;
    saveVault(operatorId, vault);
    if (oldId && oldId !== next.keyId) dropKeyFile(operatorId, oldId);
    return { keyId: next.keyId, resealed };
  } finally {
    zeroBuffer(old.key);
    zeroBuffer(next.key);
  }
}

export function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** KMS: HMAC without ever handing the plaintext to the caller. */
export function kmsHmac(
  operatorId: string,
  name: string,
  payload: string,
): { ok: true; hex: string } | { ok: false; reason: string } {
  const vault = loadVault(operatorId);
  const entry = Object.values(vault.secrets).find((e) => e.meta.name === name);
  if (!entry) return { ok: false, reason: `unknown secret '${name}'` };
  if (refreshStatus(entry.meta).status !== "active") return { ok: false, reason: "secret not active" };
  const handle = openKey(operatorId, vault);
  let buf: Buffer | null = null;
  try {
    buf = openToBuffer(handle.key, entry);
    const hex = createHmac("sha256", buf).update(payload).digest("hex");
    return { ok: true, hex };
  } catch {
    return { ok: false, reason: "kms hmac failed" };
  } finally {
    if (buf) zeroBuffer(buf);
    zeroBuffer(handle.key);
  }
}

export function signaturesMatch(expectedHex: string, provided: string): boolean {
  const clean = provided.replace(/^sha256=/i, "").trim();
  try {
    const a = Buffer.from(expectedHex, "hex");
    const b = Buffer.from(clean, "hex");
    if (a.length !== b.length) {
      zeroBuffer(a);
      zeroBuffer(b);
      return false;
    }
    const ok = timingSafeEqual(a, b);
    zeroBuffer(a);
    zeroBuffer(b);
    return ok;
  } catch {
    return false;
  }
}

export function redactSecretsFromText(text: string, extras: string[] = []): string {
  let out = text;
  for (const extra of extras) {
    if (extra.length >= 6) out = out.split(extra).join("[redacted]");
  }
  out = out.replace(/nst_[A-Za-z0-9_-]{8,}/g, "[redacted]");
  out = out.replace(/(hmac|secret|token|password|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  return out;
}

export function seedOperatorSecrets(operatorId: string): SecretMeta[] {
  const existing = listSecretMeta(operatorId);
  const out: SecretMeta[] = [];
  if (!existing.some((s) => s.name === "aj.ingress.hmac" && s.status === "active")) {
    out.push(
      putSecret(operatorId, {
        name: "aj.ingress.hmac",
        value: process.env.AJ_INGRESS_SECRET || randomBytes(24).toString("hex"),
        ttlMs: 30 * 24 * 60 * 60 * 1000,
        scope: { tools: ["ingress.verify"] },
      }),
    );
  }
  if (!existing.some((s) => s.name === "northstar.demo" && s.status === "active")) {
    out.push(
      putSecret(operatorId, {
        name: "northstar.demo",
        value: "nst_demo_not_a_production_secret",
        ttlMs: 7 * 24 * 60 * 60 * 1000,
        scope: { roles: ["security-reviewer"] },
      }),
    );
  }
  return out;
}

export function leaseIsLive(lease: SecretLeaseMeta, now = Date.now()): boolean {
  if (lease.revokedAt) return false;
  return Date.parse(lease.expiresAt) > now;
}

export function currentKeyId(operatorId: string): string {
  return loadVault(operatorId).keyId;
}

export interface SecretAccessEntry {
  agentId: string;
  toolName: string;
  timestamp: number;
  durationMs: number;
  cleaned: boolean;
}

const ACCESS_LOG_MAX = 1000;
const accessLog: SecretAccessEntry[] = [];

export function auditSecretAccess(agentId: string, toolName: string, durationMs: number, cleaned = true): void {
  accessLog.push({ agentId, toolName, timestamp: Date.now(), durationMs, cleaned });
  if (accessLog.length > ACCESS_LOG_MAX) accessLog.shift();
}

export function listSecretAccessLog(): readonly SecretAccessEntry[] {
  return accessLog;
}

export function resetSecretAccessLog(): void {
  accessLog.length = 0;
}

export function verifySecretCleaned(buffer: Buffer): boolean {
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] !== 0) return false;
  }
  return true;
}

export interface SecretHeaderLease {
  headers: { Authorization: string; "X-Secret-Lifecycle": "temporary" };
  cleanup: () => void;
}

/**
 * Mint HTTP headers from a lease without leaving a plaintext UTF-8 secret
 * in the Authorization value. Caller MUST invoke cleanup().
 */
export function mintSecretHeaders(
  operatorId: string,
  leaseId: string,
  agentId = "unknown",
  toolName = "http",
): { ok: true; lease: SecretHeaderLease } | { ok: false; reason: string } {
  const started = Date.now();
  let headers: SecretHeaderLease["headers"] | null = null;
  const used = useSecretBuffer(operatorId, leaseId, (buf) => {
    headers = {
      Authorization: `Bearer ${buf.toString("base64")}`,
      "X-Secret-Lifecycle": "temporary",
    };
  });
  if (!used.ok || !headers) {
    auditSecretAccess(agentId, toolName, Date.now() - started, false);
    return used.ok ? { ok: false, reason: "header mint failed" } : used;
  }
  auditSecretAccess(agentId, toolName, Date.now() - started, true);
  return {
    ok: true,
    lease: {
      headers,
      cleanup: () => {
        headers = {
          Authorization: "Bearer [expired]",
          "X-Secret-Lifecycle": "temporary",
        };
      },
    },
  };
}
