# AUDIT

Ledger: append-only JSONL under `data/ajd/<operator>/`.
ChangeProof: `src/runtime/change-proof.ts`.
Signed audit packages require a configured key. There is no default-dev-key.
Secrets are excluded from proofs and events.
