/**
 * Master key is never stored next to the vault.
 * Order: AJ_MASTER_KEY (CI / operator) → /dev/shm keyring (RAM, 0600).
 * DPAPI / Windows Credential Manager are the Windows equivalent; this host is Linux.
 * Disk files under data/ajd/<op>/ are refused as a key backend.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, randomFillSync } from "node:crypto";
import { dataRoot } from "../daemon/store.ts";

export interface KeyHandle {
  keyId: string;
  key: Buffer;
  backend: "env" | "shm" | "migrated-file";
}

function shmDir(operatorId: string): string {
  const safe = operatorId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const root = process.env.AJ_KEYRING_DIR || join("/dev/shm", "aj-keyring");
  return join(root, safe);
}

export function shmSafeDir(operatorId: string): string {
  return shmDir(operatorId);
}

function keyFile(operatorId: string, keyId: string): string {
  return join(shmDir(operatorId), `${keyId}.key`);
}

/** Overwrite then zero. JS strings cannot be wiped; keep secrets on Buffer. */
export function zeroBuffer(buf: Buffer): void {
  if (!buf.length) return;
  try {
    randomFillSync(buf);
  } catch {
    /* still zero */
  }
  buf.fill(0);
}

function refuseIfBesideVault(path: string): void {
  const vaultRoot = dataRoot();
  if (path.startsWith(vaultRoot)) {
    throw new Error("refused: master key must not live beside the vault");
  }
}

export function loadOrCreateKey(operatorId: string, preferredId?: string): KeyHandle {
  const fromEnv = process.env.AJ_MASTER_KEY;
  if (fromEnv && /^[0-9a-f]{64}$/i.test(fromEnv)) {
    return { keyId: preferredId || "env", key: Buffer.from(fromEnv, "hex"), backend: "env" };
  }

  const dir = shmDir(operatorId);
  refuseIfBesideVault(dir);
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  if (preferredId && existsSync(keyFile(operatorId, preferredId))) {
    return {
      keyId: preferredId,
      key: Buffer.from(readFileSync(keyFile(operatorId, preferredId), "utf8").trim(), "hex"),
      backend: "shm",
    };
  }

  const current = join(dir, "current");
  if (existsSync(current)) {
    const keyId = readFileSync(current, "utf8").trim();
    const path = keyFile(operatorId, keyId);
    if (existsSync(path)) {
      return {
        keyId,
        key: Buffer.from(readFileSync(path, "utf8").trim(), "hex"),
        backend: "shm",
      };
    }
  }

  return mintKey(operatorId);
}

export function mintKey(operatorId: string): KeyHandle {
  const dir = shmDir(operatorId);
  refuseIfBesideVault(dir);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keyId = `k_${Date.now().toString(36)}`;
  const key = randomBytes(32);
  writeFileSync(keyFile(operatorId, keyId), key.toString("hex"), { mode: 0o600 });
  writeFileSync(join(dir, "current"), keyId, { mode: 0o600 });
  return { keyId, key, backend: "shm" };
}

export function dropKeyFile(operatorId: string, keyId: string): void {
  const path = keyFile(operatorId, keyId);
  if (existsSync(path)) unlinkSync(path);
}

export function migrateLegacyKey(operatorId: string, legacyPath: string): KeyHandle | null {
  if (!existsSync(legacyPath)) return null;
  const hex = readFileSync(legacyPath, "utf8").trim();
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const handle = mintKey(operatorId);
  writeFileSync(keyFile(operatorId, handle.keyId), hex, { mode: 0o600 });
  try {
    unlinkSync(legacyPath);
  } catch {
    /* keep going */
  }
  handle.key.fill(0);
  return loadOrCreateKey(operatorId, handle.keyId);
}

export function keyBackendName(): "env" | "shm" {
  return process.env.AJ_MASTER_KEY && /^[0-9a-f]{64}$/i.test(process.env.AJ_MASTER_KEY) ? "env" : "shm";
}
