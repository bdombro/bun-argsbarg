import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CliProgram } from "../types.ts";
import { detectInstalledArtifacts } from "./detect-installed.ts";
import { resolveInstallPaths, resolveClaudeDesktopMcpPath } from "./paths.ts";
import { buildInstallPlan } from "./plan.ts";
import { buildUninstallPlan } from "./uninstall.ts";
import { printInstallStatus } from "./status.ts";
import { parseInstallOpts, runInstallMutation, validateInstallOpts } from "./index.ts";

const fixture: CliProgram = {
  key: "testapp",
  version: "0.0.0",
  description: "Test",
  mcpServer: { enabled: true },
  handler: () => {},
};

let home: string;
let prevHome: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "argsbarg-install-"));
  prevHome = process.env.HOME;
  process.env.HOME = home;
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

describe("install paths", () => {
  test("resolveInstallPaths honors prefix", () => {
    const paths = resolveInstallPaths(fixture, { prefix: join(home, "custom", "bin") });
    expect(paths.binaryPath).toBe(join(home, "custom", "bin", "testapp"));
  });

  test("fish completion uses XDG_CONFIG_HOME", () => {
    const xdg = join(home, "xdg");
    process.env.XDG_CONFIG_HOME = xdg;
    const paths = resolveInstallPaths(fixture, {});
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
  test("detects binary and completions", () => {
    const paths = resolveInstallPaths(fixture, {});
    mkdirSync(paths.bindir, { recursive: true });
    writeFileSync(paths.binaryPath, "fake", "utf8");
    mkdirSync(join(home, ".bash_completion.d"), { recursive: true });
    writeFileSync(paths.bashCompletion, "# bash", "utf8");

    const detected = detectInstalledArtifacts(paths);
    expect(detected.binary).toBe(true);
    expect(detected.bashCompletion).toBe(true);
    expect(detected.zshCompletion).toBe(false);
  });
});

describe("install plan", () => {
  test("buildInstallPlan --all includes binary", () => {
    const paths = resolveInstallPaths(fixture, {});
    const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ all: "1" }));
    expect(plan.some((a) => a.kind === "binary")).toBe(true);
  });

  test("buildInstallPlan --mcp includes claude desktop when app data exists", () => {
    const paths = resolveInstallPaths(fixture, {});
    mkdirSync(join(home, "Library", "Application Support", "Claude"), { recursive: true });
    const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ mcp: "1" }));
    expect(plan.some((a) => a.kind === "claude-desktop-mcp")).toBe(process.platform === "darwin");
    expect(plan.some((a) => a.kind === "claude-mcp")).toBe(true);
  });

  test("buildInstallPlan --mcp skips claude desktop without app data", () => {
    const paths = resolveInstallPaths(fixture, {});
    const plan = buildInstallPlan(fixture, paths, parseInstallOpts({ mcp: "1" }));
    expect(plan.some((a) => a.kind === "claude-desktop-mcp")).toBe(false);
  });
});

describe("install status", () => {
  test("printInstallStatus human output", () => {
    const paths = resolveInstallPaths(fixture, {});
    mkdirSync(paths.bindir, { recursive: true });
    writeFileSync(paths.binaryPath, "fake", "utf8");

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
      expect(out).toContain(paths.binaryPath);
    } finally {
      process.stdout.write = orig;
    }
  });

  test("printInstallStatus json output", () => {
    const paths = resolveInstallPaths(fixture, {});
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

  test("install --skill with no agent dirs succeeds", async () => {
    const result = await runInstallMutation(fixture, { skill: "1", yes: "1", dry: "1" });
    expect(result.changed).toEqual([]);
  });

  test("uninstall --all removes detected binary", async () => {
    const paths = resolveInstallPaths(fixture, {});
    mkdirSync(paths.bindir, { recursive: true });
    writeFileSync(paths.binaryPath, "fake", "utf8");

    const result = await runInstallMutation(fixture, { uninstall: "1", all: "1", yes: "1" });
    expect(result.changed).toContain(paths.binaryPath);
    expect(existsSync(paths.binaryPath)).toBe(false);
  });
});

describe("uninstall plan", () => {
  test("buildUninstallPlan --all scopes like install --all", () => {
    const paths = resolveInstallPaths(fixture, {});
    mkdirSync(paths.bindir, { recursive: true });
    writeFileSync(paths.binaryPath, "fake", "utf8");

    const plan = buildUninstallPlan(fixture, paths, parseInstallOpts({ uninstall: "1", all: "1" }));
    expect(plan.some((a) => a.summary.startsWith("binary:"))).toBe(true);
  });

  test("buildUninstallPlan --bin ignores completions", () => {
    const paths = resolveInstallPaths(fixture, {});
    mkdirSync(paths.bindir, { recursive: true });
    writeFileSync(paths.binaryPath, "fake", "utf8");
    mkdirSync(join(home, ".bash_completion.d"), { recursive: true });
    writeFileSync(paths.bashCompletion, "# bash", "utf8");

    const plan = buildUninstallPlan(fixture, paths, parseInstallOpts({ uninstall: "1", bin: "1" }));
    expect(plan).toHaveLength(1);
    expect(plan[0]!.summary.startsWith("binary:")).toBe(true);
  });
});
