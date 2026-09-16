/*
Tests for canonical wire input schema generation and wire option filtering.
*/

import { describe, expect, test } from "bun:test";
import { type CliLeaf, CliOptionKind, CliValueFormat } from "./types.ts";
import { buildLeafInputSchema, leafWireOptions } from "./wire-schema.ts";

/** Tests for leafWireOptions. */
describe("leafWireOptions", () => {
  /** Tests filtering of framework-handled presence flags. */
  test("omits json, yes, and verbose presence flags", () => {
    const leaf: CliLeaf = {
      key: "test",
      description: "Test command",
      options: [
        { name: "message", description: "Message text", kind: CliOptionKind.String },
        { name: "json", description: "Output JSON", kind: CliOptionKind.Presence },
        { name: "yes", description: "Auto-confirm", kind: CliOptionKind.Presence },
        { name: "verbose", description: "Verbose logging", kind: CliOptionKind.Presence },
        { name: "dry-run", description: "Dry run mode", kind: CliOptionKind.Presence },
      ],
      handler: () => {},
    };

    const wire = leafWireOptions(leaf);
    const names = wire.map((o) => o.name);
    expect(names).toEqual(["message", "dry-run"]);
  });

  /** Tests that hidden options are excluded from wire schemas. */
  test("omits hidden options", () => {
    const leaf: CliLeaf = {
      key: "test",
      description: "Test command",
      options: [
        { name: "visible", description: "Visible option", kind: CliOptionKind.String },
        { name: "secret", description: "Secret option", kind: CliOptionKind.String, cli: { hidden: true } },
      ],
      handler: () => {},
    };

    const wire = leafWireOptions(leaf);
    expect(wire.map((o) => o.name)).toEqual(["visible"]);
  });
});

/** Tests for buildLeafInputSchema. */
describe("buildLeafInputSchema", () => {
  /** Tests that explicitly set inputSchema is returned as-is. */
  test("returns explicit inputSchema unchanged", () => {
    const customSchema = {
      type: "object",
      properties: { custom: { type: "integer" } },
      required: ["custom"],
    };
    const leaf: CliLeaf = {
      key: "doc",
      description: "Document command",
      kind: "document",
      inputSchema: customSchema,
      handler: () => {},
    };

    expect(buildLeafInputSchema(leaf)).toBe(customSchema);
  });

  /** Tests synthesizing inputSchema for flag-based commands. */
  test("synthesizes inputSchema from wire options and positionals", () => {
    const leaf: CliLeaf = {
      key: "create",
      description: "Create resource",
      options: [
        {
          name: "name",
          description: "Resource name",
          kind: CliOptionKind.String,
          required: true,
        },
        {
          name: "count",
          description: "Item count",
          kind: CliOptionKind.Number,
          default: "1",
        },
        {
          name: "force",
          description: "Force creation",
          kind: CliOptionKind.Presence,
        },
        {
          name: "tier",
          description: "Account tier",
          kind: CliOptionKind.Enum,
          choices: ["free", "pro", "enterprise"],
        },
        {
          name: "metadata",
          description: "Raw metadata",
          kind: CliOptionKind.Json,
        },
        {
          name: "json",
          description: "Omitted presence flag",
          kind: CliOptionKind.Presence,
        },
      ],
      positionals: [
        {
          name: "target",
          description: "Deployment target",
          kind: CliOptionKind.String,
          argMin: 1,
          argMax: 1,
        },
      ],
      handler: () => {},
    };

    const schema = buildLeafInputSchema(leaf);
    expect(schema).toEqual({
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Resource name",
        },
        count: {
          type: "number",
          description: "Item count",
          default: "1",
        },
        force: {
          type: "boolean",
          description: "Force creation",
        },
        tier: {
          type: "string",
          enum: ["free", "pro", "enterprise"],
          description: "Account tier",
        },
        metadata: {
          type: "object",
          description: "Raw metadata",
        },
        target: {
          type: "string",
          description: "Deployment target",
        },
      },
      additionalProperties: false,
      required: ["name", "target"],
    });
  });

  /** Tests string format constraints in synthesized inputSchema. */
  test("synthesizes formatted string options and varargs positionals", () => {
    const leaf: CliLeaf = {
      key: "query",
      description: "Query resources",
      options: [
        {
          name: "tags",
          description: "Comma-separated tag list",
          kind: CliOptionKind.String,
          format: CliValueFormat.CommaList,
        },
        {
          name: "timeout",
          description: "Timeout duration",
          kind: CliOptionKind.String,
          format: CliValueFormat.Duration,
        },
        {
          name: "since",
          description: "Start date",
          kind: CliOptionKind.String,
          format: CliValueFormat.Date,
        },
        {
          name: "timestamp",
          description: "ISO timestamp",
          kind: CliOptionKind.String,
          format: CliValueFormat.DateTime,
        },
        {
          name: "code",
          description: "Custom code format",
          kind: CliOptionKind.String,
          pattern: "^[A-Z]{3}$",
        },
      ],
      positionals: [
        {
          name: "files",
          description: "Files to process",
          kind: CliOptionKind.String,
          argMin: 0,
          argMax: 0,
        },
      ],
      handler: () => {},
    };

    const schema = buildLeafInputSchema(leaf) as {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.type).toBe("object");
    expect(schema.required).toBeUndefined();

    // CommaList
    expect(schema.properties.tags).toEqual({
      oneOf: [
        { type: "string", description: "Comma-separated tag list" },
        { type: "array", items: { type: "string" }, description: "Comma-separated tag list" },
      ],
    });

    // Duration
    expect(schema.properties.timeout).toEqual({
      type: "string",
      description: "Timeout duration",
      pattern: "^\\d+[hdms]?$",
    });

    // Date
    expect(schema.properties.since).toEqual({
      type: "string",
      description: "Start date",
      format: "date",
    });

    // DateTime
    expect(schema.properties.timestamp).toEqual({
      type: "string",
      description: "ISO timestamp",
      format: "date-time",
    });

    // Regex pattern
    expect(schema.properties.code).toEqual({
      type: "string",
      description: "Custom code format",
      pattern: "^[A-Z]{3}$",
    });

    // Varargs positional
    expect(schema.properties.files).toEqual({
      type: "array",
      items: { type: "string" },
      description: "Files to process",
    });
  });
});
