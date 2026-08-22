/**
 * Aljwharah Lens — thin JSON-RPC for VS Code / Cursor.
 * Governance stays in ajd. This is a viewer/controller only.
 */
export interface JsonRpcReq {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcRes {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const LENS_METHODS = new Set(["ping", "missions.list", "mission.diff", "jail.status"]);

export function handleLensRpc(
  req: JsonRpcReq,
  ctx: { missions: { missionId: string; state: string; title: string }[]; diffs?: Record<string, string> },
): JsonRpcRes {
  if (req.jsonrpc !== "2.0" || !LENS_METHODS.has(req.method)) {
    return { jsonrpc: "2.0", id: req.id ?? null, error: { code: -32601, message: "method not allowed" } };
  }
  if (req.method === "ping") return { jsonrpc: "2.0", id: req.id, result: { ok: true, thinClient: true } };
  if (req.method === "missions.list") return { jsonrpc: "2.0", id: req.id, result: ctx.missions };
  if (req.method === "mission.diff") {
    const id = String(req.params?.missionId ?? "");
    return { jsonrpc: "2.0", id: req.id, result: { missionId: id, diff: ctx.diffs?.[id] ?? "" } };
  }
  return { jsonrpc: "2.0", id: req.id, result: { overlay: "namespace-ephemeral", writable: false } };
}
