/*
Remove stale __generated__/ directories and files after schemagen runs.
*/

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { SchemaRoot } from "./discover-schema-roots.ts";
import { GENERATED_DIR, schemaJsonBasename } from "./names.ts";

function listGeneratedDirs(srcDir: string, projectRoot: string, out: string[]): void {
  for (const ent of readdirSync(srcDir)) {
    const full = join(srcDir, ent);
    const st = statSync(full);
    if (!st.isDirectory()) {
      continue;
    }
    if (ent === GENERATED_DIR) {
      out.push(relative(projectRoot, full));
      continue;
    }
    listGeneratedDirs(full, projectRoot, out);
  }
}

/** Drop orphan `__generated__/` trees and JSON files for removed schema roots. */
export function cleanStaleGenerated(
  projectRoot: string,
  srcDir: string,
  activeByGeneratedDir: Map<string, SchemaRoot[]>,
): void {
  const srcPath = join(projectRoot, srcDir);
  if (!existsSync(srcPath)) {
    return;
  }

  const generatedDirs: string[] = [];
  listGeneratedDirs(srcPath, projectRoot, generatedDirs);

  for (const relGeneratedDir of generatedDirs) {
    const generatedDir = join(projectRoot, relGeneratedDir);
    const roots = activeByGeneratedDir.get(generatedDir) ?? [];

    if (roots.length === 0) {
      rmSync(generatedDir, { recursive: true, force: true });
      console.log(`removed ${relGeneratedDir}`);
      continue;
    }

    const keep = new Set(["index.ts", ...roots.map((root) => schemaJsonBasename(root.typeName))]);
    for (const ent of readdirSync(generatedDir)) {
      if (keep.has(ent)) {
        continue;
      }
      const stalePath = join(generatedDir, ent);
      rmSync(stalePath, { recursive: true, force: true });
      console.log(`removed ${relative(projectRoot, stalePath)}`);
    }
  }
}
