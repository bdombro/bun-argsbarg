/*
Help rendering and label formatting tests.
*/

import { describe, expect, test } from "bun:test";
import { cliPresentationRoot } from "./builtins/presentation.ts";
import { type CliOption, CliOptionKind, type CliPositional } from "./core/types.ts";
import {
  CLI_NOTES_PROGRAM,
  cliHelpRender,
  cliOptionLabel,
  cliPositionalLabel,
  cliResolveNotes,
  schemaToYamlLines,
  visibleWidth,
} from "./help.ts";
import { testProgram } from "./test/fixtures.ts";

describe("cliOptionLabel", () => {
  test.each([
    {
      name: "string option",
      option: { name: "out", description: "Output path.", kind: CliOptionKind.String },
      expected: "--out <string>",
    },
    {
      name: "required enum",
      option: {
        name: "format",
        description: "Format.",
        kind: CliOptionKind.Enum,
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
        kind: CliOptionKind.Presence,
        shortName: "v",
      },
      expected: "--verbose, -v",
    },
    {
      name: "json option",
      option: { name: "body", description: "JSON body.", kind: CliOptionKind.Json },
      expected: "--body <json>",
    },
  ])("$name", ({ option, expected }) => {
    expect(cliOptionLabel(option as CliOption, false)).toBe(expected);
  });
});

describe("cliPositionalLabel", () => {
  test.each([
    { positional: { name: "file", description: "File." }, expected: "<file>" },
    { positional: { name: "file", description: "File.", argMin: 0 }, expected: "[file]" },
    { positional: { name: "paths", description: "Paths.", argMax: 0 }, expected: "<paths...>" },
    { positional: { name: "paths", description: "Paths.", argMin: 0, argMax: 0 }, expected: "[paths...]" },
  ])("$expected", ({ positional, expected }) => {
    expect(cliPositionalLabel(positional as CliPositional, false)).toBe(expected);
  });
});

describe("cliResolveNotes", () => {
  test("replaces program placeholder", () => {
    expect(cliResolveNotes(`Run \`${CLI_NOTES_PROGRAM} docs readme\`.`, "myapp")).toBe("Run `myapp docs readme`.");
  });
});

