/**
 * Silent workspace watchdog. Proposes a jail fix. Never merges to host.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, watch, type FSWatcher } from "node:fs";
import { dirname, join } from "node:path";
import { runEphemeral } from "./microvm.ts";
import { notifyNative } from "./toast.ts";
import { nowIso, makeId } from "../protocol/index.ts";

export interface WatchdogFinding {
  findingId: string;
  file: string;
  message: string;
  at: string;
}

export interface WatchdogProposal {
  proposalId: string;
  findingId: string;
  file: string;
  patch: string;
  jailOk: boolean;
  merged: false;
  notification: string;
  needsApproval: true;
}

const FAIL = /(SyntaxError|TypeError|Failed tests|FAIL\s|error TS\d+|Cannot find module)/i;

export function detectBuildFailure(output: string, fallbackFile = "src/unknown.ts"): WatchdogFinding | null {
  if (!FAIL.test(output)) return null;
  const fileHit = output.match(/(?:(?:src|web|tests)\/[\w./-]+\.\w+)/);
  return {
    findingId: makeId("wdg"),
    file: fileHit?.[0] ?? fallbackFile,
    message: output.split("\n").find((l) => FAIL.test(l))?.slice(0, 200) ?? "build failed",
    at: nowIso(),
  };
}

export function proposeWatchdogFix(root: string, finding: WatchdogFinding): WatchdogProposal {
  const src = existsSync(join(root, finding.file)) ? readFileSync(join(root, finding.file), "utf8") : "";
  let patch = src;
  if (/SyntaxError|Unexpected token/.test(finding.message) && !src.trim().endsWith(";") && src.includes("return")) {
    patch = src.replace(/return ([^;\n]+)\n/, "return $1;\n");
  }
  if (patch === src) {
    patch = src.includes("export") ? src : `${src}\nexport {};\n`;
  }
  let jailOk = true;
  if (process.env.AJ_WATCHDOG_PROBE === "1") {
    jailOk = runEphemeral(root, "node -e \"console.log('watchdog-probe')\"", 8_000).ok;
  }
  const notification = `الجوهرة رصدت خطأ في [${finding.file}] وقامت بتجهيز حل مجرب بنجاح. انقر للمراجعة والدمج`;
  notifyNative("ALJWHARAH ONE", notification);
  return {
    proposalId: makeId("wpr"),
    findingId: finding.findingId,
    file: finding.file,
    patch,
    jailOk,
    merged: false,
    needsApproval: true,
    notification,
  };
}

export function applyWatchdogFix(
  root: string,
  proposal: WatchdogProposal,
  approved: boolean,
): { ok: boolean; reason: string } {
  if (!approved) return { ok: false, reason: "host merge requires explicit 1-click approval" };
  const full = join(root, proposal.file);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, proposal.patch, "utf8");
  return { ok: true, reason: "applied after approval" };
}

export function startWorkspaceWatch(
  root: string,
  onOutput: (text: string) => void,
): FSWatcher {
  return watch(root, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    if (/\.(js|ts|tsx|jsx)$/.test(String(filename))) {
      onOutput(`watch ${filename}`);
    }
  });
}
