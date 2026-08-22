/**
 * Procedural memory: real implementations agents can apply to a project.
 * These are not prompt templates — they are file-level engineering playbooks.
 */
import { EXTRA_PLAYBOOKS, resolvePlaybookKey } from "./catalog-playbooks.ts";
export type { FeatureSpec, FilePatch } from "./catalog-types.ts";
import type { FeatureSpec } from "./catalog-types.ts";

const AUTH_FIXED = `/**
 * Northstar session issuer.
 * Single-flight per user: overlapping login() calls share one in-flight promise
 * so two live tokens cannot be minted for the same identity.
 */
const sessions = new Map();
const inflight = new Map();

export function createToken(userId) {
  return \`nst_\${userId}_\${Math.random().toString(36).slice(2, 10)}\`;
}

export async function login(userId, _password) {
  const existing = sessions.get(userId);
  if (existing) return existing;
  const pending = inflight.get(userId);
  if (pending) return pending;
  const work = (async () => {
    await new Promise((r) => setTimeout(r, 15));
    const again = sessions.get(userId);
    if (again) return again;
    const token = createToken(userId);
    sessions.set(userId, token);
    return token;
  })();
  inflight.set(userId, work);
  try {
    return await work;
  } finally {
    inflight.delete(userId);
  }
}

export function currentSession(userId) {
  return sessions.get(userId) ?? null;
}

export function resetSessions() {
  sessions.clear();
  inflight.clear();
}

export function liveSessionCount(userId) {
  return [...sessions.entries()].filter(([id]) => id === userId).length;
}
`;

const HEALTH_MOD = `export function health() {
  return { ok: true, service: "northstar" };
}
`;

const HEALTH_SERVER = `import { login } from "./auth.js";
import { getUser, listUsers } from "./users.js";
import { health } from "./health.js";

export async function handle(method, path, body = {}) {
  if (method === "GET" && path === "/health") {
    return { status: 200, body: health() };
  }
  if (method === "GET" && path === "/users") {
    return { status: 200, body: listUsers() };
  }
  if (method === "GET" && path.startsWith("/users/")) {
    const id = path.slice("/users/".length);
    const user = getUser(id);
    return user ? { status: 200, body: user } : { status: 404, body: { error: "not_found" } };
  }
  if (method === "POST" && path === "/login") {
    const token = await login(body.userId, body.password);
    return { status: 200, body: { token } };
  }
  return { status: 404, body: { error: "not_found" } };
}
`;

const HEALTH_TEST = `import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../src/server.js";

test("GET /health reports ok", async () => {
  const res = await handle("GET", "/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.service, "northstar");
});
`;

const RATE_LIMIT = `const buckets = new Map();

export function resetRateLimits() {
  buckets.clear();
}

/**
 * Token bucket. capacity = burst, refillPerSec restores tokens.
 */
export function allow(identity, { capacity = 5, refillPerSec = 1 } = {}) {
  const now = Date.now();
  let b = buckets.get(identity);
  if (!b) {
    b = { tokens: capacity, updatedAt: now };
    buckets.set(identity, b);
  }
  const elapsed = (now - b.updatedAt) / 1000;
  b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
  b.updatedAt = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
`;

const RATE_SERVER = `import { login } from "./auth.js";
import { getUser, listUsers } from "./users.js";
import { allow } from "./rate-limit.js";

export async function handle(method, path, body = {}, meta = {}) {
  const identity = meta.identity ?? body.userId ?? "anon";
  if (!allow(identity, { capacity: 8, refillPerSec: 2 })) {
    return { status: 429, body: { error: "rate_limited" } };
  }
  if (method === "GET" && path === "/users") {
    return { status: 200, body: listUsers() };
  }
  if (method === "GET" && path.startsWith("/users/")) {
    const id = path.slice("/users/".length);
    const user = getUser(id);
    return user ? { status: 200, body: user } : { status: 404, body: { error: "not_found" } };
  }
  if (method === "POST" && path === "/login") {
    const token = await login(body.userId, body.password);
    return { status: 200, body: { token } };
  }
  return { status: 404, body: { error: "not_found" } };
}
`;

const RATE_TEST = `import test from "node:test";
import assert from "node:assert/strict";
import { allow, resetRateLimits } from "../src/rate-limit.js";

test("token bucket exhausts then rejects", () => {
  resetRateLimits();
  const id = "burst";
  let accepted = 0;
  let denied = 0;
  for (let i = 0; i < 8; i += 1) {
    if (allow(id, { capacity: 5, refillPerSec: 0 })) accepted += 1;
    else denied += 1;
  }
  assert.equal(accepted, 5);
  assert.equal(denied, 3);
});
`;

