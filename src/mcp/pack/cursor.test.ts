/*
Tests for mcp/cursor module behavior.
*/

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { AppSpec } from "../../core/types.ts";
import {
  defaultCursorPluginPaths,
  generateCursorPluginManifest,
  generateCursorPluginMcpJson,
  packCursorPlugin,
} from "./cursor.ts";
import { pluginName } from "./shared.ts";

const configFixture: AppSpec = {
  key: "myapp",
  version: "1.0.0",
  description: "Demo.",
  mcpServer: {
    enabled: true,
    bundle: {
      author: { name: "Author", email: "author@example.com" },
      displayName: "My Application",
      homepage: "https://example.com",
      license: "MIT",
      repository: "https://github.com/example/myapp",
    },
  },
  commands: [{ key: "run", description: "Run.", handler: () => {} }],
};

/** Tests for cursor plugin. */
describe("cursor plugin", () => {
  test("pluginName is kebab-case", () => {
    assert.equal(pluginName({ ...configFixture, key: "MyApp" }), "my-app");
  });

  test("generateCursorPluginManifest includes bundle metadata", () => {
    const manifest = generateCursorPluginManifest(configFixture, "myapp");
    assert.equal(manifest.name, "myapp");
    assert.equal(manifest.displayName, "My Application");
    assert.equal(manifest.homepage, "https://example.com");
    assert.equal(manifest.repository, "https://github.com/example/myapp");
    assert.equal(manifest.license, "MIT");
    assert.equal(manifest.variables, undefined);
  });

  test("generateCursorPluginMcpJson uses CURSOR_PLUGIN_ROOT and mcpServers wrapper", () => {
    const json = generateCursorPluginMcpJson(configFixture, "myapp");
    const servers = json.mcpServers as Record<
      string,
      { command: string; args: string[]; env?: Record<string, string> }
    >;
    const entry = servers.myapp;
    assert.notEqual(entry, undefined);
    assert.equal(entry?.command, "${CURSOR_PLUGIN_ROOT}/bin/myapp");
    assert.deepEqual(entry?.args, ["mcp"]);
    assert.equal(entry?.env, undefined);
  });

  test("defaultCursorPluginPaths", () => {
    const cwd = "/tmp/work";
    const paths = defaultCursorPluginPaths(configFixture, cwd);
    assert.equal(paths.pluginZipPath, join(cwd, "dist", "cursor-plugin", "myapp.zip"));
    assert.equal(paths.binaryPath, join(cwd, "dist", "myapp"));
  });

  test("packCursorPlugin writes zip with manifests and binary, and no skill when the repo has none", () => {
    const work = mkdtempSync(join(tmpdir(), "cursor-plugin-test-"));
    try {
      const dist = join(work, "dist");
      mkdirSync(dist, { recursive: true });
      const binaryPath = join(dist, "myapp");
      writeFileSync(binaryPath, "#!/bin/sh\n", { mode: 0o755 });
      const paths = defaultCursorPluginPaths(configFixture, work);
      packCursorPlugin(configFixture, { cwd: work, binaryPath });
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

      const pluginJson = JSON.parse(readFileSync(join(extract, ".cursor-plugin", "plugin.json"), "utf8")) as {
        name: string;
      };
      assert.equal(pluginJson.name, "myapp");

      const mcpJson = JSON.parse(readFileSync(join(extract, "mcp.json"), "utf8")) as {
        mcpServers: Record<string, { command: string }>;
      };
      assert.equal(mcpJson.mcpServers.myapp?.command, "${CURSOR_PLUGIN_ROOT}/bin/myapp");
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  test("packCursorPlugin preserves repository skills when present in cwd", () => {
    const work = mkdtempSync(join(tmpdir(), "cursor-plugin-skill-"));
    try {
      const dist = join(work, "dist");
      mkdirSync(dist, { recursive: true });
      const binaryPath = join(dist, "myapp");
      writeFileSync(binaryPath, "#!/bin/sh\n", { mode: 0o755 });

      const repoSkillDir = join(work, "skills", "myapp");
      mkdirSync(repoSkillDir, { recursive: true });
      writeFileSync(join(repoSkillDir, "SKILL.md"), "# Custom Hand-Crafted Skill\nSpecial instructions here.");
      writeFileSync(join(repoSkillDir, "reference.md"), "# Extra Reference Material");

      const paths = defaultCursorPluginPaths(configFixture, work);
      packCursorPlugin(configFixture, { cwd: work, binaryPath });

      writeFileSync(join(work, "out.zip"), readFileSync(paths.pluginZipPath));
      const extract = join(work, "extract");
      mkdirSync(extract, { recursive: true });
      execSync("unzip -o -q ../out.zip", { cwd: extract });

      const skillContent = readFileSync(join(extract, "skills", "myapp", "SKILL.md"), "utf8");
      assert.ok(skillContent.includes("Custom Hand-Crafted Skill"));
      const refContent = readFileSync(join(extract, "skills", "myapp", "reference.md"), "utf8");
      assert.ok(refContent.includes("Extra Reference Material"));
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
