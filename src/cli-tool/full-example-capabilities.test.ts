/*
Tests for cli-tool/full-example-capabilities module behavior.
*/

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CliOptionKind, type CliProgram } from "../core/types.ts";
import { resolveCapabilities } from "../runtime/capabilities.ts";

const cliExampleRoot = join(import.meta.dir, "../../examples/full-example");
const jsonExampleRoot = join(import.meta.dir, "../../examples/full-example-json");
const cliProgramSource = readFileSync(join(cliExampleRoot, "src/program.ts"), "utf8");
const jsonProgramSource = readFileSync(join(jsonExampleRoot, "src/program.ts"), "utf8");

/** Mirror capability flags for copy templates (in-repo types only). */
const sinkProgram = {
  key: "full-example",
  version: "1.0.0",
  description: "Copy template reference.",
  docs: {
    topics: { readme: { text: "# readme\n" } },
  },
  mcpServer: { enabled: true },
  httpServer: { enabled: true },
  configure: {},
  commands: [
    {
      key: "status",
      description: "Status.",
      handler: () => {},
    },
    {
      key: "echo",
      description: "Echo.",
      options: [
        {
          name: "message",
          description: "Message.",
          kind: CliOptionKind.String,
          required: true,
        },
      ],
      handler: () => {},
    },
  ],
} satisfies CliProgram;

describe("full-example cli template", () => {
  test("program source enables every builtin flag", () => {
    expect(cliProgramSource).toContain("mcpServer: {");
    expect(cliProgramSource).toContain("httpServer: {");
    expect(cliProgramSource).toContain("docs:");
    expect(cliProgramSource).not.toMatch(/docs:\s*\{[^}]*enabled:\s*true/s);
    expect(cliProgramSource).not.toContain("appConfig:");
  });

  test("status command has no outputSchema", () => {
    const statusSource = readFileSync(join(cliExampleRoot, "src/commands/status/command.ts"), "utf8");
    expect(statusSource).not.toMatch(/outputSchema[,:]/);
    expect(statusSource).not.toContain("__generated__");
  });

  test("resolveCapabilities matches sink shape", () => {
    expect(resolveCapabilities(sinkProgram)).toEqual({
      http: true,
      completion: true,
      mcp: true,
      configure: true,
      docs: true,
      configCommands: false,
    });
  });
});

describe("full-example-json template", () => {
  test("program source enables every builtin flag", () => {
    expect(jsonProgramSource).toContain("mcpServer: {");
    expect(jsonProgramSource).toContain("httpServer: {");
    expect(jsonProgramSource).toContain("docs:");
    expect(jsonProgramSource).not.toContain("appConfig:");
  });

  test("status command defines outputSchema", () => {
    const statusSource = readFileSync(join(jsonExampleRoot, "src/commands/status/command.ts"), "utf8");
    expect(statusSource).toMatch(/outputSchema[,:]/);
    expect(statusSource).toContain("StatusJsonOutputSchema");
    expect(statusSource).toContain('from "./__generated__"');
  });
});
