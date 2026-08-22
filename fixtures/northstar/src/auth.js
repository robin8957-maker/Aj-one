/**
 * Northstar session issuer.
 * Single-flight per user: overlapping login() calls share one in-flight promise
 * so two live tokens cannot be minted for the same identity.
 */
const sessions = new Map();
const inflight = new Map();

export function createToken(userId) {
  return `nst_${userId}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeUserId(userId) {
  return String(userId ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 128);
}

export async function login(userId, _password) {
  const id = sanitizeUserId(userId);
  if (!id) {
    const err = new Error("invalid_identity");
    err.code = "invalid_identity";
    throw err;
  }
  const existing = sessions.get(id);
  if (existing?.token) return existing.token;
  const pending = inflight.get(id);
  if (pending) return pending;
  const work = (async () => {
    await new Promise((r) => setTimeout(r, 15));
    const again = sessions.get(id);
    if (again?.token) return again.token;
    const token = createToken(id);
    sessions.set(id, { token, active: true, createdAt: Date.now() });
    return token;
  })();
  inflight.set(id, work);
  try {
    return await work;
  } finally {
    inflight.delete(id);
  }
}

export function currentSession(userId) {
  const rec = sessions.get(sanitizeUserId(userId));
  return rec?.token ?? null;
}

export function resetSessions() {
  sessions.clear();
  inflight.clear();
}

export function liveSessionCount(userId) {
  const id = sanitizeUserId(userId);
  return [...sessions.entries()].filter(([key]) => key === id).length;
}

export function activeSessionCount() {
  return sessions.size;
}
