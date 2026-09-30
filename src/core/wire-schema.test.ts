/*
Tests for canonical wire input schema generation and wire option filtering.
*/

import assert from "node:assert/strict";
import { describe, test } from "node:test";
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
    assert.deepEqual(names, ["message", "dry-run"]);
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
    assert.deepEqual(
      wire.map((o) => o.name),
      ["visible"],
    );
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

    assert.equal(buildCommandInputSchema(leaf), toJsonSchema(customSchema, "input"));
    assert.deepEqual(buildCommandInputSchema(leaf).required, ["custom"]);
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
    assert.deepEqual(schema, {
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
    assert.equal(schema.type, "object");
    assert.equal(schema.required, undefined);

    // CommaList
    assert.deepEqual(schema.properties.tags, {
      oneOf: [
        { type: "string", description: "Comma-separated tag list" },
        { type: "array", items: { type: "string" }, description: "Comma-separated tag list" },
      ],
    });

    // Duration
    assert.deepEqual(schema.properties.timeout, {
      type: "string",
      description: "Timeout duration",
      pattern: "^\\d+[hdms]?$",
    });

    // Date
    assert.deepEqual(schema.properties.since, {
      type: "string",
      description: "Start date",
      format: "date",
    });

    // DateTime
    assert.deepEqual(schema.properties.timestamp, {
      type: "string",
      description: "ISO timestamp",
      format: "date-time",
    });

    // Regex pattern
    assert.deepEqual(schema.properties.code, {
      type: "string",
      description: "Custom code format",
      pattern: "^[A-Z]{3}$",
    });

    // Varargs positional
    assert.deepEqual(schema.properties.files, {
      type: "array",
      items: { type: "string" },
      description: "Files to process",
    });
  });
});
