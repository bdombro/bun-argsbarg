/*
Packs a CLI program into an MCP Bundle (`.mcpb`) for Claude Desktop.
Expects `dist/<program.key>` as the compiled binary input.
*/

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { buildProgramUserConfig } from "../config/manifest.ts";
import type { CliMcpBundleConfig, CliProgram } from "../types.ts";
import { packClaudePlugin } from "./claude.ts";
import { collectMcpTools, mcpServerId } from "./tools.ts";
import { zipStore } from "./zip.ts";

const MANIFEST_VERSION = "0.3";
const DIST_DIR = "dist";

/** Resolved paths for `mcp bundle`. */
export interface McpBundlePaths {
  binaryPath: string;
  outPath: string;
  binaryName: string;
}

/** Default `dist/<key>` binary and `dist/<key>.mcpb` output under cwd. */
export function defaultMcpBundlePaths(program: CliProgram, cwd = process.cwd()): McpBundlePaths {
  const binaryName = program.key;
  const dist = join(cwd, DIST_DIR);
  return {
    binaryName,
    binaryPath: join(dist, binaryName),
    outPath: join(dist, `${binaryName}.mcpb`),
  };
}

/** Builds MCPB/plugin user_config from schema entries with `env` set. */
function buildUserConfig(program: CliProgram): Record<string, unknown> | undefined {
  return buildProgramUserConfig(program);
}

/** Default author when `mcpServer.bundle.author` is unset. */
function defaultAuthor(bundle?: CliMcpBundleConfig): {
  name: string;
  email?: string;
  url?: string;
} {
  return bundle?.author ?? { name: "Unknown" };
}

/** Generates MCPB `manifest.json` object from program schema and MCP tools. */
export function generateMcpManifest(
  program: CliProgram,
  binaryName: string,
): Record<string, unknown> {
  const bundle = program.mcpServer?.bundle;
  const tools = collectMcpTools(program).map((t) => ({
    name: t.name,
    description: t.description.split("\n")[0] ?? t.description,
  }));

  const manifest: Record<string, unknown> = {
    manifest_version: MANIFEST_VERSION,
    name: mcpServerId(program),
    version: program.version,
    description: program.description,
    author: defaultAuthor(bundle),
    server: {
      type: "binary",
      entry_point: binaryName,
      mcp_config: {
        command: `\${__dirname}/${binaryName}`,
        args: ["mcp"],
      },
    },
    tools,
    tools_generated: false,
    compatibility: {
      claude_desktop: ">=0.10.0",
      platforms: ["darwin"],
    },
  };

  const longDescription = bundle?.longDescription ?? program.description;
  if (longDescription !== program.description) {
    manifest.long_description = longDescription;
  }

  const userConfig = buildUserConfig(program);
  if (userConfig) {
    manifest.user_config = userConfig;
  }

  if (bundle?.icon) {
    manifest.icon = basename(bundle.icon);
  }

  return manifest;
}

export interface PackMcpBundleOpts {
  cwd?: string;
  binaryPath?: string;
  outPath?: string;
}

/**
 * Stages manifest + binary (+ optional icon) and writes a `.mcpb` ZIP.
 * Requires the compiled binary to exist.
 */
export function packMcpBundle(program: CliProgram, opts: PackMcpBundleOpts = {}): string {
  const cwd = opts.cwd ?? process.cwd();
  const defaults = defaultMcpBundlePaths(program, cwd);
  const binaryPath = resolve(cwd, opts.binaryPath ?? defaults.binaryPath);
  const outPath = resolve(cwd, opts.outPath ?? defaults.outPath);
  const binaryName = basename(binaryPath);

  if (!existsSync(binaryPath)) {
    throw new Error(
      `Binary not found: ${binaryPath}. Build with compile first (expected dist/${program.key}).`,
    );
  }

  const staging = mkdtempSync(join(tmpdir(), "mcpb-"));
  try {
    const stagedBinary = join(staging, binaryName);
    cpSync(binaryPath, stagedBinary, { mode: 0o755 });

    const manifest = generateMcpManifest(program, binaryName);
    const files: { name: string; data: Buffer }[] = [
      {
        name: "manifest.json",
        data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
      },
      { name: binaryName, data: readFileSync(stagedBinary) },
    ];

    const iconRel = program.mcpServer?.bundle?.icon;
    if (iconRel) {
      const iconSrc = resolve(cwd, iconRel);
      if (!existsSync(iconSrc)) {
        throw new Error(`Bundle icon not found: ${iconRel}`);
      }
      const iconName = basename(iconRel);
      files.push({ name: iconName, data: readFileSync(iconSrc) });
    }

    mkdirSync(join(outPath, ".."), { recursive: true });
    writeFileSync(outPath, zipStore(files));
    return outPath;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** Runs `mcp bundle`: writes `.mcpb` and Claude Code plugin zip; prints both paths. */
export function runMcpBundle(program: CliProgram): void {
  const mcpbPath = packMcpBundle(program);
  const pluginPath = packClaudePlugin(program);
  process.stdout.write(`${mcpbPath}\n${pluginPath}\n`);
}
