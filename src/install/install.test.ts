import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAppConfigFile } from "../config/file.ts";
import type { CliProgram } from "../types.ts";
import { detectInstalledArtifacts } from "./detect-installed.ts";
import {
  interactiveSelectionAssumesApp,
  mergeInteractiveSelection,
  parseInstallOpts,
  runInstallMutation,
  validateInstallOpts,
} from "./index.ts";
import { opencodeConfigDir } from "./mcp-opencode.ts";
import { resolveClaudeDesktopMcpPath, resolveInstallPaths } from "./paths.ts";
import { buildInstallPlan } from "./plan.ts";
import { printInstallStatus, writeInteractiveInstallIntro } from "./status.ts";
import { buildUninstallPlan } from "./uninstall.ts";

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
  home = mkdtempSync(join(tmpdir(), "argsbarg-install-"));
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

describe("install paths", () => {
  test("resolveInstallPaths uses ~/.local/bin for app", () => {
    const paths = resolveInstallPaths(fixture);
    expect(paths.appPath).toBe(join(home, ".local", "bin", "testapp"));
  });

  test("fish completion uses XDG_CONFIG_HOME", () => {
    const xdg = join(home, "xdg");
    process.env.XDG_CONFIG_HOME = xdg;
    const paths = resolveInstallPaths(fixture);
    expect(paths.fishCompletion).toBe(join(xdg, "fish", "completions", "testapp.fish"));
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

describe("detect installed", () => {
  test("detects app and completions", () => {
    const paths = resolveInstallPaths(fixture);
    mkdirSync(paths.appDir, { recursive: true });
    writeFileSync(paths.appPath, "fake", "utf8");
    mkdirSync(join(home, ".bash_completion.d"), { recursive: true });
    writeFileSync(paths.bashCompletion, "# bash", "utf8");

    const detected = detectInstalledArtifacts(paths, fixture);
    expect(detected.app).toBe(true);
    expect(detected.bashCompletion).toBe(true);
    expect(detected.zshCompletion).toBe(false);
  });
});

describe("install plan", () => {
  test("buildInstallPlan --all includes app", () => {
    const paths = resolveInstallPaths(fixture);
    const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ all: "1" }));
    expect(plan.some((a) => a.kind === "app")).toBe(true);
  });

  test("buildInstallPlan --mcp --yes also includes app", () => {
    const paths = resolveInstallPaths(fixture);
    const opts = parseInstallOpts({ mcp: "1", yes: "1" });
    validateInstallOpts(opts);
    const plan = buildInstallPlan(fixture, paths, opts);
    expect(plan.some((a) => a.kind === "app")).toBe(true);
  });

  test("buildInstallPlan --mcp without yes omits app", () => {
    const paths = resolveInstallPaths(fixture);
    const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ mcp: "1" }));
    expect(plan.some((a) => a.kind === "app")).toBe(false);
  });

  test("buildInstallPlan --mcp skips MCP when agentIntegration is skill", () => {
    const skillApp: CliProgram = {
      ...fixture,
      install: { agentIntegration: "skill" },
    };
    const paths = resolveInstallPaths(skillApp);
    mkdirSync(join(home, ".claude"), { recursive: true });
    mkdirSync(join(home, ".cursor"), { recursive: true });
    const plan = buildInstallPlan(skillApp, paths, parseInstallOpts({ mcp: "1" }));
    expect(plan.some((a) => a.kind.endsWith("-mcp"))).toBe(false);
  });

  test("buildInstallPlan --mcp includes claude desktop when app data exists", () => {
    const paths = resolveInstallPaths(fixture);
    mkdirSync(join(home, ".claude"), { recursive: true });
    mkdirSync(join(home, "Library", "Application Support", "Claude"), { recursive: true });
    const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ mcp: "1" }));
    expect(plan.some((a) => a.kind === "claude-desktop-mcp")).toBe(process.platform === "darwin");
    expect(plan.some((a) => a.kind === "claude-mcp")).toBe(true);
  });

  test("buildInstallPlan --mcp skips claude desktop without app data", () => {
    const paths = resolveInstallPaths(fixture);
    const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ mcp: "1" }));
    expect(plan.some((a) => a.kind === "claude-desktop-mcp")).toBe(false);
  });

  test("buildInstallPlan --mcp includes opencode when config dir exists", () => {
    const paths = resolveInstallPaths(fixture);
    mkdirSync(opencodeConfigDir(home), { recursive: true });
    const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ mcp: "1" }));
    expect(plan.some((a) => a.kind === "opencode-mcp")).toBe(true);
  });

  test("buildInstallPlan --mcp includes chatgpt when app data exists", () => {
    const paths = resolveInstallPaths(fixture);
    if (process.platform === "darwin") {
      mkdirSync(join(home, "Library", "Application Support", "ChatGPT"), { recursive: true });
      const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ mcp: "1" }));
      expect(plan.some((a) => a.kind === "chatgpt-desktop-mcp")).toBe(true);
    }
  });
});

