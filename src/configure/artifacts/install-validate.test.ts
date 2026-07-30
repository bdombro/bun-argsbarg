/*
Tests for install/install-validate module behavior.
*/

import { describe, expect, test } from "bun:test";
import type { CliProgram } from "../../core/types.ts";
import { CliSchemaValidationError } from "../../core/types.ts";
import { cliValidateProgram } from "../../core/validate.ts";

const base: CliProgram = {
  key: "app",
  version: "1.0.0",
  description: "Test",
  handler: () => {},
};

/** Tests for validateConfigureConfig. */
describe("validateConfigureConfig", () => {
  test("accepts empty install config", () => {
    expect(() => cliValidateProgram(base)).not.toThrow();
  });

  test("rejects removed allSkills shorthand", () => {
    const program = {
      ...base,
      configure: { targets: { allSkills: true } },
    } as CliProgram;
    expect(() => cliValidateProgram(program)).toThrow(CliSchemaValidationError);
    expect(() => cliValidateProgram(program)).toThrow(/allSkills/);
  });

  test("rejects configure.agentIntegration", () => {
    const program = {
      ...base,
      configure: { agentIntegration: "mcp" },
    } as CliProgram;
    expect(() => cliValidateProgram(program)).toThrow(/agentIntegration removed/);
  });

  test("rejects legacy per-host skill targets", () => {
    const program = {
      ...base,
      configure: { targets: { cursorSkill: true } },
    } as CliProgram;
    expect(() => cliValidateProgram(program)).toThrow(/cursorSkill removed/);
  });

  test("rejects legacy per-host MCP targets", () => {
    const program = {
      ...base,
      mcpServer: { enabled: true },
      configure: { targets: { cursorMcp: true } },
    } as CliProgram;
    expect(() => cliValidateProgram(program)).toThrow(/cursorMcp removed/);
  });

  test("rejects unknown configure.targets keys", () => {
    const program = {
      ...base,
      configure: { targets: { unknownKey: true } },
    } as CliProgram;
    expect(() => cliValidateProgram(program)).toThrow(/not a valid target key/);
  });
});
