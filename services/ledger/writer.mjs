#!/usr/bin/env node
/**
 * Isolated ledger writer. Survives parent crash long enough to fsync
 * a crash line. Protocol: one JSON object per stdin line.
 */
import { openSync, writeSync, fsyncSync, closeSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import readline from "node:readline";

function appendLine(path, line) {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "a", 0o600);
  try {
    writeSync(fd, line.endsWith("\n") ? line : `${line}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (raw) => {
  if (!raw.trim()) return;
  try {
    const msg = JSON.parse(raw);
    if (msg.op === "append" && msg.path && msg.line) appendLine(msg.path, msg.line);
    if (msg.op === "crash" && msg.path) {
      appendLine(msg.path, JSON.stringify({ type: "DaemonCrashed", at: new Date().toISOString(), note: msg.note || "parent gone" }));
    }
    process.stdout.write("ok\n");
  } catch (err) {
    process.stderr.write(`ledger-writer: ${err instanceof Error ? err.message : err}\n`);
    process.stdout.write("err\n");
  }
});
