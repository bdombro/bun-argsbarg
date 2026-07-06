/*
Tests for configure/configure module behavior.
*/

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appConfigFileExists } from "../config/file.ts";
import { appConfigHasEntries, parseConfigureOpts, validateConfigureOpts } from "../configure/index.ts";
import { Cli } from "../index.ts";
import { detectInstalledArtifacts } from "../install/detect-installed.ts";
import { parseInstallOpts } from "../install/opts.ts";
import { resolveClaudeDesktopMcpPath, resolveInstallPaths } from "../install/paths.ts";
import { buildInstallPlan, buildUpdatePlan } from "../install/plan.ts";
import { installTargetForKey } from "../install/target-registry.ts";
import { buildDetectedSnapshot, buildTargetPlanContext } from "../install/target-scope.ts";
import { buildUninstallPlan } from "../install/uninstall.ts";
import type { CliProgram } from "../types.ts";

const fixture: CliProgram = {
  key: "testapp",
  version: "0.0.0",
  description: "Test",
  mcpServer: { enabled: true },
  handler: () => {},
};

let home: string;
let prevHome: string | undefined;
let prevXdg: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "argsbarg-configure-"));
  prevHome = process.env.HOME;
  prevXdg = process.env.XDG_CONFIG_HOME;
  process.env.HOME = home;
  delete process.env.XDG_CONFIG_HOME;
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prevXdg;
  rmSync(home, { recursive: true, force: true });
});

/** Tests for configure opts. */
describe("configure opts", () => {
  test("validate rejects multiple modes", () => {
    const opts = parseConfigureOpts({ sync: "1", status: "1" });
    expect(validateConfigureOpts(opts)).toContain("only one");
  });

  test("sync requires --yes", () => {
    const opts = parseConfigureOpts({ sync: "1" });
    expect(validateConfigureOpts(opts)).toContain("--yes");
  });

  test("remove-all requires --yes", () => {
    const opts = parseConfigureOpts({ "remove-all": "1" });
    expect(validateConfigureOpts(opts)).toContain("--yes");
  });
});

/** Tests for install paths. */
describe("install paths", () => {
  test("resolveInstallPaths includes skill and mcp paths", () => {
    const paths = resolveInstallPaths(fixture);
    expect(paths.cursorSkillDir).toContain(".cursor/skills");
    expect(paths.cursorMcpPath).toContain("mcp.json");
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
  /** Detects cursor mcp when configured. */
  test("detects cursor mcp when configured", () => {
    const paths = resolveInstallPaths(fixture);
    mkdirSync(join(home, ".cursor"), { recursive: true });
    writeFileSync(
      paths.cursorMcpPath,
      JSON.stringify({ mcpServers: { testapp: { command: "testapp", args: ["mcp"] } } }),
      "utf8",
    );

    const detected = detectInstalledArtifacts(paths, fixture);
    expect(detected.cursorMcp).toBe(true);
    expect(detected.app).toBe(false);
  });
});

/** Tests for sync plan. */
describe("sync plan", () => {
  test("buildUpdatePlan greenfield includes agent targets", () => {
    const paths = resolveInstallPaths(fixture);
    const plan = buildUpdatePlan(fixture, paths, parseInstallOpts({ reinstall: "1", yes: "1" }));
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.some((a) => a.kind === "app")).toBe(false);
  });

  test("buildInstallPlan --all omits app self-install", () => {
    const paths = resolveInstallPaths(fixture);
    const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ all: "1" }));
    expect(plan.some((a) => a.kind === "app")).toBe(false);
    expect(plan.some((a) => a.kind.endsWith("-mcp"))).toBe(true);
  });

  test("buildInstallPlan respects configure.agentIntegration skill", () => {
    const skillApp: CliProgram = {
      ...fixture,
      configure: { agentIntegration: "skill" },
    };
    const paths = resolveInstallPaths(skillApp);
    mkdirSync(join(home, ".claude"), { recursive: true });
    mkdirSync(join(home, ".cursor"), { recursive: true });
    const plan = buildInstallPlan(skillApp, paths, parseInstallOpts({ mcp: "1" }));
    expect(plan.some((a) => a.kind.endsWith("-mcp"))).toBe(false);
  });
});

/** Tests for remove plan. */
describe("remove plan", () => {
  test("buildUninstallPlan --all with nothing installed is empty", () => {
    const paths = resolveInstallPaths(fixture);
    const plan = buildUninstallPlan(fixture, paths, parseInstallOpts({ uninstall: "1", all: "1" }));
    expect(plan.length).toBe(0);
  });

  test("configure --remove-all removes installed cursor skill", async () => {
    const skillApp: CliProgram = {
      ...fixture,
      configure: { agentIntegration: "skill" },
    };
    const paths = resolveInstallPaths(skillApp);
    mkdirSync(paths.cursorSkillDir, { recursive: true });
    writeFileSync(join(paths.cursorSkillDir, "SKILL.md"), "# test\n", "utf8");

    expect(detectInstalledArtifacts(paths, skillApp).cursorSkill).toBe(true);

    const result = await new Cli(skillApp).invoke(["configure", "--remove-all", "--yes"]);
    expect(result.exitCode).toBe(0);
    expect(existsSync(paths.cursorSkillDir)).toBe(false);
  });

  test("scoped skill uninstall action removes directory without global uninstall flag", () => {
    const skillApp: CliProgram = {
      ...fixture,
      configure: { agentIntegration: "skill" },
    };
    const paths = resolveInstallPaths(skillApp);
    mkdirSync(paths.cursorSkillDir, { recursive: true });
    writeFileSync(join(paths.cursorSkillDir, "SKILL.md"), "# test\n", "utf8");

    const detected = buildDetectedSnapshot(skillApp, paths);
    const ctx = buildTargetPlanContext(skillApp, paths, {}, detected);
    const target = installTargetForKey("cursorSkill");
    expect(target).toBeDefined();
    const actions = target!.planUninstall({
      ...ctx,
      mode: "uninstall-scoped",
      include: (key) => key === "cursorSkill",
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]!.run().length).toBeGreaterThan(0);
    expect(existsSync(paths.cursorSkillDir)).toBe(false);
  });
});

/** Tests for app config wizard. */
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

describe("configure --sync bootstrap", () => {
  test("creates config.json for apps without appConfig", async () => {
    const program: CliProgram = {
      key: "syncboot",
      version: "0.0.0",
      description: "Sync bootstrap test.",
      handler: () => {},
      configure: { enabled: true },
    };
    expect(appConfigFileExists(program)).toBe(false);
    const result = await new Cli(program).invoke(["configure", "--sync", "--yes"]);
    expect(result.exitCode).toBe(0);
    expect(appConfigFileExists(program)).toBe(true);
  });
});
