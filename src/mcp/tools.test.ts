/*
Tests for mcp/tools module: MCP tool derivation, size reporting, per-leaf MCP-only notes,
object-root schema wrapping, and the MCP tool schema startup check.
*/

import { describe, expect, test } from "bun:test";
import { cliPresentationRoot } from "../builtins/presentation.ts";
import { CliOptionKind } from "../core/types.ts";
import { cliValidateProgram } from "../core/validate.ts";
import { cliHelpRender } from "../help.ts";
import { requireMcpTool, testProgram } from "../test/fixtures.ts";
import {
  collectMcpTools,
  DEFAULT_MCP_SIZE_LIMITS,
  MCP_INPUT_WRAPPER_KEY,
  mcpSizeReport,
  wrapMcpRootSchema,
} from "./tools.ts";

describe("mcpSizeReport", () => {
  test("measures description and pretty definition against a hand-built JSON.stringify", () => {
    const program = testProgram({
      key: "sizetest",
      description: "size test",
      mcpServer: { enabled: true },
      commands: [{ key: "run", description: "Run it.", handler: () => {} }],
    });
    const report = mcpSizeReport(program);
    const [tool] = collectMcpTools(program);
    expect(tool).toBeDefined();

    const expectedJson = JSON.stringify(
      { name: tool?.name, description: tool?.description, inputSchema: tool?.inputSchema },
      null,
      2,
    );
    expect(report.tools).toHaveLength(1);
    expect(report.tools[0]).toEqual({
      name: tool?.name,
      descriptionChars: tool?.description.length,
      definitionBytes: Buffer.byteLength(expectedJson, "utf8"),
      definitionLines: expectedJson.split("\n").length,
    });
    expect(report.warnings).toEqual([]);
    expect(report.instructionsChars).toBe(0);
  });

  test("warns past default limits for description and definition size", () => {
    const program = testProgram({
      key: "sizetest2",
      description: "size test 2",
      mcpServer: { enabled: true },
      commands: [
        {
          key: "small",
          description: "Small tool.",
          notes: "x".repeat(3_000),
          handler: () => {},
        },
        {
          key: "big",
          description: "Big tool.",
          options: [
            {
              name: "mode",
              description: "Mode.",
              kind: CliOptionKind.Enum,
              choices: Array.from({ length: 4_000 }, (_, i) => `choice-${i}`),
            },
          ],
          handler: () => {},
        },
      ],
    });
    const report = mcpSizeReport(program);

    const smallWarning = report.warnings.find((w) => w.includes('"small"'));
    expect(smallWarning).toBeDefined();
    expect(smallWarning).toContain("description is");
    expect(smallWarning).toContain(`limit ${DEFAULT_MCP_SIZE_LIMITS.descriptionChars.toLocaleString()}`);

    const bigWarning = report.warnings.find((w) => w.includes('"big"'));
    expect(bigWarning).toBeDefined();
    expect(bigWarning).toContain("definition is");
    expect(bigWarning).toContain("pretty-printed");
  });

  test("sizeLimits overrides raise or lower the threshold", () => {
    const program = testProgram({
      key: "sizetest3",
      description: "size test 3",
      mcpServer: { enabled: true, sizeLimits: { descriptionChars: 5 } },
      commands: [
        { key: "run", description: "Run it, with a description longer than five characters.", handler: () => {} },
      ],
    });
    const report = mcpSizeReport(program);
    expect(report.warnings.some((w) => w.includes("description is"))).toBe(true);
  });

  test("sizeLimits: false disables a check entirely", () => {
    const program = testProgram({
      key: "sizetest4",
      description: "size test 4",
      mcpServer: { enabled: true, sizeLimits: { descriptionChars: false } },
      commands: [
        { key: "run", description: "Run it, with a description longer than five characters.", handler: () => {} },
      ],
    });
    const report = mcpSizeReport(program);
    expect(report.warnings.some((w) => w.includes("description is"))).toBe(false);
  });

  test("warns when instructions exceed the limit", () => {
    const program = testProgram({
      key: "sizetest5",
      description: "size test 5",
      mcpServer: { enabled: true, instructions: "x".repeat(3_000) },
      commands: [{ key: "run", description: "Run it.", handler: () => {} }],
    });
    const report = mcpSizeReport(program);
    expect(report.instructionsChars).toBe(3_000);
    expect(report.warnings.some((w) => w.startsWith("MCP instructions are"))).toBe(true);
  });
});

describe("mcpTool.notes", () => {
  function programWithNotesOverride(notesOverride: string | false | undefined) {
    return testProgram({
      key: "notestest",
      description: "notes test",
      mcpServer: { enabled: true },
      commands: [
        {
          key: "run",
          description: "Run it.",
          notes: "Original CLI notes.",
          ...(notesOverride === undefined ? {} : { mcpTool: { notes: notesOverride } }),
          handler: () => {},
        },
      ],
    });
  }

  test("false omits notes from the MCP description", () => {
    const [tool] = collectMcpTools(programWithNotesOverride(false));
    expect(tool?.description).not.toContain("Original CLI notes.");
  });

  test("a string replaces the leaf's notes in the MCP description", () => {
    const [tool] = collectMcpTools(programWithNotesOverride("Custom MCP-only note."));
    expect(tool?.description).toContain("Custom MCP-only note.");
    expect(tool?.description).not.toContain("Original CLI notes.");
  });

  test("omitted falls through to the leaf's own notes", () => {
    const [tool] = collectMcpTools(programWithNotesOverride(undefined));
    expect(tool?.description).toContain("Original CLI notes.");
  });

  test("CLI help always shows the leaf's own notes regardless of mcpTool.notes", () => {
    const program = programWithNotesOverride(false);
    const help = cliHelpRender(cliPresentationRoot(program), ["run"], false);
    expect(help).toContain("Original CLI notes.");
  });
});

