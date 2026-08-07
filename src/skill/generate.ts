/*
This module generates Agent Skills content (SKILL.md + reference.md) from a CLI schema.
*/

import { defaultConfigEntryTitle } from "../config/entry.ts";
import { collectOptionDefs } from "../core/parse.ts";
import { CliOptionKind, type CliProgram } from "../core/types.ts";
import { generateCliGuide } from "../docs/cli-guide.ts";
import {
  collectMcpTools,
  type McpToolDef,
  mcpServerId,
  resolveMcpSchemaUri,
  sanitizeToolSegment,
} from "../mcp/tools.ts";
import { skillDirName } from "./naming.ts";

export interface SkillBundle {
  dirName: string;
  skillMd: string;
  referenceMd: string;
}

/** MCP routing skill for Claude Code plugin zips (SKILL.md only). */
export interface PluginSkillBundle {
  dirName: string;
  skillMd: string;
}

/** Truncates text to maxLen with ellipsis. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

/** Builds MCP-oriented skill description for Claude plugin YAML frontmatter. */
function pluginSkillDescription(root: CliProgram): string {
  const tools = collectMcpTools(root);
  const paths = tools.map((t) => (t.path.length > 0 ? t.path.join(" ") : root.key));
  const sample = paths.slice(0, 5).join(", ");
  const more = paths.length > 5 ? `, and ${paths.length - 5} more` : "";
  const desc = `Use the ${root.key} MCP toolset (${sample}${more}). Use when the user mentions ${root.key}${paths.length > 0 ? `, ${paths.slice(0, 3).join(", ")}` : ""}, or related tasks.`;
  return truncate(desc, 1024);
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
    line += ` (\`--${e.name}\`: ${e.choices?.join(" | ")})`;
  }
  const varargs = (tool.leaf.positionals ?? []).filter((p) => (p.argMax ?? 1) === 0);
  if (varargs.length > 0) {
    line += ` (varargs: ${varargs.map((p) => p.name).join(", ")})`;
  }
  return line;
}

function buildConfigurationSection(root: CliProgram): string[] {
  const schema = root.appConfig?.entries;
  if (!schema || Object.keys(schema).length === 0) {
    return [];
  }
  const lines = ["## Configuration", ""];
  for (const [key, entry] of Object.entries(schema)) {
    const label = entry.title ?? defaultConfigEntryTitle(key);
    const envNote = entry.env ? ` (env: \`${entry.env}\`)` : "";
    lines.push(`- **${label}** (\`${key}\`${envNote}) — ${entry.description}`);
  }
  lines.push("");
  return lines;
}

/** Builds SKILL.md body for the agent skill bundle. */
function buildSkillMd(root: CliProgram, dirName: string): string {
  const name = dirName;
  const description = skillDescription(root);
  const tools = collectMcpTools(root);

  const lines: string[] = [
    "---",
    `id: ${dirName}`,
    `name: ${name}`,
    `description: ${description}`,
    "enabled: true",
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

  lines.push(...buildConfigurationSection(root));

  lines.push(
    "## Pitfalls",
    "",
    "- Pass `--` before arguments that look like flags.",
    "",
    "## Reference",
    "",
    `For full detail, open \`reference.md\` in this skill directory (same as \`${root.key} docs cli\`).`,
    "",
    "## Install location",
    "",
    "Install follows the https://dotagentsprotocol.com:",
    "",
    `- Auto-install: \`${root.key} configure --sync --yes\` when \`skill.enabled\` → \`~/.agents/skills/${dirName}/\``,
    `- Cursor and most coding agents read \`~/.agents/skills/\` natively`,
    "",
    "**Claude Code (manual):** symlink or copy into Claude's skill directory:",
    "",
    "```bash",
    "mkdir -p ~/.claude/skills",
    `ln -sf ~/.agents/skills/${dirName} ~/.claude/skills/${dirName}`,
    "```",
    "",
    `Project override (optional): \`.agents/skills/${dirName}/\``,
    "",
  );

  return lines.join("\n");
}

/** Builds reference.md with the compact `docs cli` markdown guide. */
function buildReferenceMd(root: CliProgram): string {
  return generateCliGuide(root, { compact: true });
}

/** Builds MCP routing SKILL.md for Claude Code plugin zips. */
function buildPluginSkillMd(root: CliProgram, dirName: string): string {
  const name = sanitizeToolSegment(root.key);
  const description = pluginSkillDescription(root);
  const serverId = mcpServerId(root);
  const schemaUri = resolveMcpSchemaUri(root);

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
    "This plugin bundles an MCP server. Use MCP tools to fulfill requests.",
    "",
    `- Server id: \`${serverId}\` (configured in plugin \`.mcp.json\`)`,
    "- Tool names and argument shapes come from MCP `tools/list`",
    `- Full schema: \`${schemaUri}\` (same as \`${root.key} docs cli-schema\`)`,
    "",
  ];

  lines.push(...buildConfigurationSection(root));

  lines.push(
    "## Claude Code plugin",
    "",
    `Invoke with \`/${dirName}\` or let Claude auto-match from the description.`,
    "",
  );

  return lines.join("\n");
}

/** Generates MCP routing SKILL.md for Claude Code plugin zips. */
export function generatePluginSkillBundle(root: CliProgram): PluginSkillBundle {
  const dirName = sanitizeToolSegment(root.key);
  return {
    dirName,
    skillMd: buildPluginSkillMd(root, dirName),
  };
}

/** Generates SKILL.md and reference.md for agent skill install. */
export function generateSkillBundle(root: CliProgram): SkillBundle {
  const dirName = skillDirName(root.key);
  return {
    dirName,
    skillMd: buildSkillMd(root, dirName),
    referenceMd: buildReferenceMd(root),
  };
}
