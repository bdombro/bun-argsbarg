/*
Canonical wire input schema generation for MCP tools, OpenAPI parameters, and CLI schema export.
Synthesizes a JSON Schema object from leaf-local options and positionals when inputSchema is not explicitly set.
*/

import { visibleOptions } from "../runtime/exposure.ts";
import { type CliLeaf, type CliOption, CliOptionKind, type CliPositional, CliValueFormat } from "./types.ts";

/** Regular expression pattern for duration option format (e.g. 5m, 1h, 30s). */
const DURATION_PATTERN = "^\\d+[hdms]?$";

/** Presence flags omitted from wire schemas because they are handled by the framework runtime. */
const MCP_WIRE_OMIT_PRESENCE = new Set(["json", "yes", "verbose"]);

/** JSON Schema property for one leaf option in wire schemas. */
function optionProperty(
  /** Option definition to format as a schema property. */
  opt: CliOption,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    description: opt.description,
  };
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
    case CliOptionKind.Json:
      return { type: "object", ...base };
  }
}

/** JSON Schema property for one positional argument slot in wire schemas. */
function positionalProperty(
  /** Positional argument definition to format as a schema property. */
  p: CliPositional,
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
export function leafWireOptions(
  /** Leaf command node to extract wire options from. */
  leaf: CliLeaf,
): CliOption[] {
  return visibleOptions(leaf.options).filter((o) => {
    if (o.kind === CliOptionKind.Presence && MCP_WIRE_OMIT_PRESENCE.has(o.name)) {
      return false;
    }
    return true;
  });
}

/**
 * Builds the canonical input JSON Schema for a leaf command.
 * Returns `leaf.inputSchema` when explicitly defined (e.g. on document leaves or schemagen leaves);
 * otherwise synthesizes a flat object schema from leaf-local wire options and positionals.
 */
export function buildLeafInputSchema(
  /** Leaf command node to build the input schema for. */
  leaf: CliLeaf,
): Record<string, unknown> {
  if (leaf.inputSchema !== undefined) {
    return leaf.inputSchema;
  }

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const opt of leafWireOptions(leaf)) {
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
