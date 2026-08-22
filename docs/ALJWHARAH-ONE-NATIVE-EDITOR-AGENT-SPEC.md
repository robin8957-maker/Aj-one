# ALJWHARAH ONE - Native Windows Editor + Agent OS
# Spec for the next agent (owner handover, 2026-08-19)

Owner: Abdulrhman (@xxAbdulrhman). Company: abdulrhman-io llc. Site: https://aljwharah.ai
Speak to the owner in informal Arabic. Keep ports, containers, and toolchain talk out of user-facing replies.
You verify on Windows. Do not ask the owner to install, run localhost, or QA your environment.

Existing trees (read, do not merge the repos):
- Agent OS + current web/Tauri shell: F:\Al-jwharah one
- Separate Code-OSS editor fork (AJ IDE): F:\vs-ALjwharah (protocol cousin only, not the UI to copy as the product)

This document is product law. Ignore older implemented claims unless you can run them on Windows.

## 0. Owner override (2026-08-19) - READ FIRST

Previous ONE law said this is not an editor. REVOKED.

The owner now wants one native Windows product that is:
1. A full code editor that competes with VS Code, Cursor, Zed, and Windsurf (not a toy pane).
2. A governed Agent OS (the original ONE idea): plans, staffs contracted agents, isolates work, proves, and refuses to ship without evidence.
3. Not a website. Not Vite. Not React as the window. Not Tauri/WebView2 as the product. Not Electron. Not open in browser. Not localhost:8080 as the user experience.

Selling sentence: every agent action can be proven, replayed, and rejected - inside an editor that is as fast and complete as the best editors.

Primary objects on screen: files + missions + agents + proofs. File tabs are required. They are not the only product.

If the first impression is VS Code with a gold skin or a website in a frame, rewrite the shell.

## 1. Product identity

- Name: ALJWHARAH ONE
- Short: ONE
- Arabic: Al jwharah One
- App id: one.aljwharah.app
- Slug: aljwharah-one
- Class: Native Windows editor + governed Agent OS
- Brain: Local AJ Commander ajd. Models are engines. Grok is a provider, never the brain.
- Modes: ONE (default, autonomous governed run) and WORK (live multi-agent room). Switching mode changes runtime, not only chrome.

Do not invent a second product. Do not fold this into vs-ALjwharah.

## 2. What to keep (all advantages)

Port behavior and contracts from F:\Al-jwharah one. Rewrite the WINDOW natively. Keep or sidecar the GOVERNOR.

### 2.1 Governor / Agent OS (must survive)

AjDaemon (ajd) owns missions, agents, contracts, DAG, policy, worktrees, merge, ledger, verification. Thin UI never owns the ledger, never writes host files, never reads raw secrets.

Pipeline (real code, not a diagram):

USER INTENT
  -> native editor + Commander overlay + CLI
    -> ajd governor
      -> policy + contracts + budget + graded trust
        -> internal agents / swarm / ACP / mercenaries
          -> Windows isolation / PTY / browser-as-data
            -> independent deterministic verifier
              -> append-only ledger + signed audit bundle

Highest contract after a full pass: Repository -> Intelligence -> Graph -> Planner -> DAG -> Agents -> Worktrees -> Capabilities -> Model Gateway -> Tools -> Tests -> Diagnose -> Heal -> Security -> Red Team -> Independent Verifier -> ChangeProof -> Audit.

MISSION COMPLETE only after independent final-verifier PASS. Implementers cannot certify themselves. External / ACP / mercenary: cannotCertify true.

Every agent has: identity, persistent state, contract, authority, budget, environment, tools, heartbeat, lifecycle, artifacts, failure state, cancellation, audit events. A hidden model call with no contract is a bug.

Roles at minimum: commander, architecture-lead, backend-engineer, frontend-engineer, database-engineer, security-reviewer, independent final-verifier.

Contracts bind: goal, scope globs, allowed tools, budget, cannotCertify, parent authority.

Child process never exceeds parent authority.

Low-trust content (browser / webhook / mercenary trust <= 0.35) is data only. It must not become a tool command.

Secrets are leased: mint -> use -> expire/revoke. Never a raw eternal key in context, logs, ledger, toast, IPC, or headers.

