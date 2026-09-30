/*
Tests for mcp/claude module behavior.
*/

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { AppSpec } from "../../core/types.ts";
import { defaultClaudePluginPaths, generatePluginManifest, generatePluginMcpJson, packClaudePlugin } from "./claude.ts";
import { pluginName } from "./shared.ts";

const configFixture: AppSpec = {
  key: "myapp",
  version: "1.0.0",
  description: "Demo.",
  mcpServer: { enabled: true },
  commands: [{ key: "run", description: "Run.", handler: () => {} }],
};

/** Tests for claude plugin. */
describe("claude plugin", () => {
  test("pluginName is kebab-case", () => {
    assert.equal(pluginName({ ...configFixture, key: "MyApp" }), "my-app");
  });

  test("generatePluginManifest has no userConfig", () => {
    const manifest = generatePluginManifest(configFixture, "myapp");
    assert.equal(manifest.name, "myapp");
    assert.equal(manifest.mcpServers, ".mcp.json");
    assert.equal(manifest.userConfig, undefined);
  });

  test("generatePluginMcpJson uses CLAUDE_PLUGIN_ROOT", () => {
    const json = generatePluginMcpJson(configFixture, "myapp");
    const entry = json.myapp as { command: string; args: string[]; env?: Record<string, string> };
    assert.equal(entry.command, "${CLAUDE_PLUGIN_ROOT}/bin/myapp");
    assert.deepEqual(entry.args, ["mcp"]);
    assert.equal(entry.env, undefined);
  });

  test("defaultClaudePluginPaths", () => {
    const cwd = "/tmp/work";
    const paths = defaultClaudePluginPaths(configFixture, cwd);
    assert.equal(paths.pluginZipPath, join(cwd, "dist", "claude-plugin", "myapp.zip"));
  });

  /** Tests that packClaudePlugin writes a zip without a skill when the repo has none. */
  test("packClaudePlugin ships no skill when the repository has none", () => {
    const work = mkdtempSync(join(tmpdir(), "claude-plugin-test-"));
    try {
      const dist = join(work, "dist");
      mkdirSync(dist, { recursive: true });
      const binaryPath = join(dist, "myapp");
      writeFileSync(binaryPath, "#!/bin/sh\n", { mode: 0o755 });
      const paths = defaultClaudePluginPaths(configFixture, work);
      packClaudePlugin(configFixture, { cwd: work, binaryPath });
      const zip = readFileSync(paths.pluginZipPath);
      assert.ok(zip.length > 0);
      const zipText = zip.toString("utf8");
      assert.ok(!zipText.includes("skills/myapp/SKILL.md"));

      writeFileSync(join(work, "out.zip"), zip);
      const extract = join(work, "extract");
      mkdirSync(extract, { recursive: true });
      execSync("unzip -o -q ../out.zip", { cwd: extract });
      const binMode = statSync(join(extract, "bin", "myapp")).mode & 0o777;
      assert.notEqual(binMode & 0o111, 0);
      const pluginJson = JSON.parse(readFileSync(join(extract, ".claude-plugin", "plugin.json"), "utf8")) as {
        mcpServers: string;
      };
      assert.equal(pluginJson.mcpServers, ".mcp.json");
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
