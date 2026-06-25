/*
This module maps CliProgram leaf nodes to MCP tool definitions and converts
flat JSON tool arguments into argv for Cli.invoke.
*/

import { docsMcpResources } from "../docs/mcp-resources.ts";
import { cliResolveNotes } from "../help.ts";
import { visibleOptions } from "../hidden.ts";
import { collectOptionDefs } from "../parse.ts";
import { cliSchemaJson } from "../schema.ts";
import {
  type CliLeaf,
  type CliNode,
  type CliOption,
  CliOptionKind,
  type CliPositional,
  type CliProgram,
  CliValueFormat,
  isCliLeaf,
  leafOutputSchema,
} from "../types.ts";

const DURATION_PATTERN = "^\\d+[hdms]?$";

/** Default URI pattern for the CLI schema MCP resource (`<mcpId>://schema`). */
export function defaultMcpSchemaUri(mcpId: string): string {
  return `${mcpId}://schema`;
}

export { defaultDocsTopicResourceUri, resolveDocsTopicResourceUri } from "../docs/mcp-resources.ts";

/** Sanitizes a command key segment for MCP tool names and server identity. */
export function sanitizeToolSegment(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "_");
}

/** MCP server id derived from the program root key (sanitized). */
export function mcpServerId(root: CliProgram): string {
  return sanitizeToolSegment(root.key);
}

/** One MCP tool derived from a leaf CLI command. */
export interface McpToolDef {
  /** MCP tool name (underscore-separated path). */
  name: string;
  /** Tool description from the leaf command. */
  description: string;
  /** Command path segments from the program root. */
  path: string[];
  /** Leaf command node. */
  leaf: CliLeaf;
  /** JSON Schema for tools/call arguments. */
  inputSchema: Record<string, unknown>;
  /** JSON Schema for structured tool results when set on the leaf `mcpTool`. */
  outputSchema?: Record<string, unknown>;
}

/** Builds MCP tool description: "{cli path} — {description}". */
export function mcpToolDescription(path: string[], rootKey: string, description: string): string {
  const prefix = path.length > 0 ? path.join(" ") : rootKey;
  return `${prefix} — ${description}`;
}

/** Builds the MCP tool name for a leaf at the given path. */
export function mcpToolName(root: CliProgram, path: string[]): string {
  if (path.length === 0) {
    return sanitizeToolSegment(root.key);
  }
  return path.map(sanitizeToolSegment).join("_");
}

/** JSON Schema property for one option. */
function optionProperty(opt: CliOption): Record<string, unknown> {
  const base: Record<string, unknown> = { description: opt.description };
  if (opt.default !== undefined) {
    base.default = opt.default;
  }
  switch (opt.kind) {
    case CliOptionKind.Presence:
      return { type: "boolean", ...base };
    case CliOptionKind.String: {
      if (opt.format === CliValueFormat.CommaList) {
        return {
          oneOf: [
            { type: "string", ...base },
            { type: "array", items: { type: "string" }, ...base },
          ],
        };
      }
      const stringBase = { type: "string", ...base };
      if (opt.format === CliValueFormat.Duration) {
        return { ...stringBase, pattern: DURATION_PATTERN };
      }
      if (opt.format === CliValueFormat.Date) {
        return { ...stringBase, format: "date" };
      }
      if (opt.format === CliValueFormat.DateTime) {
        return { ...stringBase, format: "date-time" };
      }
      if (opt.pattern !== undefined) {
        return { ...stringBase, pattern: opt.pattern };
      }
      return stringBase;
    }
    case CliOptionKind.Number:
      return { type: "number", ...base };
    case CliOptionKind.Enum:
      return { type: "string", enum: opt.choices, ...base };
  }
}

function formatMcpOptionValue(opt: CliOption, val: unknown): string | { error: string } {
  if (opt.format === CliValueFormat.CommaList) {
    if (Array.isArray(val)) {
      const items = val.map(String).filter(Boolean);
      if (items.length === 0) {
        return { error: `Option --${opt.name} requires at least one value` };
      }
      return items.join(",");
    }
    if (typeof val === "string") {
      return val;
    }
    return { error: `Option --${opt.name} must be a string or array of strings` };
  }
  return String(val);
}

/** JSON Schema property for one positional slot. */
function positionalProperty(p: CliPositional): Record<string, unknown> {
  const base = { description: p.description };
  const { argMax = 1 } = p;
  if (argMax === 0) {
    return { type: "array", items: { type: "string" }, ...base };
  }
  return { type: "string", ...base };
}

/** Builds inputSchema for a leaf command. */
function buildInputSchema(
  root: CliProgram,
  path: string[],
  leaf: CliLeaf,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const opt of visibleOptions(collectOptionDefs(root, path))) {
    properties[opt.name] = optionProperty(opt);
    if (opt.required) {
      required.push(opt.name);
    }
  }

  for (const p of leaf.positionals ?? []) {
    properties[p.name] = positionalProperty(p);
    const { argMin = 1, argMax = 1 } = p;
    if (argMax === 1 && argMin >= 1) {
      required.push(p.name);
    }
  }

  const schema: Record<string, unknown> = {
    type: "object",
    properties,
    additionalProperties: false,
  };
  if (required.length > 0) {
    schema.required = required;
  }
  return schema;
}

