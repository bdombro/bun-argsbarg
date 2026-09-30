/*
Help rendering and label formatting tests.
*/

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { z } from "zod";
import { cliPresentationRoot } from "../builtins/presentation.ts";
import { type CommandOption, type CommandPositional, OptionKind } from "../core/types.ts";
import { testProgram } from "../test/fixtures.ts";
import {
  CLI_NOTES_PROGRAM,
  cliHelpRender,
  cliOptionLabel,
  cliPositionalLabel,
  cliResolveNotes,
  schemaToYamlLines,
} from "./help.ts";

describe("cliOptionLabel", () => {
  for (const { name, option, expected } of [
    {
      name: "string option",
      option: { name: "out", description: "Output path.", kind: OptionKind.String },
      expected: "--out <string>",
    },
    {
      name: "required enum",
      option: {
        name: "format",
        description: "Format.",
        kind: OptionKind.Enum,
        choices: ["pdf", "html"],
        required: true,
      },
      expected: "--format <pdf|html>",
    },
    {
      name: "short name",
      option: {
        name: "verbose",
        description: "Verbose.",
        kind: OptionKind.Presence,
        shortName: "v",
      },
      expected: "--verbose, -v",
    },
    {
      name: "json option",
      option: { name: "body", description: "JSON body.", kind: OptionKind.Json },
      expected: "--body <json>",
    },
  ]) {
    test(name, () => {
      assert.equal(cliOptionLabel(option as CommandOption), expected);
    });
  }
});

describe("cliPositionalLabel", () => {
  for (const { positional, expected } of [
    { positional: { name: "file", description: "File." }, expected: "<file>" },
    { positional: { name: "file", description: "File.", argMin: 0 }, expected: "[file]" },
    { positional: { name: "paths", description: "Paths.", argMax: 0 }, expected: "<paths...>" },
    { positional: { name: "paths", description: "Paths.", argMin: 0, argMax: 0 }, expected: "[paths...]" },
  ]) {
    test(expected, () => {
      assert.equal(cliPositionalLabel(positional as CommandPositional), expected);
    });
  }
});

describe("cliResolveNotes", () => {
  test("replaces program placeholder", () => {
    assert.equal(cliResolveNotes(`Run \`${CLI_NOTES_PROGRAM} docs readme\`.`, "myapp"), "Run `myapp docs readme`.");
  });
});

