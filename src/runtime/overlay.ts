/**
 * Frameless Commander overlay. Input is tainted until parsed.
 * start → ajd.startMission   stop → cancel active   toggle → show palette
 */
export type OverlayIntent =
  | { kind: "toggle" }
  | { kind: "start"; objective: string }
  | { kind: "stop" };

const STOP = /^(stop|cancel|panic|halt|أوقف|ايقاف|إيقاف)$/i;

export function parseOverlayIntent(raw: string): { ok: true; intent: OverlayIntent } | { ok: false; reason: string } {
  const t = raw.trim();
  if (!t || t.toLowerCase() === "toggle") return { ok: true, intent: { kind: "toggle" } };
  if (t.includes("\0") || t.includes("..")) return { ok: false, reason: "overlay denied: tainted input" };
  if (t.length > 2_000) return { ok: false, reason: "overlay denied: objective too long" };
  if (STOP.test(t)) return { ok: true, intent: { kind: "stop" } };
  const objective = t.replace(/^(start|run|new|ابدأ)\s+/i, "").trim();
  if (!objective) return { ok: false, reason: "overlay denied: empty objective" };
  return { ok: true, intent: { kind: "start", objective } };
}

export function isCommanderChord(e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; code: string; key: string }): boolean {
  const chord = e.ctrlKey || e.metaKey;
  const space = e.code === "Space" || e.key === " " || e.key === "Spacebar";
  return chord && e.shiftKey && space;
}
