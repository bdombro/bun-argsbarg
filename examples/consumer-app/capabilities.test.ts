import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCapabilities } from "../../src/capabilities.ts";
import { CliOptionKind, type CliProgram } from "../../src/types.ts";

const programSource = readFileSync(join(import.meta.dir, "src/program.ts"), "utf8");

/** Mirror of consumer-app/src/program.ts capability flags (in-repo types only). */
const sinkProgram = {
  key: "consumer-app",
  version: "1.0.0",
  description: "Sink reference.",
  appConfig: {
    entries: {
      apiToken: { description: "Token.", env: "CONSUMER_APP_API_TOKEN" },
    },
  },
  docs: {
    enabled: true,
    topics: { readme: { text: "# readme\n" } },
  },
  mcpServer: { enabled: true },
  install: {
    updateGetLatest: async () => ({ path: "/bin/app", version: "1.0.0" }),
  },
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

describe("consumer-app sink", () => {
  test("program source enables every builtin flag", () => {
    expect(programSource).toContain("mcpServer: {");
    expect(programSource).toContain("enabled: true");
    expect(programSource).toContain("docs:");
    expect(programSource).toContain("updateGetLatest");
    expect(programSource).toContain("appConfig:");
    expect(programSource).toContain("outputSchema:");
  });

  test("resolveCapabilities matches full sink shape", () => {
    expect(resolveCapabilities(sinkProgram)).toEqual({
      completion: true,
      mcp: true,
      install: true,
      docs: true,
      update: true,
      configCommands: true,
    });
  });
});