describe("cliHelpRender", () => {
  test("root help omits legacy --schema flag", () => {
    const root = testProgram({
      key: "app",
      version: "1.0.0",
      description: "demo",
      commands: [
        {
          key: "x",
          description: "cmd",
          handler: () => {},
        },
      ],
    });
    const help = cliHelpRender(cliPresentationRoot(root), [], false);
    assert.ok(!help.includes("--schema"));
  });

  test("root help omits agent docs hint when docs enabled", () => {
    const root = testProgram({
      key: "myapp",
      version: "1.0.0",
      description: "demo",
      commands: [{ key: "run", description: "Run.", handler: () => {} }],
    });
    const help = cliHelpRender(cliPresentationRoot(root), [], false);
    assert.ok(!help.includes("docs skill"));
    assert.ok(!help.includes("install --skill"));
  });

  test("root help omits agent hint when docs disabled", () => {
    const root = testProgram({
      key: "myapp",
      version: "1.0.0",
      description: "demo",
      commands: [{ key: "run", description: "Run.", handler: () => {} }],
    });
    const help = cliHelpRender(cliPresentationRoot(root), [], false);
    assert.ok(!help.includes("Agents:"));
    assert.ok(!help.includes("docs skill"));
  });

  test("root help includes program notes", () => {
    const root = testProgram({
      key: "myapp",
      version: "1.0.0",
      description: "demo",
      notes: "See `{argsbarg:program} docs readme` for the user guide.",
      commands: [{ key: "run", description: "Run.", handler: () => {} }],
    });
    const help = cliHelpRender(cliPresentationRoot(root), [], false);
    assert.ok(help.includes("See `myapp docs readme` for the user guide."));
    assert.ok(!help.includes("docs skill"));
  });

  /** Tests that non-TTY help strips box characters and renders plain text. */
  test("non-TTY help strips boxes and renders clean plain text", () => {
    const root = testProgram({
      key: "myapp",
      version: "1.0.0",
      description: "Test application.",
      commands: [
        {
          key: "status",
          description: "Show status.",
          options: [
            {
              name: "verbose",
              shortName: "v",
              description: "Verbose output.",
              kind: OptionKind.Presence,
            },
          ],
          handler: () => {},
        },
      ],
    });
    const help = cliHelpRender(cliPresentationRoot(root), ["status"], false, { isTTY: false });
    assert.ok(!help.includes("╭─"));
    assert.ok(!help.includes("╰─"));
    assert.ok(!help.includes("│"));
    assert.match(help, /── Usage ─+\n {2}myapp status \[OPTIONS\]/);
    assert.match(
      help,
      /── Options ─+\n {2}--help, -h {5}Show help for this command.\n {2}--verbose, -v {2}Verbose output./,
    );
  });

  /** Tests that TTY help matches non-TTY layout (no boxes, no color) and omits output schema by default. */
  test("TTY help uses rule headers without boxes or color and omits output schema by default", () => {
    const root = testProgram({
      key: "myapp",
      version: "1.0.0",
      description: "Test application.",
      commands: [
        {
          key: "status",
          description: "Show status.",
          outputSchema: z.object({ version: z.string().describe("App version.") }),
          handler: () => {},
        },
      ],
    });
    const help = cliHelpRender(cliPresentationRoot(root), ["status"], false, { isTTY: true });
    assert.ok(help.includes("── Usage ─"));
    assert.ok(!help.includes("╭"));
    assert.ok(!help.includes("│"));
    assert.ok(!help.includes("\u001B["));
    assert.ok(!help.includes("Output Schema"));
    const piped = cliHelpRender(cliPresentationRoot(root), ["status"], false, { isTTY: false, showSchema: false });
    assert.equal(help, piped);
  });

  /** Tests that section rules fill the terminal width. */
  test("section rules fill terminal width", () => {
    const origColumns = process.stdout.columns;
    try {
      process.stdout.columns = 120;
      const root = testProgram({
        key: "doc",
        version: "1.0.0",
        description: "Test application.",
        commands: [
          {
            key: "query",
            description:
              "Query the body tape. Prints apply-shaped YAML `{ documentId, tabs: [{ tabId, ops: [], nodes }] }` (or JSON with --json). Fill ops and pipe to apply.",
            handler: () => {},
          },
          {
            key: "markdown-insert",
            description:
              "Insert markdown into a Google Doc tab as native DOM elements (headings, lists, code, tables).",
            handler: () => {},
          },
        ],
      });
      const help = cliHelpRender(cliPresentationRoot(root), [], false, { isTTY: true });
      const rules = help.split("\n").filter((l) => l.startsWith("── "));
      assert.ok(rules.length > 0);
      for (const line of rules) {
        assert.equal(line.length, 120);
      }
    } finally {
      process.stdout.columns = origColumns;
    }
  });

  /** Tests that non-TTY help automatically includes output schema in YAML by default. */
  test("non-TTY help automatically includes output schema in YAML by default", () => {
    const root = testProgram({
      key: "myapp",
      version: "1.0.0",
      description: "Test application.",
      commands: [
        {
          key: "status",
          description: "Show status.",
          outputSchema: z.object({ version: z.string().describe("App version.") }),
          handler: () => {},
        },
      ],
    });
    const help = cliHelpRender(cliPresentationRoot(root), ["status"], false, { isTTY: false });
    assert.ok(help.includes("── Output Schema (with --json) ─"));
    assert.ok(help.includes("# App version."));
    assert.ok(help.includes("version: string"));
  });

  /** Tests that json commands with a handler render Output Schema (JSON) and Input Schema. */
  test("document leaf renders Output Schema (JSON) and Input Schema in non-TTY mode", () => {
    const root = testProgram({
      key: "myapp",
      version: "1.0.0",
      description: "Test application.",
      commands: [
        {
          key: "create",
          kind: "document",
          description: "Create resource.",
          inputSchema: z.object({ name: z.string().describe("Resource name.") }),
          outputSchema: z.object({ id: z.string().describe("Generated ID.") }),
          handler: () => {},
        },
      ],
    });
    const help = cliHelpRender(cliPresentationRoot(root), ["create"], false, { isTTY: false });
    assert.ok(help.includes("── Input Schema ─"));
    assert.ok(help.includes("# Resource name."));
    assert.ok(help.includes("name: string"));
    assert.ok(help.includes("── Output Schema (JSON) ─"));
    assert.ok(help.includes("# Generated ID."));
    assert.ok(help.includes("id: string"));
  });

  /** Tests that document commands with a handler render [DOCUMENT] usage and schema sections. */
  test("document leaf renders [DOCUMENT] usage and schemas in non-TTY mode", () => {
    const root = testProgram({
      key: "myapp",
      version: "1.0.0",
      description: "Test application.",
      commands: [
        {
          key: "deploy",
          kind: "document",
          description: "Deploy from document.",
          inputSchema: z.object({ target: z.string().describe("Deployment target.") }),
          outputSchema: z.object({ url: z.string().describe("Deployment URL.") }),
          handler: () => {},
        },
      ],
    });
    const help = cliHelpRender(cliPresentationRoot(root), ["deploy"], false, { isTTY: false });
    assert.ok(help.includes("myapp deploy [DOCUMENT]"));
    assert.ok(help.includes("Pass a JSON document as an argument or pipe to stdin."));
    assert.ok(help.includes("── Input Schema ─"));
    assert.ok(help.includes("# Deployment target."));
    assert.ok(help.includes("target: string"));
    assert.ok(help.includes("── Output Schema (JSON) ─"));
    assert.ok(help.includes("# Deployment URL."));
    assert.ok(help.includes("url: string"));
  });
});

