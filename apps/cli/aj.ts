#!/usr/bin/env node
/**
 * ajd CLI — thin client. Governance stays in the daemon.
 *   aj init [dir]
 *   aj run "task"
 *   aj mission list|start|status|pause|resume
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AjDaemon } from "../../src/daemon/ajd.ts";
import { signOperatorEvent } from "../../src/runtime/ingress.ts";
import { serveLens } from "../../src/runtime/lens-server.ts";
import { serveLensWs } from "../../src/runtime/lens-ws.ts";
import { startWorkspaceWatch } from "../../src/runtime/watchdog.ts";

const op = process.env.AJ_USER ?? "local-operator";
const ajd = new AjDaemon();
const [cmd = "help", sub = "", ...rest] = process.argv.slice(2);

function print(value: unknown) {
  console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

if (cmd === "init") {
  const target = sub || process.cwd();
  const dir = join(target, ".aljwharah");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), JSON.stringify({ bound: true, operator: op, at: new Date().toISOString() }, null, 2));
  print({ ok: true, bound: target });
} else if (cmd === "run") {
  const objective = [sub, ...rest].join(" ").trim();
  if (!objective) {
    console.error("objective required");
    process.exit(1);
  }
  const mission = ajd.startMission(op, objective, process.cwd());
  print({ missionId: mission.missionId, state: mission.state });
} else if (cmd === "overlay") {
  const raw = sub === "stop" || sub === "cancel" || sub === "panic" ? "stop" : [sub, ...rest].join(" ").trim();
  print(ajd.overlayInvoke(op, raw || "toggle"));
} else if (cmd === "mission" && sub === "list") {
  const view = ajd.view(op);
  print(view.missions.map((m) => ({ id: m.missionId, state: m.state, title: m.title, progress: m.progress })));
} else if (cmd === "mission" && sub === "start") {
  const objective = rest.join(" ").trim();
  if (!objective) process.exit(1);
  const mission = ajd.startMission(op, objective);
  print({ missionId: mission.missionId, state: mission.state });
} else if (cmd === "mission" && sub === "status") {
  const id = rest[0];
  if (!id) process.exit(1);
  print(ajd.missionView(op, id).missions[0] ?? { error: "not found" });
} else if (cmd === "mission" && (sub === "pause" || sub === "resume")) {
  const id = rest[0];
  if (!id) process.exit(1);
  if (sub === "pause") ajd.pause(op, id);
  else ajd.resume(op, id);
  print({ ok: true, sub, id });
} else if (cmd === "agents") {
  const view = sub ? ajd.missionView(op, sub) : ajd.view(op);
  print(view.agents.map((a) => ({ id: a.agentId, role: a.role, state: a.state })));
} else if (cmd === "hook") {
  const event = sub || "ci-failure";
  ajd.view(op);
  const timestamp = new Date().toISOString();
  const rawBody = JSON.stringify({ conclusion: "failure", source: "aj-cli" });
  const signed = signOperatorEvent(op, timestamp, rawBody);
  if (!signed.ok) {
    console.error(signed.reason);
    process.exit(1);
  }
  print(
    ajd.ingestExternalEvent(op, {
      source: "aj-cli",
      event,
      timestamp,
      signature: signed.signature,
      rawBody,
      mode: "aj",
    }),
  );
} else if (cmd === "approve" || cmd === "reject") {
  const id = sub;
  if (!id) process.exit(1);
  ajd.resolveApproval(op, id, cmd === "approve" ? "allow-once" : "denied");
  print({ ok: true, cmd, id });
} else if (cmd === "lens") {
  serveLens(op);
  serveLensWs(op);
  print({ ok: true, tcp: 8765, ws: 8766 });
} else if (cmd === "watch") {
  const root = sub || process.cwd();
  startWorkspaceWatch(root, (text) => {
    print(ajd.observeBuild(op, text, root));
  });
  print({ ok: true, watching: root });
} else if (cmd === "approvals") {
  print(ajd.view(op).approvals);
} else {
  print(`aj <init|run|lens|watch|overlay|mission|approve|reject|agents|approvals|hook>`);
}
