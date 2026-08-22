import { listRepoFiles, readRepoFile } from "./repository.ts";

export type FindingSeverity = "low" | "medium" | "high" | "critical";

export interface SecurityFinding {
  id: string;
  severity: FindingSeverity;
  kind: string;
  file: string;
  evidence: string;
  remediation: string;
  status: "open";
}

const PATTERNS: Array<{ kind: string; re: RegExp; severity: FindingSeverity; remediation: string }> = [
  { kind: "secret", re: /(ghp_|github_pat_|sk_live_|AKIA[0-9A-Z]{16}|BEGIN (RSA |OPENSSH )?PRIVATE KEY)/, severity: "critical", remediation: "revoke and rotate; never commit" },
  { kind: "command-injection", re: /child_process\.(exec|execSync)\([^)]*\+|eval\(/, severity: "high", remediation: "use allowlisted argv, never interpolate" },
  { kind: "path-traversal", re: /\.\.\/|\.\.\\/, severity: "high", remediation: "resolve + prefix-check against root" },
  { kind: "sql-injection", re: /SELECT .+ \+ |query\(`[^`]*\$\{/, severity: "high", remediation: "parameterized queries" },
  { kind: "xss", re: /innerHTML\s*=|dangerouslySetInnerHTML/, severity: "medium", remediation: "textContent or sanitized markup" },
  { kind: "ssrf", re: /fetch\(\s*[`'"]https?:\/\/\$\{/, severity: "high", remediation: "allowlist hosts" },
  { kind: "auth-bypass", re: /req\.user\s*=\s*\{|skipAuth\s*=\s*true/, severity: "critical", remediation: "never assign identity from client input" },
];

export function watchRepository(root: string): SecurityFinding[] {
  const files = listRepoFiles(root, 200);
  const findings: SecurityFinding[] = [];
  let n = 0;
  for (const file of files) {
    if (!/\.(js|ts|tsx|mjs|cjs|json|env|md)$/.test(file)) continue;
    const body = readRepoFile(root, file);
    if (!body) continue;
    if (file.includes("node_modules")) continue;
    for (const p of PATTERNS) {
      if (p.re.test(body)) {
        findings.push({
          id: `sec-${++n}`,
          severity: p.severity,
          kind: p.kind,
          file,
          evidence: `${p.kind} pattern in ${file}`,
          remediation: p.remediation,
          status: "open",
        });
      }
    }
  }
  return findings;
}
