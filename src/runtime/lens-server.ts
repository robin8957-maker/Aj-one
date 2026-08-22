/**
 * Local JSON-RPC lens. Bind 127.0.0.1 only. Thin client — no fs.write.
 */
import { createServer, type Server, type Socket } from "node:net";
import { handleLensRpc, type JsonRpcReq } from "./lens.ts";
import { reconstruct } from "../daemon/store.ts";

export const LENS_PORT = Number(process.env.AJ_LENS_PORT || 8765);

export function serveLens(operatorId = "local-operator", port = LENS_PORT): Server {
  const server = createServer((sock: Socket) => {
    let buf = "";
    sock.setEncoding("utf8");
    sock.on("data", (chunk) => {
      buf += chunk;
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let req: JsonRpcReq;
        try {
          req = JSON.parse(line) as JsonRpcReq;
        } catch {
          sock.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse" } })}\n`);
          continue;
        }
        const world = reconstruct(operatorId);
        const missions = Object.values(world.missions).map((m) => ({
          missionId: m.missionId,
          state: m.state,
          title: m.title,
        }));
        sock.write(`${JSON.stringify(handleLensRpc(req, { missions }))}\n`);
      }
    });
  });
  server.listen(port, "127.0.0.1");
  return server;
}
