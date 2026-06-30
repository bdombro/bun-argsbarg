import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliProgram } from "../types.ts";
import { maybeBootstrapInstallArgv } from "./bootstrap.ts";
import { normalizeInstallRawOpts } from "./normalize.ts";
import { resolveInstallPaths } from "./paths.ts";
import { resolveAgentIntegration, resolveEffectiveInstallTargets } from "./target-effective.ts";
import { isArtifactInScope } from "./target-scope.ts";

describe("normalizeInstallRawOpts", () => {
  test("bare install sets all", () => {
    expect(normalizeInstallRawOpts({})).toEqual({ all: "1" });
  });

  test("bare uninstall sets all", () => {
    expect(normalizeInstallRawOpts({ uninstall: "1" })).toEqual({
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
  test("defaults app completions configure includedInAll", () => {
    const t = resolveEffectiveInstallTargets(undefined);
    expect(t.app.includedInAll).toBe(true);
    expect(t.completions.includedInAll).toBe(true);
    expect(t.configure.includedInAll).toBe(true);
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
      install: { agentIntegration: "skill" },
      handler: () => {},
    };
    const effective = resolveEffectiveInstallTargets(program.install, program);
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
});

describe("maybeBootstrapInstallArgv", () => {
  const program: CliProgram = {
    key: "bootapp",
    version: "1.0.0",
    description: "Boot",
    handler: () => {},
  };

  test("rewrites empty argv when app missing and TTY", () => {
    const prev = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    try {
      expect(maybeBootstrapInstallArgv([], program)).toEqual(["install"]);
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: prev, configurable: true });
    }
  });

  test("does not rewrite when app exists", () => {
    const home = mkdtempSync(join(tmpdir(), "boot-"));
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    const paths = resolveInstallPaths(program);
    try {
      mkdirSync(paths.appDir, { recursive: true });
      writeFileSync(paths.appPath, "x", "utf8");
      expect(maybeBootstrapInstallArgv([], program)).toEqual([]);
    } finally {
      process.env.HOME = prevHome;
      rmSync(home, { recursive: true, force: true });
    }
  });
});
