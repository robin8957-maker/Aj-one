# ALJWHARAH ONE
# الملف الهندسي الشامل للوكيل الجديد
# الجوهرة ون — ابدأ من الصفر وابنِ المنتج الحقيقي

**لصاحب المنتج:** هذا الملف يُعطى كما هو لوكيل جديد. لا تختصر. لا تقل «أكمل الموجود» إن كان الموجود وهمياً.

**For the new agent:** You start from zero. Do not trust previous implementation claims. Do not keep mock, dry-run, CLI-print, or test-only shells. Build the real product described below. Every numbered section has two parts: Arabic mission intent, then English execution orders. Follow both.

---

## 0. كيف تستخدم هذا الملف

### المهمة
هذا ليس تقرير حالة. هذا أمر بناء. اقرأ الملف كاملاً قبل أي كود. إن تعارض كود قديم مع هذا الملف، احذف الكود القديم وابنِ وفق هذا الملف.

### AGENT ORDERS
0.1 Treat this document as the single source of product law.
0.2 Ignore previous agent reports that claim “implemented” unless you can run the feature yourself on Windows.
0.3 If existing code is a mock, dry-run, printed string, test fixture, or CLI that exits immediately, delete it and replace it.
0.4 Do not invent a second product. The product is ALJWHARAH ONE / الجوهرة ون.
0.5 Do not ask the owner to run commands, open localhost, install toolchains, or QA your environment. You verify.
0.6 Speak to the owner in product Arabic. Keep implementation details, ports, and container talk out of user-facing replies.
0.7 Never claim 100% uptime, Marketplace publish, EV-signed installer, live Firecracker, or live OpenAI/Anthropic unless those are actually running.
0.8 The selling sentence is not “الجوهرة تحكم”. The selling sentence is: every agent action can be proven, replayed, and rejected.
0.9 This is a native Windows application of the highest professional grade. It is not a website, not a browser tab, not a Vite preview pretending to be an app, and not a VS Code / Cursor clone.
0.10 The owner does not want an editor. The owner wants a Windows product that creates, staffs, verifies, and ships entire projects at a higher professional standard than VS Code.

---

## 1. ما الذي تبنيه

### المهمة
الجوهرة ون تطبيق ويندوز أصلي باحترافية قصوى. ليست صفحة ويب، وليست تبويب متصفح، وليست معاينة Vite، وليست نسخة من VS Code أو Cursor.

هي ليست محرر ملفات. المحرر الخفيف أداة مساعدة فقط. المنتج الحقيقي ينشئ مشاريع كاملة باحتراف أعلى من VS Code: يخطط، يوظّف وكلاء، يكتب، يختبر، يعزل، يثبت، ويرفض الدمج إن نقص الدليل.

المستخدم يعطي نية. القائد ينفّذ مشروعاً. النتيجة مجلد مشروع حي يعمل، لا دردشة فوق مستودع.

### AGENT ORDERS
1.1 Product name: ALJWHARAH ONE. Short name: ONE. Arabic: الجوهرة ون. App id: `one.aljwharah.app`. Slug: `aljwharah-one`.
1.2 Product class: native Windows governed Agent OS that creates professional software projects. Not a website. Not a web UI wrapped as an exe. Not a VS Code / Cursor / Code-OSS clone. Not a file editor whose main job is typing.
1.3 Do not build “another IDE”. A light inspector/editor may exist as a secondary pane. The primary job is project creation, staffing, verification, and governed delivery at a higher professional standard than VS Code.
1.3b Competitor frame: VS Code edits files. ALJWHARAH ONE founds a project, plans it, implements it with contracted agents, proves it, and refuses to ship without evidence.
1.4 Two operating modes, both real:
    - ONE: default. Outcome-directed autonomous execution.
    - WORK: live war-room of real agents who propose, object, prove. Not simulated chat.
1.5 Switching mode changes runtime behavior, not only CSS.
1.6 Organizational brain is local AJ Commander (`ajd`). Models are interchangeable engines. Grok is a provider, never the brain.
1.7 Completion rule: `MISSION COMPLETE` is emitted only after an independent final verifier PASSes. Implementers cannot certify themselves. External/ACP/mercenary agents have `cannotCertify: true`.
1.8 Local-first: unsigned preview may use `local-operator`. Deployed Neon environments require a signed-in identity.

---

## 2. الجملة الثابتة والقواعد الخمس

### المهمة
الجوهرة أقوى لا لأنها تشغّل نماذج أكثر، بل لأن الوكيل لا يصدّق نفسه، والسر لا يعيش للأبد، والدفتر لا يُكذب عليه، والمهمة لا تُختم إلا بدليل يمكن رفضه.

