/*
Checks that every copy template (cli, api, agent-plugin) enables every built-in capability.
*/

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type AppSpec, OptionKind } from "../core/types.ts";
import { resolveCapabilities } from "../runtime/capabilities.ts";

const cliExampleRoot = join(import.meta.dir, "../../examples/cli");
const jsonExampleRoot = join(import.meta.dir, "../../examples/api");
const cliProgramSource = readFileSync(join(cliExampleRoot, "src/app.ts"), "utf8");
const jsonProgramSource = readFileSync(join(jsonExampleRoot, "src/app.ts"), "utf8");

/** Mirror capability flags for copy templates (in-repo types only). */
const sinkProgram = {
  key: "cli",
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
          kind: OptionKind.String,
          required: true,
        },
      ],
      handler: () => {},
    },
  ],
} satisfies AppSpec;

describe("cli template", () => {
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

describe("api template", () => {
  test("program source enables every builtin flag", () => {
    expect(jsonProgramSource).toContain("mcpServer: {");
    expect(jsonProgramSource).toContain("httpServer: {");
    expect(jsonProgramSource).toContain("docs:");
    expect(jsonProgramSource).not.toContain("appConfig:");
  });

  test("status command defines outputSchema", () => {
    const statusSource = readFileSync(join(jsonExampleRoot, "src/commands/status/command.ts"), "utf8");
    expect(statusSource).toMatch(/outputSchema[,:]/);
    expect(statusSource).toContain("command");
    expect(statusSource).toContain("outputSchema: StatusJsonOutput,");
  });
});
