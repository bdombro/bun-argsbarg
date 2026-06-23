#!/usr/bin/env bun
/**
 * Merge argsbarg's cli-program.mdc template into a consumer repo, preserving
 * app-specific convention blocks from the existing rule file.
 *
 * Usage: bun scripts/merge-cli-program-rule.ts <consumer-dir> [template-path]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PLACEHOLDER = "**App-specific conventions:** add below or in a separate";

function parentDir(absolute: string): string {
  const s = absolute.replace(/[/\\]+$/, "");
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return i <= 0 ? s : s.slice(0, i);
}

const repoRoot = parentDir(import.meta.dir);
const consumerDir = process.argv[2];
if (!consumerDir) {
  console.error("Usage: bun scripts/merge-cli-program-rule.ts <consumer-dir> [template-path]");
  process.exit(1);
}

const templatePath =
  process.argv[3] ?? join(repoRoot, "docs/templates/cursor/rules/cli-program.mdc");
const rulePath = join(consumerDir, ".cursor/rules/cli-program.mdc");

const template = readFileSync(templatePath, "utf8").trimEnd();
const templateBody = template
  .split("\n")
  .filter((line) => !line.includes(PLACEHOLDER))
  .join("\n")
  .replace(/\n+$/, "");

let suffix = "";
if (existsSync(rulePath)) {
  const existing = readFileSync(rulePath, "utf8");
  const match = existing.match(/\n(\*\*[^*\n]+ conventions:\*\*[\s\S]*)$/i);
  if (match?.[1] && !match[1].includes("add below or in a separate")) {
    suffix = match[1].trimEnd();
  }
}

const merged = suffix ? `${templateBody}\n\n${suffix}\n` : `${templateBody}\n`;
mkdirSync(dirname(rulePath), { recursive: true });
writeFileSync(rulePath, merged, "utf8");
console.log(`Updated ${rulePath}`);
