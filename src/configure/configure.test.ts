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
import { parseInstallOpts } from "./artifacts/opts.ts";
import { resolveClaudeDesktopMcpPath, resolveInstallPaths } from "./artifacts/paths.ts";
import { buildInstallPlan, buildUpdatePlan } from "./artifacts/plan.ts";
import { installTargetForKey } from "./artifacts/target-registry.ts";
import { buildDetectedSnapshot, buildTargetPlanContext } from "./artifacts/target-scope.ts";
import { buildUninstallPlan } from "./artifacts/uninstall.ts";
import {
  appConfigHasEntries,
  formatConfigureMutationSummary,
  parseConfigureOpts,
  validateConfigureOpts,
} from "./index.ts";

const fixture: CliProgram = {
  key: "testapp",
  version: "0.0.0",
  description: "Test",
  mcpServer: { enabled: true },
  skill: { enabled: true },
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
    const opts = parseConfigureOpts({ refresh: "1", status: "1" });
    expect(validateConfigureOpts(opts)).toContain("only one");
  });

  test("refresh requires --yes", () => {
    const opts = parseConfigureOpts({ refresh: "1" });
    expect(validateConfigureOpts(opts)).toContain("--yes");
  });

  test("remove-all requires --yes", () => {
    const opts = parseConfigureOpts({ "remove-all": "1" });
    expect(validateConfigureOpts(opts)).toContain("--yes");
  });
});

describe("configure mutation summary", () => {
  test("interactive uninstall reports removed artifacts not file count", () => {
    const msg = formatConfigureMutationSummary(
      { paths: ["~/.agents/skills/testapp/"], installed: 0, removed: 1, configured: 0 },
      {},
    );
    expect(msg).toBe("Removed 1 artifact.");
  });

  test("interactive install reports installed artifacts not file count", () => {
    const msg = formatConfigureMutationSummary(
      {
        paths: ["~/.agents/skills/testapp/SKILL.md", "~/.agents/skills/testapp/reference.md"],
        installed: 1,
        removed: 0,
        configured: 0,
      },
      {},
    );
    expect(msg).toBe("Installed 1 artifact.");
  });

  test("refresh mode uses refreshed verb and artifact count", () => {
    const msg = formatConfigureMutationSummary(
      { paths: ["a", "b", "c"], installed: 3, removed: 0, configured: 0 },
      { refresh: true },
    );
    expect(msg).toBe("Refreshed 3 artifacts.");
  });

  test("remove-all uses removed verb", () => {
    const msg = formatConfigureMutationSummary(
      { paths: ["a"], installed: 0, removed: 2, configured: 0 },
      { removeAll: true },
    );
    expect(msg).toBe("Removed 2 artifacts.");
  });
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

/** Tests for refresh plan. */
describe("refresh plan", () => {
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

/** Tests for remove plan. */
describe("remove plan", () => {
  test("buildUninstallPlan --all with nothing installed is empty", () => {
    const paths = resolveInstallPaths(fixture);
    const plan = buildUninstallPlan(fixture, paths, parseInstallOpts({ uninstall: "1", all: "1" }));
    expect(plan.length).toBe(0);
  });

  test("configure --remove-all removes installed agent skill", async () => {
    const paths = resolveInstallPaths(fixture);
    mkdirSync(paths.agentsSkillDir, { recursive: true });
    writeFileSync(join(paths.agentsSkillDir, "SKILL.md"), "# test\n", "utf8");

    expect(detectInstalledArtifacts(paths, fixture).skill).toBe(true);

    const result = await new Cli(fixture).invoke(["configure", "--remove-all", "--yes"]);
    expect(result.exitCode).toBe(0);
    expect(existsSync(paths.agentsSkillDir)).toBe(false);
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

describe("configure --refresh bootstrap", () => {
  test("creates config.json for apps without appConfig", async () => {
    const program: CliProgram = {
      key: "refreshboot",
      version: "0.0.0",
      description: "Refresh bootstrap test.",
      skill: { enabled: true },
      handler: () => {},
      configure: { enabled: true },
    };
    expect(appConfigFileExists(program)).toBe(false);
    const result = await new Cli(program).invoke(["configure", "--refresh", "--yes"]);
    expect(result.exitCode).toBe(0);
    expect(appConfigFileExists(program)).toBe(true);
  });
});

describe("configure lifecycle hooks", () => {
  test("afterRefresh runs after --refresh plan", async () => {
    const calls: string[] = [];
    const program: CliProgram = {
      ...fixture,
      key: "hookrefresh",
      configure: {
        afterRefresh: async (ctx) => {
          calls.push(`after:${ctx.paths.mcpName}:dry=${ctx.dry}`);
        },
      },
    };
    const result = await new Cli(program).invoke(["configure", "--refresh", "--yes"]);
    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([`after:hookrefresh:dry=false`]);
  });

  test("beforeRemoveAll runs before --remove-all plan", async () => {
    const paths = resolveInstallPaths({ ...fixture, key: "hookremove" });
    mkdirSync(paths.agentsSkillDir, { recursive: true });
    writeFileSync(join(paths.agentsSkillDir, "SKILL.md"), "# test\n", "utf8");

    const calls: string[] = [];
    const program: CliProgram = {
      ...fixture,
      key: "hookremove",
      configure: {
        beforeRemoveAll: async (ctx) => {
          calls.push(`before:${ctx.paths.skillDirName}`);
          expect(existsSync(ctx.paths.agentsSkillDir)).toBe(true);
        },
      },
    };
    const result = await new Cli(program).invoke(["configure", "--remove-all", "--yes"]);
    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(["before:hookremove"]);
    expect(existsSync(paths.agentsSkillDir)).toBe(false);
  });

  test("hooks receive dry from --dry", async () => {
    const calls: string[] = [];
    const program: CliProgram = {
      ...fixture,
      key: "hookdry",
      configure: {
        afterRefresh: (ctx) => {
          calls.push(`dry=${ctx.dry}`);
        },
      },
    };
    const result = await new Cli(program).invoke(["configure", "--refresh", "--yes", "--dry"]);
    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(["dry=true"]);
  });

  test("beforeRemoveAll is not called for --remove-config", async () => {
    let called = false;
    const program: CliProgram = {
      ...fixture,
      key: "hookcfg",
      appConfig: { entries: { token: { description: "Token." } } },
      configure: {
        beforeRemoveAll: () => {
          called = true;
        },
      },
    };
    const result = await new Cli(program).invoke(["configure", "--remove-config", "--yes"]);
    expect(result.exitCode).toBe(0);
    expect(called).toBe(false);
  });
});
