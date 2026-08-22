# ALJWHARAH ONE

نظام تشغيل وكلاء محكوم. محلي-أول. المهمة لا تُختم إلا بدليل يمكن رفضه.

Governed Agent OS. Local-first. A mission is not complete until an independent verifier PASSes.

## What it is

The Commander is not a chat window. It plans, staffs contracted agents, isolates worktrees, and cannot certify its own mission.

- **ONE** — outcome-directed execution
- **WORK** — live war-room of real agents (proposal / objection / evidence / approval)

Models are engines. `ajd` is the governor.

## Honest status (2026-08-22)

Active plan: [`docs/REPAIR-PLAN-2026-08-22.md`](docs/REPAIR-PLAN-2026-08-22.md)

| Surface | Status |
|---|---|
| Local coder (`aj-local`) on a real repo | Working — operator/import/export repairs + tests |
| Ledger, policy, independent verifier | Working |
| Linux namespace jail | Working when `unshare`/`chroot` exist; fail-closed otherwise |
| Web workstation | Preview |
| Windows Tauri installer | Not shipped |
| Live OpenAI / Anthropic / Firecracker | Unsupported (fail-closed) |

## Commands

```bash
npm test          # runtime contracts
npm run aj -- run "Fix add() so it sums"
npm run dev       # workstation preview
```

See `docs/ARCHITECTURE.md` and `docs/SECURITY.md`.
