#!/usr/bin/env bun
/**
 * Merge argsbarg's AGENTS.md template into a consumer repo, preserving
 * consumer-specific prefix content and app convention blocks.
 *
 * Usage: bun scripts/merge-agents-md.ts <consumer-dir> [template-path]
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MANAGED_BEGIN = "<!-- argsbarg:managed -->";
const MANAGED_END = "<!-- /argsbarg:managed -->";
const CLAUDE_CONTENT = "@AGENTS.md\n";

const PLACEHOLDER_SUFFIX_LINE = /replace this line|replace with app-specific|add below or in a separate/i;

/** Last real app-specific conventions block (not template placeholders). */
export function extractConventionSuffix(existing: string): string {
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

/** Content before the argsbarg managed region (consumer-specific prefix). */
export function extractPrefix(existing: string): string {
  const heading = existing.match(/^#\s+.+\n*/)?.[0] ?? "";
  const idx = existing.indexOf(MANAGED_BEGIN);
  if (idx === -1) {
    const suffix = extractConventionSuffix(existing);
    if (suffix) {
      const suffixIdx = existing.lastIndexOf(suffix);
      if (suffixIdx > heading.length) {
        return existing.slice(heading.length, suffixIdx).trim();
      }
    }
    return existing.slice(heading.length).trim();
  }
  const before = existing.slice(0, idx).trimEnd();
  return before.slice(heading.length).trim();
}

/** Managed block from template (between markers, inclusive). */
export function extractManagedBlock(template: string): string {
  const begin = template.indexOf(MANAGED_BEGIN);
  const end = template.indexOf(MANAGED_END);
  if (begin === -1 || end === -1) {
    throw new Error(`Template missing ${MANAGED_BEGIN} / ${MANAGED_END} markers`);
  }
  return template.slice(begin, end + MANAGED_END.length).trimEnd();
}

/** Strip template placeholder convention lines from managed block. */
export function stripManagedPlaceholders(managed: string): string {
  return managed
    .split("\n")
    .filter((line) => !(/^\*\*[^*\n]+ conventions:\*\*/.test(line) && PLACEHOLDER_SUFFIX_LINE.test(line)))
    .filter((line) => !/^\*\*[^*\n]+ conventions:\*\*/.test(line) || !PLACEHOLDER_SUFFIX_LINE.test(line))
    .join("\n")
    .replace(/\n+$/, "");
}

/** Build merged AGENTS.md from template, optional existing file, and app title. */
export function mergeAgentsMd(template: string, existing: string | undefined, title: string): string {
  const managed = stripManagedPlaceholders(extractManagedBlock(template));
  const prefix = existing ? extractPrefix(existing) : "";
  const suffix = existing ? extractConventionSuffix(existing) : "";

  const parts = [`# ${title}`];
  if (prefix) parts.push("", prefix);
  parts.push("", managed);
  if (suffix) parts.push("", suffix);
  parts.push("");
  return parts.join("\n");
}

function parentDir(absolute: string): string {
  const s = absolute.replace(/[/\\]+$/, "");
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return i <= 0 ? s : s.slice(0, i);
}

function titleFromConsumerDir(consumerDir: string): string {
  const base =
    consumerDir
      .replace(/[/\\]+$/, "")
      .split(/[/\\]/)
      .pop() ?? "app";
  return base;
}

const repoRoot = parentDir(import.meta.dir);

if (import.meta.main) {
  const consumerDir = process.argv[2];
  if (!consumerDir) {
    console.error("Usage: bun scripts/merge-agents-md.ts <consumer-dir> [template-path]");
    process.exit(1);
  }

  const templatePath = process.argv[3] ?? join(repoRoot, "examples/full-example-json/AGENTS.md");
  const agentsPath = join(consumerDir, "AGENTS.md");
  const claudePath = join(consumerDir, "CLAUDE.md");

  const template = readFileSync(templatePath, "utf8");
  const existing = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : undefined;
  const title = existing?.match(/^#\s+(.+)/m)?.[1]?.trim() ?? titleFromConsumerDir(consumerDir);

  const merged = mergeAgentsMd(template, existing, title);
  writeFileSync(agentsPath, merged, "utf8");
  writeFileSync(claudePath, CLAUDE_CONTENT, "utf8");
  console.log(`Updated ${agentsPath}`);
  console.log(`Updated ${claudePath}`);
}
