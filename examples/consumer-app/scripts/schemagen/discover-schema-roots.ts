/*
Discovers schema roots in src (recursive) types.ts files by JSDoc markers.
Copy per consumer repo — see docs/output-schema.md and docs/config-schema.md.
*/

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  configSchemaExportName,
  outfileForConfigType,
  outfileForOutputType,
  outputSchemaExportName,
} from "./naming.ts";

export type SchemaRootKind = "config" | "output";

export interface SchemaRoot {
  kind: SchemaRootKind;
  typeName: string;
  /** Path relative to project root (e.g. src/types.ts). */
  relFile: string;
  outfile: string;
  exportName: string;
}

const CONFIG_MARKER = "Config schema";
const OUTPUT_MARKER = "JSON payload";

const INTERFACE_RE = /\/\*\*([\s\S]*?)\*\/\s*export\s+interface\s+(\w+)/g;

function listTypesTsFiles(srcDir: string, baseDir: string, out: string[]): void {
  for (const ent of readdirSync(srcDir)) {
    const full = join(srcDir, ent);
    const st = statSync(full);
    if (st.isDirectory()) {
      listTypesTsFiles(full, baseDir, out);
      continue;
    }
    if (ent === "types.ts") {
      out.push(relative(baseDir, full));
    }
  }
}

function classifyRoot(jsDoc: string, typeName: string, relFile: string): SchemaRoot | undefined {
  const hasConfig = jsDoc.includes(CONFIG_MARKER);
  const hasOutput = jsDoc.includes(OUTPUT_MARKER);
  if (hasConfig && hasOutput) {
    throw new Error(`${relFile}: ${typeName} has both Config schema and JSON payload markers`);
  }
  if (!hasConfig && !hasOutput) {
    return undefined;
  }
  if (hasConfig) {
    return {
      kind: "config",
      typeName,
      relFile,
      outfile: outfileForConfigType(typeName),
      exportName: configSchemaExportName(typeName),
    };
  }
  return {
    kind: "output",
    typeName,
    relFile,
    outfile: outfileForOutputType(typeName),
    exportName: outputSchemaExportName(typeName),
  };
}

/** Find all schema roots under `src/` in files named types.ts. */
export function discoverSchemaRoots(projectRoot: string): SchemaRoot[] {
  const srcDir = join(projectRoot, "src");
  const files: string[] = [];
  listTypesTsFiles(srcDir, projectRoot, files);
  const roots: SchemaRoot[] = [];
  for (const relFile of files.sort()) {
    const text = readFileSync(join(projectRoot, relFile), "utf8");
    for (const match of text.matchAll(INTERFACE_RE)) {
      const jsDoc = match[1] ?? "";
      const typeName = match[2];
      if (!typeName) {
        continue;
      }
      const root = classifyRoot(jsDoc, typeName, relFile);
      if (root) {
        roots.push(root);
      }
    }
  }
  return roots;
}
