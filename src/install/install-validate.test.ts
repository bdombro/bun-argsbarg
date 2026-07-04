/*
Tests for install/install-validate module behavior.
*/

import { describe, expect, test } from "bun:test";
import type { CliProgram } from "../types.ts";
import { CliSchemaValidationError } from "../types.ts";
import { cliValidateProgram } from "../validate.ts";

const base: CliProgram = {
  key: "app",
  version: "1.0.0",
  description: "Test",
  handler: () => {},
};

/** Tests for validateConfigureConfig. */
describe("validateConfigureConfig", () => {
  /** Tests that accepts empty install config. */
  test("accepts empty install config", () => {
    expect(() => cliValidateProgram(base)).not.toThrow();
  });

  /** Rejects removed allSkills shorthand. */
  test("rejects removed allSkills shorthand", () => {
    const program = {
      ...base,
      configure: { targets: { allSkills: true } },
    } as CliProgram;
    expect(() => cliValidateProgram(program)).toThrow(CliSchemaValidationError);
    expect(() => cliValidateProgram(program)).toThrow(/allSkills/);
  });

  /** Rejects both sides of pair without both integration. */
  test("rejects both sides of pair without both integration", () => {
    const program: CliProgram = {
      ...base,
      mcpServer: { enabled: true },
      configure: {
        agentIntegration: "mcp",
        targets: { cursorMcp: true, cursorSkill: true },
      },
    };
    expect(() => cliValidateProgram(program)).toThrow(/both/);
  });

  /** Rejects explicit MCP target in skill integration mode. */
  test("rejects explicit MCP target in skill integration mode", () => {
    const program: CliProgram = {
      ...base,
      configure: {
        agentIntegration: "skill",
        targets: { cursorMcp: true },
      },
    };
    expect(() => cliValidateProgram(program)).toThrow(/cursorMcp/);
  });

  /** Allows explicit pair targets with both integration. */
  test("allows explicit pair targets with both integration", () => {
    const program: CliProgram = {
      ...base,
      mcpServer: { enabled: true },
      configure: {
        agentIntegration: "both",
        targets: { cursorMcp: true, cursorSkill: true },
      },
    };
    expect(() => cliValidateProgram(program)).not.toThrow();
  });
});
