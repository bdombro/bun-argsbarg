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

describe("validateInstallConfig", () => {
  test("accepts empty install config", () => {
    expect(() => cliValidateProgram(base)).not.toThrow();
  });

  test("rejects removed allSkills shorthand", () => {
    const program = {
      ...base,
      install: { targets: { allSkills: true } },
    } as CliProgram;
    expect(() => cliValidateProgram(program)).toThrow(CliSchemaValidationError);
    expect(() => cliValidateProgram(program)).toThrow(/allSkills/);
  });

  test("rejects both sides of pair without both integration", () => {
    const program: CliProgram = {
      ...base,
      mcpServer: { enabled: true },
      install: {
        agentIntegration: "mcp",
        targets: { cursorMcp: true, cursorSkill: true },
      },
    };
    expect(() => cliValidateProgram(program)).toThrow(/both/);
  });

  test("rejects explicit MCP target in skill integration mode", () => {
    const program: CliProgram = {
      ...base,
      install: {
        agentIntegration: "skill",
        targets: { cursorMcp: true },
      },
    };
    expect(() => cliValidateProgram(program)).toThrow(/cursorMcp/);
  });

  test("allows explicit pair targets with both integration", () => {
    const program: CliProgram = {
      ...base,
      mcpServer: { enabled: true },
      install: {
        agentIntegration: "both",
        targets: { cursorMcp: true, cursorSkill: true },
      },
    };
    expect(() => cliValidateProgram(program)).not.toThrow();
  });
});
