/*
Tests for install/install-validate module behavior.
*/

import { describe, expect, test } from "bun:test";
import type { AppSpec } from "../../core/types.ts";
import { SchemaValidationError } from "../../core/types.ts";
import { cliValidateProgram } from "../../core/validate.ts";

const base: AppSpec = {
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
    } as AppSpec;
    expect(() => cliValidateProgram(program)).toThrow(SchemaValidationError);
    expect(() => cliValidateProgram(program)).toThrow(/allSkills/);
  });

  test("rejects legacy per-host skill targets", () => {
    const program = {
      ...base,
      configure: { targets: { cursorSkill: true } },
    } as AppSpec;
    expect(() => cliValidateProgram(program)).toThrow(/configure.targets.cursorSkill is not a valid target key/);
  });

  test("rejects legacy per-host MCP targets", () => {
    const program = {
      ...base,
      mcpServer: { enabled: true },
      configure: { targets: { cursorMcp: true } },
    } as AppSpec;
    expect(() => cliValidateProgram(program)).toThrow(/configure.targets.cursorMcp is not a valid target key/);
  });

  test("rejects unknown configure.targets keys", () => {
    const program = {
      ...base,
      configure: { targets: { unknownKey: true } },
    } as AppSpec;
    expect(() => cliValidateProgram(program)).toThrow(/not a valid target key/);
  });
});
