/*
This module generates Agent Skills content (SKILL.md + reference.md) from a CLI schema.
*/

import { generateApiGuide } from "../docs/api-guide.ts";
import { collectOptionDefs } from "../parse.ts";
import { collectMcpTools, sanitizeToolSegment, type McpToolDef } from "../mcp/tools.ts";
import { CliProgram, CliOptionKind } from "../types.ts";

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

/** CLI path with required single-slot positionals for the compact catalog. */
function commandCatalogPath(root: CliProgram, tool: McpToolDef): string {
  const base = tool.path.length > 0 ? `${root.key} ${tool.path.join(" ")}` : root.key;
  const slots = (tool.leaf.positionals ?? [])
    .filter((p) => (p.argMin ?? 1) > 0 && (p.argMax ?? 1) === 1)
    .map((p) => `<${p.name}>`);
  if (slots.length === 0) {
    return base;
  }
  return `${base} ${slots.join(" ")}`;
}

/** Formats one command line for the SKILL.md index (details live in reference.md). */
function formatCommandEntry(root: CliProgram, tool: McpToolDef): string {
  const cliPath = commandCatalogPath(root, tool);
  let line = `- **\`${cliPath}\`** — ${tool.leaf.description}`;
  const opts = collectOptionDefs(root, tool.path);
  const flags = opts.filter((o) => o.kind === CliOptionKind.Presence).map((o) => `--${o.name}`);
  if (flags.length > 0) {
    line += ` (flags: ${flags.join(", ")})`;
  }
  const enums = opts.filter((o) => o.kind === CliOptionKind.Enum && o.choices?.length);
  for (const e of enums) {
    line += ` (\`--${e.name}\`: ${e.choices!.join(" | ")})`;
  }
  const varargs = (tool.leaf.positionals ?? []).filter((p) => (p.argMax ?? 1) === 0);
  if (varargs.length > 0) {
    line += ` (varargs: ${varargs.map((p) => p.name).join(", ")})`;
  }
  const env = tool.leaf.mcpTool?.requiresEnv;
  if (env && env.length > 0) {
    line += ` [requires env: ${env.join(", ")}]`;
  }
  return line;
}

/** Builds SKILL.md body for the given target. */
function buildSkillMd(root: CliProgram, target: SkillTarget, dirName: string): string {
  const name = sanitizeToolSegment(root.key);
  const description = skillDescription(root);
  const tools = collectMcpTools(root);

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
    "## Execution",
    "",
    "Invoke via shell:",
    "",
    "```bash",
    `${root.key} <subcommand> [options] [args]`,
    "```",
    "",
    "## Commands",
    "",
  ];

  if (tools.length === 0) {
    lines.push("(No leaf commands in schema.)", "");
  } else {
    for (const tool of tools) {
      lines.push(formatCommandEntry(root, tool));
    }
    lines.push("");
  }

  lines.push(
    "## Pitfalls",
    "",
    "- Use `--` before tokens that look like flags when they are positional arguments.",
    "- Required environment variables are listed per command above (`requires env`) and in `reference.md`.",
    "",
    "## Reference",
    "",
    "This file is a command index. For full option tables, positionals, notes, and built-ins,",
    `read \`reference.md\` in this skill directory (same content as \`${root.key} docs api\`).`,
    "Search for the command path you need before invoking.",
    "",
  );

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

/** Builds reference.md with the full `docs api` markdown guide. */
function buildReferenceMd(root: CliProgram): string {
  return generateApiGuide(root);
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
