/**
 * Native toast. Linux: notify-send. Windows host: aljwharah-one toast.
 * Never embeds secrets.
 */
import { spawnSync } from "node:child_process";

export function notifyNative(title: string, body: string): { delivered: boolean; backend: string } {
  const cleanTitle = title.replace(/sk-|Bearer |BEGIN /g, "").slice(0, 80);
  const cleanBody = body.replace(/sk-|Bearer |BEGIN /g, "").slice(0, 240);
  if (process.platform === "linux") {
    const r = spawnSync("notify-send", ["-a", "ALJWHARAH ONE", cleanTitle, cleanBody], {
      encoding: "utf8",
      timeout: 2_000,
    });
    if (r.status === 0) return { delivered: true, backend: "notify-send" };
  }
  if (process.platform === "win32") {
    const r = spawnSync("aljwharah-one", ["toast", "apr_host"], { encoding: "utf8", timeout: 2_000 });
    if (r.status === 0) return { delivered: true, backend: "native-host" };
  }
  return { delivered: false, backend: "in-app" };
}