### AGENT ORDERS
2.1 Child process never exceeds parent authority.
2.2 External agent never certifies a mission (`cannotCertify`).
2.3 Low-trust content (browser / webhook / mercenary trust ≤ 0.35) is data only. It must not become a tool command.
2.4 Secrets are leased: mint → use → expire/revoke. Never a raw eternal key in context, logs, ledger, or headers.
2.5 Ledger is append-only. Do not delete failed events. Failed branches are marked aborted (`BranchPruned`), not erased.
2.6 Keep this sentence true in runtime, tests, and UI copy: every agent action can be proven, replayed, and rejected.

---

## 3. المكدس المسموح والمكدس الممنوع

### المهمة
المنتج الذي يراه المالك هو تطبيق ويندوز أصلي: نافذة، صينية، اختصار عام، إشعارات، قائمة ابدأ، تكامل Explorer. أي سطح HTML داخل النافذة هو محرّك رسم فقط، وليس المنتج.

لا تسلّم واجهة ويب وتسمّيها تطبيقاً. إن فتح المالك الملف التنفيذي ولم يشعر أنه أمام برنامج ويندوز فاخر، فقد فشلت.

### AGENT ORDERS
3.1 Rendering inside the window may use React 19 + TypeScript + Vite + TanStack + Tailwind + Radix. That stack is the paint engine, not the product identity. The product identity is a native Windows application.
3.2 Core: local TypeScript daemon `AjDaemon` (`ajd`) owns missions, agents, contracts, DAG, policy, worktrees, merge, ledger, verification.
3.3 Desktop host: Rust + Tauri 2 + WebView2. No Electron. No Chromium bundle. No “open in browser”. No localhost hand-off as the main experience.
3.3b Native Windows professionalism is mandatory: DWM Mica/Acrylic, snap layouts, taskbar icon, jump list later if needed, system tray, WinRT toast, Explorer verbs, caption chrome that actually drives HWND, RTL-aware Arabic, high-DPI, keyboard-first Commander.
3.3c A web preview on port 8080 is only an engineering aid. Shipping the preview as the product is a failure.
3.4 CLI: `aj` / `ajd` must talk to the same daemon. No second runtime.
3.5 Isolation: Linux namespaces + chroot + prlimit + OverlayFS + `setpriv --no-new-privs`. If tools are missing, fail closed with code 126. No host fallback.
3.6 Ledger: JSONL + fsync + atomic write + independent writer + heal on truncated line.
3.7 Secrets: AES-256-GCM. Master key order: `AJ_MASTER_KEY` (CI) → Windows DPAPI/Credential Manager → Linux Secret Service/`secret-tool` → `/dev/shm`. Never store the master key beside `secrets.vault.json`.
3.8 Models: `aj-local` is the planner. xAI Grok is optional only with `XAI_API_KEY` and `AJ_USE_GROK=1`. OpenAI / Anthropic / Google / Cohere are UNSUPPORTED product backends and must return `AJ_ERR_PROVIDER_UNAVAILABLE`. No fake completions.
3.9 Vectors: local hashed 64-d (or documented 384-d local) embeddings. Not OpenAI embeddings. Not Chroma/Qdrant as a required dependency.
3.10 Data: preview uses PGLite. Deploy uses Neon when `DATABASE_URL` exists. Auth is Better Auth federated to Grok broker (Google, X) plus optional local email/password. Do not invent demo users.
3.11 Forbidden: Electron, mock AI answers, silent host fallback from a missing sandbox, default-dev signing keys, marketplace publish without a token, EV-signed MSI claims without a certificate.

---

## 4. مسار التنفيذ المعماري

### المهمة
النية تدخل من سطح رفيع. الحاكم يقرر. الوكلاء يعملون في عزل. المدقق المستقل يحكم. الدفتر يسجّل كل شيء.

### AGENT ORDERS
4.1 Implement this pipeline as real code, not a diagram:

```
USER INTENT
  → thin clients (Workstation / CLI / VS Code Lens)
    → ajd governor
      → policy + contracts + budget + graded trust
        → internal agents / swarm / ACP / mercenaries
          → OverlayFS jail / PTY / browser
            → independent deterministic verifier
              → append-only ledger + signed audit bundle
```

4.2 Highest contract after a full pass:
Repository → Intelligence → Graph → Planner → DAG → Agents → Worktrees → Capabilities → Model Gateway → Tools → Tests → Diagnose → Heal → Security → Red Team → Independent Verifier → ChangeProof → Audit.
4.3 The governor remains the authority on every step.
4.4 Thin clients render and send commands. They never own the ledger, never write host files, never read raw secrets.

