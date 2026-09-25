/*
This module maps CliProgram leaf nodes to MCP tool definitions and converts
flat JSON tool arguments into argv for Cli.invoke.
*/

import { cliSchemaJson } from "../core/schema.ts";
import {
  type CliLeaf,
  type CliMcpSizeLimits,
  type CliNode,
  type CliOption,
  CliOptionKind,
  type CliProgram,
  CliValueFormat,
  isCliLeaf,
  isDocumentLeaf,
  leafOutputSchema,
} from "../core/types.ts";
import { buildLeafInputSchema, leafWireOptions } from "../core/wire-schema.ts";
import { docsMcpResources } from "../docs/mcp-resources.ts";
import { cliResolveNotes } from "../help.ts";
import { isMcpHidden, visibleOptions } from "../runtime/exposure.ts";

export { buildLeafInputSchema, leafWireOptions } from "../core/wire-schema.ts";
export { defaultDocsTopicResourceUri, resolveDocsTopicResourceUri } from "../docs/mcp-resources.ts";

/** Default URI pattern for the CLI schema MCP resource (`<mcpId>://schema`). */
export function defaultMcpSchemaUri(mcpId: string): string {
  return `${mcpId}://schema`;
}

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
  /** MCP tool name (underscore-separated, sanitized segments). */
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

/** True when the leaf declares a `yes` presence option (auto-injected on MCP invoke). */
export function leafHasYesOption(
  /** Leaf command node to inspect. */
  leaf: CliLeaf,
): boolean {
  return visibleOptions(leaf.options).some((opt) => opt.name === "yes" && opt.kind === CliOptionKind.Presence);
}

/** Formats an incoming MCP option value to an argv string. */
export function formatMcpOptionValue(
  /** Option definition to format the value for. */
  opt: CliOption,
  /** Incoming raw value from the MCP tool call. */
  val: unknown,
): string | { error: string } {
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

/** Resolves MCP tool description with optional override and leaf notes. */
function resolveToolDescription(root: CliProgram, path: string[], leaf: CliLeaf): string {
  let desc: string;
  if (leaf.mcpTool?.description) {
    desc = leaf.mcpTool.description;
  } else {
    desc = mcpToolDescription(path, root.key, leaf.description);
  }
  // `mcpTool.notes` overrides what CLI help shows (leaf.notes) for the MCP description only:
  // `false` omits notes entirely; a string replaces them; omitted falls through to leaf.notes.
  const notesOverride = leaf.mcpTool?.notes;
  if (notesOverride === false) {
    return desc;
  }
  const notes = (typeof notesOverride === "string" ? notesOverride : (leaf.notes ?? "")).trim();
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
    description: "Full CLI command tree (same as docs cli-schema).",
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
      if (cmd.key === "completion" || cmd.key === "configure" || cmd.key === "mcp" || cmd.key === "version") {
        return;
      }
      if (isMcpHidden(cmd)) {
        return;
      }
      const outputSchema = leafOutputSchema(cmd);
      out.push({
        name: mcpToolName(root, path),
        description: resolveToolDescription(root, path, cmd),
        path,
        leaf: cmd,
        inputSchema: buildLeafInputSchema(cmd),
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

  return out.sort((a, b) => a.name.localeCompare(b.name));
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
  _root: CliProgram,
  tool: McpToolDef,
  args: Record<string, unknown>,
): string[] | { error: string } {
  if (isDocumentLeaf(tool.leaf)) {
    return [...tool.path];
  }

  const argv = [...tool.path];

  for (const opt of leafWireOptions(tool.leaf)) {
    if (opt.kind === CliOptionKind.Json) {
      continue;
    }
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

  if (leafHasYesOption(tool.leaf) && !argv.includes("--yes")) {
    argv.push("--yes");
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

/** Default {@link CliMcpSizeLimits}; see that type for what each limit approximates and why. */
export const DEFAULT_MCP_SIZE_LIMITS: Required<CliMcpSizeLimits> = {
  definitionBytes: 51_200,
  definitionLines: 2_000,
  descriptionChars: 2_048,
  instructionsChars: 2_048,
};

/** Measured size of one MCP tool's description and pretty-printed definition. */
export interface McpToolSize {
  /** Pretty-printed `{name, description, inputSchema, outputSchema}`, in UTF-8 bytes. */
  definitionBytes: number;
  /** Line count of the same pretty-printed definition. */
  definitionLines: number;
  /** Character length of `description` alone. */
  descriptionChars: number;
  /** MCP tool name. */
  name: string;
}

/** Per-tool sizes plus any warnings past {@link CliMcpSizeLimits} (defaults or `mcpServer.sizeLimits`). */
export interface McpSizeReport {
  /** Character length of `mcpServer.instructions`, or 0 when unset. */
  instructionsChars: number;
  /** One entry per MCP tool, in `tools/list` order. */
  tools: McpToolSize[];
  /** Human-readable warnings for anything past its limit; empty when everything fits. */
  warnings: string[];
}

/** Formats a definition's pretty-printed JSON exactly as Cursor's synced tool file would show it. */
function mcpToolDefinitionJson(tool: McpToolDef): string {
  return JSON.stringify(
    {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
    },
    null,
    2,
  );
}

/** Measures every MCP tool's description and definition size against {@link CliMcpSizeLimits}. */
export function mcpSizeReport(root: CliProgram): McpSizeReport {
  const limits = { ...DEFAULT_MCP_SIZE_LIMITS, ...root.mcpServer?.sizeLimits };
  const warnings: string[] = [];

  const tools = collectMcpTools(root).map((tool): McpToolSize => {
    const definitionJson = mcpToolDefinitionJson(tool);
    const definitionBytes = Buffer.byteLength(definitionJson, "utf8");
    const definitionLines = definitionJson.split("\n").length;
    const descriptionChars = tool.description.length;

    if (limits.descriptionChars !== false && descriptionChars > limits.descriptionChars) {
      warnings.push(
        `MCP tool "${tool.name}" description is ${descriptionChars.toLocaleString()} chars ` +
          `(limit ${limits.descriptionChars.toLocaleString()}; Claude Code truncates longer descriptions)`,
      );
    }
    const overBytes = limits.definitionBytes !== false && definitionBytes > limits.definitionBytes;
    const overLines = limits.definitionLines !== false && definitionLines > limits.definitionLines;
    if (overBytes || overLines) {
      const byteLimit = limits.definitionBytes === false ? "∞" : limits.definitionBytes.toLocaleString();
      const lineLimit = limits.definitionLines === false ? "∞" : limits.definitionLines.toLocaleString();
      warnings.push(
        `MCP tool "${tool.name}" definition is ${definitionBytes.toLocaleString()} bytes / ` +
          `${definitionLines.toLocaleString()} lines pretty-printed (limit ${byteLimit} bytes / ${lineLimit} lines; ` +
          `Cursor reads tool definitions in chunks of at most that size)`,
      );
    }

    return { definitionBytes, definitionLines, descriptionChars, name: tool.name };
  });

  const instructionsChars = (root.mcpServer?.instructions ?? "").length;
  if (limits.instructionsChars !== false && instructionsChars > limits.instructionsChars) {
    warnings.push(
      `MCP instructions are ${instructionsChars.toLocaleString()} chars (limit ${limits.instructionsChars.toLocaleString()})`,
    );
  }

  return { instructionsChars, tools, warnings };
}
