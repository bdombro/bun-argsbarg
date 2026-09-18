/*
Packs a Cursor plugin zip from a compiled CLI binary.
Internal module — not exported from index.ts.
*/

import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { buildCursorPluginMcpEnvMapping, buildCursorPluginVariables } from "../config/manifest.ts";
import type { CliProgram } from "../core/types.ts";
import { defaultMcpBundlePaths, type PackMcpBundleOpts } from "./bundle.ts";
import { collectZipEntries, defaultAuthor, pluginName, stagePluginSkills } from "./plugin-shared.ts";
import { mcpServerId } from "./tools.ts";
import { zipStore } from "./zip.ts";

/** Base distribution output directory relative to workspace root. */
const DIST_DIR = "dist";

/** Output subdirectory name under dist for Cursor plugin archives. */
const CURSOR_PLUGIN_DIR = "cursor-plugin";

/** Default Cursor plugin zip output under cwd. */
export function defaultCursorPluginPaths(
  /** CLI program schema. */
  program: CliProgram,
  /** Working directory (defaults to cwd). */
  cwd = process.cwd(),
) {
  const binaryName = program.key;
  const dist = join(cwd, DIST_DIR);
  const name = pluginName(program);
  return {
    pluginZipPath: join(dist, CURSOR_PLUGIN_DIR, `${name}.zip`),
    binaryPath: join(dist, binaryName),
    binaryName,
  };
}

/** Generates `.cursor-plugin/plugin.json` object. */
export function generateCursorPluginManifest(
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
  };
  if (bundle?.displayName) {
    manifest.displayName = bundle.displayName;
  }
  if (bundle?.homepage) {
    manifest.homepage = bundle.homepage;
  }
  if (bundle?.repository) {
    manifest.repository = bundle.repository;
  }
  if (bundle?.license) {
    manifest.license = bundle.license;
  }
  const variables = buildCursorPluginVariables(program);
  if (variables) {
    manifest.variables = variables;
  }
  return manifest;
}

/** Generates plugin `mcp.json` stdio server config for Cursor. */
export function generateCursorPluginMcpJson(
  /** CLI program schema. */
  program: CliProgram,
  /** Staged executable name. */
  binaryName: string,
): Record<string, unknown> {
  const mcp: Record<string, unknown> = {
    command: `\${CURSOR_PLUGIN_ROOT}/bin/${binaryName}`,
    args: ["mcp"],
  };
  const env = buildCursorPluginMcpEnvMapping(program);
  if (env) {
    mcp.env = env;
  }
  return {
    mcpServers: {
      [mcpServerId(program)]: mcp,
    },
  };
}

/**
 * Stages directory tree for Cursor plugin: manifest, mcp.json, binary, and skills.
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
  mkdirSync(join(pluginRoot, ".cursor-plugin"), { recursive: true });
  mkdirSync(join(pluginRoot, "bin"), { recursive: true });

  writeFileSync(
    join(pluginRoot, ".cursor-plugin", "plugin.json"),
    `${JSON.stringify(generateCursorPluginManifest(program, binaryName), null, 2)}\n`,
  );
  writeFileSync(
    join(pluginRoot, "mcp.json"),
    `${JSON.stringify(generateCursorPluginMcpJson(program, binaryName), null, 2)}\n`,
  );
  cpSync(binaryPath, join(pluginRoot, "bin", binaryName), { mode: 0o755 });
  stagePluginSkills(pluginRoot, program, cwd);
}

/**
 * Writes `dist/cursor-plugin/<name>.zip` with manifests, binary, and skill bundle.
 * Requires the compiled binary to exist.
 */
export function packCursorPlugin(
  /** CLI program schema. */
  program: CliProgram,
  /** Packaging options. */
  opts: PackMcpBundleOpts = {},
): string {
  const cwd = opts.cwd ?? process.cwd();
  const defaults = defaultCursorPluginPaths(program, cwd);
  const mcpDefaults = defaultMcpBundlePaths(program, cwd);
  const binaryPath = resolve(cwd, opts.binaryPath ?? mcpDefaults.binaryPath);
  const pluginZipPath = resolve(cwd, defaults.pluginZipPath);
  const binaryName = basename(binaryPath);

  if (!existsSync(binaryPath)) {
    throw new Error(`Binary not found: ${binaryPath}. Build with compile first (expected dist/${program.key}).`);
  }

  const staging = mkdtempSync(join(tmpdir(), "cursor-plugin-"));
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
