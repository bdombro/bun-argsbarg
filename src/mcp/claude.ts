/*
Packs a Claude Code plugin zip from a compiled CLI binary.
Internal module — not exported from index.ts.
*/

import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { buildPluginMcpEnvMapping, buildProgramUserConfig } from "../config/manifest.ts";
import type { CliProgram } from "../core/types.ts";
import { defaultMcpBundlePaths, type PackMcpBundleOpts } from "./bundle.ts";
import { collectZipEntries, defaultAuthor, pluginName, stagePluginSkills } from "./plugin-shared.ts";
import { mcpServerId } from "./tools.ts";
import { zipStore } from "./zip.ts";

/** Base distribution output directory relative to workspace root. */
const DIST_DIR = "dist";

/** Output subdirectory name under dist for Claude Code plugin archives. */
const CLAUDE_PLUGIN_DIR = "claude-plugin";

/** Default plugin zip output under cwd. */
export function defaultClaudePluginPaths(
  /** CLI program schema. */
  program: CliProgram,
  /** Working directory (defaults to cwd). */
  cwd = process.cwd(),
) {
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
  /** CLI program schema. */
  program: CliProgram,
  /** Staged executable name. */
  _binaryName: string,
): Record<string, unknown> {
  const bundle = program.mcpServer?.bundle;
  const manifest: Record<string, unknown> = {
    name: pluginName(program),
    version: program.version,
    description: program.description,
    author: defaultAuthor(bundle),
    mcpServers: ".mcp.json",
  };
  const userConfig = buildProgramUserConfig(program);
  if (userConfig) {
    manifest.userConfig = userConfig;
  }
  return manifest;
}

/** Generates plugin `.mcp.json` stdio server config. */
export function generatePluginMcpJson(
  /** CLI program schema. */
  program: CliProgram,
  /** Staged executable name. */
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

/**
 * Stages directory tree for Claude Code plugin: manifest, .mcp.json, binary, and skills.
 */
function writePluginTree(
  /** Staging root directory. */
  pluginRoot: string,
  /** CLI program schema. */
  program: CliProgram,
  /** Absolute path to compiled binary. */
  binaryPath: string,
  /** Executable filename. */
  binaryName: string,
  /** Working directory containing repository sources. */
  cwd: string,
): void {
  mkdirSync(join(pluginRoot, ".claude-plugin"), { recursive: true });
  mkdirSync(join(pluginRoot, "bin"), { recursive: true });

  writeFileSync(
    join(pluginRoot, ".claude-plugin", "plugin.json"),
    `${JSON.stringify(generatePluginManifest(program, binaryName), null, 2)}\n`,
  );
  writeFileSync(
    join(pluginRoot, ".mcp.json"),
    `${JSON.stringify(generatePluginMcpJson(program, binaryName), null, 2)}\n`,
  );
  const stagedBinary = join(pluginRoot, "bin", binaryName);
  cpSync(binaryPath, stagedBinary);
  chmodSync(stagedBinary, 0o755);
  stagePluginSkills(pluginRoot, program, cwd);
}

/**
 * Writes `dist/claude-plugin/<name>.zip` with manifests, binary, and skill bundle.
 * Requires the compiled binary to exist.
 */
export function packClaudePlugin(
  /** CLI program schema. */
  program: CliProgram,
  /** Packaging options. */
  opts: PackMcpBundleOpts = {},
): string {
  const cwd = opts.cwd ?? process.cwd();
  const defaults = defaultClaudePluginPaths(program, cwd);
  const mcpDefaults = defaultMcpBundlePaths(program, cwd);
  const binaryPath = resolve(cwd, opts.binaryPath ?? mcpDefaults.binaryPath);
  const pluginZipPath = resolve(cwd, defaults.pluginZipPath);
  const binaryName = basename(binaryPath);

  if (!existsSync(binaryPath)) {
    throw new Error(`Binary not found: ${binaryPath}. Build with compile first (expected dist/${program.key}).`);
  }

  const staging = mkdtempSync(join(tmpdir(), "claude-plugin-"));
  try {
    writePluginTree(staging, program, binaryPath, binaryName, cwd);
    const zip = zipStore(collectZipEntries(staging));
    mkdirSync(join(pluginZipPath, ".."), { recursive: true });
    writeFileSync(pluginZipPath, zip);
    return pluginZipPath;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
