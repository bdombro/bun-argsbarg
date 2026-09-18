#!/usr/bin/env bun
/*
 * Merge argsbarg's AGENTS.md template into a consumer repo.
 * The framework baseline sits at the top under the app title,
 * and all consumer-specific sections live below the managed block
 * where they take precedence over framework defaults.
 *
 * Usage: bun scripts/merge-agents-md.ts <consumer-dir> [template-path]
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Opening token for the argsbarg-owned AGENTS.md region; rest of the HTML comment may explain the contract. */
const MANAGED_BEGIN_TOKEN = "<!-- argsbarg:managed";
/** Closing token for the argsbarg-owned AGENTS.md region. */
const MANAGED_END_TOKEN = "<!-- /argsbarg:managed";
/** Claude Code bridge file body. */
const CLAUDE_CONTENT = "@AGENTS.md\n";

/** Inclusive HTML-comment span starting at `token`, through `-->`. */
function htmlCommentSpan(
  /** Full text of the markdown document being parsed. */
  source: string,
  /** Search token marking the beginning of the target HTML comment. */
  token: string,
): { start: number; end: number } | undefined {
  const start = source.indexOf(token);
  if (start === -1) return undefined;
  const close = source.indexOf("-->", start);
  if (close === -1) {
    throw new Error(`Unclosed HTML comment starting with ${token}`);
  }
  return { start, end: close + 3 };
}

/** Pattern matching lines that mark a conventions block as a copy-template placeholder. */
const PLACEHOLDER_SUFFIX_LINE = /replace this line|replace with app-specific|add below or in a separate/i;

/** Managed block from template (between markers, inclusive). */
export function extractManagedBlock(
  /** Full text of the template markdown document. */
  template: string,
): string {
  const begin = htmlCommentSpan(template, MANAGED_BEGIN_TOKEN);
  const end = htmlCommentSpan(template, MANAGED_END_TOKEN);
  if (!begin || !end) {
    throw new Error(`Template missing ${MANAGED_BEGIN_TOKEN} / ${MANAGED_END_TOKEN} markers`);
  }
  return template.slice(begin.start, end.end).trimEnd();
}

/** Strip template placeholder convention lines from managed block if present. */
export function stripManagedPlaceholders(
  /** Managed block content extracted from the template. */
  managed: string,
): string {
  return managed
    .split("\n")
    .filter((line) => !(/^\*\*[^*\n]+ conventions:\*\*/.test(line) && PLACEHOLDER_SUFFIX_LINE.test(line)))
    .filter((line) => !/^\*\*[^*\n]+ conventions:\*\*/.test(line) || !PLACEHOLDER_SUFFIX_LINE.test(line))
    .join("\n")
    .replace(/\n+$/, "");
}

/** Extract template app-specific content (everything after the managed block). */
export function extractTemplateAppContent(
  /** Full template content. */
  template: string,
  /** Optional consumer application title or key to substitute in skill paths. */
  title?: string,
): string {
  const end = htmlCommentSpan(template, MANAGED_END_TOKEN);
  if (!end) return "";
  let content = template.slice(end.end).trim();
  if (title) {
    content = content.replace(
      /skills\/(full-example|full-example-json|mcp-plugin)\/SKILL\.md/g,
      `skills/${title}/SKILL.md`,
    );
  }
  return content;
}

/** Content before the argsbarg managed region (consumer-specific prefix in legacy layout). */
export function extractPrefix(
  /** Existing AGENTS.md content. */
  existing: string,
): string {
  const heading = existing.match(/^#\s+.+\n*/)?.[0] ?? "";
  const begin = htmlCommentSpan(existing, MANAGED_BEGIN_TOKEN);
  if (!begin) {
    const suffix = extractConventionSuffix(existing);
    if (suffix) {
      const suffixIdx = existing.lastIndexOf(suffix);
      if (suffixIdx > heading.length) {
        return existing.slice(heading.length, suffixIdx).trim();
      }
    }
    return existing.slice(heading.length).trim();
  }
  const before = existing.slice(0, begin.start).trimEnd();
  return before.slice(heading.length).trim();
}

/** Last real app-specific conventions block (not template placeholders) in legacy format. */
export function extractConventionSuffix(
  /** Existing AGENTS.md content. */
  existing: string,
): string {
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

/** Extract all consumer-owned content from an existing AGENTS.md file. */
export function extractAppContent(
  /** Existing AGENTS.md content. */
  existing: string,
  /** Optional template content for falling back if existing content is empty. */
  template?: string,
  /** Optional application title. */
  title?: string,
): string {
  const begin = htmlCommentSpan(existing, MANAGED_BEGIN_TOKEN);
  const end = htmlCommentSpan(existing, MANAGED_END_TOKEN);

  if (!begin || !end) {
    const heading = existing.match(/^#\s+.+\n*/)?.[0] ?? "";
    return existing.slice(heading.length).trim();
  }

  const heading = existing.match(/^#\s+.+\n*/)?.[0] ?? "";
  const prefix = existing.slice(heading.length, begin.start).trim();
  const after = existing.slice(end.end).trim();

  // Legacy layout: prefix was above the managed block.
  if (prefix) {
    const isPlaceholderAfter =
      !after ||
      (PLACEHOLDER_SUFFIX_LINE.test(after) && (/full-example/i.test(after) || /^\*\*.*\bconventions:\*\*/.test(after)));
    if (isPlaceholderAfter) {
      return prefix;
    }
    return `${prefix}\n\n${after}`;
  }

  // Modern layout: managed block is at top, all app content is below.
  if (after) {
    return after;
  }

  // Fallback to template app content if existing file had nothing after managed block.
  return template ? extractTemplateAppContent(template, title) : "";
}

/** Build merged AGENTS.md from template, optional existing file, and app title. */
export function mergeAgentsMd(
  /** Full content of the template AGENTS.md. */
  template: string,
  /** Existing AGENTS.md content if the file already exists. */
  existing: string | undefined,
  /** Consumer application title. */
  title: string,
): string {
  const managed = stripManagedPlaceholders(extractManagedBlock(template));
  const appContent = existing
    ? extractAppContent(existing, template, title)
    : extractTemplateAppContent(template, title);

  const parts = [`# ${title}`, "", managed];
  if (appContent) {
    parts.push("", appContent);
  }
  parts.push("");
  return parts.join("\n");
}

/** Resolve parent directory from an absolute file path. */
function parentDir(
  /** Absolute file or directory path. */
  absolute: string,
): string {
  const s = absolute.replace(/[/\\]+$/, "");
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return i <= 0 ? s : s.slice(0, i);
}

/** Derive default application title from the consumer directory path. */
function titleFromConsumerDir(
  /** Path to the consumer project directory. */
  consumerDir: string,
): string {
  const base =
    consumerDir
      .replace(/[/\\]+$/, "")
      .split(/[/\\]/)
      .pop() ?? "app";
  return base;
}

/** Repository root path computed relative to this script. */
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
