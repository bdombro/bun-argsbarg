import { describe, expect, test } from "bun:test";
import type { CliProgram } from "../types.ts";
import { normalizeInstallRawOpts } from "./normalize.ts";
import { normalizeUninstallRawOpts } from "./normalize-uninstall.ts";
import { resolveAgentIntegration, resolveEffectiveInstallTargets } from "./target-effective.ts";
import { isArtifactInScope } from "./target-scope.ts";

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

describe("resolveAgentIntegration", () => {
  test("defaults to skill without MCP", () => {
    expect(resolveAgentIntegration(undefined, false)).toBe("skill");
  });

  test("defaults to mcp when MCP enabled", () => {
    expect(resolveAgentIntegration(undefined, true)).toBe("mcp");
  });
});

describe("resolveEffectiveInstallTargets", () => {
  test("defaults app and configure not in --all", () => {
    const t = resolveEffectiveInstallTargets(undefined);
    expect(t.app.includedInAll).toBe(false);
    expect(t.configure.includedInAll).toBe(false);
  });

  test("skill mode includes skills in --all not MCP pairs", () => {
    const program: Pick<CliProgram, "mcpServer"> = {};
    const t = resolveEffectiveInstallTargets(undefined, program);
    expect(t.cursorSkill.includedInAll).toBe(true);
    expect(t.cursorMcp.includedInAll).toBe(false);
  });

  test("mcp mode includes MCP in --all not paired skills", () => {
    const program: Pick<CliProgram, "mcpServer"> = { mcpServer: { enabled: true } };
    const t = resolveEffectiveInstallTargets(undefined, program);
    expect(t.cursorMcp.includedInAll).toBe(true);
    expect(t.cursorSkill.includedInAll).toBe(false);
    expect(t.claudeDesktopMcp.includedInAll).toBe(true);
  });

  test("both mode includes MCP and skills", () => {
    const program: Pick<CliProgram, "mcpServer"> = { mcpServer: { enabled: true } };
    const t = resolveEffectiveInstallTargets({ agentIntegration: "both" }, program);
    expect(t.cursorMcp.includedInAll).toBe(true);
    expect(t.cursorSkill.includedInAll).toBe(true);
  });

  test("per-key override disables one skill", () => {
    const t = resolveEffectiveInstallTargets({
      targets: { cursorSkill: false },
    });
    expect(t.claudeSkill.includedInAll).toBe(true);
    expect(t.cursorSkill.enabled).toBe(false);
  });

  test("scoped --mcp uses effective targets not all MCP hosts", () => {
    const program: CliProgram = {
      key: "app",
      version: "1",
      description: "x",
      mcpServer: { enabled: true },
      configure: { agentIntegration: "skill" },
      handler: () => {},
    };
    const effective = resolveEffectiveInstallTargets(program.configure, program);
    const scope = { mcp: true };
    expect(isArtifactInScope("cursorMcp", scope, effective, "install-scoped", program)).toBe(false);
    expect(
      isArtifactInScope(
        "cursorMcp",
        scope,
        resolveEffectiveInstallTargets(
          { targets: { cursorMcp: true }, agentIntegration: "both" },
          program,
        ),
        "install-scoped",
        program,
      ),
    ).toBe(true);
  });

  test("scoped --mcp --skill --configure includes skill and mcp not only configure", () => {
    const program: CliProgram = {
      key: "app",
      version: "1",
      description: "x",
      mcpServer: { enabled: true },
      configure: { agentIntegration: "both" },
      handler: () => {},
    };
    const effective = resolveEffectiveInstallTargets(program.configure, program);
    const scope = { mcp: true, skill: true, configure: true };
    expect(isArtifactInScope("cursorSkill", scope, effective, "install-scoped", program)).toBe(
      true,
    );
    expect(isArtifactInScope("cursorMcp", scope, effective, "install-scoped", program)).toBe(true);
    expect(isArtifactInScope("configure", scope, effective, "install-scoped", program)).toBe(true);
    expect(isArtifactInScope("claudeSkill", scope, effective, "install-scoped", program)).toBe(
      true,
    );
  });
});