/** Tests for converting JSON Schema to human- and agent-friendly YAML lines. */
describe("schemaToYamlLines", () => {
  /** Tests primitive properties with required and optional keys and comments. */
  test("formats primitive properties with descriptions and optionality", () => {
    const schema = {
      type: "object",
      properties: {
        documentId: {
          type: "string",
          description: "Unique document identifier.",
        },
        index: {
          type: "integer",
        },
      },
      required: ["documentId"],
    };
    const lines = schemaToYamlLines(schema, 0);
    assert.deepEqual(lines, ["# Unique document identifier.", "documentId: string", "index?: integer"]);
  });

  /** Tests enums, string formats, and union types. */
  test("formats enums, string formats, and union types", () => {
    const schema = {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["pdf", "html"],
        },
        createdAt: {
          type: "string",
          format: "date-time",
        },
        status: {
          anyOf: [{ type: "string" }, { type: "number" }],
        },
      },
    };
    const lines = schemaToYamlLines(schema, 0);
    assert.deepEqual(lines, ['format?: "pdf" | "html"', "createdAt?: string (date-time)", "status?: string | number"]);
  });

  /** Tests nested objects and arrays of objects with definitions. */
  test("formats nested objects and arrays of objects with definition resolution", () => {
    const schema = {
      type: "object",
      properties: {
        tab: {
          type: "object",
          description: "Active tab metadata.",
          properties: {
            tabId: { type: "string" },
            title: { type: "string" },
          },
          required: ["tabId", "title"],
        },
        tabs: {
          type: "array",
          items: {
            $ref: "#/definitions/TabItem",
          },
        },
      },
      definitions: {
        TabItem: {
          type: "object",
          properties: {
            tabId: { type: "string" },
            title: { type: "string" },
            index: { type: "integer" },
          },
          required: ["tabId", "title", "index"],
        },
      },
      required: ["tab"],
    };
    const lines = schemaToYamlLines(schema, 0);
    assert.deepEqual(lines, [
      "# Active tab metadata.",
      "tab:",
      "  tabId: string",
      "  title: string",
      "tabs?:",
      "  - tabId: string",
      "    title: string",
      "    index: integer",
    ]);
  });

  /** Tests recursive references handle cycles gracefully without infinite loop. */
  test("handles recursive definition references without infinite loop", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        parent: { $ref: "#/definitions/TreeNode" },
      },
      definitions: {
        TreeNode: {
          type: "object",
          properties: {
            name: { type: "string" },
            parent: { $ref: "#/definitions/TreeNode" },
          },
        },
      },
    };
    const lines = schemaToYamlLines(schema, 0);
    assert.deepEqual(lines, ["name?: string", "parent?:", "  name?: string", "  parent?: TreeNode"]);
  });
});