describe("install status", () => {
  test("printInstallStatus human output", () => {
    const paths = resolveInstallPaths(fixture);
    mkdirSync(paths.appDir, { recursive: true });
    writeFileSync(paths.appPath, "fake", "utf8");

    const chunks: string[] = [];
    const orig = process.stdout.write;
    process.stdout.write = ((s: string) => {
      chunks.push(s);
      return true;
    }) as typeof process.stdout.write;
    try {
      printInstallStatus(fixture, {});
      const out = chunks.join("");
      expect(out).toContain("Installed artifacts for testapp");
      expect(out).toContain("~/.local/bin/testapp");
    } finally {
      process.stdout.write = orig;
    }
  });

  test("printInstallStatus json output", () => {
    const paths = resolveInstallPaths(fixture);
    mkdirSync(join(home, ".cursor"), { recursive: true });
    writeFileSync(
      paths.cursorMcpPath,
      JSON.stringify({ mcpServers: { testapp: { command: "testapp", args: ["mcp"] } } }),
      "utf8",
    );

    const chunks: string[] = [];
    const orig = process.stdout.write;
    process.stdout.write = ((s: string) => {
      chunks.push(s);
      return true;
    }) as typeof process.stdout.write;
    try {
      printInstallStatus(fixture, { json: true });
      const data = JSON.parse(chunks.join(""));
      expect(data.cursorMcp).toContain("mcp.json");
    } finally {
      process.stdout.write = orig;
    }
  });
});

describe("interactive selection", () => {
  test("mergeInteractiveSelection prepends 1 when app is assumed", () => {
    expect(mergeInteractiveSelection([2, 3], 5, true)).toEqual([1, 2, 3]);
    expect(mergeInteractiveSelection([1, 3], 5, true)).toEqual([1, 3]);
    expect(mergeInteractiveSelection([2, 3], 5, false)).toEqual([2, 3]);
  });

  test("interactiveSelectionAssumesApp when install plan starts with app", () => {
    const paths = resolveInstallPaths(fixture);
    const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ all: "1" }));
    expect(interactiveSelectionAssumesApp(plan, false)).toBe(true);
    expect(interactiveSelectionAssumesApp(plan, true)).toBe(false);
  });

  test("interactiveSelectionAssumesApp false when app not in plan", () => {
    const paths = resolveInstallPaths(fixture);
    const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ completions: "1" }));
    expect(plan.some((a) => a.kind === "app")).toBe(false);
    expect(interactiveSelectionAssumesApp(plan, false)).toBe(false);
  });
});

describe("install output", () => {
  test("writeInteractiveInstallIntro prints app Setup banner on stderr", () => {
    const chunks: string[] = [];
    const orig = process.stderr.write;
    process.stderr.write = ((s: string | Uint8Array) => {
      chunks.push(String(s));
      return true;
    }) as typeof process.stderr.write;
    try {
      writeInteractiveInstallIntro(fixture);
      expect(chunks.join("")).toBe("\ntestapp Setup\n\n");
    } finally {
      process.stderr.write = orig;
    }
  });
});

