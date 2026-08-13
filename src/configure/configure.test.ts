/*
Tests for configure/configure module behavior.
*/

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appConfigFileExists } from "../config/file.ts";
import type { CliProgram } from "../core/types.ts";
import { Cli } from "../index.ts";
import { detectInstalledArtifacts } from "./artifacts/detect-installed.ts";
import { installMcpServerEntry } from "./artifacts/mcp-config.ts";
import { parseInstallOpts } from "./artifacts/opts.ts";
import { resolveClaudeDesktopMcpPath, resolveInstallPaths } from "./artifacts/paths.ts";
import { buildInstallPlan, buildUpdatePlan } from "./artifacts/plan.ts";
import { installTargetForKey } from "./artifacts/target-registry.ts";
import { buildDetectedSnapshot, buildTargetPlanContext } from "./artifacts/target-scope.ts";
import { buildUninstallPlan } from "./artifacts/uninstall.ts";
import { appConfigHasEntries } from "./index.ts";

const fixture: CliProgram = {
  key: "testapp",
  version: "0.0.0",
  description: "Test",
  mcpServer: { enabled: true },
  skill: { enabled: true },
  handler: () => {},
};

let home: string;
let prevTestHome: string | undefined;
let prevXdg: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "argsbarg-configure-"));
  prevTestHome = process.env.TEST_USER_HOME;
  prevXdg = process.env.XDG_CONFIG_HOME;
  process.env.TEST_USER_HOME = home;
  delete process.env.XDG_CONFIG_HOME;
});

afterEach(() => {
  if (prevTestHome === undefined) delete process.env.TEST_USER_HOME;
  else process.env.TEST_USER_HOME = prevTestHome;
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prevXdg;
  rmSync(home, { recursive: true, force: true });
});

/** Tests for install paths. */
describe("install paths", () => {
  test("resolveInstallPaths includes agents skill and mcp paths", () => {
    const paths = resolveInstallPaths(fixture);
    expect(paths.agentsSkillDir).toContain(".agents/skills");
    expect(paths.agentsMcpPath).toContain(".agents/mcp.json");
  });

  test("claude desktop mcp path on darwin", () => {
    const prev = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin" });
    try {
      expect(resolveClaudeDesktopMcpPath(home)).toBe(
        join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
      );
    } finally {
      Object.defineProperty(process, "platform", { value: prev });
    }
  });
});

/** Tests for detect installed. */
describe("detect installed", () => {
  test("detects agents mcp when configured", () => {
    const paths = resolveInstallPaths(fixture);
    mkdirSync(join(home, ".agents"), { recursive: true });
    writeFileSync(
      paths.agentsMcpPath,
      JSON.stringify({ mcpServers: { testapp: { command: "testapp", args: ["mcp"] } } }),
      "utf8",
    );

    const detected = detectInstalledArtifacts(paths, fixture);
    expect(detected.agentsMcp).toBe(true);
    expect(detected.app).toBe(false);
  });
});

/** Tests for install plan. */
describe("install plan", () => {
  test("buildUpdatePlan greenfield includes skill when enabled", () => {
    const paths = resolveInstallPaths(fixture);
    const plan = buildUpdatePlan(fixture, paths, parseInstallOpts({ reinstall: "1", yes: "1" }));
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.some((a) => a.kind === "agent-skill")).toBe(true);
    expect(plan.some((a) => a.kind === "app")).toBe(false);
  });

  test("buildInstallPlan --all omits app self-install", () => {
    const paths = resolveInstallPaths(fixture);
    const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ all: "1" }));
    expect(plan.some((a) => a.kind === "app")).toBe(false);
    expect(plan.some((a) => a.kind === "agent-skill")).toBe(true);
    expect(plan.some((a) => a.kind === "agents-mcp")).toBe(true);
  });

  test("buildInstallPlan --mcp scoped includes agentsMcp when mcp enabled", () => {
    const paths = resolveInstallPaths(fixture);
    const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ mcp: "1" }));
    expect(plan.some((a) => a.kind === "agents-mcp")).toBe(true);
  });
});

