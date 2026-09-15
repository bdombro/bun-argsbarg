/*
This module generates the MCP routing skill (SKILL.md) for Claude Code plugin zips.
*/

import { defaultConfigEntryTitle } from "../config/entry.ts";
import type { CliProgram } from "../core/types.ts";
import {
  collectMcpTools,
  leafWireOptions,
  mcpServerId,
  resolveMcpSchemaUri,
  sanitizeToolSegment,
} from "../mcp/tools.ts";

/** MCP routing skill for Claude Code plugin zips (SKILL.md only). */
export interface PluginSkillBundle {
  /** Target directory name under `skills/`. */
  dirName: string;
  /** Generated plugin SKILL.md content. */
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

/** Builds configuration section lines for YAML and markdown. */
function buildConfigurationSection(root: CliProgram): string[] {
  if (!root.appConfig || Object.keys(root.appConfig.entries).length === 0) {
    return [];
  }
  const entries = root.appConfig.entries;
  const lines: string[] = ["## Configuration", ""];
  for (const name of Object.keys(entries).sort()) {
    const entry = entries[name];
    if (!entry) continue;
    const title = defaultConfigEntryTitle(name);
    const envStr = entry.env ? ` (env: \`${entry.env}\`)` : "";
    const desc = entry.description ? ` — ${entry.description}` : "";
    lines.push(`- **${name}** (\`${title}\`${envStr})${desc}`);
  }
  lines.push("");
  return lines;
}

/** Builds SKILL.md for Claude Code plugin zips (MCP routing only). */
function buildPluginSkillMd(root: CliProgram, dirName: string): string {
  const lines: string[] = [
    "---",
    `name: ${dirName}`,
    `description: ${pluginSkillDescription(root)}`,
    "---",
    "",
    `# ${root.key}`,
    "",
    root.description,
    "",
    "## MCP Tools",
    "",
    `Server id: \`${mcpServerId(root)}\``,
    "",
    "Prefer using MCP tools over terminal commands when available.",
    "",
    `- Run \`tools/list\` against \`${mcpServerId(root)}\` to discover tools.`,
    `- Read schema resource \`${resolveMcpSchemaUri(root)}\` for types.`,
    "",
  ];

  const tools = collectMcpTools(root);
  if (tools.length > 0) {
    lines.push("### Available tools", "");
    for (const tool of tools) {
      const toolName = sanitizeToolSegment(tool.path.join("_"));
      const desc = tool.leaf.description;
      const wire = leafWireOptions(tool.leaf);
      const flags = wire.length > 0 ? ` (flags: ${wire.map((o) => `--${o.name}`).join(", ")})` : "";
      lines.push(`- \`${toolName}\` — ${desc}${flags}`);
    }
    lines.push("");
  }

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
