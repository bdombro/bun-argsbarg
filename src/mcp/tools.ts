/*
This module maps AppSpec leaf nodes to MCP tool definitions and converts
flat JSON tool arguments into argv for App.invoke.
*/

import {
  type AppSpec,
  type Command,
  type CommandOption,
  hasHandler,
  isDocumentCommand,
  leafOutputSchema,
  type McpSizeLimits,
  OptionKind,
  type RunnableCommand,
  ValueFormat,
} from "../core/types.ts";
import { buildCommandInputSchema, commandWireOptions } from "../core/wire-schema.ts";
import { toJsonSchema } from "../core/zod-schema.ts";
import { isMcpHidden, visibleOptions } from "../runtime/exposure.ts";
import { cliResolveNotes } from "../runtime/help.ts";

export { buildCommandInputSchema, commandWireOptions } from "../core/wire-schema.ts";

/** Sanitizes a command key segment for MCP tool names and server identity. */
export function sanitizeToolSegment(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "_");
}

/** MCP server id derived from the app root key (sanitized). */
export function mcpServerId(root: AppSpec): string {
  return sanitizeToolSegment(root.key);
}

/** One MCP tool derived from a leaf CLI command. */
export interface McpToolDef {
  /** MCP tool name (underscore-separated, sanitized segments). */
  name: string;
  /** Tool description from the command with a handler. */
  description: string;
  /** Command path segments from the app root. */
  path: string[];
  /** Leaf command node. */
  leaf: RunnableCommand;
  /** JSON Schema for tools/call arguments (wrapped under {@link MCP_INPUT_WRAPPER_KEY} when not object-rooted). */
  inputSchema: Record<string, unknown>;
  /** True when {@link inputSchema} wraps the leaf schema; tools/call arguments are unwrapped before invoke. */
  inputWrapped: boolean;
  /** JSON Schema for structured tool results (wrapped under {@link MCP_OUTPUT_WRAPPER_KEY} when not object-rooted). */
  outputSchema?: Record<string, unknown>;
  /** True when {@link outputSchema} wraps the leaf schema; `structuredContent` is wrapped to match. */
  outputWrapped: boolean;
  /** `:param` names on the tool's path (without `:`); each is a required top-level tool argument. */
  pathParamNames: string[];
}

/**
 * Adds each `:param` on the tool path as a required top-level string property of the tool's input schema
 * (described by the leaf's `pathParams` schema when declared). Params the input schema already declares are
 * left as-is. Returns a new object; emitted schemas are frozen.
 */
function withMcpPathParams(
  /** Object-rooted tool input schema (possibly the `{ input }` wrapper). */
  schema: Record<string, unknown>,
  /** Path parameter names. */
  names: string[],
  /** Leaf, for its optional `pathParams` schema. */
  leaf: RunnableCommand,
): Record<string, unknown> {
  if (names.length === 0) {
    return schema;
  }
  const declared = (schema.properties ?? {}) as Record<string, unknown>;
  const described = leaf.pathParams === undefined ? undefined : toJsonSchema(leaf.pathParams, "input").properties;
  const properties: Record<string, unknown> = { ...declared };
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  for (const name of names) {
    if (name in declared) continue;
    const fromSchema = (described as Record<string, Record<string, unknown>> | undefined)?.[name];
    properties[name] = fromSchema ?? { type: "string", description: `Path parameter \`:${name}\`.` };
    required.add(name);
  }
  return { ...schema, properties, required: [...required] };
}

/** Property holding the leaf input when an MCP `inputSchema` is wrapped to get an object root. */
export const MCP_INPUT_WRAPPER_KEY = "input";

/** Property holding the leaf result when an MCP `outputSchema` is wrapped to get an object root. */
export const MCP_OUTPUT_WRAPPER_KEY = "result";

/**
 * MCP requires `type: "object"` at the root of tool input and output schemas. Returns object-rooted
 * schemas unchanged; wraps anything else (e.g. a discriminated-union `anyOf` root) as a single
 * required property, moving `$schema`, `$id`, `definitions`, and `$defs` up so `#/definitions/…`
 * references still resolve.
 */
export function wrapMcpRootSchema(
  /** Leaf input or output schema. */
  schema: Record<string, unknown>,
  /** Wrapper property name ({@link MCP_INPUT_WRAPPER_KEY} or {@link MCP_OUTPUT_WRAPPER_KEY}). */
  key: string,
): { schema: Record<string, unknown>; wrapped: boolean } {
  if (schema.type === "object") {
    return { schema, wrapped: false };
  }
  const { $schema, $id, definitions, $defs, ...inner } = schema;
  return {
    schema: {
      ...($schema === undefined ? {} : { $schema }),
      ...($id === undefined ? {} : { $id }),
      type: "object",
      properties: { [key]: inner },
      required: [key],
      additionalProperties: false,
      ...(definitions === undefined ? {} : { definitions }),
      ...($defs === undefined ? {} : { $defs }),
    },
    wrapped: true,
  };
}

