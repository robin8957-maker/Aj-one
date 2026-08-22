/**
 * Real TypeScript language service — not regex.
 * Definitions, references, rename locations, and parser diagnostics.
 */
import { createRequire } from "node:module";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { listProjectFiles, readProjectFile } from "./workspace.ts";

const require = createRequire(import.meta.url);
let ts: typeof import("typescript") | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ts = require("typescript") as typeof import("typescript");
} catch {
  ts = null;
}

export function typescriptAvailable(): boolean {
  return ts !== null;
}

export interface SymbolDef {
  name: string;
  file: string;
  line: number;
  column: number;
  exported: boolean;
  kind: "function" | "class" | "variable" | "unknown";
}

export interface SymbolRef {
  name: string;
  file: string;
  line: number;
  column: number;
}

export interface FileSymbols {
  file: string;
  exports: string[];
  imports: { names: string[]; from: string }[];
  functions: string[];
  references: string[];
  definitions: SymbolDef[];
  refs: SymbolRef[];
}

export interface RenameImpact {
  symbol: string;
  definition?: SymbolDef;
  references: SymbolRef[];
  files: string[];
}

export interface LspDiagnostic {
  file: string;
  message: string;
  severity: "error" | "warning";
  line?: number;
}

function scriptKind(file: string): import("typescript").ScriptKind {
  if (!ts) return 1 as import("typescript").ScriptKind;
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".ts")) return ts.ScriptKind.TS;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function posToLine(sf: import("typescript").SourceFile, pos: number): { line: number; column: number } {
  const lc = sf.getLineAndCharacterOfPosition(pos);
  return { line: lc.line + 1, column: lc.character + 1 };
}

function kindOf(node: import("typescript").Node): SymbolDef["kind"] {
  if (!ts) return "unknown";
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) {
    return "function";
  }
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isVariableDeclaration(node)) return "variable";
  return "unknown";
}

function extractSymbolsFallback(file: string, source: string): FileSymbols {
  const exports: string[] = [];
  const functions: string[] = [];
  const imports: FileSymbols["imports"] = [];
  const definitions: SymbolDef[] = [];
  for (const m of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
    exports.push(m[1]!);
    functions.push(m[1]!);
    definitions.push({ name: m[1]!, file, line: 1, column: 1, exported: true, kind: "function" });
  }
  for (const m of source.matchAll(/(?:^|[^\w])function\s+(\w+)/g)) {
    if (!functions.includes(m[1]!)) {
      functions.push(m[1]!);
      if (!definitions.some((d) => d.name === m[1]!)) {
        definitions.push({ name: m[1]!, file, line: 1, column: 1, exported: false, kind: "function" });
      }
    }
  }
  for (const m of source.matchAll(/export\s+(?:const|let|var|class)\s+(\w+)/g)) {
    exports.push(m[1]!);
    definitions.push({ name: m[1]!, file, line: 1, column: 1, exported: true, kind: "variable" });
  }
  for (const m of source.matchAll(/import\s+(?:\{\s*([^}]+)\s*\}|\*\s+as\s+(\w+)|\s*(\w+))\s+from\s+['"]([^'"]+)['"]/g)) {
    const named = m[1] ? m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]!).filter(Boolean) : [];
    const namespace = m[2] ? [m[2]] : [];
    const defaultImp = m[3] ? [m[3]] : [];
    const names = [...named, ...namespace, ...defaultImp];
    imports.push({ names: names.length ? names : ["*"], from: m[4]! });
  }
  for (const m of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    if (!imports.some((i) => i.from === m[1]!)) {
      imports.push({ names: ["*"], from: m[1]! });
    }
  }
  return {
    file,
    exports,
    imports,
    functions,
    references: [],
    definitions,
    refs: [],
  };
}

