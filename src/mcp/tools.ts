/*
This module maps CliCommand leaf nodes to MCP tool definitions and converts
flat JSON tool arguments into argv for cliInvoke.
*/

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectOptionDefs } from "../parse.ts";
import { cliSchemaJson } from "../schema.ts";
import { CliCommand, CliOption, CliOptionKind, CliPositional } from "../types.ts";

/** Default URI for the CLI schema MCP resource. */
export const MCP_SCHEMA_URI_DEFAULT = "argsbarg://schema";

/** One MCP tool derived from a leaf CLI command. */
export interface McpToolDef {
  /** MCP tool name (underscore-separated path). */
  name: string;
  /** Tool description from the leaf command. */
  description: string;
  /** Command path segments from the program root. */
  path: string[];
  /** Leaf command node. */
  leaf: CliCommand;
  /** JSON Schema for tools/call arguments. */
  inputSchema: Record<string, unknown>;
}

/** Builds MCP tool description: "{cli path} — {description}". */
export function mcpToolDescription(path: string[], rootKey: string, description: string): string {
  const prefix = path.length > 0 ? path.join(" ") : rootKey;
  return `${prefix} — ${description}`;
}

/** Sanitizes a command key segment for MCP tool names. */
export function sanitizeToolSegment(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "_");
}

/** Builds the MCP tool name for a leaf at the given path. */
export function mcpToolName(root: CliCommand, path: string[]): string {
  if (path.length === 0) {
    return sanitizeToolSegment(root.key);
  }
  return path.map(sanitizeToolSegment).join("_");
}

/** JSON Schema property for one option. */
function optionProperty(opt: CliOption): Record<string, unknown> {
  const base = { description: opt.description };
  switch (opt.kind) {
    case CliOptionKind.Presence:
      return { type: "boolean", ...base };
    case CliOptionKind.String:
      return { type: "string", ...base };
    case CliOptionKind.Number:
      return { type: "number", ...base };
    case CliOptionKind.Enum:
      return { type: "string", enum: opt.choices, ...base };
  }
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
function buildInputSchema(root: CliCommand, path: string[], leaf: CliCommand): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const opt of collectOptionDefs(root, path)) {
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

/** Resolves MCP tool description with optional override and requiresEnv suffix. */
function resolveToolDescription(root: CliCommand, path: string[], leaf: CliCommand): string {
  if (leaf.mcpTool?.description) {
    return leaf.mcpTool.description;
  }
  let desc = mcpToolDescription(path, root.key, leaf.description);
  const env = leaf.mcpTool?.requiresEnv;
  if (env && env.length > 0) {
    desc += ` [requires env: ${env.join(", ")}]`;
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
export function allMcpResources(root: CliCommand): McpResourceEntry[] {
  const schemaUri = resolveMcpSchemaUri(root);
  const builtIn: McpResourceEntry = {
    uri: schemaUri,
    name: "cli-schema",
    description: "Full CLI command tree (same as --schema).",
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
  return [builtIn, ...user];
}

/** Recursively collects MCP tool definitions from user leaf commands. */
export function collectMcpTools(root: CliCommand): McpToolDef[] {
  const out: McpToolDef[] = [];

  /** Walks the command tree and appends leaf tools. */
  function walk(cmd: CliCommand, path: string[]): void {
    if ("handler" in cmd && cmd.handler) {
      if (cmd.key === "completion" || cmd.key === "mcp") {
        return;
      }
      if (cmd.mcpTool?.enabled === false) {
        return;
      }
      out.push({
        name: mcpToolName(root, path),
        description: resolveToolDescription(root, path, cmd),
        path,
        leaf: cmd,
        inputSchema: buildInputSchema(root, path, cmd),
      });
      return;
    }
    for (const ch of cmd.commands ?? []) {
      walk(ch, [...path, ch.key]);
    }
  }

  if ("handler" in root && root.handler) {
    walk(root, []);
  } else {
    for (const ch of root.commands ?? []) {
      walk(ch, [ch.key]);
    }
  }

  return out;
}

/** Reads package.json version from cwd synchronously. */
function resolveMcpVersionFromPackageJson(): string | undefined {
  try {
    const text = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const version = (JSON.parse(text) as { version?: string }).version;
    return typeof version === "string" ? version : undefined;
  } catch {
    return undefined;
  }
}

/** Resolves MCP server name and version for initialize. */
export function resolveMcpServerInfo(root: CliCommand): { name: string; version: string } {
  return {
    name: root.mcpServer?.name ?? root.key,
    version: root.mcpServer?.version ?? resolveMcpVersionFromPackageJson() ?? "0.0.0",
  };
}

/** Resolves the schema resource URI for this app. */
export function resolveMcpSchemaUri(root: CliCommand): string {
  return root.mcpServer?.schemaResourceUri ?? MCP_SCHEMA_URI_DEFAULT;
}

/** Converts flat MCP tool arguments to argv for cliInvoke. */
export function mcpToolCallToArgv(
  root: CliCommand,
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
    argv.push(`--${opt.name}`, String(val));
  }

  for (const p of tool.leaf.positionals ?? []) {
    const val = args[p.name];
    const { argMin = 1, argMax = 1 } = p;

    if (argMax === 0) {
      if (!Array.isArray(val)) {
        return { error: `Missing argument: ${p.name}` };
      }
      for (const item of val) {
        argv.push(String(item));
      }
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
