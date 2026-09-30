/*
Tests for canonical wire input schema generation and wire option filtering.
*/

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { OptionKind, type RunnableCommand, ValueFormat } from "./types.ts";
import { buildCommandInputSchema, commandWireOptions } from "./wire-schema.ts";
import { toJsonSchema } from "./zod-schema.ts";

/** Tests for commandWireOptions. */
describe("commandWireOptions", () => {
  /** Tests filtering of framework-handled presence flags. */
  test("omits json, yes, and verbose presence flags", () => {
    const leaf: RunnableCommand = {
      key: "test",
      description: "Test command",
      options: [
        { name: "message", description: "Message text", kind: OptionKind.String },
        { name: "json", description: "Output JSON", kind: OptionKind.Presence },
        { name: "yes", description: "Auto-confirm", kind: OptionKind.Presence },
        { name: "verbose", description: "Verbose logging", kind: OptionKind.Presence },
        { name: "dry-run", description: "Dry run mode", kind: OptionKind.Presence },
      ],
      handler: () => {},
    };

    const wire = commandWireOptions(leaf);
    const names = wire.map((o) => o.name);
    expect(names).toEqual(["message", "dry-run"]);
  });

  /** Tests that hidden options are excluded from wire schemas. */
  test("omits hidden options", () => {
    const leaf: RunnableCommand = {
      key: "test",
      description: "Test command",
      options: [
        { name: "visible", description: "Visible option", kind: OptionKind.String },
        { name: "secret", description: "Secret option", kind: OptionKind.String, cli: { hidden: true } },
      ],
      handler: () => {},
    };

    const wire = commandWireOptions(leaf);
    expect(wire.map((o) => o.name)).toEqual(["visible"]);
  });
});

/** Tests for buildCommandInputSchema. */
describe("buildCommandInputSchema", () => {
  /** Tests that an explicit inputSchema is emitted (and memoized). */
  test("returns the emitted explicit inputSchema", () => {
    const customSchema = z.strictObject({ custom: z.number().int() });
    const leaf: RunnableCommand = {
      key: "doc",
      description: "Document command",
      kind: "document",
      inputSchema: customSchema,
      handler: () => {},
    };

    expect(buildCommandInputSchema(leaf)).toBe(toJsonSchema(customSchema, "input"));
    expect(buildCommandInputSchema(leaf).required).toEqual(["custom"]);
  });

  /** Tests synthesizing inputSchema for flag-based commands. */
  test("synthesizes inputSchema from wire options and positionals", () => {
    const leaf: RunnableCommand = {
      key: "create",
      description: "Create resource",
      options: [
        {
          name: "name",
          description: "Resource name",
          kind: OptionKind.String,
          required: true,
        },
        {
          name: "count",
          description: "Item count",
          kind: OptionKind.Number,
          default: "1",
        },
        {
          name: "force",
          description: "Force creation",
          kind: OptionKind.Presence,
        },
        {
          name: "tier",
          description: "Account tier",
          kind: OptionKind.Enum,
          choices: ["free", "pro", "enterprise"],
        },
        {
          name: "metadata",
          description: "Raw metadata",
          kind: OptionKind.Json,
        },
        {
          name: "json",
          description: "Omitted presence flag",
          kind: OptionKind.Presence,
        },
      ],
      positionals: [
        {
          name: "target",
          description: "Deployment target",
          kind: OptionKind.String,
          argMin: 1,
          argMax: 1,
        },
      ],
      handler: () => {},
    };

    const schema = buildCommandInputSchema(leaf);
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
    const leaf: RunnableCommand = {
      key: "query",
      description: "Query resources",
      options: [
        {
          name: "tags",
          description: "Comma-separated tag list",
          kind: OptionKind.String,
          format: ValueFormat.CommaList,
        },
        {
          name: "timeout",
          description: "Timeout duration",
          kind: OptionKind.String,
          format: ValueFormat.Duration,
        },
        {
          name: "since",
          description: "Start date",
          kind: OptionKind.String,
          format: ValueFormat.Date,
        },
        {
          name: "timestamp",
          description: "ISO timestamp",
          kind: OptionKind.String,
          format: ValueFormat.DateTime,
        },
        {
          name: "code",
          description: "Custom code format",
          kind: OptionKind.String,
          pattern: "^[A-Z]{3}$",
        },
      ],
      positionals: [
        {
          name: "files",
          description: "Files to process",
          kind: OptionKind.String,
          argMin: 0,
          argMax: 0,
        },
      ],
      handler: () => {},
    };

    const schema = buildCommandInputSchema(leaf) as {
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
