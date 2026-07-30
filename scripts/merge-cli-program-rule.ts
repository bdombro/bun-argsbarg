#!/usr/bin/env bun
/**
 * Merge argsbarg's cli-program.mdc template into a consumer repo, preserving
 * app-specific convention blocks from the existing rule file.
 *
 * Usage: bun scripts/merge-cli-program-rule.ts <consumer-dir> [template-path]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PLACEHOLDER = /\*\*\{key\} conventions:\*\*|\*\*[^*\n]+ conventions:\*\* add below or in a separate/;

const PLACEHOLDER_SUFFIX_LINE = /replace this line|add below or in a separate/i;

/** Last real app-specific conventions block (not template placeholders). */
function extractConventionSuffix(existing: string): string {
  const lines = existing.split("\n");
  let best = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\*\*[^*\n]+ conventions:\*\*/.test(line)) continue;
    if (PLACEHOLDER_SUFFIX_LINE.test(line)) continue;
    if (/^\*\*full-example conventions:\*\*/i.test(line)) continue;
    if (/^\*\*full-example-json conventions:\*\*/i.test(line)) continue;
    best = lines.slice(i).join("\n").trimEnd();
  }
  return best;
}

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

const templatePath = process.argv[3] ?? join(repoRoot, "examples/full-example-json/.cursor/rules/cli-program.mdc");
const rulePath = join(consumerDir, ".cursor/rules/cli-program.mdc");

const template = readFileSync(templatePath, "utf8").trimEnd();
const templateBody = template
  .split("\n")
  .filter((line) => !PLACEHOLDER.test(line))
  .filter((line) => !(/^\*\*[^*\n]+ conventions:\*\*/.test(line) && PLACEHOLDER_SUFFIX_LINE.test(line)))
  .join("\n")
  .replace(/\n+$/, "");

let suffix = "";
if (existsSync(rulePath)) {
  suffix = extractConventionSuffix(readFileSync(rulePath, "utf8"));
}

const merged = suffix ? `${templateBody}\n\n${suffix}\n` : `${templateBody}\n`;
mkdirSync(dirname(rulePath), { recursive: true });
writeFileSync(rulePath, merged, "utf8");
console.log(`Updated ${rulePath}`);