/** Builds MCP tool description: "{cli path} — {description}". */
export function mcpToolDescription(path: string[], rootKey: string, description: string): string {
  const prefix = path.length > 0 ? path.join(" ") : rootKey;
  return `${prefix} — ${description}`;
}

/** Builds the MCP tool name for a leaf at the given path. */
export function mcpToolName(root: AppSpec, path: string[]): string {
  if (path.length === 0) {
    return sanitizeToolSegment(root.key);
  }
  return path.map(sanitizeToolSegment).join("_");
}

/** True when the leaf declares a `yes` presence option (auto-injected on MCP invoke). */
export function leafHasYesOption(
  /** Leaf command node to inspect. */
  leaf: RunnableCommand,
): boolean {
  return visibleOptions(leaf.options).some((opt) => opt.name === "yes" && opt.kind === OptionKind.Presence);
}

/** Formats an incoming MCP option value to an argv string. */
export function formatMcpOptionValue(
  /** Option definition to format the value for. */
  opt: CommandOption,
  /** Incoming raw value from the MCP tool call. */
  val: unknown,
): string | { error: string } {
  if (opt.format === ValueFormat.CommaList) {
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
function resolveToolDescription(root: AppSpec, path: string[], leaf: RunnableCommand): string {
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

/** Returns the app's `mcpServer.resources`. */
export function allMcpResources(root: AppSpec): McpResourceEntry[] {
  return (root.mcpServer?.resources ?? []).map((r) => ({
    uri: r.uri,
    name: r.name,
    description: r.description,
    mimeType: r.mimeType ?? "text/plain",
    load: r.load,
  }));
}

/** Recursively collects MCP tool definitions from user commands with a handler. */
export function collectMcpTools(root: AppSpec): McpToolDef[] {
  const out: McpToolDef[] = [];

  /** Walks the command tree and appends leaf tools. */
  function walk(cmd: Command, path: string[]): void {
    if (hasHandler(cmd)) {
      if (cmd.key === "completion" || cmd.key === "mcp" || cmd.key === "version") {
        return;
      }
      if (isMcpHidden(cmd)) {
        return;
      }
      const input = wrapMcpRootSchema(buildCommandInputSchema(cmd), MCP_INPUT_WRAPPER_KEY);
      const pathParamNames = path.filter((segment) => segment.startsWith(":")).map((segment) => segment.slice(1));
      const leafOutput = leafOutputSchema(cmd);
      const output = leafOutput === undefined ? undefined : wrapMcpRootSchema(leafOutput, MCP_OUTPUT_WRAPPER_KEY);
      out.push({
        name: mcpToolName(root, path),
        description: resolveToolDescription(root, path, cmd),
        path,
        leaf: cmd,
        inputSchema: withMcpPathParams(input.schema, pathParamNames, cmd),
        inputWrapped: input.wrapped,
        pathParamNames,
        ...(output === undefined ? {} : { outputSchema: output.schema }),
        outputWrapped: output?.wrapped ?? false,
      });
      return;
    }
    for (const ch of cmd.commands) {
      walk(ch, [...path, ch.key]);
    }
  }

  if (hasHandler(root)) {
    walk(root, []);
  } else {
    for (const ch of root.commands) {
      walk(ch, [ch.key]);
    }
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolves MCP server name and version for initialize. */
export function resolveMcpServerInfo(root: AppSpec): { name: string; version: string } {
  return {
    name: mcpServerId(root),
    version: root.version,
  };
}

/** Converts flat MCP tool arguments to argv for App.invoke. */
export function mcpToolCallToArgv(
  _root: AppSpec,
  tool: McpToolDef,
  args: Record<string, unknown>,
): string[] | { error: string } {
  const argv: string[] = [];
  for (const segment of tool.path) {
    if (!segment.startsWith(":")) {
      argv.push(segment);
      continue;
    }
    const value = args[segment.slice(1)];
    if (value === undefined || value === null || String(value).length === 0) {
      return { error: `Missing path parameter: ${segment.slice(1)}` };
    }
    argv.push(String(value));
  }
  if (isDocumentCommand(tool.leaf)) {
    return argv;
  }

  for (const opt of commandWireOptions(tool.leaf)) {
    if (opt.kind === OptionKind.Json) {
      continue;
    }
    const val = args[opt.name];
    if (val === undefined) {
      continue;
    }
    if (opt.kind === OptionKind.Presence) {
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

/** Default {@link McpSizeLimits}; see that type for what each limit approximates and why. */
export const DEFAULT_MCP_SIZE_LIMITS: Required<McpSizeLimits> = {
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

/** Per-tool sizes plus any warnings past {@link McpSizeLimits} (defaults or `mcpServer.sizeLimits`). */
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

/** Measures every MCP tool's description and definition size against {@link McpSizeLimits}. */
export function mcpSizeReport(root: AppSpec): McpSizeReport {
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
