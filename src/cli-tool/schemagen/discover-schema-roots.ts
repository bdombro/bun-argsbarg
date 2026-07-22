/*
Discovers schema roots in schema.ts files via configType / inputType / outputType exports.
*/

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { SCHEMA_FILE } from "./names.ts";

export type SchemaRootKind = "config" | "input" | "output";

export type SchemaRole = "configType" | "inputType" | "outputType";

export interface SchemaRoot {
  kind: SchemaRootKind;
  typeName: string;
  /** Path relative to project root (e.g. src/config/schema.ts). */
  path: string;
}

const ROLE_EXPORT_RE = /export\s+type\s+(configType|inputType|outputType)\s*=\s*(\w+)/g;

const ROLE_TO_KIND: Record<SchemaRole, SchemaRootKind> = {
  configType: "config",
  inputType: "input",
  outputType: "output",
};

function listSchemaFiles(srcDir: string, baseDir: string, out: string[]): void {
  for (const ent of readdirSync(srcDir)) {
    const full = join(srcDir, ent);
    const st = statSync(full);
    if (st.isDirectory()) {
      listSchemaFiles(full, baseDir, out);
      continue;
    }
    if (ent === SCHEMA_FILE) {
      out.push(relative(baseDir, full));
    }
  }
}

/** True when `typeName` is declared in this file (not a re-export alias to another module). */
function isTypeDefinedInFile(text: string, typeName: string): boolean {
  if (new RegExp(`export\\s+interface\\s+${typeName}\\b`).test(text)) {
    return true;
  }
  if (new RegExp(`export\\s+type\\s+${typeName}\\s*=`).test(text)) {
    return !["configType", "inputType", "outputType"].includes(typeName);
  }
  return false;
}

function discoverFromFile(path: string, text: string): SchemaRoot[] {
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
    if (!isTypeDefinedInFile(text, typeName)) {
      continue;
    }
    roots.push({ kind: ROLE_TO_KIND[role], typeName, path });
  }

  return roots;
}

/** Find all schema roots under `srcDir` in files named `schema.ts`. */
export function discoverSchemaRoots(projectRoot: string, srcDir = "src"): SchemaRoot[] {
  const srcPath = join(projectRoot, srcDir);
  const files: string[] = [];
  listSchemaFiles(srcPath, projectRoot, files);

  const roots: SchemaRoot[] = [];
  const typeOwners = new Map<string, string>();

  for (const relPath of files.sort()) {
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

  const configRoots = roots.filter((r) => r.kind === "config");
  if (configRoots.length > 1) {
    throw new Error(`multiple config schema roots: ${configRoots.map((r) => `${r.typeName} (${r.path})`).join(", ")}`);
  }

  return roots;
}
