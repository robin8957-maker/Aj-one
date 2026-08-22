import { activeSessionCount } from "./auth.js";

const startedAt = Date.now();

export function health() {
  return {
    ok: true,
    status: "ok",
    service: "northstar",
    timestamp: Date.now(),
    uptime: process.uptime ? process.uptime() : (Date.now() - startedAt) / 1000,
    activeUsers: activeSessionCount(),
  };
}