---

## 5. ما هو الوكيل الحقيقي

### المهمة
نداء نموذج مخفي ليس وكيلاً. كل أخصائي ظاهر في WORK يجب أن يكون زمن تشغيل حقيقي.

### AGENT ORDERS
5.1 Every agent object must have: identity, persistent state, contract, authority, budget, environment, tools, heartbeat, lifecycle, artifacts, failure state, cancellation, audit events.
5.2 Roles at minimum: commander, architecture-lead, backend-engineer, frontend-engineer, database-engineer, security-reviewer, independent final-verifier.
5.3 Contracts bind: goal, scope globs, allowed tools, budget, cannotCertify, parent authority.
5.4 Heartbeat must be observable in UI and ledger.
5.5 Cancellation must stop tools and mark the branch aborted.
5.6 A hidden model call with no contract is a bug.

---

## 6. سطحا التشغيل: ONE و WORK

### المهمة
ONE ينفّذ للنتيجة. WORK غرفة حرب. التبديل يغيّر القانون لا اللون.

### AGENT ORDERS
6.1 ONE is default. Planner staffs the smallest capable set, executes, verifies, stops.
6.2 WORK is a live multi-agent room. Communication is structured JSON on the ledger only: `proposal | objection | evidence | approval`. No free chat as the control plane.
6.3 Swarm completion and code merge require consensus (majority or reviewer unanimity as configured).
6.4 A tester objection against an implementer opens a resolution session and a merge wall.
6.5 Even a verifier PASS does not complete a WORK mission if the swarm has no consensus.
6.6 Discussion is not a write. WORK talk must not mutate the host tree until policy allows a merge.

---

## 7. سطح محطة العمل

### المهمة
سطح محطة إنشاء مشاريع، لا سطح تحرير ملفات. VS Code يرتّب التبويبات. الجوهرة ترتّب النية والخطة والوكلاء والدليل والمشروع الناتج.

المحرر الخفيف موجود لرؤية الفرق ومراجعة الرقعة، لا ليعيش المستخدم داخله كـ IDE.

### AGENT ORDERS
7.1 Build one native workstation whose primary objects are missions, plans, agents, proofs, and the resulting project — not file tabs.
7.1b Required surfaces:
    - missions / project founding
    - composer (intent, not chat-as-product)
    - agents and artifacts
    - light inspector/editor for review only
    - PTY terminal
    - browser / computer-use
    - computers / fleet
    - problems
    - logs / evidence
7.1c Forbidden primary UX: VS Code clone (activity bar + file tree + tabs + status bar as the product). If the first impression is “this is VS Code with a new skin”, rewrite the shell.
7.2 Composer supports attachments, entity mentions, and a spec-before-large-mission flow.
7.3 Permissions are precise per agent, tool, path, scope, secret, and action.
7.4 Environment snapshots, fork, parallel solution arena, and adversarial verification must be reachable from the same surface.
7.5 Desktop shell may look like a Windows workstation (caption, start, tray chrome) but window min/max/close must hit the real OS when hosted in Tauri.
7.6 Overlay Commander is a frameless palette, not a decorated browser tab.
7.7 Arabic and English. RTL when locale is `ar`. Theme tokens: pearl-dark / pearl-light.

---

## 8. الهوية البصرية

### المهمة
الشعار معتمد: جوهرة/ماسة فضية بخطوط دوائر. لا تخترع شعاراً جديداً. نفس العلامة للويب والتطبيق والمثبت والصينية.

### AGENT ORDERS
8.1 Product wordmark: `ALJWHARAH ONE`. Arabic lockup: `الجوهرة ون`. Tagline EN: Governed intelligence workstation. Tagline AR: محطة عمل ذكاء محكومة.
8.2 Do not put Grok, OpenAI, Anthropic, or any vendor on assets.
8.3 Dark tokens: bg `#0A0C10`, elevated `#141820`, subtle `#1B202A`, text `#F2EFE8`, accent `#EADFCF`, ok `#8FB392`, warn `#C9AE7A`, danger `#C98980`.
8.4 Light tokens: bg `#D8DDE6`, elevated `#F4F2EC`, subtle `#E6E3DA`, text `#15171C`, accent `#1C212B`.
8.5 Mark must stay recognizable at 16 px. No wordmark inside icons smaller than 64 px. Safe zone ≥ 12%.
8.6 Produce or keep: favicon.svg, PWA icons, Tauri ico/png/tray, OG 1200x630, installer bitmaps, Lens extension icons, agent avatars.
8.7 Do not ship a generated mock of the UI instead of the running app.

