import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliProgram } from "../types.ts";
import {
  defaultClaudePluginPaths,
  generatePluginManifest,
  generatePluginMcpJson,
  packClaudePlugin,
  pluginName,
} from "./claude.ts";

const configFixture: CliProgram = {
  key: "myapp",
  version: "1.0.0",
  description: "Demo.",
  mcpServer: { enabled: true },
  appConfig: {
    entries: {
      apiToken: {
        description: "Token from settings.",
        env: "API_TOKEN",
        sensitive: true,
      },
    },
  },
  commands: [{ key: "run", description: "Run.", handler: () => {} }],
};

describe("claude plugin", () => {
  test("pluginName is kebab-case", () => {
    expect(pluginName({ ...configFixture, key: "MyApp" })).toBe("my-app");
  });

  test("generatePluginManifest includes userConfig from program.appConfig", () => {
    const manifest = generatePluginManifest(configFixture, "myapp");
    expect(manifest.name).toBe("myapp");
    const userConfig = manifest.userConfig as Record<string, Record<string, unknown>>;
    expect(userConfig.api_token?.description).toBe("Token from settings.");
    expect(userConfig.api_token?.sensitive).toBe(true);
  });

  test("generatePluginMcpJson uses CLAUDE_PLUGIN_ROOT and env mapping", () => {
    const json = generatePluginMcpJson(configFixture, "myapp");
    const entry = json.myapp as { command: string; args: string[]; env: Record<string, string> };
    expect(entry.command).toBe("${CLAUDE_PLUGIN_ROOT}/bin/myapp");
    expect(entry.args).toEqual(["mcp"]);
    expect(entry.env.API_TOKEN).toBe("${user_config.api_token}");
  });

  test("defaultClaudePluginPaths", () => {
    const cwd = "/tmp/work";
    const paths = defaultClaudePluginPaths(configFixture, cwd);
    expect(paths.pluginZipPath).toBe(join(cwd, "dist", "claude-plugin", "myapp.zip"));
  });

  test("packClaudePlugin writes zip with expected entries", () => {
    const work = mkdtempSync(join(tmpdir(), "claude-plugin-test-"));
    try {
      const dist = join(work, "dist");
      mkdirSync(dist, { recursive: true });
      const binaryPath = join(dist, "myapp");
      writeFileSync(binaryPath, "#!/bin/sh\n", { mode: 0o755 });
      const paths = defaultClaudePluginPaths(configFixture, work);
      packClaudePlugin(configFixture, { cwd: work, binaryPath });
      const zipPath = paths.pluginZipPath;
      expect(readFileSync(zipPath).length).toBeGreaterThan(0);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
