import { readRepoFile } from "./repository.ts";
import { inspectUntrustedText } from "./instruction-boundary.ts";
import { watchRepository } from "./security-watch.ts";

export interface RedTeamReport {
  passed: boolean;
  attacks: Array<{ name: string; succeeded: boolean; detail: string }>;
}

export function runRedTeam(root: string, changedFiles: string[]): RedTeamReport {
  const attacks: RedTeamReport["attacks"] = [];

  const secrets = watchRepository(root).filter((f) => f.kind === "secret");
  attacks.push({
    name: "secret-leak",
    succeeded: secrets.length > 0,
    detail: secrets.length ? secrets.map((s) => s.file).join(",") : "no committed secret pattern",
  });

  let injection = false;
  for (const file of changedFiles.concat(["README.md", "docs/NOTE.md"])) {
    const body = readRepoFile(root, file);
    if (!body) continue;
    const inspect = inspectUntrustedText(body, "REPOSITORY");
    if (!inspect.allowed) {
      injection = true;
      attacks.push({ name: "prompt-injection", succeeded: false, detail: `${file}: blocked (${inspect.reason})` });
    }
  }
  if (!injection) attacks.push({ name: "prompt-injection", succeeded: false, detail: "no executable override granted" });

  const auth = readRepoFile(root, "src/auth.js") ?? "";
  const race = /sessions\.get\(userId\)/.test(auth) && !/inflight/.test(auth);
  attacks.push({
    name: "auth-race",
    succeeded: race,
    detail: race ? "check-then-set without single-flight still present" : "single-flight or no auth module",
  });

  const cmdInj = watchRepository(root).filter((f) => f.kind === "command-injection");
  attacks.push({
    name: "command-injection",
    succeeded: cmdInj.length > 0,
    detail: cmdInj.length ? cmdInj.map((s) => s.file).join(",") : "no command injection found",
  });

  const passed = attacks.every((a) => a.succeeded === false);
  return { passed, attacks };
}