describe("parseInstallOpts", () => {
  test("json implies yes in validate path via cliInstall", () => {
    const opts = parseInstallOpts({ json: "1", all: "1" });
    expect(opts.json).toBe(true);
    expect(opts.all).toBe(true);
  });
});

describe("validateInstallOpts", () => {
  test("uninstall requires a target flag", () => {
    const opts = parseInstallOpts({ uninstall: "1", yes: "1" });
    expect(validateInstallOpts(opts)).toContain("Specify at least one target");
  });

  test("uninstall allows --all", () => {
    const opts = parseInstallOpts({ uninstall: "1", all: "1", yes: "1" });
    expect(validateInstallOpts(opts)).toBeNull();
  });

  test("uninstall rejects --reinstall", () => {
    const opts = parseInstallOpts({ uninstall: "1", reinstall: "1", all: "1" });
    expect(validateInstallOpts(opts)).toContain("--reinstall");
  });
});

describe("install mutation", () => {
  test("uninstall --all with nothing installed succeeds", async () => {
    const result = await runInstallMutation(fixture, { uninstall: "1", all: "1", yes: "1" });
    expect(result.changed).toEqual([]);
  });

  test("install --skill skips cursor and claude when agent dirs missing", async () => {
    const result = await runInstallMutation(fixture, { skill: "1", yes: "1", dry: "1" });
    expect(
      result.changed.every((p) => !p.includes("/.cursor/") && !p.includes("/.claude/skills/")),
    ).toBe(true);
  });

  test("uninstall --all removes detected app", async () => {
    const paths = resolveInstallPaths(fixture);
    mkdirSync(paths.appDir, { recursive: true });
    writeFileSync(paths.appPath, "fake", "utf8");

    const result = await runInstallMutation(fixture, { uninstall: "1", all: "1", yes: "1" });
    expect(result.changed).toContain(paths.appPath);
    expect(existsSync(paths.appPath)).toBe(false);
    expect(existsSync(paths.appDir)).toBe(true);
  });
});

describe("uninstall plan", () => {
  test("buildUninstallPlan --all scopes like install --all", () => {
    const paths = resolveInstallPaths(fixture);
    mkdirSync(paths.appDir, { recursive: true });
    writeFileSync(paths.appPath, "fake", "utf8");

    const plan = buildUninstallPlan(fixture, paths, parseInstallOpts({ uninstall: "1", all: "1" }));
    expect(plan.some((a) => a.summary.startsWith("app:"))).toBe(true);
  });

  test("buildUninstallPlan --all runs configure last", () => {
    const program: CliProgram = {
      ...fixture,
      appConfig: {
        entries: { token: { description: "API token." } },
      },
    };
    const paths = resolveInstallPaths(program);
    mkdirSync(paths.appDir, { recursive: true });
    writeFileSync(paths.appPath, "fake", "utf8");
    writeAppConfigFile(program, { token: "secret" });

    const plan = buildUninstallPlan(program, paths, parseInstallOpts({ uninstall: "1", all: "1" }));
    const appIdx = plan.findIndex((a) => a.summary.startsWith("app:"));
    const configureIdx = plan.findIndex((a) => a.summary.startsWith("app config:"));
    expect(appIdx).toBeGreaterThanOrEqual(0);
    expect(configureIdx).toBeGreaterThan(appIdx);
    expect(configureIdx).toBe(plan.length - 1);
  });

  test("buildUninstallPlan --app ignores completions", () => {
    const paths = resolveInstallPaths(fixture);
    mkdirSync(paths.appDir, { recursive: true });
    writeFileSync(paths.appPath, "fake", "utf8");
    mkdirSync(join(home, ".bash_completion.d"), { recursive: true });
    writeFileSync(paths.bashCompletion, "# bash", "utf8");

    const plan = buildUninstallPlan(fixture, paths, parseInstallOpts({ uninstall: "1", app: "1" }));
    expect(plan).toHaveLength(1);
    expect(plan[0]?.summary.startsWith("app:")).toBe(true);
  });
});