---

## 9. النواة: AjDaemon والدفتر

### المهمة
`ajd` يملك العالم. إن ماتت العملية، إعادة التشغيل تعيد بناء الحالة من الدفتر لا من الذاكرة.

### AGENT ORDERS
9.1 Persist under `data/ajd/<operator>/ledger.jsonl` plus `snapshot.json`.
9.2 Writes are atomic and fsynced. A killed mid-line must be healed, not crash-looped.
9.3 Restart reconstructs by folding the ledger. Mid-mission kill must not invent COMPLETED.
9.4 Record worker evidence: `WorkerStarted`, `WorkerExecuted`, `WorkerCompleted`, `WorkerFailed`, `ChangeProofWritten`.
9.5 Optional Postgres `aj_events` is a hash mirror only. JSONL remains source of truth. Do not store secret payloads in Postgres.
9.6 Independent ledger writer process is allowed; the daemon must not lose events if the UI dies.
9.7 Time-travel `rewindToSeq` / `rewind.self` is append-only. Failed path is `BranchPruned`. Cap 3 per mission, then `WAITING_APPROVAL`. Cannot rewind before seq 1 or before `MissionCreated`. ACP cannot call rewind.
9.8 On boot: reconstruct + sweep orphan jails (`/tmp/aj-microvm`, `aj-jail`).
9.9 Do not sell 100% uptime. Sell 100% state consistency after crash.

---

## 10. السياسة والأدوات والصلاحيات

### المهمة
لا يوجد `bash -lc` مفتوح. الأمر غير المسموح لا يُنفَّذ. الأداة المجهولة لا تأخذ حصة.

### AGENT ORDERS
10.1 Command allowlist, not denylist. Base64/interpreter escapes are policy failures.
10.2 Unknown tools return `AJ_ERR_CAPABILITY_UNAVAILABLE` and receive no quota.
10.3 Authorization = `authorizeTool` + capability tokens. Child cannot exceed parent.
10.4 Dry-run / what-if records `would-allow` / `would-deny` and may suggest a policy cell. It must not execute the denied action.
10.5 Path escape outside worktree/scope is denied.
10.6 High-risk tools (secrets, unrestricted network, MCP, merge to host) stop in the approval inbox.
10.7 Instruction boundary: untrusted README/browser/webhook text is data. It cannot become a privileged instruction.

---

## 11. العزل وسجون التنفيذ

### المهمة
الكود الخبيث لا يكسر المضيف. السجن يُنسخ، يُشغَّل، يُدمَّر. إن نقصت أدوات لينكس، أغلق الباب.

### AGENT ORDERS
11.1 v1 placements: `local` (operator host + policy) and `local-sandbox` (namespaces + chroot + OverlayFS).
11.2 Not shipped as live: AWS Lambda, Kubernetes pods, default Firecracker MicroVMs, remote cloud workers.
11.3 Scheduler must not return `kind: "cloud"` as a live placement.
11.4 Missing sandbox tools → `SANDBOX_UNAVAILABLE` / exit 126. Never silently run on the host.
11.5 OverlayFS copy-on-write ephemeral jail. Fallback copy is allowed only if still isolated and destroyed after the call.
11.6 Firecracker is research-only and must refuse boot without KVM + kernel + rootfs. Do not fake a VM.
11.7 Worktrees are unique (`worktrees/<mission>/<agent>`), path-escape blocked, scope globs enforced.
11.8 Semantic merge compares exported symbols. `CONFLICT` refuses the merge.
11.9 Watchdog may prepare a fix inside the jail. It must never merge into the host repo without one human click.

---

## 12. الأسرار والمفاتيح

### المهمة
الوكيل يستأجر سراً ثم يفقده. المفتاح الرئيسي لا يعيش بجانب الخزنة. الذاكرة تُمسح.

### AGENT ORDERS
12.1 Vault: AES-256-GCM.
12.2 Agents receive a lease, not a durable secret.
12.3 Prefer `useSecretBuffer`, `kmsHmac`, or `mintSecretHeaders`. Callers of `mintSecretHeaders()` must `cleanup()`.
12.4 Wipe buffers with `randomFillSync` then `fill(0)`.
12.5 JavaScript strings cannot be wiped in V8. Do not put plaintext secrets in HTTP `Authorization` headers. Use base64/buffer minting.
12.6 Windows host must actually call DPAPI (`CryptProtectData` / `CryptUnprotectData`) or Credential Manager. Linux uses Secret Service when present.
12.7 Refuse any key path beside `data/ajd` or `secrets.vault`.
12.8 Ledger, toast, IPC payload, and audit bundle never contain `sk-`, `Bearer `, or `BEGIN ` secret material.
12.9 Mercenary context that contains a key is rejected before egress.

