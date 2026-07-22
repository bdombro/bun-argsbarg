/*
Discovers schema roots in types.ts files via configType / inputType / outputType exports.
*/

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { TYPES_FILE } from "./names.ts";

export type SchemaRootKind = "config" | "input" | "output";

export type SchemaRole = "configType" | "inputType" | "outputType";

export interface SchemaRoot {
  kind: SchemaRootKind;
  typeName: string;
  /** Path to types.ts relative to project root (anchors __generated__/ output). */
  path: string;
  /** Path to the file that defines `typeName` (defaults to `path`). */
  sourcePath: string;
}

const ROLE_EXPORT_RE = /export\s+type\s+(configType|inputType|outputType)\s*=\s*(\w+)/g;
const HAS_ROLE_EXPORT_RE = /export\s+type\s+(configType|inputType|outputType)\s*=/;
const IMPORT_RE = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["']/g;

const ROLE_TO_KIND: Record<SchemaRole, SchemaRootKind> = {
  configType: "config",
  inputType: "input",
  outputType: "output",
};

function listTypesManifestFiles(srcDir: string, baseDir: string, out: string[]): void {
  for (const ent of readdirSync(srcDir)) {
    const full = join(srcDir, ent);
    const st = statSync(full);
    if (st.isDirectory()) {
      listTypesManifestFiles(full, baseDir, out);
      continue;
    }
    if (ent !== TYPES_FILE) {
      continue;
    }
    const text = readFileSync(full, "utf8");
    if (HAS_ROLE_EXPORT_RE.test(text)) {
      out.push(relative(baseDir, full));
    }
  }
}

/** True when `typeName` is declared in this file (not a schemagen role alias). */
function isTypeDefinedInFile(text: string, typeName: string): boolean {
  if (new RegExp(`export\\s+interface\\s+${typeName}\\b`).test(text)) {
    return true;
  }
  if (new RegExp(`export\\s+type\\s+${typeName}\\s*=`).test(text)) {
    return !["configType", "inputType", "outputType"].includes(typeName);
  }
  return false;
}

function parseLocalTypeImports(text: string): Map<string, string> {
  const imports = new Map<string, string>();
  for (const match of text.matchAll(IMPORT_RE)) {
    const names = match[1];
    const from = match[2];
    if (!names || !from?.startsWith(".")) {
      continue;
    }
    for (const part of names.split(",")) {
      const trimmed = part.trim();
      const nameMatch = trimmed.match(/^(?:type\s+)?(\w+)(?:\s+as\s+(\w+))?$/);
      if (!nameMatch?.[1]) {
        continue;
      }
      const localName = nameMatch[2] ?? nameMatch[1];
      imports.set(localName, from);
    }
  }
  return imports;
}

function resolveModuleFile(manifestFile: string, specifier: string): string | null {
  const base = join(dirname(manifestFile), specifier);
  const candidates = [base, `${base}.ts`, join(base, "index.ts")];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Resolve a role alias to the module that defines `typeName`, when imported from a relative path. */
function resolveAliasedTypeSource(
  projectRoot: string,
  manifestRelPath: string,
  manifestText: string,
  typeName: string,
): string | null {
  const manifestFile = join(projectRoot, manifestRelPath);
  const specifier = parseLocalTypeImports(manifestText).get(typeName);
  if (!specifier) {
    return null;
  }
  const moduleFile = resolveModuleFile(manifestFile, specifier);
  if (!moduleFile) {
    return null;
  }
  const moduleText = readFileSync(moduleFile, "utf8");
  if (!isTypeDefinedInFile(moduleText, typeName)) {
    return null;
  }
  return relative(projectRoot, moduleFile);
}

function discoverFromFile(projectRoot: string, path: string, text: string): SchemaRoot[] {
  const rolesSeen = new Set<SchemaRole>();
  const roots: SchemaRoot[] = [];

  for (const match of text.matchAll(ROLE_EXPORT_RE)) {
    const role = match[1] as SchemaRole | undefined;
    const typeName = match[2];
    if (!role || !typeName) {
      continue;
    }
    if (rolesSeen.has(role)) {
      throw new Error(`${path}: duplicate export type ${role}`);
    }
    rolesSeen.add(role);

    let sourcePath = path;
    if (!isTypeDefinedInFile(text, typeName)) {
      const resolved = resolveAliasedTypeSource(projectRoot, path, text, typeName);
      if (!resolved) {
        continue;
      }
      sourcePath = resolved;
    }

    roots.push({ kind: ROLE_TO_KIND[role], typeName, path, sourcePath });
  }

  return roots;
}

/** Find all schema roots under `srcDir` in `types.ts` files with role exports. */
export function discoverSchemaRoots(projectRoot: string, srcDir = "src"): SchemaRoot[] {
  const srcPath = join(projectRoot, srcDir);
  const files: string[] = [];
  listTypesManifestFiles(srcPath, projectRoot, files);

  const roots: SchemaRoot[] = [];
  const typeOwners = new Map<string, string>();

  for (const relPath of files.sort()) {
    const text = readFileSync(join(projectRoot, relPath), "utf8");
    for (const root of discoverFromFile(projectRoot, relPath, text)) {
      const prev = typeOwners.get(root.typeName);
      if (prev) {
        throw new Error(`${relPath}: duplicate schema root type ${root.typeName} (already declared in ${prev})`);
      }
      typeOwners.set(root.typeName, relPath);
      roots.push(root);
    }
  }

  const configRoots = roots.filter((r) => r.kind === "config");
  if (configRoots.length > 1) {
    throw new Error(`multiple config schema roots: ${configRoots.map((r) => `${r.typeName} (${r.path})`).join(", ")}`);
  }

  return roots;
}
