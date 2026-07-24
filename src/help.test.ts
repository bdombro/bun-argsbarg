/*
Help rendering and label formatting tests.
*/

import { describe, expect, test } from "bun:test";
import { cliPresentationRoot } from "./builtins/presentation.ts";
import { type CliOption, CliOptionKind, type CliPositional } from "./core/types.ts";
import { CLI_NOTES_PROGRAM, cliHelpRender, cliOptionLabel, cliPositionalLabel, cliResolveNotes } from "./help.ts";
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
  test("docs help lists schema, cli, and skill subcommands", () => {
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
    expect(help).toContain("skill");
    expect(help).toContain("reference agent SKILL");
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

  test("root help shows agent docs hint when docs enabled", () => {
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
    expect(help).toContain("For AI agents: `myapp docs skill`.");
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

  test("root help includes program notes and agent hint", () => {
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
    expect(help).toContain("myapp docs skill");
  });
});
