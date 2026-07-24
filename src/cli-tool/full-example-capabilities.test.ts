/*
Tests for cli-tool/full-example-capabilities module behavior.
*/

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CliOptionKind, type CliProgram } from "~/core/types.ts";
import { resolveCapabilities } from "~/runtime/capabilities.ts";

const exampleRoot = join(import.meta.dir, "../../examples/full-example");
const programSource = readFileSync(join(exampleRoot, "src/program.ts"), "utf8");

/** Mirror of full-example/src/program.ts capability flags (in-repo types only). */
const sinkProgram = {
  key: "full-example",
  version: "1.0.0",
  description: "Full example reference.",
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

/** Tests for full-example template. */
describe("full-example template", () => {
  /** Tests that program source enables every builtin flag. */
  test("program source enables every builtin flag", () => {
    expect(programSource).toContain("mcpServer: {");
    expect(programSource).toContain("httpServer: {");
    expect(programSource).toContain("docs:");
    expect(programSource).not.toMatch(/docs:\s*\{[^}]*enabled:\s*true/s);
    expect(programSource).not.toContain("appConfig:");
  });

  test("status command defines outputSchema", () => {
    const statusSource = readFileSync(join(exampleRoot, "src/commands/status/command.ts"), "utf8");
    expect(statusSource).toMatch(/outputSchema[,:]/);
    expect(statusSource).toContain("StatusJsonOutputSchema");
    expect(statusSource).toContain('from "./__generated__"');
  });

  test("resolveCapabilities matches full sink shape", () => {
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
