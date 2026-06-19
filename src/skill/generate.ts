/*
This module generates Agent Skills content (SKILL.md + reference.md) from a CLI schema.
*/

import { collectOptionDefs } from "../parse.ts";
import { cliSchemaJson } from "../schema.ts";
import { collectMcpTools, sanitizeToolSegment } from "../mcp/tools.ts";
import { CliCommand, CliOptionKind } from "../types.ts";

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
function skillDescription(root: CliCommand): string {
  const tools = collectMcpTools(root);
  const paths = tools.map((t) => (t.path.length > 0 ? t.path.join(" ") : root.key));
  const sample = paths.slice(0, 5).join(", ");
  const more = paths.length > 5 ? `, and ${paths.length - 5} more` : "";
  const desc = `Operates the ${root.key} CLI (${sample}${more}). Use when the user mentions ${root.key}${paths.length > 0 ? `, ${paths.slice(0, 3).join(", ")}` : ""}, or related tasks.`;
  return truncate(desc, 1024);
}

/** Formats one command line for the catalog section. */
function formatCommandEntry(root: CliCommand, tool: ReturnType<typeof collectMcpTools>[number]): string {
  const cliPath = tool.path.length > 0 ? `${root.key} ${tool.path.join(" ")}` : root.key;
  let line = `- **\`${cliPath}\`** — ${tool.description}`;
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
  return line;
}

/** Builds SKILL.md body for the given target. */
function buildSkillMd(root: CliCommand, target: SkillTarget, dirName: string): string {
  const name = root.aiSkill?.name ?? sanitizeToolSegment(root.key);
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
    "## When to use",
    "",
    `Use this skill when working with **${root.key}** — shell commands, automation, or agent tool calls for this application.`,
    "",
    "## Execution",
    "",
  ];

  if (root.mcpServer !== undefined) {
    lines.push(
      "**Prefer MCP** when a host has the server connected:",
      "",
      "```bash",
      `${root.key} ai mcp`,
      "```",
      "",
      "Example Cursor `mcp.json` entry:",
      "",
      "```json",
      JSON.stringify(
        {
          mcpServers: {
            [root.mcpServer.name ?? root.key]: {
              command: root.key,
              args: ["ai", "mcp"],
            },
          },
        },
        null,
        2,
      ),
      "```",
      "",
      "When MCP tools are available, use `tools/call` with flat JSON arguments. Read the schema resource for full shapes.",
      "",
      "Otherwise invoke via shell:",
      "",
    );
  } else {
    lines.push("Invoke via shell:", "");
  }

  lines.push("```bash", `${root.key} <subcommand> [options] [args]`, "```", "", "## Commands", "");

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
    "- Under MCP (`ctx.invocation === \"mcp\"`), child processes must not inherit stdout — use piped stdout.",
    "- Required environment variables are listed per command in descriptions (`requires env`).",
    "",
    "## Reference",
    "",
    "See `reference.md` in this skill directory for the full `--schema` JSON export.",
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

/** Builds reference.md with pretty-printed schema JSON. */
function buildReferenceMd(root: CliCommand): string {
  return [
    `# ${root.key} — CLI reference`,
    "",
    "Generated from the program `--schema` export. Handlers and runtime-only nodes are omitted.",
    "",
    "```json",
    cliSchemaJson(root).trimEnd(),
    "```",
    "",
  ].join("\n");
}

/** Generates SKILL.md and reference.md for Cursor or Claude Code. */
export function generateSkillBundle(root: CliCommand, target: SkillTarget): SkillBundle {
  const dirName = root.aiSkill?.name ?? sanitizeToolSegment(root.key);
  return {
    dirName,
    skillMd: buildSkillMd(root, target, dirName),
    referenceMd: buildReferenceMd(root),
  };
}
