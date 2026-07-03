import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAppConfigFile } from "../config/file.ts";
import type { CliProgram } from "../types.ts";
import { detectInstalledArtifacts } from "./detect-installed.ts";
import {
  cliInstall,
  interactiveSelectionAssumesApp,
  mergeInteractiveSelection,
  parseInstallOpts,
  runInstallMutation,
  runUninstallMutation,
  validateInstallOpts,
  validateUninstallOpts,
} from "./index.ts";
import { opencodeConfigDir } from "./mcp-opencode.ts";
import { normalizeUninstallRawOpts } from "./normalize-uninstall.ts";
import { resolveClaudeDesktopMcpPath, resolveInstallPaths } from "./paths.ts";
import { buildInstallPlan, buildUpdatePlan } from "./plan.ts";
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

describe("detect installed", () => {
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

describe("install plan", () => {
  test("buildInstallPlan --all omits app self-install", () => {
    const paths = resolveInstallPaths(fixture);
    const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ all: "1" }));
    expect(plan.some((a) => a.kind === "app")).toBe(false);
    expect(plan.some((a) => a.kind.endsWith("-mcp"))).toBe(true);
  });

  test("buildInstallPlan --mcp without yes omits implicit app", () => {
    const paths = resolveInstallPaths(fixture);
    const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ mcp: "1" }));
    expect(plan.some((a) => a.kind === "app")).toBe(false);
  });

  test("buildUpdatePlan greenfield falls back to install-all", () => {
    const paths = resolveInstallPaths(fixture);
    const plan = buildUpdatePlan(fixture, paths, parseInstallOpts({ reinstall: "1", yes: "1" }));
    expect(plan.length).toBeGreaterThan(0);
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

  test("buildInstallPlan --mcp includes opencode when config dir exists", () => {
    const paths = resolveInstallPaths(fixture);
    mkdirSync(opencodeConfigDir(home), { recursive: true });
    const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ mcp: "1" }));
    expect(plan.some((a) => a.kind === "opencode-mcp")).toBe(true);
  });

  test("buildInstallPlan --mcp --skill --configure is not empty when agents exist", () => {
    const program: CliProgram = {
      ...fixture,
      install: { agentIntegration: "both" },
      appConfig: {
        entries: { token: { description: "API token." } },
      },
    };
    const paths = resolveInstallPaths(program);
    mkdirSync(join(home, ".cursor"), { recursive: true });
    mkdirSync(join(home, ".claude"), { recursive: true });
    const plan = buildInstallPlan(
      program,
      paths,
      parseInstallOpts({ mcp: "1", skill: "1", configure: "1" }),
    );
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.some((a) => a.kind.endsWith("-mcp"))).toBe(true);
    expect(plan.some((a) => a.kind.endsWith("-skill"))).toBe(true);
  });
});

describe("install status", () => {
  test("printInstallStatus human output with MCP", () => {
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
      printInstallStatus(fixture, {});
      const out = chunks.join("");
      expect(out).toContain("Installed artifacts for testapp");
      expect(out).toContain("cursor mcp");
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

  test("interactiveSelectionAssumesApp is always false", () => {
    const paths = resolveInstallPaths(fixture);
    const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ all: "1" }));
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

describe("validateUninstallOpts", () => {
  test("bare uninstall normalizes to --all", () => {
    const opts = parseInstallOpts(normalizeUninstallRawOpts({ yes: "1" }));
    expect(validateUninstallOpts(opts)).toBeNull();
    expect(opts.all).toBe(true);
  });

  test("uninstall allows --all", () => {
    const opts = parseInstallOpts({ uninstall: "1", all: "1", yes: "1" });
    expect(validateUninstallOpts(opts)).toBeNull();
  });

  test("uninstall rejects --reinstall", () => {
    const opts = parseInstallOpts({ uninstall: "1", reinstall: "1", all: "1" });
    expect(validateUninstallOpts(opts)).toContain("--reinstall");
  });
});

describe("validateInstallOpts", () => {
  test("install --uninstall is rejected", () => {
    const opts = parseInstallOpts({ uninstall: "1", all: "1", yes: "1" });
    expect(validateInstallOpts(opts)).toContain("uninstall");
  });
});

describe("install mutation", () => {
  test("uninstall --all with nothing installed succeeds", async () => {
    const result = await runUninstallMutation(fixture, { all: "1", yes: "1" });
    expect(result.changed).toEqual([]);
  });

  test("install --skill skips cursor and claude when agent dirs missing", async () => {
    const result = await runInstallMutation(fixture, { skill: "1", yes: "1", dry: "1" });
    expect(
      result.changed.every((p) => !p.includes("/.cursor/") && !p.includes("/.claude/skills/")),
    ).toBe(true);
  });

  test("install --all --yes dry-run succeeds when stdin is not a TTY", async () => {
    const program: CliProgram = {
      ...fixture,
      appConfig: {
        entries: { token: { description: "API token." } },
      },
    };
    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    const exitCode = await new Promise<number>((resolve) => {
      const origExit = process.exit;
      process.exit = ((code?: number) => {
        process.exit = origExit;
        resolve(code ?? 0);
      }) as typeof process.exit;
      void cliInstall(program, { all: "1", yes: "1", dry: "1" });
    });
    Object.defineProperty(process.stdin, "isTTY", { value: origIsTTY, configurable: true });
    expect(exitCode).toBe(0);
  });
});

describe("uninstall plan", () => {
  test("buildUninstallPlan --all runs configure last when config exists", () => {
    const program: CliProgram = {
      ...fixture,
      appConfig: {
        entries: { token: { description: "API token." } },
      },
    };
    const paths = resolveInstallPaths(program);
    writeAppConfigFile(program, { token: "secret" });

    const plan = buildUninstallPlan(program, paths, parseInstallOpts({ uninstall: "1", all: "1" }));
    const configureIdx = plan.findIndex((a) => a.summary.startsWith("app config:"));
    expect(configureIdx).toBe(plan.length - 1);
  });
});