---

## 13. النماذج والبوابة

### المهمة
القائد المحلي يخطط. النماذج الخارجية اختيارية ومغلقة إن لم تُضبط. لا إجابات وهمية.

### AGENT ORDERS
13.1 `aj-local` is the deterministic planner and default judge path.
13.2 Grok is optional and never auto-selected unless the caller prefers it and `AJ_USE_GROK=1`.
13.3 Unconfigured providers return `AJ_ERR_PROVIDER_UNAVAILABLE` with `available: false`.
13.4 Independent verifier must use a different model path than the implementer when a second engine exists. Verifier does not see implementer chain-of-thought.
13.5 Budget-aware local engine notes are required when the local model is chosen for cost.
13.6 No silent fallback to a stronger unpaid cloud model.

---

## 14. حلقة الهندسة العامة (P0–P5)

### المهمة
المنتج يؤسس مشاريع كاملة باحتراف أعلى من VS Code: مواصفات، مخطط، عمال معزولون، اختبارات، إثبات تغيير، مدقق مستقل. Northstar أداة اختبار فقط، ليس هدف الإنتاج.

### AGENT ORDERS
14.1 Implement `RepositoryRuntime` over any inspected tree.
14.2 Code graph queries over a real graph, not regex-only scans.
14.3 Context engine, mission planner DAG, DAG scheduler, capability tokens, tool registry.
14.4 TypeScript Language Service via the `typescript` package, with a documented regex fallback only when TS is absent.
14.5 Multi-class coder must fix missing imports, wrong operators, missing/broken exports, and synthesize regression tests.
14.6 Test intelligence detects the real runner (`node:test` or whatever exists). Do not invent a runner.
14.7 Parallel DAG workers run in isolated worktrees and record ledger events.
14.8 Security watcher emits evidence-backed findings or explicit `[]`. Never a fake clean bill.
14.9 Red team verifies secret leak, injection, auth race, command injection on the changed tree.
14.10 ChangeProof is strict `ok` or `failed`. Broken patch → `verifierResult=failed`.
14.11 Self-heal cap is 3. After 3 failed heals: forensic markdown + human. After exhaustion do not keep looping.
14.12 Acceptance must include four executable paths: arbitrary-repo bugfix + regression, prompt injection blocked, unauthorized fs/command/secret denied, broken patch rejected.
14.13 Remote execution remains `REMOTE_EXECUTION_UNAVAILABLE`.
14.14 Project founding is first-class: from a single objective the system must create a real project tree, installable/runnable according to its stack, with tests and ChangeProof. This is stronger than “open folder and edit” in VS Code.
14.15 Quality bar versus VS Code: VS Code helps a human type. ALJWHARAH ONE must produce architecture, implementation, regression tests, security review, and a rejectable proof. If the output is only edited files with no proof, it failed.

---

## 15. الوعي الاستباقي والاقتصاد

### المهمة
عند 90٪ من الميزانية لا يصمت القائد ولا يزعج البشر فوراً. يتفاوض مرة واحدة.

### AGENT ORDERS
15.1 Resource negotiation at 90% spend: implementer requests, `aj-local` judges, one 15% extension or terminate.
15.2 Grant rules: DAG ≥ 50% complete, no prior extension, reputation not catastrophic. No privilege escalation. Secrets stripped from the request reason.
15.3 `WorkspaceIndexer` runs in the background (`setImmediate`) and must not block the commander.
15.4 Extract functions/interfaces via the existing LSP engine. Keep a local vector index and reverse imports.
15.5 On `fs.write`, inject a data-only note such as: `calculateTotal` in totals.ts is called by InvoiceManager.ts — do not break the signature. Injection grants no write.
15.6 Local playbooks (20 templates) are optimization fallbacks, never a substitute for the general coder.

---

## 16. السرب والمرتزقة والفوضى

### المهمة
السرب يصوّت في الدفتر. المرتزق يدخل بمقتطف ويعود ملوّثاً. قتل العملية لا يفسد الحالة.