export function extractSymbols(file: string, source: string): FileSymbols {
  if (!ts) return extractSymbolsFallback(file, source);
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const exports = new Set<string>();
  const functions = new Set<string>();
  const imports: FileSymbols["imports"] = [];
  const definitions: SymbolDef[] = [];
  const refs: SymbolRef[] = [];
  const references = new Set<string>();

  const addDef = (name: string, node: import("typescript").Node, exported: boolean) => {
    if (!name) return;
    const { line, column } = posToLine(sf, node.getStart(sf, false));
    definitions.push({ name, file, line, column, exported, kind: kindOf(node) });
    if (exported) exports.add(name);
    if (kindOf(node) === "function") functions.add(name);
  };

  const visit = (node: import("typescript").Node, exportedCtx: boolean) => {
    const exported = exportedCtx || hasExportMod(node);

    if (ts.isFunctionDeclaration(node) && node.name) {
      addDef(node.name.text, node, exported);
    } else if (ts.isClassDeclaration(node) && node.name) {
      addDef(node.name.text, node, exported);
    } else if (ts.isVariableStatement(node)) {
      const vsExport = exported || hasExportMod(node);
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) addDef(decl.name.text, decl, vsExport);
        if (decl.initializer && (ts.isFunctionExpression(decl.initializer) || ts.isArrowFunction(decl.initializer))) {
          if (ts.isIdentifier(decl.name)) functions.add(decl.name.text);
        }
      }
    } else if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression)) {
      exports.add(node.expression.text);
    } else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) exports.add(el.name.text);
    } else if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const names: string[] = [];
      const clause = node.importClause;
      if (clause?.name) names.push(clause.name.text);
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) names.push(el.name.text);
      }
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        names.push(clause.namedBindings.name.text);
      }
      imports.push({ names, from: node.moduleSpecifier.text });
    } else if (ts.isIdentifier(node)) {
      const name = node.text;
      if (name.length > 1) {
        references.add(name);
        const { line, column } = posToLine(sf, node.getStart(sf, false));
        refs.push({ name, file, line, column });
      }
    }

    ts.forEachChild(node, (child) => visit(child, exported));
  };

  ts.forEachChild(sf, (child) => visit(child, false));

  return {
    file,
    exports: [...exports],
    imports,
    functions: [...functions],
    references: [...references],
    definitions,
    refs,
  };
}

function hasExportMod(node: import("typescript").Node): boolean {
  if (!ts) return false;
  const mods = (node as import("typescript").HasModifiers).modifiers;
  return Boolean(mods && mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

export function parseDiagnostics(file: string, source: string): LspDiagnostic[] {
  if (!ts) return [];
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      allowJs: true,
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.ESNext,
      noEmit: true,
    },
  });
  return (result.diagnostics ?? []).map((d) => {
    const start = d.start ?? 0;
    const sf = d.file ?? ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
    const { line } = posToLine(sf, start);
    return {
      file,
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
      severity: "error" as const,
      line,
    };
  });
}

export function renameImpactFromSymbols(
  files: FileSymbols[],
  symbol: string,
): RenameImpact {
  const definition = files.flatMap((f) => f.definitions).find((d) => d.name === symbol && d.exported);
  const references = files.flatMap((f) => f.refs).filter((r) => r.name === symbol);
  const fileSet = new Set(references.map((r) => r.file));
  if (definition) fileSet.add(definition.file);
  return {
    symbol,
    definition,
    references,
    files: [...fileSet],
  };
}

export function analyzeProject(projectPath: string): {
  files: FileSymbols[];
  diagnostics: LspDiagnostic[];
  service: "typescript-language-service" | "parser-only";
} {
  const rels = listProjectFiles(projectPath, 80).filter((f) => /\.(js|jsx|ts|tsx|mjs|cjs)$/.test(f));
  const files = rels.map((f) => extractSymbols(f, readProjectFile(projectPath, f) ?? ""));
  const diagnostics: LspDiagnostic[] = [];
  for (const f of rels) {
    diagnostics.push(...parseDiagnostics(f, readProjectFile(projectPath, f) ?? ""));
  }

  const abs = rels.map((f) => join(projectPath, f));
  let service: "typescript-language-service" | "parser-only" = "parser-only";
  if (!ts) return { files, diagnostics, service };
  try {
    const snapshots = new Map<string, string>();
    for (const f of abs) {
      if (existsSync(f)) snapshots.set(ts.sys.resolvePath(f), readFileSync(f, "utf8"));
    }
    const host: import("typescript").LanguageServiceHost = {
      getScriptFileNames: () => [...snapshots.keys()],
      getScriptVersion: () => "1",
      getScriptSnapshot: (fn) => {
        const text = snapshots.get(ts.sys.resolvePath(fn));
        return text == null ? undefined : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => projectPath,
      getCompilationSettings: () => ({
        allowJs: true,
        checkJs: false,
        noEmit: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        skipLibCheck: true,
        allowNonTsExtensions: true,
      }),
      getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
      fileExists: (p) => snapshots.has(ts.sys.resolvePath(p)) || ts.sys.fileExists(p),
      readFile: (p) => snapshots.get(ts.sys.resolvePath(p)) ?? ts.sys.readFile(p),
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };
    const ls = ts.createLanguageService(host, ts.createDocumentRegistry());
    service = "typescript-language-service";
    for (const fileName of snapshots.keys()) {
      const diags = [
        ...ls.getSyntacticDiagnostics(fileName),
        ...ls.getSemanticDiagnostics(fileName).slice(0, 20),
      ];
      for (const d of diags) {
        if (!d.file) continue;
        const { line } = posToLine(d.file, d.start ?? 0);
        const rel = rels.find((r) => fileName.endsWith(r.replace(/\\/g, "/"))) ?? d.file.fileName;
        diagnostics.push({
          file: rel,
          message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
          severity: d.category === ts.DiagnosticCategory.Error ? "error" : "warning",
          line,
        });
      }
    }
    ls.dispose();
  } catch {
    service = "parser-only";
  }

  return { files, diagnostics, service };
}