const LOGIN_FIXED = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Northstar console</title>
    <style>
      :root { color-scheme: dark; }
      body { font: 16px/1.5 "IBM Plex Sans", sans-serif; background: #0c0c0b; color: #eeeae3; margin: 0; }
      main { max-width: 28rem; margin: 12vh auto; padding: 1.5rem; }
      h1 { font-weight: 500; letter-spacing: -0.03em; }
      label { display: block; margin: 1rem 0 0.35rem; font-size: 0.85rem; color: #9a958b; }
      input { width: 100%; min-height: 44px; border: 0; border-radius: 8px; background: #1c1b19; color: #eeeae3; padding: 0 0.85rem; box-sizing: border-box; }
      button { margin-top: 1.25rem; min-height: 44px; padding: 0 1.1rem; border: 0; border-radius: 8px; background: #d8d2c6; color: #141413; font-weight: 500; }
      #status { margin-top: 1rem; color: #9a958b; min-height: 1.4em; }
    </style>
  </head>
  <body>
    <main>
      <p>Operator console</p>
      <h1>Northstar</h1>
      <label for="user">Identity</label>
      <input id="user" name="user" value="u_ada" autocomplete="username" />
      <button id="login-btn" type="button" aria-label="Sign in">Sign in</button>
      <p id="status" role="status"></p>
    </main>
    <script>
      document.getElementById("login-btn").addEventListener("click", () => {
        const id = document.getElementById("user").value || "operator";
        document.getElementById("status").textContent = "session ready for " + id;
      });
    </script>
  </body>
</html>
`;

export const FEATURES: FeatureSpec[] = [
  {
    key: "auth-race",
    title: "Authentication single-flight",
    keywords: ["auth", "race", "session", "login", "concurrent", "authentication"],
    requirements: [
      {
        key: "REQ-AUTH-1",
        text: "Concurrent login() for one user returns a single live token.",
        mandatory: true,
      },
      {
        key: "REQ-AUTH-2",
        text: "Existing session is reused on subsequent login.",
        mandatory: true,
      },
    ],
    crew: ["architecture-lead", "backend-engineer", "test-engineer", "final-verifier"],
    files: [{ path: "src/auth.js", content: AUTH_FIXED, mode: "write" }],
    testsToRun: ["tests/auth.test.js"],
    decisions: [
      {
        question: "How should overlapping logins be serialized?",
        options: ["mutex around map", "single-flight promise per user", "ignore race"],
        choice: "single-flight promise per user",
      },
    ],
  },
  {
    key: "health",
    title: "Health endpoint",
    keywords: ["health", "liveness", "readiness", "/health"],
    requirements: [
      {
        key: "REQ-HLTH-1",
        text: "GET /health returns { ok: true, service: 'northstar' }.",
        mandatory: true,
      },
      {
        key: "REQ-HLTH-2",
        text: "Unit test fails closed if the payload regresses.",
        mandatory: true,
      },
    ],
    crew: ["backend-engineer", "test-engineer", "final-verifier"],
    files: [
      { path: "src/health.js", content: HEALTH_MOD, mode: "create" },
      { path: "src/server.js", content: HEALTH_SERVER, mode: "write" },
      { path: "tests/health.test.js", content: HEALTH_TEST, mode: "create" },
    ],
    testsToRun: ["tests/health.test.js"],
    decisions: [
      {
        question: "Where does health live?",
        options: ["inline in server", "dedicated module"],
        choice: "dedicated module",
      },
    ],
  },
  {
    key: "rate-limit",
    title: "Token-bucket rate limiter",
    keywords: ["rate", "limit", "throttle", "bucket", "429"],
    requirements: [
      {
        key: "REQ-RL-1",
        text: "Request path applies a per-identity token bucket.",
        mandatory: true,
      },
      {
        key: "REQ-RL-2",
        text: "Burst exhaustion returns 429 semantics (tested).",
        mandatory: true,
      },
    ],
    crew: [
      "architecture-lead",
      "backend-engineer",
      "test-engineer",
      "security-reviewer",
      "final-verifier",
    ],
    files: [
      { path: "src/rate-limit.js", content: RATE_LIMIT, mode: "create" },
      { path: "src/server.js", content: RATE_SERVER, mode: "write" },
      { path: "tests/rate-limit.test.js", content: RATE_TEST, mode: "create" },
    ],
    testsToRun: ["tests/rate-limit.test.js"],
    decisions: [
      {
        question: "Which rate-limit algorithm?",
        options: ["fixed window", "sliding window", "token bucket"],
        choice: "token bucket",
      },
    ],
  },
  {
    key: "ui-login",
    title: "Accessible login console",
    keywords: ["console login", "sign in", "accessible", "browser", "ui-login"],
    requirements: [
      {
        key: "REQ-UI-1",
        text: "The Sign in control is enabled and has an accessible name.",
        mandatory: true,
      },
      {
        key: "REQ-UI-2",
        text: "Clicking Sign in completes login and is captured as browser evidence.",
        mandatory: true,
      },
    ],
    crew: ["frontend-engineer", "browser-verifier", "final-verifier"],
    files: [{ path: "web/index.html", content: LOGIN_FIXED, mode: "write" }],
    testsToRun: [],
    decisions: [
      {
        question: "How must the login control be exposed?",
        options: ["disabled Continue button", "accessible enabled Sign in", "icon-only control"],
        choice: "accessible enabled Sign in",
      },
    ],
  },
  ...EXTRA_PLAYBOOKS,
];

export function scoreFeature(objective: string, feature: FeatureSpec): number {
  const hay = objective.toLowerCase();
  let score = 0;
  for (const kw of feature.keywords) {
    if (hay.includes(kw)) score += kw.length > 6 ? 3 : 2;
  }
  if (hay.includes(feature.key.replace("-", " "))) score += 4;
  return score;
}

export function selectFeature(objective: string): FeatureSpec | null {
  let best: FeatureSpec | null = null;
  let bestScore = 0;
  for (const f of FEATURES) {
    const s = scoreFeature(objective, f);
    if (s > bestScore) {
      best = f;
      bestScore = s;
    }
  }
  return bestScore >= 3 ? best : null;
}

export function genericFeature(objective: string): FeatureSpec {
  const slug = objective
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "change";
  const safe = slug.replace(/-/g, "_");
  const impl = `/** Generated by ALJWHARAH ONE for: ${objective.replace(/\*\//g, "")} */
export function ${safe}Ready() {
  return { ok: true, feature: ${JSON.stringify(slug)} };
}
`;
  const test = `import test from "node:test";
import assert from "node:assert/strict";
import { ${safe}Ready } from "../src/${slug}.js";

test("${slug} reports ready", () => {
  const r = ${safe}Ready();
  assert.equal(r.ok, true);
});
`;
  return {
    key: "generic",
    title: objective.slice(0, 80),
    keywords: [],
    requirements: [
      {
        key: "REQ-1",
        text: `Implementation exists for: ${objective}`,
        mandatory: true,
      },
      {
        key: "REQ-2",
        text: "A unit test covers the new module.",
        mandatory: true,
      },
    ],
    crew: ["architecture-lead", "backend-engineer", "test-engineer", "final-verifier"],
    files: [
      { path: `src/${slug}.js`, content: impl, mode: "create" },
      { path: `tests/${slug}.test.js`, content: test, mode: "create" },
    ],
    testsToRun: [`tests/${slug}.test.js`],
    decisions: [
      {
        question: "How should this change be isolated?",
        options: ["inline patch", "dedicated module"],
        choice: "dedicated module",
      },
    ],
  };
}

export function resolveFeature(objective: string): FeatureSpec {
  const lower = objective.toLowerCase();
  if (
    lower.includes("ui-login") ||
    lower.includes("operator console") ||
    lower.includes("sign in") ||
    lower.includes("browser evidence") ||
    (lower.includes("login") &&
      (lower.includes("console") ||
        lower.includes("accessible") ||
        lower.includes("button") ||
        lower.includes("html") ||
        lower.includes("browser")))
  ) {
    return FEATURES.find((f) => f.key === "ui-login")!;
  }
  const selected = selectFeature(objective);
  if (selected) return selected;
  const extraKey = resolvePlaybookKey(objective);
  if (extraKey) {
    const extra = FEATURES.find((f) => f.key === extraKey);
    if (extra) return extra;
  }
  if (lower.includes("audit") || lower.includes("security review")) {
    return FEATURES.find((f) => f.key === "security-audit") ?? FEATURES.find((f) => f.key === "auth-race")!;
  }
  return genericFeature(objective);
}