describe("cliHelpRender", () => {
  test("docs help lists schema and cli subcommands", () => {
    const root = testProgram({
      key: "app",
      version: "1.0.0",
      description: "demo",
      docs: {
        topics: { readme: { text: "# readme\n" } },
      },
      commands: [
        {
          key: "x",
          description: "cmd",
          handler: () => {},
        },
      ],
    });
    const help = cliHelpRender(cliPresentationRoot(root), ["docs"], false);
    expect(help).toContain("cli-schema");
    expect(help).toContain("Print the full CLI command tree as JSON.");
    expect(help).toContain("cli");
    expect(help).toContain("markdown");
    expect(help).not.toContain("skill");
  });

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
    expect(help).not.toContain("--schema");
  });

  test("root help omits agent docs hint when docs enabled", () => {
    const root = testProgram({
      key: "myapp",
      version: "1.0.0",
      description: "demo",
      docs: {
        topics: { readme: { text: "# readme\n" } },
      },
      commands: [{ key: "run", description: "Run.", handler: () => {} }],
    });
    const help = cliHelpRender(cliPresentationRoot(root), [], false);
    expect(help).not.toContain("docs skill");
    expect(help).not.toContain("install --skill");
  });

  test("root help omits agent hint when docs disabled", () => {
    const root = testProgram({
      key: "myapp",
      version: "1.0.0",
      description: "demo",
      docs: { enabled: false },
      commands: [{ key: "run", description: "Run.", handler: () => {} }],
    });
    const help = cliHelpRender(cliPresentationRoot(root), [], false);
    expect(help).not.toContain("Agents:");
    expect(help).not.toContain("docs skill");
  });

  test("root help includes program notes", () => {
    const root = testProgram({
      key: "myapp",
      version: "1.0.0",
      description: "demo",
      notes: "See `{argsbarg:program} docs readme` for the user guide.",
      docs: {
        topics: { readme: { text: "# readme\n" } },
      },
      commands: [{ key: "run", description: "Run.", handler: () => {} }],
    });
    const help = cliHelpRender(cliPresentationRoot(root), [], false);
    expect(help).toContain("See `myapp docs readme` for the user guide.");
    expect(help).not.toContain("docs skill");
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
              kind: CliOptionKind.Presence,
            },
          ],
          handler: () => {},
        },
      ],
    });
    const help = cliHelpRender(cliPresentationRoot(root), ["status"], false, { isTTY: false });
    expect(help).not.toContain("╭─");
    expect(help).not.toContain("╰─");
    expect(help).not.toContain("│");
    expect(help).toContain("Usage:\n  myapp status [OPTIONS]");
    expect(help).toContain("Options:\n  --help, -h     Show help for this command.\n  --verbose, -v  Verbose output.");
  });

  /** Tests that TTY help renders rounded UTF-8 boxes. */
  test("TTY help renders rounded UTF-8 boxes and omits output schema by default", () => {
    const root = testProgram({
      key: "myapp",
      version: "1.0.0",
      description: "Test application.",
      commands: [
        {
          key: "status",
          description: "Show status.",
          outputSchema: {
            type: "object",
            properties: {
              version: { type: "string", description: "App version." },
            },
            required: ["version"],
          },
          handler: () => {},
        },
      ],
    });
    const help = cliHelpRender(cliPresentationRoot(root), ["status"], false, { isTTY: true });
    expect(help).toContain("╭");
    expect(help).toContain("╰");
    expect(help).toContain("│");
    expect(help).not.toContain("Output Schema");
  });

  /** Tests that TTY help table boxes constrain line lengths to terminal width without wrapping border characters. */
  test("TTY help table boxes fit terminal width without overflow", () => {
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
      const boxLines = help.split("\n").filter((l) => l.includes("╭") || l.includes("│") || l.includes("╰"));
      expect(boxLines.length).toBeGreaterThan(0);
      for (const line of boxLines) {
        expect(visibleWidth(line)).toBe(120);
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
          outputSchema: {
            type: "object",
            properties: {
              version: { type: "string", description: "App version." },
            },
            required: ["version"],
          },
          handler: () => {},
        },
      ],
    });
    const help = cliHelpRender(cliPresentationRoot(root), ["status"], false, { isTTY: false });
    expect(help).toContain("Output Schema (with --json):");
    expect(help).toContain("# App version.");
    expect(help).toContain("version: string");
  });

  /** Tests that json leaf commands render Output Schema (JSON) and Input Schema. */
  test("json leaf renders Output Schema (JSON) and Input Schema in non-TTY mode", () => {
    const root = testProgram({
      key: "myapp",
      version: "1.0.0",
      description: "Test application.",
      commands: [
        {
          key: "create",
          kind: "json",
          description: "Create resource.",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Resource name." },
            },
            required: ["name"],
          },
          outputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "Generated ID." },
            },
            required: ["id"],
          },
          handler: () => {},
        },
      ],
    });
    const help = cliHelpRender(cliPresentationRoot(root), ["create"], false, { isTTY: false });
    expect(help).toContain("Input Schema:");
    expect(help).toContain("# Resource name.");
    expect(help).toContain("name: string");
    expect(help).toContain("Output Schema (JSON):");
    expect(help).toContain("# Generated ID.");
    expect(help).toContain("id: string");
  });

  /** Tests that document leaf commands render [DOCUMENT] usage and schema sections. */
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
          inputSchema: {
            type: "object",
            properties: {
              target: { type: "string", description: "Deployment target." },
            },
            required: ["target"],
          },
          outputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "Deployment URL." },
            },
            required: ["url"],
          },
          handler: () => {},
        },
      ],
    });
    const help = cliHelpRender(cliPresentationRoot(root), ["deploy"], false, { isTTY: false });
    expect(help).toContain("myapp deploy [DOCUMENT]");
    expect(help).toContain("Pass a JSON or YAML document as an argument or pipe to stdin.");
    expect(help).toContain("Input Schema:");
    expect(help).toContain("# Deployment target.");
    expect(help).toContain("target: string");
    expect(help).toContain("Output Schema (JSON):");
    expect(help).toContain("# Deployment URL.");
    expect(help).toContain("url: string");
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
    expect(lines).toEqual(["# Unique document identifier.", "documentId: string", "index?: integer"]);
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
    expect(lines).toEqual(['format?: "pdf" | "html"', "createdAt?: string (date-time)", "status?: string | number"]);
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
    expect(lines).toEqual([
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
    expect(lines).toEqual(["name?: string", "parent?:", "  name?: string", "  parent?: TreeNode"]);
  });
});
