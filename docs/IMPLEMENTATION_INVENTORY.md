# IMPLEMENTATION INVENTORY

Classified from executable code and tests on 2026-08-17. Not from README claims.

Status values: IMPLEMENTED | PARTIALLY_IMPLEMENTED | DECLARED_ONLY | BROKEN | UNSAFE | REMOVED | UNSUPPORTED

## Core Governor & Protocol

| Capability | Status | Evidence |
|---|---|---|
| AjDaemon event ledger (JSONL) | IMPLEMENTED | `src/daemon/store.ts`, `tests/runtime.test.ts`, `tests/p1-ledger-worker-evidence.test.ts` |
| Worker ledger events (Start/Done/Fail/Proof) | IMPLEMENTED | `WorkerStarted`, `WorkerExecuted`, `WorkerCompleted`, `WorkerFailed`, `ChangeProofWritten` in `store.ts` + `workers.ts` |
| Policy / tool authorization | IMPLEMENTED | `src/runtime/policy.ts`, `tests/p5-acceptance.test.ts` |
| Command allowlist | IMPLEMENTED | `src/runtime/allowlist.ts`, `tests/p5-acceptance.test.ts` |
| Sandbox Linux namespaces (fail-closed) | IMPLEMENTED | `src/runtime/sandbox.ts` returns 126 fail-closed when namespaces absent; `tests/p2-isolation-honesty.test.ts` |
| Isolated worktrees | IMPLEMENTED | `src/runtime/workspace.ts` `createWorktree`, path escape blocked, scope enforced |
| Independent final-verifier role | IMPLEMENTED | `src/runtime/engineering-agent.ts`, `tests/p3-security-patch.test.ts`, `tests/p5-acceptance.test.ts` |
| Secret vault + leases | IMPLEMENTED | `src/runtime/secrets.ts` |
| Trust / ingress HMAC | IMPLEMENTED | `src/runtime/trust.ts`, `src/runtime/ingress.ts` |
| Self-heal cap 3 + repair exhaustion | IMPLEMENTED | `src/runtime/diagnose.ts`, `tests/p0-coder-classes.test.ts` |
| Budget + one negotiation | IMPLEMENTED | `src/runtime/economy.ts`, `src/runtime/negotiate.ts` |
| WORK room (discussion ≠ write) | IMPLEMENTED | `src/runtime/work.ts` |
| Daemon recovery & ledger replay | IMPLEMENTED | `src/daemon/store.ts` `reconstruct`, `tests/p4-daemon-recovery.test.ts` |

## Master-Contract & Engineering Loop (P0–P5)

| Capability | Status | Evidence |
|---|---|---|
| RepositoryRuntime (any tree) | IMPLEMENTED | `src/runtime/repository.ts`, `tests/master-contract.test.ts` |
| Code graph queries | IMPLEMENTED | `src/runtime/code-graph.ts` over real `graph.ts` |
| ContextEngine | IMPLEMENTED | `src/runtime/context-engine.ts` |
| MissionPlanner DAG | IMPLEMENTED | `src/runtime/mission-planner.ts` |
| DAG scheduler | IMPLEMENTED | `src/runtime/scheduler.ts` |
| Capability tokens | IMPLEMENTED | `src/runtime/capability.ts` |
| Tool registry / unknown = no quota | IMPLEMENTED | `src/runtime/tool-registry.ts` |
| Model gateway fail-closed | IMPLEMENTED | `src/runtime/model-gateway.ts` — OpenAI/Anthropic/Google UNAVAILABLE |
| Instruction boundary | IMPLEMENTED | `src/runtime/instruction-boundary.ts`, `tests/p3-security-patch.test.ts`, `tests/p5-acceptance.test.ts` |
| Security watcher | IMPLEMENTED | `src/runtime/security-watch.ts` (evidence-backed findings or explicit `[]`) |
| Red team (repo attack verification) | IMPLEMENTED | `src/runtime/red-team.ts` (secret leak, injection, auth race, cmd injection) |
| ChangeProof (strict ok / failed) | IMPLEMENTED | `src/runtime/change-proof.ts` |
| Multi-class coder (P0) | IMPLEMENTED | `src/runtime/coder.ts` (missing imports, operators, exports, synthesized tests) |
| TypeScript Language Service / fallback | IMPLEMENTED | `src/runtime/lsp.ts` (real TS compiler via `typescript` package + regex fallback) |
| Test intelligence | IMPLEMENTED | `src/runtime/test-intel.ts` — detected runner only (`node:test`) |
| Parallel DAG workers | IMPLEMENTED | `src/runtime/workers.ts` isolated worktrees + ledger recording |
| Remote / cloud / Firecracker live | UNSUPPORTED | `src/runtime/remote.ts` returns `REMOTE_EXECUTION_UNAVAILABLE` |
| Live OpenAI/Anthropic/Google chat | UNSUPPORTED | gateway health `available: false`, error `PROVIDER_UNAVAILABLE` |
| VS Code Marketplace publish | UNSUPPORTED | no publisher token |
| Signed desktop installer | UNSUPPORTED | no signing certificate |
| Full IDE / DAP debugger | UNSUPPORTED | no DAP client, fail-closed |

## Playbooks

20 local playbooks in `FEATURES` (`catalog.ts` + `catalog-playbooks.ts`). They are fallback templates for scaffolded features, not substitutes for the general multi-class coder.

## Persistence

- Source of truth: `data/ajd/<operator>/ledger.jsonl` (with atomic writes, fsync, and corrupt-line immunity)
- Snapshot: `data/ajd/<operator>/snapshot.json`
- Postgres `aj_events` optional mirror (`migrations/0002_aj_ledger.sql`)

## Clients

| Client | Status |
|---|---|
| Web workstation | IMPLEMENTED (preview) |
| CLI `aj` | IMPLEMENTED |
| Lens VS Code | PARTIALLY_IMPLEMENTED (thin read-only, unpublished) |
| Tauri host | IMPLEMENTED (real `tauri::Builder` window, system tray, RegisterHotKey, WinRT toast, named pipe, DWM mica, signed updater plugin) |