/** Discriminated-union input: `anyOf` root with `$ref` branches, as ts-json-schema-generator writes it. */
const unionInputSchema: Record<string, unknown> = {
  $schema: "http://json-schema.org/draft-07/schema#",
  description: "Edit operation.",
  anyOf: [{ $ref: "#/definitions/Append" }, { $ref: "#/definitions/Replace" }],
  definitions: {
    Append: {
      type: "object",
      properties: { kind: { const: "append" }, text: { type: "string" } },
      required: ["kind", "text"],
      additionalProperties: false,
    },
    Replace: {
      type: "object",
      properties: { kind: { const: "replace" }, find: { type: "string" }, text: { type: "string" } },
      required: ["kind", "find", "text"],
      additionalProperties: false,
    },
  },
};

describe("MCP object-root wrapping", () => {
  test("object-rooted schemas pass through unchanged", () => {
    const schema = { type: "object", properties: { a: { type: "string" } } };
    expect(wrapMcpRootSchema(schema, MCP_INPUT_WRAPPER_KEY)).toEqual({ schema, wrapped: false });
  });

  test("union roots wrap under input with $schema and definitions moved to the new root", () => {
    const { schema, wrapped } = wrapMcpRootSchema(unionInputSchema, MCP_INPUT_WRAPPER_KEY);
    expect(wrapped).toBe(true);
    expect(schema).toEqual({
      $schema: unionInputSchema.$schema,
      type: "object",
      properties: { input: { description: "Edit operation.", anyOf: unionInputSchema.anyOf } },
      required: ["input"],
      additionalProperties: false,
      definitions: unionInputSchema.definitions,
    });
  });

  test("collectMcpTools wraps non-object input and output schemas and flags them", () => {
    const program = testProgram({
      key: "wrapapp",
      description: "Wrap demo.",
      mcpServer: { enabled: true },
      commands: [
        {
          key: "edit",
          description: "Edit.",
          kind: "document",
          inputSchema: unionInputSchema,
          outputSchema: { type: "array", items: { type: "string" } },
          handler: () => [],
        },
        { key: "plain", description: "Plain.", handler: () => {} },
      ],
    });
    const tools = collectMcpTools(program);
    const edit = requireMcpTool(tools, "edit");
    expect(edit.inputWrapped).toBe(true);
    expect(edit.inputSchema.type).toBe("object");
    expect(edit.outputWrapped).toBe(true);
    expect(edit.outputSchema).toEqual({
      type: "object",
      properties: { result: { type: "array", items: { type: "string" } } },
      required: ["result"],
      additionalProperties: false,
    });
    const plain = requireMcpTool(tools, "plain");
    expect(plain.inputWrapped).toBe(false);
    expect(plain.outputWrapped).toBe(false);
  });
});

describe("MCP tool schema startup check", () => {
  /** Program with one document leaf using `inputSchema`, MCP on or off. */
  function schemaProgram(inputSchema: Record<string, unknown>, mcpEnabled: boolean) {
    return testProgram({
      key: "checkapp",
      description: "Check demo.",
      ...(mcpEnabled ? { mcpServer: { enabled: true } } : {}),
      commands: [{ key: "run", description: "Run.", kind: "document", inputSchema, handler: () => {} }],
    });
  }

  test("accepts wrapped schemas whose definitions still resolve", () => {
    expect(() => cliValidateProgram(schemaProgram(unionInputSchema, true))).not.toThrow();
  });

  test("rejects an unresolved local $ref when MCP is enabled", () => {
    const dangling = { $ref: "#/definitions/Missing", definitions: {} };
    expect(() => cliValidateProgram(schemaProgram(dangling, true))).toThrow(
      'MCP tool "run" inputSchema has an unresolved $ref: #/definitions/Missing',
    );
  });

  test('rejects $ref "#" in a wrapped schema', () => {
    const recursive = { anyOf: [{ type: "object" }, { type: "array", items: { $ref: "#" } }] };
    expect(() => cliValidateProgram(schemaProgram(recursive, true))).toThrow('uses $ref "#"');
  });

  test("skips the check when MCP is disabled", () => {
    const dangling = { $ref: "#/definitions/Missing", definitions: {} };
    expect(() => cliValidateProgram(schemaProgram(dangling, false))).not.toThrow();
  });

  test("skips MCP-hidden leaves", () => {
    const program = testProgram({
      key: "checkapp",
      description: "Check demo.",
      mcpServer: { enabled: true },
      commands: [
        {
          key: "run",
          description: "Run.",
          kind: "document",
          inputSchema: { $ref: "#/definitions/Missing", definitions: {} },
          mcpTool: { hidden: true },
          handler: () => {},
        },
      ],
    });
    expect(() => cliValidateProgram(program)).not.toThrow();
  });
});
