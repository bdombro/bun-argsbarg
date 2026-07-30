/*
Tests for install/targets module behavior.
*/

import { describe, expect, test } from "bun:test";
import type { CliProgram } from "../../core/types.ts";
import { normalizeInstallRawOpts } from "./normalize.ts";
import { normalizeUninstallRawOpts } from "./normalize-uninstall.ts";
import { resolveEffectiveInstallTargets } from "./target-effective.ts";
import { isArtifactInScope } from "./target-scope.ts";

/** Tests for normalizeInstallRawOpts. */
describe("normalizeInstallRawOpts", () => {
  test("bare install sets all", () => {
    expect(normalizeInstallRawOpts({})).toEqual({ all: "1" });
  });

  test("bare uninstall sets all", () => {
    expect(normalizeUninstallRawOpts({})).toEqual({
      uninstall: "1",
      all: "1",
    });
  });

  test("configure-only install unchanged", () => {
    expect(normalizeInstallRawOpts({ configure: "1" })).toEqual({ configure: "1" });
  });
});

/** Tests for resolveEffectiveInstallTargets. */
describe("resolveEffectiveInstallTargets", () => {
  test("defaults app and configure not in --all", () => {
    const t = resolveEffectiveInstallTargets(undefined);
    expect(t.app.includedInAll).toBe(false);
    expect(t.configure.includedInAll).toBe(false);
  });

  test("skill disabled by default", () => {
    const t = resolveEffectiveInstallTargets(undefined, {});
    expect(t.skill.enabled).toBe(false);
    expect(t.skill.includedInAll).toBe(false);
    expect(t.agentsMcp.includedInAll).toBe(false);
  });

  test("skill enabled via program.skill", () => {
    const t = resolveEffectiveInstallTargets(undefined, { skill: { enabled: true } });
    expect(t.skill.enabled).toBe(true);
    expect(t.skill.includedInAll).toBe(true);
  });

  test("agentsMcp in --all when mcpServer enabled", () => {
    const program: Pick<CliProgram, "mcpServer"> = { mcpServer: { enabled: true } };
    const t = resolveEffectiveInstallTargets(undefined, program);
    expect(t.agentsMcp.enabled).toBe(true);
    expect(t.agentsMcp.includedInAll).toBe(true);
    expect(t.skill.includedInAll).toBe(false);
  });

  test("scoped --mcp includes agentsMcp when mcpServer enabled", () => {
    const program: CliProgram = {
      key: "app",
      version: "1",
      description: "x",
      mcpServer: { enabled: true },
      handler: () => {},
    };
    const effective = resolveEffectiveInstallTargets(program.configure, program);
    const scope = { mcp: true };
    expect(isArtifactInScope("agentsMcp", scope, effective, "install-scoped", program)).toBe(true);
  });

  test("scoped --skill includes skill when program.skill.enabled", () => {
    const program: CliProgram = {
      key: "app",
      version: "1",
      description: "x",
      skill: { enabled: true },
      handler: () => {},
    };
    const effective = resolveEffectiveInstallTargets(program.configure, program);
    const scope = { skill: true };
    expect(isArtifactInScope("skill", scope, effective, "install-scoped", program)).toBe(true);
  });
});
