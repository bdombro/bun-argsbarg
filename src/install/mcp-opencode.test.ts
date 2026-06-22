import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CliProgram } from "../types.ts";
import {
  detectOpenCodeMcpConfigPath,
  expectedOpenCodeMcpEntry,
  mergeOpenCodeMcpConfig,
  OPENCODE_CONFIG_SCHEMA,
  opencodeConfigDir,
  removeOpenCodeMcpConfig,
  resolveOpenCodeConfigPathForInstall,
} from "./mcp-opencode.ts";

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
  home = mkdtempSync(join(tmpdir(), "argsbarg-opencode-"));
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

describe("opencode mcp config", () => {
  test("resolveOpenCodeConfigPathForInstall prefers existing file", () => {
    const dir = opencodeConfigDir(home);
    mkdirSync(dir, { recursive: true });
    const existing = join(dir, "opencode.json");
    writeFileSync(existing, "{}", "utf8");
    expect(resolveOpenCodeConfigPathForInstall(home)).toBe(existing);
  });

  test("resolveOpenCodeConfigPathForInstall defaults to config.json", () => {
    mkdirSync(opencodeConfigDir(home), { recursive: true });
    expect(resolveOpenCodeConfigPathForInstall(home)).toBe(join(opencodeConfigDir(home), "config.json"));
  });

  test("mergeOpenCodeMcpConfig writes mcp block", () => {
    const path = resolveOpenCodeConfigPathForInstall(home);
    mkdirSync(opencodeConfigDir(home), { recursive: true });
    const entry = expectedOpenCodeMcpEntry(fixture);
    mergeOpenCodeMcpConfig(path, "testapp", entry, false);
    const data = JSON.parse(readFileSync(path, "utf8")) as {
      $schema: string;
      mcp: Record<string, unknown>;
    };
    expect(data.$schema).toBe(OPENCODE_CONFIG_SCHEMA);
    expect(data.mcp.testapp).toEqual(entry);
  });

  test("detectOpenCodeMcpConfigPath finds entry across filenames", () => {
    const dir = opencodeConfigDir(home);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "config.json");
    writeFileSync(
      path,
      JSON.stringify({
        mcp: {
          testapp: { type: "local", command: ["testapp", "mcp"] },
        },
      }),
      "utf8",
    );
    expect(detectOpenCodeMcpConfigPath(home, "testapp")).toBe(path);
  });

  test("removeOpenCodeMcpConfig deletes server entry", () => {
    const path = resolveOpenCodeConfigPathForInstall(home);
    mkdirSync(opencodeConfigDir(home), { recursive: true });
    mergeOpenCodeMcpConfig(path, "testapp", expectedOpenCodeMcpEntry(fixture), false);
    removeOpenCodeMcpConfig(path, "testapp", false);
    const data = JSON.parse(readFileSync(path, "utf8")) as { mcp?: Record<string, unknown> };
    expect(data.mcp?.testapp).toBeUndefined();
    expect(existsSync(path)).toBe(true);
  });
});
