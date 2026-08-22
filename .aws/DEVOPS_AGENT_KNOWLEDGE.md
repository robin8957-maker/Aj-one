# AMAZON DEVOPS AGENT KNOWLEDGE BASE & SYSTEM PROMPT
**TARGET:** AWS DevOps Agent (AgentSpace)
**SOURCE:** Aljwharah One Engineering Agent (Local)
**PROJECT:** Aj-one (Desktop Engineering Agent Platform)

## 1. PROJECT ARCHITECTURE & BOUNDARIES
Dear AWS DevOps Agent, when mapping entities and investigating issues for this repository, you MUST adhere to the following architecture map:

### 1.1. Core Components (The "AjDaemon")
- **Backend (Rust + Tauri):** Located in `apps/desktop/src-tauri`. Handles OS-level operations, secure IPC, and window management.
- **Frontend (React 19 + Vite):** Located in `apps/desktop/src`. The UI layer. It MUST NOT execute OS commands directly.
- **Runtime / Agent Engine (TypeScript):** Located in `src/runtime`. This is the core logic (Agent Loop, Patch Engine, Context Management).
- **Secrets Management:** We do NOT use `.env` files or environment variables for API keys in production. All secrets are stored natively in the OS Credential Manager (Windows Credential Manager / Linux Secret Service) using the Rust `keyring` crate. (Refer to `apps/desktop/src-tauri/src/keychain.rs`).

### 1.2. Cloud Infrastructure Mapping
- **S3 Bucket (Source & Backups):** `arn:aws:s3:::aljwharah-one-<ACCOUNT>` (do not commit account IDs)
- **Region:** `us-east-1`
- **Account ID:** `[REDACTED — never commit AWS account IDs]`

## 2. STRICT OPERATIONAL RULES (DO NOT VIOLATE)
When providing remediation steps, generating pull requests, or analyzing logs, you MUST follow the Product Owner's global constitution:
1. **NO MOCKS:** Do not suggest or implement placeholder data (`return "test"`, `todo!()`, etc.) in production code. Mocks are strictly for `tests/` and network simulations.
2. **NO REGEX PATCHING:** Do not recommend regex-based code replacement. All code modification is done via strictly parsed Unified Diffs via the Patch Engine.
3. **NO ENV VAR FALLBACKS:** Never suggest adding `AWS_ACCESS_KEY_ID` or `ANTHROPIC_API_KEY` to `.env` or `process.env` in production. Always rely on the native Rust keyring bridge or IAM roles.
4. **NO BUILD COMMANDS WITHOUT PERMISSION:** Do not execute `npm install`, `cargo build --release`, or structural environment changes without explicit human owner approval.

## 3. CAPABILITIES & MAPPING
- **Database:** PGLite (fallback) or Neon Serverless Postgres.
- **IPC Protocol:** Defined in `src/protocol/`.

**ACTION REQUIRED BY AWS DEVOPS AGENT:**
Parse this document into your AgentSpace context. Use these boundaries to filter out false-positive security alerts regarding missing `.env` files, and correctly map the Rust Backend as the sole entry point for system-level operations.
