/*
Checks that the npm copy templates (cli, api) enable every built-in capability.
*/

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { type AppSpec, OptionKind } from "../core/types.ts";
import { resolveCapabilities } from "./capabilities.ts";

const cliExampleRoot = join(import.meta.dirname, "../../examples/cli");
const jsonExampleRoot = join(import.meta.dirname, "../../examples/api");
const cliProgramSource = readFileSync(join(cliExampleRoot, "src/app.ts"), "utf8");
const jsonProgramSource = readFileSync(join(jsonExampleRoot, "src/app.ts"), "utf8");

/** Mirror capability flags for copy templates (in-repo types only). */
const sinkProgram = {
  key: "cli",
  version: "1.0.0",
  description: "Copy template reference.",
  mcpServer: { enabled: true },
  httpServer: { enabled: true },
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
    assert.ok(cliProgramSource.includes("mcpServer: {"));
    assert.ok(cliProgramSource.includes("httpServer: {"));
    assert.ok(!cliProgramSource.includes("docs:"));
    assert.ok(!cliProgramSource.includes("appConfig:"));
  });

  test("status command has no outputSchema", () => {
    const statusSource = readFileSync(join(cliExampleRoot, "src/commands/status/command.ts"), "utf8");
    assert.doesNotMatch(statusSource, /outputSchema[,:]/);
  });

  test("resolveCapabilities matches sink shape", () => {
    assert.deepEqual(resolveCapabilities(sinkProgram), {
      http: true,
      completion: true,
      mcp: true,
    });
  });
});

describe("api template", () => {
  test("program source enables every builtin flag", () => {
    assert.ok(jsonProgramSource.includes("mcpServer: {"));
    assert.ok(jsonProgramSource.includes("httpServer: {"));
    assert.ok(!jsonProgramSource.includes("docs:"));
    assert.ok(!jsonProgramSource.includes("appConfig:"));
  });

  test("status command defines outputSchema", () => {
    const statusSource = readFileSync(join(jsonExampleRoot, "src/commands/status/command.ts"), "utf8");
    assert.match(statusSource, /outputSchema[,:]/);
    assert.ok(statusSource.includes("command"));
    assert.ok(statusSource.includes("outputSchema: StatusJsonOutput,"));
  });
});