### AGENT ORDERS
16.1 Swarm agents may use different engines (write / security review / test) but communicate only via ledger JSON.
16.2 Mercenary ACP: HMAC-authenticated frame (intended WSS/mTLS), context snippet only, every reply `tainted`, trust 0.15, `cannotCertify: true`.
16.3 Mercenary forbidden tools: `fs.write`, merge, PTY, secrets, rewind.
16.4 Chaos: kill during a partial ledger line → `healLedger` drops the truncated line. Restart reconstructs and sweeps jails.
16.5 Ingress accepts only HMAC-signed events (AJ or GitHub header) with a time window and replay protection. Policy runs before Commander.

---

## 17. الثقة والتدقيق

### المهمة
الثقة درجات. الحزمة تُصدَّر وتُوقَّع. السر لا يدخل الحزمة.

### AGENT ORDERS
17.1 Graded trust defaults: user 1.0, repo 0.75, agent 0.55, browser/webhook ≤ 0.35, mercenary 0.15.
17.2 Dynamic trust decay: a repo that pulls npm/HTTP drops toward the tainted source level.
17.3 Negative reputation records the kind of failure, not a single opaque number.
17.4 Exportable audit bundle: mission + plan + evidence + verdict + tools + secret references only (no values).
17.5 Sign the bundle with Ed25519. No default-dev key in the repo.
17.6 Metrics: verifier catch rate, false PASS, rewind count, cost, time-to-first-human.
17.7 ChangeProof and events exclude secrets.

---

## 18. Computer Use و MCP والطرفيات

### المهمة
المتصفح أداة مراقبة وتنفيذ محكومة. MCP لا يُستدعى مباشرة من الوكيل. الطرفية ليست TUI حرّة تسرق الجلسة.

### AGENT ORDERS
18.1 Browser agent drives Chromium via Playwright: DOM, a11y tree, click/type/scroll, screenshot, console, network. Observations become evidence.
18.2 Failed UI observations replay the playbook once, then the independent verifier re-runs Computer Use on the merged tree.
18.3 MCP gateway speaks JSON-RPC NDJSON over stdio. Agents never talk to a server process directly.
18.4 `mcp.call` is fail-closed. `mcp.invoke` / `mcp.discover` go through allowlists, timeout, and audit events. Definitions are pinned.
18.5 PTY uses `TERM=dumb`, strips ANSI, and `/escape` exists to leave a TUI. ACP child has no raw network unless proxied by policy.
18.6 Artifact iframe is `allow-scripts` only, never `allow-same-origin`.

---

## 19. محرك ويندوز الأصلي — هذا كان موضع الفشل

### المهمة
صاحب المنتج يريد برنامج ويندوز فاخر كأقوى تطبيقات سطح المكتب: يُفتح من أيقونة، يعيش في شريط المهام والصينية، يحترم ويندوز 11، ويعمل حتى لو أُغلق المتصفح.

ليس CLI يطبع ثم يغلق. ليس واجهة ويب. ليس Electron. ليس VS Code. إذا لم يشعر المستخدم أنه أمام تطبيق ويندوز أصلي باحتراف عالٍ، فالمهمة فاشلة.

### AGENT ORDERS
19.1 Default launch (no argv) MUST call `tauri::Builder::default()...run(tauri::generate_context!())` and stay open.
19.2 A process that prints `hotkey=...` and exits is a failure, even if cargo tests pass.
19.3 Real WebView2 window. Frameless main window. Separate frameless always-on-top overlay window at `/overlay`.
19.4 System tray via `TrayIconBuilder` with a real icon next to the clock. Menu: status, Open Commander, Panic stop, Quit. Left-click shows the main window. Close-to-tray, do not quit.
19.5 Global hotkey is OS-level `RegisterHotKey` (Ctrl+Shift+Space) on a dedicated Windows message thread. In-process `keydown` is not enough.
19.6 Caption buttons call real window minimize / maximize / close through Tauri IPC.
19.7 IPC from the webview is tainted. Renderer may only `mission.approve` and `mission.reject`. Chrome may only window/overlay/panic. Host CLI has a separate allowlist. Deny `fs.*`, `secret.*`, `keychain-*`, `shell.exec`, path `..`, NUL, `BEGIN `, `sk-`, `Bearer `.
19.8 Frontend must use `@tauri-apps/api` `invoke` when `__TAURI_INTERNALS__` exists. Do not leave buttons as CSS-only.
19.9 Named pipe `\\.\pipe\aljwharah-ajd` (Windows) or `/tmp/aljwharah-$uid.sock` mode 0600 (Linux) is hosted by the Rust process. Node only connects. Reject `fs.write` on the pipe.
19.10 Updater uses `tauri-plugin-updater`. Unsigned payloads are refused. Never print `would apply`. Apply only after signature verification.
19.11 Toasts are real WinRT notifications with Approve Merge / Reject. Building XML and not showing it is a failure.
19.12 DWM Mica/Acrylic via `DwmSetWindowAttribute` on the live HWND. CSS blur is not Mica.
19.13 Explorer context menu writes HKCU only: Open in Aljwharah / Fix with Aljwharah. No HKLM, no elevation.
19.14 Windows Service path, if present, is SCM + idle-on-pipe, not a spin loop.
19.15 Single-instance plugin: second launch focuses the existing window.
19.16 Icons exist as real PNG/ICO files consumed by Tauri. Missing icon that makes tray install fail is a bug.
19.17 `npm run desktop:dev` and `npm run desktop:build` must be real Tauri commands.
19.18 You must prove the window yourself: start the exe, confirm a process that stays alive, confirm a visible window or a documented WebView2 bootstrap error, confirm tray, confirm hotkey registration. Cargo unit tests alone are not proof.
19.19 Honest limits you may keep: no EV certificate → do not claim a signed store installer. No release endpoint → updater refuses unsigned / missing channel. Do not hide those as “implemented”.

