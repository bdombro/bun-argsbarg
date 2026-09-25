/*
Tests for mcp/tools module: MCP tool derivation, size reporting, and per-leaf MCP-only notes.
*/

import { describe, expect, test } from "bun:test";
import { cliPresentationRoot } from "../builtins/presentation.ts";
import { CliOptionKind } from "../core/types.ts";
import { cliHelpRender } from "../help.ts";
import { testProgram } from "../test/fixtures.ts";
import { collectMcpTools, DEFAULT_MCP_SIZE_LIMITS, mcpSizeReport } from "./tools.ts";

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