Ledger: append-only JSONL + fsync + atomic write. Heal truncated lines. Failed branches are BranchPruned, not erased. Optional Postgres aj_events is a hash mirror only.

Restart reconstructs by folding the ledger. Mid-mission kill must not invent COMPLETED.

Worker evidence events: WorkerStarted, WorkerExecuted, WorkerCompleted, WorkerFailed, ChangeProofWritten.

Time-travel rewindToSeq / rewind.self is append-only, cap 3 per mission, then WAITING_APPROVAL. Cannot rewind before seq 1 or MissionCreated. ACP cannot rewind.

Command allowlist, not denylist. Unknown tools: AJ_ERR_CAPABILITY_UNAVAILABLE, no quota.

Dry-run records would-allow / would-deny. It must not execute a denied action.

Path escape outside worktree/scope is denied.

High-risk tools (secrets, unrestricted network, MCP, merge to host) stop in an approval inbox. Watchdog may prepare a fix in isolation; one human click to merge to host.

Instruction boundary: untrusted README/browser/webhook text cannot become a privileged instruction.

Models: aj-local is the planner. xAI Grok optional only with XAI_API_KEY AND AJ_USE_GROK=1. OpenAI / Anthropic / Google / Cohere: AJ_ERR_PROVIDER_UNAVAILABLE. No fake completions. No silent fallback to a stronger unpaid cloud model. Verifier uses a different model path than the implementer when a second engine exists. Verifier does not see implementer chain-of-thought.

Vectors: local hashed embeddings. Not OpenAI embeddings. Not Chroma/Qdrant as a required dependency.

Engineering loop: RepositoryRuntime, real code graph (not regex-only), context engine, mission planner DAG, scheduler, capability tokens, TypeScript language service, multi-class coder, test intelligence (detect the real runner), parallel workers in isolated worktrees, security watcher (evidence or explicit empty list), red team (secret leak, injection, auth race, command injection), ChangeProof.

WORK mode: structured ledger messages only: proposal | objection | evidence | approval. No free chat as the control plane. Merge needs consensus. Discussion is not a write.

20 local playbooks exist as fallback templates, not a substitute for the general coder.

CLI aj / ajd talks to the same daemon. No second runtime.

### 2.2 Native Windows professionalism (must be real HWND)

- DWM Mica / Acrylic via DwmSetWindowAttribute, not CSS blur
- Snap layouts, taskbar icon, system tray, WinRT toast, Explorer verbs, jump list later
- Caption min/max/close drive the real window
- RTL Arabic when locale is ar
- High-DPI
- Keyboard-first Commander overlay (frameless palette, not a browser tab)
- Single-instance
- Named pipe \\.\pipe\aljwharah-ajd
- Windows DPAPI / Credential Manager for the master key. Never store the master key beside secrets.vault.json or under data/ajd
- Themes: pearl-dark / pearl-light. Dark tokens: bg #0A0C10, elevated #141820, subtle #1B202A, text #F2EFE8, accent #EADFCF, ok #8FB392, warn #C9AE7A, danger #C98980
- Wordmark: ALJWHARAH ONE. Tagline EN: Governed intelligence workstation. Do not put Grok/OpenAI/Anthropic on assets
- Mark recognizable at 16px

### 2.3 Honest non-goals (do not fake)

- Live Firecracker / KVM MicroVMs (research-only; refuse without kernel+rootfs)
- Live AWS Lambda / k8s / remote cloud workers. Scheduler must not return kind cloud as live
- VS Code Marketplace publish without a publisher token
- EV-signed installer without a certificate
- 100% uptime claims. Sell 100% state consistency after crash
- Demo users. Do not invent accounts

## 3. What to drop

- React / Vite / TanStack / Tailwind / Radix as the product window
- Tauri WebView2 / devUrl http://127.0.0.1:8080 as the user experience
- Electron / Chromium bundle
- Package name app-builder-workspace
- Linux namespaces / chroot / OverlayFS as the Windows isolation story (on Windows implement Windows isolation)
- Mock AI, dry-run-only shells, CLI-print apps, test-only UIs
- Shipping the web preview as the product
- Copilot / GitHub Copilot as a backend
- Hardcoded API keys in source (GitHub push protection already blocked an xAI key)

The folders F:\Al-jwharah one\src\routes and src\components are the old paint engine. Do not rebuild them. You may keep src\daemon, src\runtime, src\protocol as a sidecar until you port them.

