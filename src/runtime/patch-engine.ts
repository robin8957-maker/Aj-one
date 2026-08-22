/**
 * Unified Diff Patch Engine with atomic all-or-nothing guarantees,
 * strict context-line matching, size limits, binary rejection, and pre-image revert.
 * No regex mutation. Pure deterministic diff application.
 */
import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import { resolve, dirname, sep } from "node:path";
import { AJ_ERR } from "./errors.ts";
import { matchScope } from "./workspace.ts";

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  isNew: boolean;
  isDeleted: boolean;
  hunks: Hunk[];
}

export interface PatchResult {
  ok: boolean;
  patchedFiles: string[];
  code?: string;
  reason?: string;
  errorDetails?: {
    file: string;
    hunkIndex?: number;
    expectedLine?: string;
    actualLine?: string;
  };
}

export const MAX_PATCHABLE_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export function isBinaryContent(buffer: Buffer | string): boolean {
  if (typeof buffer === "string") {
    return buffer.includes("\0");
  }
  for (let i = 0; i < Math.min(buffer.length, 8000); i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

export function parseUnifiedDiff(diffText: string): FileDiff[] {
  const fileDiffs: FileDiff[] = [];
  const lines = diffText.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.startsWith("--- ")) {
      const oldHeader = line.slice(4).trim();
      i++;
      if (i >= lines.length || !lines[i]!.startsWith("+++ ")) {
        continue;
      }
      const newHeader = lines[i]!.slice(4).trim();
      i++;

      const cleanOld = oldHeader.replace(/^a\//, "").replace(/^\/dev\/null/, "/dev/null");
      const cleanNew = newHeader.replace(/^b\//, "").replace(/^\/dev\/null/, "/dev/null");

      const isNew = cleanOld === "/dev/null";
      const isDeleted = cleanNew === "/dev/null";
      const targetPath = isNew ? cleanNew : cleanOld;

      const fileDiff: FileDiff = {
        oldPath: cleanOld,
        newPath: cleanNew,
        isNew,
        isDeleted,
        hunks: [],
      };

      while (i < lines.length && lines[i]!.startsWith("@@")) {
        const hunkHeader = lines[i]!;
        i++;
        const match = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(hunkHeader);
        if (!match) continue;

        const oldStart = parseInt(match[1]!, 10);
        const oldLines = match[2] !== undefined ? parseInt(match[2], 10) : 1;
        const newStart = parseInt(match[3]!, 10);
        const newLines = match[4] !== undefined ? parseInt(match[4], 10) : 1;

        const hunkLines: string[] = [];
        while (i < lines.length && !lines[i]!.startsWith("@@") && !lines[i]!.startsWith("--- ")) {
          const hl = lines[i]!;
          if (hl.startsWith("+") || hl.startsWith("-") || hl.startsWith(" ") || hl === "") {
            hunkLines.push(hl);
            i++;
          } else {
            break;
          }
        }

        fileDiff.hunks.push({
          oldStart,
          oldLines,
          newStart,
          newLines,
          lines: hunkLines,
        });
      }

      if (targetPath !== "/dev/null" && fileDiff.hunks.length > 0) {
        fileDiffs.push(fileDiff);
      }
    } else {
      i++;
    }
  }

  return fileDiffs;
}

export const PATCH_DENY_LIST = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "Cargo.toml",
  "Cargo.lock",
  "tauri.conf.json",
  "*.config.*",
  "tsconfig.json",
  "tsconfig.*.json",
  "eslint.config.*",
  ".github/**",
  ".git/**",
  "scripts/**",
  "src-tauri/**",
  "apps/*/src-tauri/**",
  "aljwharah.config.*",
  ".aljwharah/**",
  "AGENTS.md",
  "AGENTS.project.md",
  ".env",
  ".env.*",
  "infra/**",
  "data/**",
  "production/**",
];

export function isPathDenied(normalizedPath: string): boolean {
  const p = normalizedPath.split(sep).join("/").replace(/^\//, "");
  const filename = p.split("/").pop() || p;

  if (PATCH_DENY_LIST.includes(filename) || PATCH_DENY_LIST.includes(p)) {
    return true;
  }

  for (const pattern of PATCH_DENY_LIST) {
    if (matchScope(p, pattern) || matchScope(filename, pattern)) {
      return true;
    }
  }
  return false;
}

export function validatePatchPath(
  worktreePath: string,
  relPath: string,
  allowedScope: string[] = ["src/**", "tests/**", "test/**", "web/**", "docs/**", "lib/**", "*.md"],
  forbiddenScope: string[] = [],
): { ok: true; fullPath: string; normalized: string } | { ok: false; code: string; reason: string } {
  const normalized = relPath.split(sep).join("/").replace(/^\//, "");
  const full = resolve(worktreePath, normalized);
  const root = resolve(worktreePath);

  if (!full.startsWith(root) || full === root) {
    return { ok: false, code: AJ_ERR.POLICY_DENIED, reason: `Path escape outside worktree: ${relPath}` };
  }

  // F4: Enforce strict deny-list before any write
  if (isPathDenied(normalized) || forbiddenScope.some((g) => matchScope(normalized, g))) {
    return { ok: false, code: AJ_ERR.PATH_DENIED, reason: `Attempted modification of denied path: ${normalized}` };
  }

  if (allowedScope.length > 0 && !allowedScope.some((g) => matchScope(normalized, g))) {
    return { ok: false, code: AJ_ERR.POLICY_DENIED, reason: `Path outside allowed scope: ${normalized}` };
  }

  return { ok: true, fullPath: full, normalized };
}

export function applyUnifiedDiff(
  worktreePath: string,
  diffText: string,
  allowedScope?: string[],
  forbiddenScope?: string[],
): PatchResult {
  const fileDiffs = parseUnifiedDiff(diffText);
  if (fileDiffs.length === 0) {
    return {
      ok: false,
      patchedFiles: [],
      code: AJ_ERR.PATCH_FAILED,
      reason: "No valid unified diff hunks found in patch text.",
    };
  }

  const preImageMap = new Map<string, { exists: boolean; content: string }>();
  const modifiedFiles: string[] = [];

  for (const fd of fileDiffs) {
    const rel = fd.isNew ? fd.newPath : fd.oldPath;
    const pathVal = validatePatchPath(worktreePath, rel, allowedScope, forbiddenScope);
    if (!pathVal.ok) {
      return {
        ok: false,
        patchedFiles: [],
        code: pathVal.code,
        reason: pathVal.reason,
      };
    }

    const fullPath = pathVal.fullPath;
    if (!preImageMap.has(fullPath)) {
      if (existsSync(fullPath)) {
        try {
          const st = statSync(fullPath);
          if (st.size > MAX_PATCHABLE_FILE_SIZE) {
            return {
              ok: false,
              patchedFiles: [],
              code: AJ_ERR.PATCH_FAILED,
              reason: `File ${rel} exceeds 2MB size limit (${st.size} bytes).`,
            };
          }
          const buf = readFileSync(fullPath);
          if (isBinaryContent(buf)) {
            return {
              ok: false,
              patchedFiles: [],
              code: AJ_ERR.PATCH_FAILED,
              reason: `File ${rel} is a binary file; unified diff rejected.`,
            };
          }
          preImageMap.set(fullPath, { exists: true, content: buf.toString("utf8") });
        } catch (err: unknown) {
          return {
            ok: false,
            patchedFiles: [],
            code: AJ_ERR.PATCH_FAILED,
            reason: `Error inspecting ${rel}: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      } else {
        preImageMap.set(fullPath, { exists: false, content: "" });
      }
    }
  }

  const pendingWrites = new Map<string, string>();

  for (const fd of fileDiffs) {
    const rel = fd.isNew ? fd.newPath : fd.oldPath;
    const pathVal = validatePatchPath(worktreePath, rel, allowedScope, forbiddenScope);
    if (!pathVal.ok) continue;

    const fullPath = pathVal.fullPath;
    const pre = preImageMap.get(fullPath);
    if (!pre) continue;

    if (fd.isNew) {
      if (pre.exists) {
        return {
          ok: false,
          patchedFiles: [],
          code: AJ_ERR.PATCH_FAILED,
          reason: `Cannot create new file ${rel}: file already exists on disk.`,
        };
      }
      const newLines: string[] = [];
      for (const hunk of fd.hunks) {
        for (const line of hunk.lines) {
          if (line.startsWith("+")) {
            newLines.push(line.slice(1));
          }
        }
      }
      pendingWrites.set(fullPath, newLines.join("\n") + (newLines.length > 0 ? "\n" : ""));
      modifiedFiles.push(pathVal.normalized);
      continue;
    }

    if (!pre.exists) {
      return {
        ok: false,
        patchedFiles: [],
        code: AJ_ERR.PATCH_FAILED,
        reason: `Target file ${rel} does not exist.`,
      };
    }

    let originalLines = pre.content.split(/\r?\n/);
    if (originalLines.length === 1 && originalLines[0] === "") {
      originalLines = [];
    }

    const currentLines = [...originalLines];
    let lineOffset = 0;

    for (let hIdx = 0; hIdx < fd.hunks.length; hIdx++) {
      const hunk = fd.hunks[hIdx]!;
      const expectedOldStart = hunk.oldStart - 1;
      const targetPos = expectedOldStart + lineOffset;

      const expectedContext: string[] = [];
      const replacement: string[] = [];

      for (const hl of hunk.lines) {
        const marker = hl[0] ?? " ";
        const text = hl.slice(1);
        if (marker === " " || marker === "-") {
          expectedContext.push(text);
        }
        if (marker === " " || marker === "+") {
          replacement.push(text);
        }
      }

      for (let cIdx = 0; cIdx < expectedContext.length; cIdx++) {
        const actualPos = targetPos + cIdx;
        const expected = expectedContext[cIdx];
        const actual = currentLines[actualPos];

        if (actual === undefined || actual !== expected) {
          return {
            ok: false,
            patchedFiles: [],
            code: AJ_ERR.PATCH_FAILED,
            reason: `Context line mismatch in ${rel} at line ${actualPos + 1}. Expected: "${expected ?? ""}", Actual: "${actual ?? "<EOF>"}"`,
            errorDetails: {
              file: rel,
              hunkIndex: hIdx,
              expectedLine: expected,
              actualLine: actual,
            },
          };
        }
      }

      currentLines.splice(targetPos, expectedContext.length, ...replacement);
      lineOffset += replacement.length - expectedContext.length;
    }

    pendingWrites.set(fullPath, currentLines.join("\n"));
    modifiedFiles.push(pathVal.normalized);
  }

  try {
    for (const [fullPath, content] of pendingWrites.entries()) {
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content, "utf8");
    }
  } catch (err: unknown) {
    for (const [fullPath, pre] of preImageMap.entries()) {
      if (pre.exists) {
        writeFileSync(fullPath, pre.content, "utf8");
      }
    }
    return {
      ok: false,
      patchedFiles: [],
      code: AJ_ERR.PATCH_FAILED,
      reason: `Disk write error during atomic commit: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    ok: true,
    patchedFiles: Array.from(new Set(modifiedFiles)),
  };
}

export function writeFileNewOnly(
  worktreePath: string,
  relPath: string,
  content: string,
  allowedScope?: string[],
  forbiddenScope?: string[],
): { ok: true; path: string } | { ok: false; code: string; reason: string } {
  const pathVal = validatePatchPath(worktreePath, relPath, allowedScope, forbiddenScope);
  if (!pathVal.ok) {
    return { ok: false, code: pathVal.code, reason: pathVal.reason };
  }

  if (existsSync(pathVal.fullPath)) {
    return {
      ok: false,
      code: AJ_ERR.PATCH_FAILED,
      reason: `write_file is only permitted for NEW files. File "${pathVal.normalized}" already exists. Use apply_patch for modifications.`,
    };
  }

  if (Buffer.byteLength(content, "utf8") > MAX_PATCHABLE_FILE_SIZE) {
    return {
      ok: false,
      code: AJ_ERR.PATCH_FAILED,
      reason: "File content exceeds 2MB limit.",
    };
  }

  if (isBinaryContent(content)) {
    return {
      ok: false,
      code: AJ_ERR.PATCH_FAILED,
      reason: "Binary files are not permitted.",
    };
  }

  try {
    mkdirSync(dirname(pathVal.fullPath), { recursive: true });
    writeFileSync(pathVal.fullPath, content, "utf8");
    return { ok: true, path: pathVal.normalized };
  } catch (err: unknown) {
    return {
      ok: false,
      code: AJ_ERR.PATCH_FAILED,
      reason: `Failed to write new file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}