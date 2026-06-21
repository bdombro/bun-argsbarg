/*
This module generates Agent Skills content (SKILL.md + reference.md) from a CLI schema.
*/

import { generateApiGuideBody } from "../docs/api-guide.ts";
import { cliSchemaJson } from "../schema.ts";
import { collectMcpTools, sanitizeToolSegment } from "../mcp/tools.ts";
import { CliProgram } from "../types.ts";

export type SkillTarget = "cursor" | "claude";

export interface SkillBundle {
  dirName: string;
  skillMd: string;
  referenceMd: string;
}

/** Truncates text to maxLen with ellipsis. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

/** Builds third-person skill description for YAML frontmatter. */
function skillDescription(root: CliProgram): string {
  const tools = collectMcpTools(root);
  const paths = tools.map((t) => (t.path.length > 0 ? t.path.join(" ") : root.key));
  const sample = paths.slice(0, 5).join(", ");
  const more = paths.length > 5 ? `, and ${paths.length - 5} more` : "";
  const desc = `Operates the ${root.key} CLI (${sample}${more}). Use when the user mentions ${root.key}${paths.length > 0 ? `, ${paths.slice(0, 3).join(", ")}` : ""}, or related tasks.`;
  return truncate(desc, 1024);
}

/** Builds SKILL.md body for the given target. */
function buildSkillMd(root: CliProgram, target: SkillTarget, dirName: string): string {
  const name = sanitizeToolSegment(root.key);
  const description = skillDescription(root);

  const lines: string[] = [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "---",
    "",
    `# ${root.key}`,
    "",
    root.description,
    "",
    "## When to use",
    "",
    `Use this skill when working with **${root.key}** — shell commands and automation for this application.`,
    "",
    "## Execution",
    "",
    "Invoke via shell:",
    "",
    "```bash",
    `${root.key} <subcommand> [options] [args]`,
    "```",
    "",
    generateApiGuideBody(root).trimEnd(),
    "",
    "## Pitfalls",
    "",
    "- Use `--` before tokens that look like flags when they are positional arguments.",
    "- Required environment variables are listed per command in descriptions (`requires env`).",
    "",
    "## Reference",
    "",
    "See `reference.md` in this skill directory for the full `docs schema` JSON export.",
    "",
  ];

  if (target === "cursor") {
    lines.push(
      "## Cursor install location",
      "",
      `- Project: \`.cursor/skills/${dirName}/\``,
      `- Global: \`~/.cursor/skills/${dirName}/\``,
      "",
      "Do not install under `~/.cursor/skills-cursor/` (reserved for Cursor built-ins).",
      "",
    );
  } else {
    lines.push(
      "## Claude Code",
      "",
      `- Invoke with \`/${dirName}\` or let Claude auto-match from the description.`,
      `- Project skills: \`.claude/skills/${dirName}/\``,
      `- Global skills: \`~/.claude/skills/${dirName}/\``,
      `- Bundled files in this directory are available via \`\${CLAUDE_SKILL_DIR}\` when the skill runs.`,
      "",
    );
  }

  return lines.join("\n");
}

/** Builds reference.md with pretty-printed schema JSON. */
function buildReferenceMd(root: CliProgram): string {
  return [
    `# ${root.key} — CLI reference`,
    "",
    "Generated from the program `docs schema` export. Handlers and runtime-only nodes are omitted.",
    "",
    "```json",
    cliSchemaJson(root).trimEnd(),
    "```",
    "",
  ].join("\n");
}

/** Generates SKILL.md and reference.md for Cursor or Claude Code. */
export function generateSkillBundle(root: CliProgram, target: SkillTarget): SkillBundle {
  const dirName = sanitizeToolSegment(root.key);
  return {
    dirName,
    skillMd: buildSkillMd(root, target, dirName),
    referenceMd: buildReferenceMd(root),
  };
}
