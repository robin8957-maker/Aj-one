import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { shmSafeDir } from "./keyring.ts";

export interface AuditSignature {
  alg: "ed25519";
  publicKey: string;
  signature: string;
}

function keyDir(operatorId: string): string {
  return join(shmSafeDir(operatorId), "audit");
}

export function loadOrCreateAuditKeys(operatorId: string): { publicKey: string; privateKey: string } {
  const dir = keyDir(operatorId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const pub = join(dir, "audit.pub");
  const priv = join(dir, "audit.pem");
  if (existsSync(pub) && existsSync(priv)) {
    return { publicKey: readFileSync(pub, "utf8"), privateKey: readFileSync(priv, "utf8") };
  }
  const pair = generateKeyPairSync("ed25519");
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  writeFileSync(pub, publicKey, { mode: 0o600 });
  writeFileSync(priv, privateKey, { mode: 0o600 });
  return { publicKey, privateKey };
}

export function signAuditPayload(operatorId: string, canonical: string): AuditSignature {
  const keys = loadOrCreateAuditKeys(operatorId);
  const signature = sign(null, Buffer.from(canonical), keys.privateKey).toString("base64");
  return { alg: "ed25519", publicKey: keys.publicKey, signature };
}

export function verifyAuditPayload(canonical: string, sig: AuditSignature): boolean {
  try {
    return verify(null, Buffer.from(canonical), sig.publicKey, Buffer.from(sig.signature, "base64"));
  } catch {
    return false;
  }
}
