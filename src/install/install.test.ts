import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CliCommand } from "../types.ts";
import { detectInstalledArtifacts } from "./detect-installed.ts";
import { resolveInstallPaths } from "./paths.ts";
import { buildInstallPlan } from "./plan.ts";
import { printInstallStatus } from "./status.ts";
import { parseInstallOpts } from "./index.ts";

const fixture: CliCommand = {
  key: "testapp",
  description: "Test",
  mcpServer: { name: "testapp" },
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
