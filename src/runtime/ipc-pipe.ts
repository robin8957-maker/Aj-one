/**
 * Transport to the Rust host pipe.
 * Windows: \\.\pipe\aljwharah-ajd (opened by the native host).
 * Linux: /tmp/aljwharah-$uid.sock
 * Node never implements the Windows API — it only connects.
 */
import { createConnection } from "node:net";
import { userInfo } from "node:os";

export function pipePath(): string {
  if (process.platform === "win32") return "\\\\.\\pipe\\aljwharah-ajd";
  return `/tmp/aljwharah-${userInfo().uid}.sock`;
}

export function isUserScoped(path: string): boolean {
  if (process.platform === "win32") return path.startsWith("\\\\.\\pipe\\aljwharah-");
  return path.includes(`aljwharah-${userInfo().uid}`);
}

export function pingOverPipe(path = pipePath(), timeoutMs = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = createConnection({ path });
    const t = setTimeout(() => {
      sock.destroy();
      reject(new Error("pipe timeout"));
    }, timeoutMs);
    sock.on("connect", () => sock.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n'));
    sock.setEncoding("utf8");
    sock.on("data", (d) => {
      clearTimeout(t);
      sock.end();
      resolve(String(d));
    });
    sock.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}
