/**
 * Local WebSocket JSON-RPC for the VS Code / Cursor lens.
 * 127.0.0.1 only. Thin client — fs.write is rejected by handleLensRpc.
 */
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Socket } from "node:net";
import { handleLensRpc, type JsonRpcReq } from "./lens.ts";
import { reconstruct } from "../daemon/store.ts";

export const LENS_WS_PORT = Number(process.env.AJ_LENS_WS_PORT || 8766);
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function acceptKey(key: string): string {
  return createHash("sha1").update(key + GUID).digest("base64");
}

function decodeFrame(buf: Buffer): string | null {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  if (opcode === 0x8) return "";
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let off = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    off = 4;
  } else if (len === 127) return null;
  if (masked) {
    if (buf.length < off + 4 + len) return null;
    const mask = buf.subarray(off, off + 4);
    off += 4;
    const data = Buffer.alloc(len);
    for (let i = 0; i < len; i++) data[i] = buf[off + i] ^ mask[i % 4];
    return data.toString("utf8");
  }
  if (buf.length < off + len) return null;
  return buf.subarray(off, off + len).toString("utf8");
}

function encodeText(text: string): Buffer {
  const payload = Buffer.from(text, "utf8");
  if (payload.length < 126) {
    return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  }
  const head = Buffer.alloc(4);
  head[0] = 0x81;
  head[1] = 126;
  head.writeUInt16BE(payload.length, 2);
  return Buffer.concat([head, payload]);
}

export function serveLensWs(operatorId = "local-operator", port = LENS_WS_PORT): Server {
  const server = createServer((_req, res) => {
    res.writeHead(426, { "Content-Type": "text/plain" });
    res.end("WebSocket only");
  });
  server.on("upgrade", (req: IncomingMessage, sock: Socket) => {
    const key = req.headers["sec-websocket-key"];
    if (req.headers.upgrade !== "websocket" || !key || Array.isArray(key)) {
      sock.end();
      return;
    }
    const host = String(req.headers.host ?? "");
    if (!host.startsWith("127.0.0.1") && !host.startsWith("localhost")) {
      sock.end();
      return;
    }
    sock.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${acceptKey(key)}`,
        "",
        "",
      ].join("\r\n"),
    );
    sock.on("data", (chunk: Buffer) => {
      const text = decodeFrame(chunk);
      if (text === null || text === "") return;
      let reqJson: JsonRpcReq;
      try {
        reqJson = JSON.parse(text) as JsonRpcReq;
      } catch {
        sock.write(encodeText(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse" } })));
        return;
      }
      const world = reconstruct(operatorId);
      const missions = Object.values(world.missions).map((m) => ({
        missionId: m.missionId,
        state: m.state,
        title: m.title,
      }));
      sock.write(encodeText(JSON.stringify(handleLensRpc(reqJson, { missions }))));
    });
  });
  server.listen(port, "127.0.0.1");
  return server;
}