---

## 20. CLI والعدسة

### المهمة
أي مجلد يمكن ربطه. الأمر نفسه يمر على نفس الحاكم. العدسة عارض رفيع.

### AGENT ORDERS
20.1 `aj init [folder]` binds a folder to the core.
20.2 `aj run "mission"` runs through the same `ajd`.
20.3 Also implement: `overlay`, `mission pause|resume`, `approve`, `reject`, `agents`, `approvals`, `hook`, `watch`, `lens`.
20.4 Lens JSON-RPC: `ping`, `missions.list`, `mission.diff`, `jail.status`. Thin client. No host fs. Unpublished Marketplace is allowed; do not claim it is published.
20.5 Watch workspace and ingest CI/build failures through the policy gateway.

---

## 21. الواجهة الويب والمعاينة

### المهمة
المعاينة المحلية تبقى حيّة للمالك أثناء البناء. لكنها ليست بديل التطبيق الأصلي.

### AGENT ORDERS
21.1 Keep `/workspace/startup.sh` (or project `startup.sh`) idempotent, non-blocking, binding `0.0.0.0:8080` for preview environments that need it.
21.2 Do not delete Grok PWA injector, PreviewHostBridge, auth popup wiring, or `public/__grok/` if this workspace still uses that template.
21.3 Sign-in is real. Do not scaffold mock users.
21.4 `npm run build` and `npm run typecheck` must pass. Dev-only success that breaks SSR/Vercel build is a bug.
21.5 Never ask the owner to open localhost.

---

## 22. الاختبارات — متى يحق لك أن تقول «تم»

### المهمة
الاختبار النصي الذي يمر على جملة مطبوعة ليس إثبات نافذة. لا تكذب في الحالة.

### AGENT ORDERS
22.1 Keep and extend the Node suite: runtime, engines, hardening, workstation, work, connections, sandbox, governance, negotiate, indexer, rewind-self, overlay, tauri-ipc, leftover, phase7/8, northstar, catalog, lens, master-contract, general-engineering, p0–p5.
22.2 Rust tests must compile the real Tauri host. Fix compiler errors. Do not weaken tests to match a mock.
22.3 Forbidden test style: assert that stdout contains `would apply`, `Compiles without the tauri`, or a printed tray label instead of creating a tray.
22.4 Required proof before claiming the Windows app works:
    - `cargo test` in `apps/desktop/src-tauri` passes
    - exe exists and running it without args does not exit within 2 seconds
    - a WebView2 window or a precise bootstrap error is observed by you
    - `status` reports `window=tauri tray=system backend=registerhotkey`
    - renderer IPC denies `fs.write`
    - unsigned updater is refused
    - toast XML contains Approve Merge and Reject, and a WinRT show path exists
22.5 Playwright smoke may cover the web workstation. It does not prove the tray.
22.6 Status vocabulary: IMPLEMENTED | PARTIALLY_IMPLEMENTED | DECLARED_ONLY | BROKEN | UNSAFE | REMOVED | UNSUPPORTED. Classify from executable evidence only.

---

## 23. ما يُمنع ادّعاؤه

### المهمة
الصدق جزء من المنتج.

### AGENT ORDERS
23.1 Do not claim: signed Windows store installer, VS Code Marketplace publish, live Firecracker root boot, full seccomp-BPF, V8 string wipe, live OpenAI/Anthropic/Google, remote cloud workers, 100% uptime, full DAP debugger.
23.2 Full seccomp-BPF is NOT loaded without libseccomp. `setpriv --no-new-privs` is the honest current Linux hardening.
23.3 Postgres team sync is deferred on purpose while local ledger reconstructs.
23.4 If a feature is dry-run on a non-Windows host, say so. If you are on Windows, do not leave it as dry-run.

