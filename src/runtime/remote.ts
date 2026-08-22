import { AJ_ERR } from "./errors.ts";

export function remoteExecute(): { ok: false; code: string; reason: string } {
  return {
    ok: false,
    code: AJ_ERR.REMOTE_EXECUTION_UNAVAILABLE,
    reason: "no RemoteProvisioner / RemoteVerifier / RemoteSecretBroker registered",
  };
}

export function firecrackerExecute(): { ok: false; code: string; reason: string } {
  return {
    ok: false,
    code: AJ_ERR.REMOTE_EXECUTION_UNAVAILABLE,
    reason: "Firecracker is research-only until KVM + kernel + rootfs exist; no local fallback",
  };
}
