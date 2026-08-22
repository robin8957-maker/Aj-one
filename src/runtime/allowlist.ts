/**
 * Terminal allowlist. A deny-list is not a sandbox — base64, interpreters,
 * and `;` chains walk around it. Only these heads may run, and only inside
 * the namespace jail, with no shell metacharacters.
 */
const HEADS = new Set(["ls", "pwd", "cat", "head", "tail", "wc", "echo", "date", "true", "false", "test", "node", "npm", "npx", "git"]);
const GIT = new Set(["status", "diff", "log", "show", "rev-parse", "blame"]);
const NPM = new Set(["test", "run", "ci", "ls", "version"]);
const META = /[;&|`$><\n]|\$\(|\$\{/;

export function authorizeCommand(raw: string): { ok: true } | { ok: false; reason: string } {
  const cmd = raw.trim();
  if (!cmd) return { ok: false, reason: "empty command" };
  if (META.test(cmd)) return { ok: false, reason: "shell metacharacters refused — allowlist only" };
  const tokens = cmd.split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]!)) i += 1;
  const head = tokens[i];
  if (!head) return { ok: false, reason: "no command" };
  if (head.includes("/") || head.includes("..") || head.startsWith(".")) {
    return { ok: false, reason: "path-qualified binaries refused" };
  }
  if (!HEADS.has(head)) return { ok: false, reason: `command '${head}' is not on the allowlist` };
  if (head === "git" && !GIT.has(tokens[i + 1] ?? "")) {
    return { ok: false, reason: "git subcommand not on allowlist" };
  }
  if (head === "npm" && !NPM.has(tokens[i + 1] ?? "")) {
    return { ok: false, reason: "npm subcommand not on allowlist" };
  }
  return { ok: true };
}

export function refuseTaintedInterpolation(command: string, previews: string[]): { ok: true } | { ok: false; reason: string } {
  for (const preview of previews) {
    const slice = preview.trim();
    if (slice.length >= 8 && command.includes(slice)) {
      return { ok: false, reason: "tainted context must not enter a shell command" };
    }
  }
  return { ok: true };
}
