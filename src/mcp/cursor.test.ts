/*
Tests for mcp/cursor module behavior.
*/

import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliProgram } from "../core/types.ts";
import {
  defaultCursorPluginPaths,
  generateCursorPluginManifest,
  generateCursorPluginMcpJson,
  packCursorPlugin,
} from "./cursor.ts";
import { pluginName } from "./plugin-shared.ts";

const configFixture: CliProgram = {
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
  appConfig: {
    entries: {
      apiToken: {
        description: "Token from settings.",
        env: "API_TOKEN",
        required: true,
        sensitive: true,
      },
    },
  },
  commands: [{ key: "run", description: "Run.", handler: () => {} }],
};

/** Tests for cursor plugin. */
describe("cursor plugin", () => {
  test("pluginName is kebab-case", () => {
    expect(pluginName({ ...configFixture, key: "MyApp" })).toBe("my-app");
  });

  test("generateCursorPluginManifest includes bundle metadata and variables", () => {
    const manifest = generateCursorPluginManifest(configFixture, "myapp");
    expect(manifest.name).toBe("myapp");
    expect(manifest.displayName).toBe("My Application");
    expect(manifest.homepage).toBe("https://example.com");
    expect(manifest.repository).toBe("https://github.com/example/myapp");
    expect(manifest.license).toBe("MIT");
    const variables = manifest.variables as {
      type: string;
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
    expect(variables.type).toBe("object");
    expect(variables.properties.API_TOKEN?.description).toBe("Token from settings.");
    expect(variables.required).toContain("API_TOKEN");
  });

  test("generateCursorPluginMcpJson uses CURSOR_PLUGIN_ROOT and mcpServers wrapper", () => {
    const json = generateCursorPluginMcpJson(configFixture, "myapp");
    const servers = json.mcpServers as Record<string, { command: string; args: string[]; env: Record<string, string> }>;
    const entry = servers.myapp;
    expect(entry).toBeDefined();
    expect(entry?.command).toBe("${CURSOR_PLUGIN_ROOT}/bin/myapp");
    expect(entry?.args).toEqual(["mcp"]);
    expect(entry?.env?.API_TOKEN).toBe("${API_TOKEN}");
  });

  test("defaultCursorPluginPaths", () => {
    const cwd = "/tmp/work";
    const paths = defaultCursorPluginPaths(configFixture, cwd);
    expect(paths.pluginZipPath).toBe(join(cwd, "dist", "cursor-plugin", "myapp.zip"));
    expect(paths.binaryPath).toBe(join(cwd, "dist", "myapp"));
  });

  test("packCursorPlugin writes zip with manifests, binary, and generated skill", () => {
    const work = mkdtempSync(join(tmpdir(), "cursor-plugin-test-"));
    try {
      const dist = join(work, "dist");
      mkdirSync(dist, { recursive: true });
      const binaryPath = join(dist, "myapp");
      writeFileSync(binaryPath, "#!/bin/sh\n", { mode: 0o755 });
      const paths = defaultCursorPluginPaths(configFixture, work);
      packCursorPlugin(configFixture, { cwd: work, binaryPath });
      const zip = readFileSync(paths.pluginZipPath);
      expect(zip.length).toBeGreaterThan(0);
      const zipText = zip.toString("utf8");
      expect(zipText).toContain("skills/myapp/SKILL.md");
      expect(zipText).toContain("MCP toolset");

      writeFileSync(join(work, "out.zip"), zip);
      const extract = join(work, "extract");
      mkdirSync(extract, { recursive: true });
      execSync("unzip -o -q ../out.zip", { cwd: extract });
      const binMode = statSync(join(extract, "bin", "myapp")).mode & 0o777;
      expect(binMode & 0o111).not.toBe(0);

      const pluginJson = JSON.parse(readFileSync(join(extract, ".cursor-plugin", "plugin.json"), "utf8")) as {
        name: string;
      };
      expect(pluginJson.name).toBe("myapp");

      const mcpJson = JSON.parse(readFileSync(join(extract, "mcp.json"), "utf8")) as {
        mcpServers: Record<string, { command: string }>;
      };
      expect(mcpJson.mcpServers.myapp?.command).toBe("${CURSOR_PLUGIN_ROOT}/bin/myapp");
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
      expect(skillContent).toContain("Custom Hand-Crafted Skill");
      const refContent = readFileSync(join(extract, "skills", "myapp", "reference.md"), "utf8");
      expect(refContent).toContain("Extra Reference Material");
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