/** Resolves MCP tool description with optional override and leaf notes. */
function resolveToolDescription(root: CliProgram, path: string[], leaf: CliLeaf): string {
  let desc: string;
  if (leaf.mcpTool?.description) {
    desc = leaf.mcpTool.description;
  } else {
    desc = mcpToolDescription(path, root.key, leaf.description);
  }
  const notes = (leaf.notes ?? "").trim();
  if (notes.length > 0) {
    desc += `\n\n${cliResolveNotes(notes, root.key)}`;
  }
  return desc;
}

/** One resolved MCP resource (built-in or user-defined). */
export interface McpResourceEntry {
  uri: string;
  name: string;
  description?: string;
  mimeType: string;
  load: () => string;
}

/** Returns built-in schema resource plus user mcpServer.resources. */
export function allMcpResources(root: CliProgram): McpResourceEntry[] {
  const schemaUri = resolveMcpSchemaUri(root);
  const builtIn: McpResourceEntry = {
    uri: schemaUri,
    name: "cli-schema",
    description: "Full CLI command tree (same as docs schema).",
    mimeType: "application/json",
    load: () => cliSchemaJson(root),
  };
  const user = (root.mcpServer?.resources ?? []).map((r) => ({
    uri: r.uri,
    name: r.name,
    description: r.description,
    mimeType: r.mimeType ?? "text/plain",
    load: r.load,
  }));
  return [builtIn, ...docsMcpResources(root), ...user];
}

/** Recursively collects MCP tool definitions from user leaf commands. */
export function collectMcpTools(root: CliProgram): McpToolDef[] {
  const out: McpToolDef[] = [];

  /** Walks the command tree and appends leaf tools. */
  function walk(cmd: CliNode, path: string[]): void {
    if (isCliLeaf(cmd)) {
      if (
        cmd.key === "completion" ||
        cmd.key === "install" ||
        cmd.key === "mcp" ||
        cmd.key === "version"
      ) {
        return;
      }
      if (cmd.hidden || cmd.mcpTool?.enabled === false) {
        return;
      }
      const outputSchema = leafOutputSchema(cmd);
      out.push({
        name: mcpToolName(root, path),
        description: resolveToolDescription(root, path, cmd),
        path,
        leaf: cmd,
        inputSchema: buildInputSchema(root, path, cmd),
        ...(outputSchema === undefined ? {} : { outputSchema }),
      });
      return;
    }
    for (const ch of cmd.commands) {
      walk(ch, [...path, ch.key]);
    }
  }

  if (isCliLeaf(root)) {
    walk(root, []);
  } else {
    for (const ch of root.commands) {
      walk(ch, [ch.key]);
    }
  }

  return out;
}

/** Resolves MCP server name and version for initialize. */
export function resolveMcpServerInfo(root: CliProgram): { name: string; version: string } {
  return {
    name: mcpServerId(root),
    version: root.version,
  };
}

/** Resolves the schema resource URI for this app. */
export function resolveMcpSchemaUri(root: CliProgram): string {
  if (root.mcpServer?.schemaResourceUri) {
    return root.mcpServer.schemaResourceUri;
  }
  return defaultMcpSchemaUri(mcpServerId(root));
}

/** Converts flat MCP tool arguments to argv for Cli.invoke. */
export function mcpToolCallToArgv(
  root: CliProgram,
  tool: McpToolDef,
  args: Record<string, unknown>,
): string[] | { error: string } {
  const argv = [...tool.path];

  for (const opt of collectOptionDefs(root, tool.path)) {
    const val = args[opt.name];
    if (val === undefined) {
      continue;
    }
    if (opt.kind === CliOptionKind.Presence) {
      if (val === true) {
        argv.push(`--${opt.name}`);
      }
      continue;
    }
    const formatted = formatMcpOptionValue(opt, val);
    if (typeof formatted !== "string") {
      return formatted;
    }
    argv.push(`--${opt.name}`, formatted);
  }

  for (const p of tool.leaf.positionals ?? []) {
    const val = args[p.name];
    const { argMin = 1, argMax = 1 } = p;

    if (argMax === 0) {
      const raw = args[p.name];
      if (raw === undefined) {
        if (argMin >= 1) {
          return { error: `Missing argument: ${p.name} (use a JSON array)` };
        }
        continue;
      }
      if (!Array.isArray(raw)) {
        return {
          error: `Argument ${p.name} must be a JSON array of strings (not a comma-separated string)`,
        };
      }
      const items = raw.map(String).filter(Boolean);
      if (items.length === 0 && argMin >= 1) {
        return { error: `Missing argument: ${p.name}` };
      }
      argv.push(...items);
      continue;
    }

    if (val === undefined) {
      if (argMin >= 1) {
        return { error: `Missing argument: ${p.name}` };
      }
      continue;
    }
    argv.push(String(val));
  }

  return argv;
}
