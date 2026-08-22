export function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function shortId(id: string): string {
  const parts = id.split("_");
  return parts[parts.length - 1]?.slice(0, 6) ?? id.slice(0, 6);
}

export function timeLabel(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function stateTone(state: string): string {
  if (state === "COMPLETE" || state === "verified") return "text-ok";
  if (state === "FAILED" || state === "CANCELLED" || state === "denied") return "text-danger";
  if (state === "BLOCKED" || state === "WAITING_APPROVAL" || state === "PAUSED") return "text-warn";
  if (state === "RUNNING" || state === "VERIFYING" || state === "PLANNING") return "text-accent";
  return "text-fg-muted";
}
