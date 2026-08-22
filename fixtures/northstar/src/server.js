import { login } from "./auth.js";
import { getUser, listUsers } from "./users.js";
import { health } from "./health.js";
import { allow } from "./rate-limit.js";

export async function handle(method, path, body = {}, meta = {}) {
  if (method === "GET" && path === "/health") {
    return { status: 200, body: health() };
  }

  const identity = String(meta.identity ?? body.userId ?? body.email ?? "anon").toLowerCase();
  if (!allow(identity, { capacity: 5, refillPerSec: 5 / (15 * 60) })) {
    return { status: 429, body: { error: "rate_limited", message: "Too many login attempts" } };
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
    try {
      const token = await login(body.userId ?? body.email, body.password);
      return { status: 200, body: { success: true, token } };
    } catch (err) {
      return { status: 400, body: { error: err?.code ?? "login_failed" } };
    }
  }
  return { status: 404, body: { error: "not_found" } };
}
