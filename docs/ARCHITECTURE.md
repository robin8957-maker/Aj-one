# ALJWHARAH ONE

Standalone Agent Operating System. Not a replacement for ALJWHARAH IDE.

```
USER INTENT
  → AJ COMMANDER
  → MISSION (event-sourced)
  → PLAN + TASK DAG
  → REAL SPECIALIZED AGENTS
  → ISOLATED WORKTREES
  → TOOL GATEWAY + POLICY
  → EVIDENCE
  → INDEPENDENT FINAL VERIFIER
  → MEMORY / DECISION UPDATE
```

## Boundary

- **ALJWHARAH ONE** — this product. Mission Control + `ajd` daemon.
- **ALJWHARAH IDE** — remains an independent Code-OSS product. No IDE files were moved or rewritten. No shared runtime dependency was introduced. Protocol types live here as `@aljwharah/protocol` (currently `src/protocol`) for later convergence.

No ALJWHARAH IDE repository was present in this workspace or as a public extractable source. Contracts were authored here rather than forked.

## Process model

The desktop/web shell is thin. It renders Mission Control and sends commands.

`AjDaemon` (`src/daemon/ajd.ts`) owns:

- missions, agents, contracts, DAG
- tool gateway and policy
- worktrees and merge
- ledger + snapshots
- verification

Persistence is an append-only JSONL ledger plus periodic snapshots under `data/ajd/<operator>/`. Restart reconstructs world state by folding the ledger.

Local-first: unsigned preview operators use `local-operator`. Deployed Neon environments require a signed-in identity.

## What is a real agent

Every agent has: identity, persistent state, contract, authority, budget, environment, tools, heartbeat, lifecycle, artifacts, failure state, cancellation, audit events. A hidden model call is not an agent.

## Completion

`MISSION COMPLETE` is emitted only after `AjFinalVerifier` PASSes. Implementation agents cannot certify themselves.

## Computer Use + MCP + Intelligence

- **Browser Agent** drives Chromium via Playwright (DOM, a11y tree, click/type/scroll, screenshot, console, network). Observations become evidence. Failed UI observations replay the playbook once, then the independent verifier re-runs Computer Use on the merged tree.
- **MCP Gateway** speaks JSON-RPC NDJSON over stdio. Agents never talk to a server process directly. `mcp.call` is fail-closed; `mcp.invoke` / `mcp.discover` go through allowlists, timeout, and audit events.
- **Intelligence V2** uses the TypeScript parser and in-process language service for definitions, references, rename impact, and diagnostics. The graph is not a regex scan.
- **Semantic merge** compares exported symbols across worktrees before the coordinator copies files. `CONFLICT` refuses the merge.
- **AjModelGovernor** routes capabilities. `aj-local` is the planner. `xai-grok` is one optional provider and is never selected unless the caller prefers it and `AJ_USE_GROK=1`.
- **Secrets broker** seals values (AES-256-GCM). Agents get scoped, expiring, revocable leases. The ledger never stores plaintext.
- **ACP worker** is a live child process under AJ grants. It cannot self-authorize tools or certify a mission.
- **Ingress** accepts only HMAC-signed events (AJ or GitHub header). Policy runs before Commander.

## Execution environments (v1)

Supported:

- local (operator host + policy)
- local-sandbox (Linux namespaces + chroot + OverlayFS)

Not shipped:

- AWS Lambda / remote cloud workers
- Firecracker MicroVMs as a default runtime
- Kubernetes pods

The scheduler no longer returns `kind: "cloud"` as a live placement.

## Later phases

Networked third-party ACP hosts and a Postgres ledger for multi-device / team sync remain deferred. The local JSONL ledger remains the source of truth.

Highest contract after this pass:

Repository → Intelligence → Graph → Planner → DAG → Agents → Worktrees → Capabilities → Model Gateway → Tools → Tests → Diagnose → Heal → Security → Red Team → Independent Verifier → ChangeProof → Audit.

The governor remains the authority.
