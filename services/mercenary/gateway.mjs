#!/usr/bin/env node
/**
 * Mercenary ingress. Intended transport: WSS/mTLS.
 * This process only accepts HMAC-framed JSON: { snippet, question, token }.
 * No workspace path, no secrets, cannotCertify.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.AJ_MERCENARY_PORT || 0);
const server = createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/frame") {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, reason: "handle frames inside ajd — this listener is a bind stub", cannotCertify: true }));
  });
});
if (PORT) server.listen(PORT, "127.0.0.1");
export { server };