---

## 24. ترتيب البناء للوكيل الجديد

### المهمة
لا تبدأ بالزينة. ابدأ بما يجعل البرنامج موجوداً، ثم الحاكم، ثم العزل، ثم السطح.

### AGENT ORDERS
24.1 Phase A — Honest inventory. Run the current tree. List every mock. Do not reuse a lying host.
24.2 Phase B — Real Tauri Windows host: window, tray, hotkey, IPC, pipe, toast, DWM, updater refuse-unsigned. Prove the exe stays open.
24.3 Phase C — `ajd` ledger, policy, worktrees, verifier, secrets leases. Crash-restart test.
24.4 Phase D — Workstation UI bound to the daemon. ONE/WORK. Composer, missions, approvals.
24.5 Phase E — Sandbox fail-closed, OverlayFS jail, watchdog click-to-merge.
24.6 Phase F — Intelligence, graph, planner, multi-class coder, ChangeProof, red team.
24.7 Phase G — Budget negotiation, indexer, rewind.self, swarm JSON, mercenary taint.
24.8 Phase H — CLI + Lens thin clients on the same daemon.
24.9 Phase I — Brand assets, installer script, honest docs. No signed-store claim.
24.10 After every phase: run tests, run the exe or preview, fix before advancing.

---

## 25. أوامر التشغيل التي يجب أن تبقى صحيحة

### المهمة
الأوامر للمالك بسيطة. التنفيذ عليك.

### AGENT ORDERS
25.1 Web preview: `npm run dev` on `0.0.0.0:8080`.
25.2 Tests: `npm test`.
25.3 Desktop dev: `npm run desktop:dev` (Tauri + Vite).
25.4 Desktop exe: `apps/desktop/src-tauri/target/debug/aljwharah-one.exe` or release build via `npm run desktop:build`.
25.5 CLI: `npm run aj -- run "Add GET /health"`.
25.6 Keep `startup.sh` valid wherever the preview contract still applies.

---

## 26. رسالة الافتتاح التي تعطيها للوكيل الجديد

### المهمة
انسخ الفقرة الإنجليزية التالية كما هي إلى أول رسالة للوكيل الجديد، ثم أرفق هذا الملف.

### AGENT ORDERS
You are a new engineering agent. Start from zero on ALJWHARAH ONE (الجوهرة ون). Read `ALJWHARAH-ONE-ENGINEERING-BRIEF-FOR-NEW-AGENT.md` in full before writing code. The previous Windows host was a mock: a CLI that printed and exited, with tray/hotkey/updater/toast implemented as strings and tests. That is unacceptable. Build a real governed Agent OS: local `ajd` commander, event-sourced missions, real contracted agents, isolated worktrees, fail-closed sandbox, independent verifier, leased secrets, append-only ledger, and a real Tauri/WebView2 Windows app with a living window, system tray, RegisterHotKey Ctrl+Shift+Space, WinRT toasts, and tainted IPC. Models are engines, not the brain. Do not fake completions. Do not claim unsigned installers or unpublished Marketplace listings. Verify yourself. Every agent action must be provable, replayable, and rejectable.

---

## 27. تعريف الإنجاز للمالك

### المهمة
يعتبر العمل منجزاً فقط إذا استطاع المالك أن يفعل هذا بيده.

### AGENT ORDERS
27.1 Double-click / run the Windows exe → a real window appears and stays.
27.2 An icon appears next to the clock. Panic stop and Quit work.
27.3 Ctrl+Shift+Space opens Commander even when another app is focused.
27.4 Minimize / maximize / close affect the OS window.
27.5 A mission can be started from Commander or `aj run` and appears on the ledger.
27.6 A high-risk action stops for approval. Reject works. Approve works.
27.7 A failed verify does not mark COMPLETED. After 3 heals it asks a human.
27.8 Killing the daemon mid-write and restarting restores a consistent world.
27.9 Secrets never appear in toast, ledger, or IPC.
27.10 You have not called Electron, have not called a missing sandbox a jail, and have not printed `would apply` as an updater.
27.11 The first five seconds feel like a premium Windows 11 product, not a website and not VS Code.
27.12 From one objective the system can found a real project with tests and ChangeProof — stronger than opening a folder in VS Code and typing.

---

نهاية الملف.
أعطِ هذا الملف للوكيل الجديد كاملاً. لا تختصره.