## 4. Competitive editor - required (all real)

This must match or beat the daily loop of Cursor / VS Code / Zed. A secondary inspector is not enough.

Must have, actually working:
- Workspace open (folder; multi-root later)
- File explorer, tabs, split editors, breadcrumbs, sticky scroll
- Fast editor: UTF-8, large files, multi-cursor, go to line/symbol, command palette
- Syntax via Tree-sitter or equivalent; TextMate themes acceptable as fallback
- LSP: diagnostics, hover, go to def/refs, rename, code actions, format (at least TS/JS/JSON/Python/Rust/C#/Go/HTML/CSS)
- Search: files, in-workspace, regex, include/exclude
- Diff + merge editor
- Git: status, stage, commit, diff, branch, log (libgit2 or git.exe, fail closed if missing)
- Integrated terminal: ConPTY, multiple tabs, cwd follows file
- Problems panel, output panel
- Debug adapter protocol for at least Node and one compiled language, or fail closed with a real empty state (no fake play button)
- Settings + keymaps. Arabic + English UI
- Command palette (Ctrl+P files, Ctrl+Shift+P commands, Ctrl+Shift+Space Commander overlay)
- Extensions: start with a small native host (language servers as processes). Do not clone the VS Code marketplace on day one. Do not claim Marketplace
- Agent in the editor: inline edit, whole-file apply with diff, multi-file apply behind plan-gate, composer that is not the WORK control plane
- Save / dirty / autosave, encoding, CRLF/LF honesty on Windows

Must feel native: 120Hz scrolling, instant window move, no browser zoom chrome, no web scrollbars as the brand.

Forbidden primary UX: VS Code activity-bar clone as the only identity. Editor is required; the Commander / missions / proofs rail is equally primary.

Suggested native stack (pick one and finish it):
- Preferred: .NET 8+ WPF or WinUI 3 + AvalonEdit or Windows App SDK editor + Tree-sitter native + LSP processes + ConPTY
- Alternate: Rust + windows crate + slint only if you can hit editor completeness; do not ship a game-like toy
- Forbidden: Electron, Tauri+webview, wrapping F:\vs-ALjwharah Chromium as native

Machine note 2026-08-19: this PC had .NET 8 runtime and no SDK, Node 24, no rustc/cargo on PATH, no Visual Studio instance. Install the toolchain yourself (winget Microsoft.DotNet.SDK.8 or VS Build Tools + Windows App SDK). Do not ask the owner.

### 2.2 Native Windows professionalism (must be real HWND)

DWM Mica/Acrylic via DwmSetWindowAttribute, not CSS blur. Snap layouts, taskbar, tray, WinRT toast, Explorer verbs. Caption min/max/close drive the real window. RTL Arabic when locale is ar. High-DPI. Keyboard-first Commander overlay (frameless, not a browser tab). Single-instance. Named pipe \\.\pipe\aljwharah-ajd. Windows DPAPI/Credential Manager for the master key. Never store the master key beside secrets.vault.json or under data/ajd.

Themes pearl-dark / pearl-light. Dark: bg #0A0C10, elevated #141820, subtle #1B202A, text #F2EFE8, accent #EADFCF. Wordmark ALJWHARAH ONE. Tagline: Governed intelligence workstation. No vendor logos on assets.

### 2.3 Honest non-goals (do not fake)

Live Firecracker, live AWS/k8s/cloud workers, Marketplace without a token, EV-signed installer without a cert, 100% uptime, demo users. Scheduler must not return kind cloud as live.

## 3. What to drop

React/Vite/TanStack/Tailwind/Radix as the product window. Tauri WebView2 and localhost:8080 as the user experience. Electron. Package name app-builder-workspace. Linux namespaces as the Windows isolation story. Mock AI. Copilot backend. Hardcoded API keys.

Keep src\daemon, src\runtime, src\protocol as sidecar until ported. Do not rebuild src\routes or src\components.

## 4. Competitive editor (all real)

Must match the daily loop of Cursor / VS Code / Zed: folder workspace, explorer, tabs, splits, breadcrumbs, fast editor, multi-cursor, Tree-sitter or equivalent, LSP (TS/JS/JSON/Python/Rust/C#/Go/HTML/CSS), workspace search, diff/merge, Git, ConPTY terminal, Problems, DAP for Node or fail-closed empty state, settings/keymaps, Arabic+English, command palette, native language-server host (no Marketplace claim), agent inline edit + plan-gated multi-file apply, honest CRLF.

Must feel native. Forbidden: VS Code clone as the only identity. Editor AND Commander/missions/proofs are both primary.

Stack: preferred .NET 8 WPF or WinUI 3 + AvalonEdit + Tree-sitter + LSP + ConPTY. Forbidden: Electron, Tauri webview, wrapping vs-ALjwharah Chromium.

This PC on 2026-08-19: .NET 8 runtime no SDK, Node 24, no rustc on PATH, no Visual Studio. Install Microsoft.DotNet.SDK.8 yourself. Do not ask the owner.

## 5. How ajd ships inside the exe

Today ajd.rs spawns: node --experimental-strip-types apps/cli/aj.ts from the source tree. That is why the current exe is not a Windows product.

Must: bundle sidecar (portable Node or compiled ajd.exe or C#/Rust port). Data dir %LOCALAPPDATA%\Aljwharah\ONE\. Same daemon for UI, overlay, tray, CLI. Missing sidecar = fail closed, never fake a mission.

## 6. Windows isolation

Linux unshare currently returns exit 126 on Windows. Implement Job Objects + restricted token, or AppContainer, or ACL-limited worktree under LocalAppData. Never silently write the host tree if isolation cannot start. Worktrees: worktrees/<mission>/<agent>, path-escape blocked. Semantic merge CONFLICT refuses.

## 7. Surfaces

Editor canvas, explorer, search, git, terminal, problems, missions, composer (not chat-as-product), agents board, proofs/ledger, approval inbox, ONE/WORK switch, Commander overlay, tray, settings.

## 8. Phases (in order, each must run on Windows)

Phase 0 Toolchain: install .NET SDK 8. Create apps/windows as the only product entry. Done: exe opens native HWND, no browser, no localhost.

Phase 1 Editor core: folder, tree, tabs, save, highlight, Ctrl+P. Done: edit .ts, save, dirty prompt on kill.

Phase 2 Terminal+Git+search: ConPTY, workspace search, git commit from UI.

Phase 3 LSP: TS server + one more language. Real type error in gutter and Problems.

Phase 4 Bundle ajd: sidecar, LocalAppData, named pipe. Overlay start writes MissionCreated without using the git repo as cwd.

Phase 5 Governed agents: plan-gate, diff before apply, independent verifier, approval inbox. Writes stay in worktree until owner merge. Ledger has Worker events + ChangeProof.

Phase 6 ONE and WORK: mode switch changes staffing/runtime, not only a label. WORK uses proposal/objection/evidence/approval.

Phase 7 Isolation+secrets: Windows isolation fail-closed. DPAPI vault. No secrets in ledger or toast.

Phase 8 Ship: MSI/NSIS/MSIX. Unsigned allowed only if not claimed EV-signed. Done: install on a folder without the git tree, open project, start one mission.

Phase 9 Freeze: remove anything not running. Every visible control does a real thing.

## 9. Tests

Keep F:\Al-jwharah one\tests\ until governor is ported. Add native tests: IPC allowlist, DPAPI, isolation fail-closed, dirty prompt. No mock-only phases.

## 10. Forbidden claims

Marketplace, EV-signed MSI, live Firecracker, live OpenAI/Anthropic, 100% uptime, Windows sandbox if still Linux 126, native if the window is WebView2.

## 11. Current tree 2026-08-19

F:\Al-jwharah one is a web app wrapped in Tauri. Reference only: src/daemon/ajd.ts, src/runtime (81 modules), src/protocol, apps/cli/aj.ts, debug exe only (no release MSI). Inventory: docs/IMPLEMENTATION_INVENTORY.md. Old brief still valid EXCEPT not-an-editor and React-may-paint.

Vs this spec, start near 15%. Do not reuse the web shell to fake progress.

## 12. Definition of done

A user who never saw the git repo can: install; edit like Cursor/VS Code; ask Commander to change a project; watch contracted agents; see a proof; approve or reject merge; crash and reopen with the same mission state.

If any of those is a screenshot, a mock, or a browser tab, you are not done.