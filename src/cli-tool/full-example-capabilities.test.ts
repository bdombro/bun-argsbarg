/*
Tests for cli-tool/full-example-capabilities module behavior.
*/

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCapabilities } from "../capabilities.ts";
import { CliOptionKind, type CliProgram } from "../types.ts";

const exampleRoot = join(import.meta.dir, "../../examples/full-example");
const programSource = readFileSync(join(exampleRoot, "src/program.ts"), "utf8");

/** Mirror of full-example/src/program.ts capability flags (in-repo types only). */
const sinkProgram = {
  key: "full-example",
  version: "1.0.0",
  description: "Full example reference.",
  appConfig: {
    entries: {
      apiToken: { description: "Token.", env: "FULL_EXAMPLE_API_TOKEN" },
    },
  },
  docs: {
    enabled: true,
    topics: { readme: { text: "# readme\n" } },
  },
  mcpServer: { enabled: true },
  apiServer: { enabled: true },
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

/** Tests for full-example template. */
describe("full-example template", () => {
  /** Tests that program source enables every builtin flag. */
  test("program source enables every builtin flag", () => {
    expect(programSource).toContain("mcpServer: {");
    expect(programSource).toContain("apiServer: {");
    expect(programSource).toContain("enabled: true");
    expect(programSource).toContain("docs:");
    expect(programSource).toContain("appConfig:");
  });

  test("status command defines outputSchema", () => {
    const statusSource = readFileSync(join(exampleRoot, "src/commands/status/command.ts"), "utf8");
    expect(statusSource).toMatch(/outputSchema[,:]/);
    expect(statusSource).toContain('from "./__generated__/index.ts"');
  });

  test("resolveCapabilities matches full sink shape", () => {
    expect(resolveCapabilities(sinkProgram)).toEqual({
      api: true,
      completion: true,
      mcp: true,
      configure: true,
      docs: true,
      configCommands: true,
    });
  });
});
