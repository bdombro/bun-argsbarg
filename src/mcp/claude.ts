/*
Packs a Claude Code plugin zip from a compiled CLI binary.
Internal module — not exported from index.ts.
*/

import {
  cpSync,
  type Dirent,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { buildPluginMcpEnvMapping, buildProgramUserConfig } from "../config/manifest.ts";
import { generateSkillBundle } from "../skill/generate.ts";
import { applySkillBundleHints } from "../skill/hint.ts";
import type { CliMcpBundleConfig, CliProgram } from "../types.ts";
import { defaultMcpBundlePaths, type PackMcpBundleOpts } from "./bundle.ts";
import { mcpServerId, sanitizeToolSegment } from "./tools.ts";
import { zipStore } from "./zip.ts";

const DIST_DIR = "dist";
const CLAUDE_PLUGIN_DIR = "claude-plugin";

/** Kebab-case plugin name for plugin.json (Claude Code requires kebab-case). */
export function pluginName(program: CliProgram): string {
  return program.key
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function defaultAuthor(bundle?: CliMcpBundleConfig): {
  name: string;
  email?: string;
  url?: string;
} {
  return bundle?.author ?? { name: "Unknown" };
}

/** Default plugin zip output under cwd. */
export function defaultClaudePluginPaths(program: CliProgram, cwd = process.cwd()) {
  const binaryName = program.key;
  const dist = join(cwd, DIST_DIR);
  const name = pluginName(program);
  return {
    pluginZipPath: join(dist, CLAUDE_PLUGIN_DIR, `${name}.zip`),
    binaryPath: join(dist, binaryName),
    binaryName,
  };
}

/** Generates `.claude-plugin/plugin.json` object. */
export function generatePluginManifest(
  program: CliProgram,
  _binaryName: string,
): Record<string, unknown> {
  const bundle = program.mcpServer?.bundle;
  const manifest: Record<string, unknown> = {
    name: pluginName(program),
    version: program.version,
    description: program.description,
    author: defaultAuthor(bundle),
  };
  const userConfig = buildProgramUserConfig(program);
  if (userConfig) {
    manifest.userConfig = userConfig;
  }
  return manifest;
}

/** Generates plugin `.mcp.json` stdio server config. */
export function generatePluginMcpJson(
  program: CliProgram,
  binaryName: string,
): Record<string, unknown> {
  const mcp: Record<string, unknown> = {
    command: `\${CLAUDE_PLUGIN_ROOT}/bin/${binaryName}`,
    args: ["mcp"],
  };
  const env = buildPluginMcpEnvMapping(program);
  if (env) {
    mcp.env = env;
  }
  return {
    [mcpServerId(program)]: mcp,
  };
}

function collectZipEntries(rootDir: string, dir = rootDir): { name: string; data: Buffer }[] {
  const entries: { name: string; data: Buffer }[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true }) as Dirent[]) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      entries.push(...collectZipEntries(rootDir, full));
      continue;
    }
    if (!ent.isFile()) {
      continue;
    }
    const rel = relative(rootDir, full).split("\\").join("/");
    entries.push({ name: rel, data: readFileSync(full) });
  }
  return entries;
}

function writePluginTree(
  pluginRoot: string,
  program: CliProgram,
  binaryPath: string,
  binaryName: string,
): void {
  const skillDirName = sanitizeToolSegment(program.key);
  const bundle = generateSkillBundle(program, "claude");
  const hinted = applySkillBundleHints(program, bundle.skillMd, bundle.referenceMd);

  mkdirSync(join(pluginRoot, ".claude-plugin"), { recursive: true });
  mkdirSync(join(pluginRoot, "bin"), { recursive: true });
  mkdirSync(join(pluginRoot, "skills", skillDirName), { recursive: true });

  writeFileSync(
    join(pluginRoot, ".claude-plugin", "plugin.json"),
    `${JSON.stringify(generatePluginManifest(program, binaryName), null, 2)}\n`,
  );
  writeFileSync(
    join(pluginRoot, ".mcp.json"),
    `${JSON.stringify(generatePluginMcpJson(program, binaryName), null, 2)}\n`,
  );
  cpSync(binaryPath, join(pluginRoot, "bin", binaryName), { mode: 0o755 });
  writeFileSync(join(pluginRoot, "skills", skillDirName, "SKILL.md"), hinted.skillMd);
  writeFileSync(join(pluginRoot, "skills", skillDirName, "reference.md"), hinted.referenceMd);
}

/**
 * Writes `dist/claude-plugin/<name>.zip` with manifests, binary, and skill bundle.
 * Requires the compiled binary to exist.
 */
export function packClaudePlugin(program: CliProgram, opts: PackMcpBundleOpts = {}): string {
  const cwd = opts.cwd ?? process.cwd();
  const defaults = defaultClaudePluginPaths(program, cwd);
  const mcpDefaults = defaultMcpBundlePaths(program, cwd);
  const binaryPath = resolve(cwd, opts.binaryPath ?? mcpDefaults.binaryPath);
  const pluginZipPath = resolve(cwd, defaults.pluginZipPath);
  const binaryName = basename(binaryPath);

  if (!existsSync(binaryPath)) {
    throw new Error(
      `Binary not found: ${binaryPath}. Build with compile first (expected dist/${program.key}).`,
    );
  }

  const staging = mkdtempSync(join(tmpdir(), "claude-plugin-"));
  try {
    writePluginTree(staging, program, binaryPath, binaryName);
    const zip = zipStore(collectZipEntries(staging));
    mkdirSync(join(pluginZipPath, ".."), { recursive: true });
    writeFileSync(pluginZipPath, zip);
    return pluginZipPath;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
