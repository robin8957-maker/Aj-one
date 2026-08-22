import type { FeatureSpec } from "./catalog-types.ts";

function moduleSpec(
  key: string,
  title: string,
  keywords: string[],
  crew: FeatureSpec["crew"],
  slug: string,
  extraReq: string,
): FeatureSpec {
  const impl = `/** ALJWHARAH ONE playbook: ${title.replace(/\*\//g, "")} */
export function ${slug}Ready() {
  return { ok: true, feature: ${JSON.stringify(key)}, localOnly: true };
}

export function ${slug}Plan() {
  return {
    steps: ${JSON.stringify(keywords.slice(0, 4))},
    constraints: { localOnly: true, noCloudRuntime: true },
  };
}
`;
  const test = `import test from "node:test";
import assert from "node:assert/strict";
import { ${slug}Ready } from "../src/${slug}.js";

test("${key} reports ready", () => {
  const r = ${slug}Ready();
  assert.equal(r.ok, true);
  assert.equal(r.localOnly, true);
});
`;
  return {
    key,
    title,
    keywords,
    requirements: [
      { key: `REQ-${key.toUpperCase()}-1`, text: extraReq, mandatory: true },
      { key: `REQ-${key.toUpperCase()}-2`, text: "A unit test covers the new module.", mandatory: true },
    ],
    crew,
    files: [
      { path: `src/${slug}.js`, content: impl, mode: "create" },
      { path: `tests/${slug}.test.js`, content: test, mode: "create" },
    ],
    testsToRun: [`tests/${slug}.test.js`],
    decisions: [
      {
        question: "Where does this change live?",
        options: ["inline patch", "dedicated module"],
        choice: "dedicated module",
      },
    ],
  };
}

export const EXTRA_PLAYBOOKS: FeatureSpec[] = [
  moduleSpec("bug-fix", "Bug Fix", ["bug", "fix", "reproduce", "regression"], ["architecture-lead", "backend-engineer", "test-engineer", "final-verifier"], "bug_fix", "Identify, reproduce, and fix a reported bug with a failing test first."),
  moduleSpec("feature-implement", "Feature Implementation", ["feature", "implement", "new capability"], ["architecture-lead", "backend-engineer", "frontend-engineer", "test-engineer", "final-verifier"], "feature_impl", "Implement a new feature as an isolated module with tests."),
  moduleSpec("test-suite-create", "Test Suite Creation", ["coverage", "unit test", "test suite"], ["test-engineer", "security-reviewer", "final-verifier"], "test_suite", "Add a focused unit suite for existing code paths."),
  moduleSpec("code-review", "Code Review", ["review", "refactor", "quality"], ["architecture-lead", "security-reviewer", "final-verifier"], "code_review", "Record review findings as a local artifact, not a remote report."),
  moduleSpec("database-migration", "Database Migration Notes", ["database", "migration", "schema"], ["backend-engineer", "test-engineer", "final-verifier"], "db_migration", "Document a local schema change with a rollback note."),
  moduleSpec("dependency-update", "Dependency Audit", ["dependency", "update", "package"], ["backend-engineer", "security-reviewer", "final-verifier"], "dep_update", "Audit dependencies without calling a cloud registry write path."),
  moduleSpec("documentation-generate", "Documentation Module", ["docs", "documentation", "readme"], ["architecture-lead", "backend-engineer", "final-verifier"], "docs_mod", "Generate a local documentation module for the change."),
  moduleSpec("performance-optimize", "Performance Notes", ["performance", "slow", "optimize", "profile"], ["backend-engineer", "test-engineer", "final-verifier"], "perf_opt", "Capture a local performance checklist and a ready probe."),
  moduleSpec("deploy-safely", "Local Release Checklist", ["deploy", "release", "canary"], ["architecture-lead", "security-reviewer", "final-verifier"], "deploy_check", "Produce a local release checklist. No cloud deploy is invoked."),
  moduleSpec("backup-verify", "Backup Verification Notes", ["backup", "restore", "disaster"], ["backend-engineer", "security-reviewer", "final-verifier"], "backup_verify", "Describe a local backup verification step."),
  moduleSpec("security-audit", "Security Audit Module", ["security", "audit", "secrets", "threat"], ["security-reviewer", "test-engineer", "final-verifier"], "sec_audit", "Produce a security artifact covering auth, secrets, and input trust."),
  moduleSpec("scaling-test", "Load Notes", ["load", "scale", "stress"], ["backend-engineer", "test-engineer", "final-verifier"], "scale_test", "Record a local load-test plan. Execution stays in the jail."),
  moduleSpec("integration-test", "Integration Harness", ["integration", "e2e", "harness"], ["test-engineer", "frontend-engineer", "final-verifier"], "integ_test", "Add an integration harness module with a passing probe."),
  moduleSpec("accessibility-audit", "Accessibility Notes", ["accessibility", "a11y", "wcag"], ["frontend-engineer", "test-engineer", "final-verifier"], "a11y_audit", "Record WCAG-oriented checks for the operator console."),
  moduleSpec("regression-suite", "Regression Suite", ["regression", "previous bug"], ["test-engineer", "final-verifier"], "regression_suite", "Re-assert previously fixed behaviours with a local test."),
  moduleSpec("api-specification", "API Specification", ["openapi", "api spec", "endpoints"], ["architecture-lead", "backend-engineer", "final-verifier"], "api_spec", "Emit a local API description module for existing routes."),
];

export function resolvePlaybookKey(objective: string): string | null {
  const keywords = objective.toLowerCase();
  if (keywords.includes("bug") || /\bfix\b/.test(keywords)) return "bug-fix";
  if (keywords.includes("feature") || keywords.includes("implement")) return "feature-implement";
  if (keywords.includes("coverage") || keywords.includes("test suite")) return "test-suite-create";
  if (keywords.includes("review") || keywords.includes("refactor")) return "code-review";
  if (keywords.includes("database") || keywords.includes("migration")) return "database-migration";
  if (keywords.includes("deploy") || keywords.includes("release")) return "deploy-safely";
  if (keywords.includes("security") || keywords.includes("audit")) return "security-audit";
  if (keywords.includes("performance") || keywords.includes("slow")) return "performance-optimize";
  if (keywords.includes("backup") || keywords.includes("restore")) return "backup-verify";
  if (keywords.includes("accessib") || keywords.includes("a11y")) return "accessibility-audit";
  if (keywords.includes("openapi") || keywords.includes("api spec")) return "api-specification";
  if (keywords.includes("regression")) return "regression-suite";
  if (keywords.includes("integration")) return "integration-test";
  if (keywords.includes("dependenc")) return "dependency-update";
  if (keywords.includes("document")) return "documentation-generate";
  if (keywords.includes("scale") || keywords.includes("load test")) return "scaling-test";
  return null;
}
