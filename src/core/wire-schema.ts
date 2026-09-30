/*
Canonical wire input schema generation for MCP tools, OpenAPI parameters, and CLI schema export.
Synthesizes a JSON Schema object from leaf-local options and positionals when inputSchema is not explicitly set.
*/

import { visibleOptions } from "../runtime/exposure.ts";
import { type CommandOption, type CommandPositional, OptionKind, type RunnableCommand, ValueFormat } from "./types.ts";
import { toJsonSchema } from "./zod-schema.ts";

/** Regular expression pattern for duration option format (e.g. 5m, 1h, 30s). */
const DURATION_PATTERN = "^\\d+[hdms]?$";

/** Presence flags omitted from wire schemas because they are handled by the framework runtime. */
const MCP_WIRE_OMIT_PRESENCE = new Set(["json", "yes", "verbose"]);

/** JSON Schema property for one leaf option in wire schemas. */
function optionProperty(
  /** Option definition to format as a schema property. */
  opt: CommandOption,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    description: opt.description,
  };
  if (opt.default !== undefined) {
    base.default = opt.default;
  }
  switch (opt.kind) {
    case OptionKind.Presence:
      return { type: "boolean", ...base };
    case OptionKind.String: {
      if (opt.format === ValueFormat.CommaList) {
        return {
          oneOf: [
            { type: "string", ...base },
            { type: "array", items: { type: "string" }, ...base },
          ],
        };
      }
      const stringBase = { type: "string", ...base };
      if (opt.format === ValueFormat.Duration) {
        return { ...stringBase, pattern: DURATION_PATTERN };
      }
      if (opt.format === ValueFormat.Date) {
        return { ...stringBase, format: "date" };
      }
      if (opt.format === ValueFormat.DateTime) {
        return { ...stringBase, format: "date-time" };
      }
      if (opt.pattern !== undefined) {
        return { ...stringBase, pattern: opt.pattern };
      }
      return stringBase;
    }
    case OptionKind.Number:
      return { type: "number", ...base };
    case OptionKind.Enum:
      return { type: "string", enum: opt.choices, ...base };
    case OptionKind.Json:
      return { type: "object", ...base };
  }
}

/** JSON Schema property for one positional argument slot in wire schemas. */
function positionalProperty(
  /** Positional argument definition to format as a schema property. */
  p: CommandPositional,
): Record<string, unknown> {
  const base = { description: p.description };
  const { argMax = 1 } = p;
  if (argMax === 0) {
    return { type: "array", items: { type: "string" }, ...base };
  }
  return { type: "string", ...base };
}

/**
 * Filters leaf-local options to only those exposed over wire protocols (MCP, OpenAPI, CLI schema export).
 * Omits hidden options and framework-handled presence flags (`--json`, `--yes`, `--verbose`).
 */
export function commandWireOptions(
  /** Leaf command node to extract wire options from. */
  leaf: RunnableCommand,
): CommandOption[] {
  return visibleOptions(leaf.options).filter((o) => {
    if (o.kind === OptionKind.Presence && MCP_WIRE_OMIT_PRESENCE.has(o.name)) {
      return false;
    }
    return true;
  });
}

/**
 * Builds the canonical input JSON Schema for a command with a handler.
 * Returns the emitted `leaf.inputSchema` when set (e.g. on document leaves or Zod-schema leaves);
 * otherwise synthesizes a flat object schema from leaf-local wire options and positionals.
 */
export function buildCommandInputSchema(
  /** Leaf command node to build the input schema for. */
  leaf: RunnableCommand,
): Record<string, unknown> {
  if (leaf.inputSchema !== undefined) {
    return toJsonSchema(leaf.inputSchema, "input");
  }

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const opt of commandWireOptions(leaf)) {
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