/** Tests for uninstall plan. */
describe("uninstall plan", () => {
  test("buildUninstallPlan --all with nothing installed is empty", () => {
    const paths = resolveInstallPaths(fixture);
    const plan = buildUninstallPlan(fixture, paths, parseInstallOpts({ uninstall: "1", all: "1" }));
    expect(plan.length).toBe(0);
  });

  test("configure uninstall removes installed agent skill", async () => {
    const paths = resolveInstallPaths(fixture);
    mkdirSync(paths.agentsSkillDir, { recursive: true });
    writeFileSync(join(paths.agentsSkillDir, "SKILL.md"), "# test\n", "utf8");

    expect(detectInstalledArtifacts(paths, fixture).skill).toBe(true);

    const result = await new Cli(fixture).invoke(["configure", "uninstall", "--yes"]);
    expect(result.exitCode).toBe(0);
    expect(existsSync(paths.agentsSkillDir)).toBe(false);
  });

  test("configure uninstall removes skill when HOME is a Homebrew sandbox", async () => {
    const paths = resolveInstallPaths(fixture);
    mkdirSync(paths.agentsSkillDir, { recursive: true });
    writeFileSync(join(paths.agentsSkillDir, "SKILL.md"), "# test\n", "utf8");

    const prevHome = process.env.HOME;
    process.env.HOME = "/private/tmp/sqsp-workspaces-postinstall-20260807-fake";
    try {
      const result = await new Cli(fixture).invoke(["configure", "uninstall", "--yes"]);
      expect(result.exitCode).toBe(0);
      expect(existsSync(paths.agentsSkillDir)).toBe(false);
    } finally {
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
    }
  });

  test("scoped skill uninstall action removes directory", () => {
    const paths = resolveInstallPaths(fixture);
    mkdirSync(paths.agentsSkillDir, { recursive: true });
    writeFileSync(join(paths.agentsSkillDir, "SKILL.md"), "# test\n", "utf8");

    const detected = buildDetectedSnapshot(fixture, paths);
    const ctx = buildTargetPlanContext(fixture, paths, {}, detected);
    const target = installTargetForKey("skill");
    expect(target).toBeDefined();
    const actions = target!.planUninstall({
      ...ctx,
      mode: "uninstall-scoped",
      include: (key) => key === "skill",
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]!.run().length).toBeGreaterThan(0);
    expect(existsSync(paths.agentsSkillDir)).toBe(false);
  });
});

describe("app config wizard", () => {
  test("appConfigHasEntries when entries exist", () => {
    expect(
      appConfigHasEntries({
        ...fixture,
        appConfig: { entries: { token: { description: "API token." } } },
      }),
    ).toBe(true);
  });

  test("appConfigHasEntries false for empty entries or missing appConfig", () => {
    expect(appConfigHasEntries({ ...fixture, appConfig: { entries: {} } })).toBe(false);
    expect(appConfigHasEntries(fixture)).toBe(false);
  });
});

describe("configure install bootstrap", () => {
  test("creates config.json for apps without appConfig", async () => {
    const program: CliProgram = {
      key: "installboot",
      version: "0.0.0",
      description: "Install bootstrap test.",
      skill: { enabled: true },
      handler: () => {},
      configure: { enabled: true },
    };
    expect(appConfigFileExists(program)).toBe(false);
    const result = await new Cli(program).invoke(["configure", "install"]);
    expect(result.exitCode).toBe(0);
    expect(appConfigFileExists(program)).toBe(true);
  });
});

describe("configure lifecycle hooks", () => {
  test("afterInstall runs after install plan", async () => {
    const calls: string[] = [];
    const program: CliProgram = {
      ...fixture,
      key: "hookinstall",
      configure: {
        afterInstall: async (ctx) => {
          calls.push(`after:${ctx.paths.mcpName}:dry=${ctx.dry}`);
        },
      },
    };
    const result = await new Cli(program).invoke(["configure", "install"]);
    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([`after:hookinstall:dry=false`]);
  });

  test("beforeUninstall runs before uninstall plan", async () => {
    const paths = resolveInstallPaths({ ...fixture, key: "hookremove" });
    mkdirSync(paths.agentsSkillDir, { recursive: true });
    writeFileSync(join(paths.agentsSkillDir, "SKILL.md"), "# test\n", "utf8");

    const calls: string[] = [];
    const program: CliProgram = {
      ...fixture,
      key: "hookremove",
      configure: {
        beforeUninstall: async (ctx) => {
          calls.push(`before:${ctx.paths.skillDirName}`);
          expect(existsSync(ctx.paths.agentsSkillDir)).toBe(true);
        },
      },
    };
    const result = await new Cli(program).invoke(["configure", "uninstall", "--yes"]);
    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(["before:hookremove"]);
    expect(existsSync(paths.agentsSkillDir)).toBe(false);
  });
});

describe("MCP install idempotency", () => {
  test("installMcpServerEntry skips matching entry", () => {
    const paths = resolveInstallPaths(fixture);
    mkdirSync(join(home, ".agents"), { recursive: true });
    const entry = { command: "testapp", args: ["mcp"] };
    writeFileSync(paths.agentsMcpPath, JSON.stringify({ mcpServers: { testapp: entry } }), "utf8");
    expect(installMcpServerEntry(paths.agentsMcpPath, "testapp", entry)).toBe("skipped-match");
  });
});
