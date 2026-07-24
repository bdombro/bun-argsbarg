/*
Discovers schema roots via @sg JSDoc markers on export interface/type declarations.
*/

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Directories to scan relative to project root. */
const SEARCH_DIRS = ["src"] as const;

/** Directory names skipped during walk (any depth). */
const EXCLUDE_DIRS = ["node_modules", "__generated__"] as const;

/** File basename patterns skipped (basename match only). */
const EXCLUDE_FILE_PATTERNS = [/\.test\.ts$/];

const SG_JSDOC_RE = /\/\*\*[\s\S]*?@sg[\s\S]*?\*\//g;
const EXPORT_DECL_RE = /^export\s+(interface|type)\s+(\w+)/;

export interface SchemaRoot {
  typeName: string;
  /** Path to the file containing `@sg`, relative to project root (anchors `__generated__/`). */
  path: string;
  /** Path to the file that defines `typeName` (same as `path` for `@sg`). */
  sourcePath: string;
}

function shouldIncludeFile(basename: string): boolean {
  if (!basename.endsWith(".ts") || basename.endsWith(".d.ts")) {
    return false;
  }
  return !EXCLUDE_FILE_PATTERNS.some((pattern) => pattern.test(basename));
}

function walkDir(dir: string, baseDir: string, out: string[]): void {
  for (const ent of readdirSync(dir)) {
    if ((EXCLUDE_DIRS as readonly string[]).includes(ent)) {
      continue;
    }
    const full = join(dir, ent);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkDir(full, baseDir, out);
      continue;
    }
    if (!shouldIncludeFile(ent)) {
      continue;
    }
    out.push(relative(baseDir, full));
  }
}

function listScannableFiles(projectRoot: string): string[] {
  const files: string[] = [];
  for (const searchDir of SEARCH_DIRS) {
    const abs = join(projectRoot, searchDir);
    if (!existsSync(abs)) {
      continue;
    }
    walkDir(abs, projectRoot, files);
  }
  return files.sort();
}

function parseTypeNameAfterSgBlock(text: string, blockEndIndex: number, relPath: string): string {
  const rest = text.slice(blockEndIndex);
  const sameLine = rest.match(/^([^\n]*)/)?.[1] ?? "";
  if (sameLine.trim().length > 0) {
    throw new Error(
      `${relPath}: @sg JSDoc must be immediately followed by export interface/type (same-line export not supported)`,
    );
  }

  const lines = rest.split("\n").slice(1);
  for (const line of lines) {
    if (line.trim() === "") {
      throw new Error(`${relPath}: @sg JSDoc must be immediately followed by export interface/type`);
    }
    const match = line.match(EXPORT_DECL_RE);
    if (match?.[2]) {
      return match[2];
    }
    throw new Error(`${relPath}: @sg JSDoc must be immediately followed by export interface/type`);
  }

  throw new Error(`${relPath}: @sg JSDoc must be immediately followed by export interface/type`);
}

function discoverFromFile(relPath: string, text: string): SchemaRoot[] {
  const roots: SchemaRoot[] = [];
  for (const match of text.matchAll(SG_JSDOC_RE)) {
    const index = match.index ?? 0;
    const blockEnd = index + match[0].length;
    const typeName = parseTypeNameAfterSgBlock(text, blockEnd, relPath);
    roots.push({ typeName, path: relPath, sourcePath: relPath });
  }
  return roots;
}

/** Find all `@sg` schema roots under `SEARCH_DIRS`. */
export function discoverSchemaRoots(projectRoot: string, _srcDir = "src"): SchemaRoot[] {
  const files = listScannableFiles(projectRoot);
  const roots: SchemaRoot[] = [];
  const typeOwners = new Map<string, string>();

  for (const relPath of files) {
    const text = readFileSync(join(projectRoot, relPath), "utf8");
    for (const root of discoverFromFile(relPath, text)) {
      const prev = typeOwners.get(root.typeName);
      if (prev) {
        throw new Error(`${relPath}: duplicate schema root type ${root.typeName} (already declared in ${prev})`);
      }
      typeOwners.set(root.typeName, relPath);
      roots.push(root);
    }
  }

  return roots;
}
