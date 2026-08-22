# Phase report (truth = runtime)

## Hardening-next

| Item | Status |
|---|---|
| Buffer wipe: randomFillSync then fill(0); useSecretBuffer | IMPLEMENTED · TESTED |
| JS strings still used for HTTP Authorization | MITIGATED — mintSecretHeaders uses base64; plaintext UTF-8 not placed in headers. V8 strings remain unwipeable. |
| setpriv --no-new-privs in jail | IMPLEMENTED |
| Full seccomp-BPF deny list | NOT loaded (no libseccomp) |
| Ledger writer micro-process (dual-write + unref) | IMPLEMENTED |
| Time-travel rewindToSeq | IMPLEMENTED · TESTED |
| Tauri IPC allowlist (tainted paths denied) | IMPLEMENTED · cargo test |
| PTY TERM=dumb + ANSI strip + /escape TUI | IMPLEMENTED · TESTED |
| OverlayFS CoW ephemeral jail | IMPLEMENTED · TESTED (fallback copy) |
| Budget-aware local engine note | IMPLEMENTED · TESTED |
| Forensic markdown after 3 failed heals | IMPLEMENTED · TESTED |
| Ed25519 signed audit bundle | IMPLEMENTED · TESTED |
| Trust decay on npm/http imports | IMPLEMENTED · TESTED |
| What-if policy hints on dry-run denies | IMPLEMENTED · TESTED |
