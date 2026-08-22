# Phase report (truth = runtime)

**Active campaign:** [`REPAIR-PLAN-2026-08-22.md`](./REPAIR-PLAN-2026-08-22.md)  
Older narrative reports are archive, not approval.

## Repair wave 0 (2026-08-22)

| Item | Status |
|---|---|
| `aj-local` deterministic coder (operator / import / export) | IMPLEMENTED · TESTED (P5-1, general-engineering) |
| Sandbox invoked via `sh enter.sh` (no +x required) | IMPLEMENTED · TESTED |
| Product copy is Agent OS, not "code editor" | IMPLEMENTED |
| Package name `aljwharah-one` | IMPLEMENTED |
| AWS account ID removed from tree | IMPLEMENTED |
| CI workflow | IMPLEMENTED |
| Health / computer-use missions COMPLETE | OPEN — wave 1 |
| Windows native host tests | OPEN — windows runner or skip on Linux |

## Hardening-next (prior)

| Item | Status |
|---|---|
| Buffer wipe: randomFillSync then fill(0); useSecretBuffer | IMPLEMENTED · TESTED |
| JS strings still used for HTTP Authorization | MITIGATED |
| setpriv --no-new-privs in jail | IMPLEMENTED |
| Full seccomp-BPF deny list | NOT loaded (no libseccomp) |
| Ledger writer micro-process | IMPLEMENTED |
| Time-travel rewindToSeq | IMPLEMENTED · TESTED |
| Tauri IPC allowlist | IMPLEMENTED |
| OverlayFS CoW ephemeral jail | IMPLEMENTED · TESTED |
