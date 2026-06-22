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
import type { CliMcpBundleConfig, CliProgram } from "../types.ts";
import { collectMcpTools, mcpServerId } from "./tools.ts";

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

/** Collects unique env var names from MCP tool `requiresEnv` for manifest `user_config`. */
function collectUserConfigEnvVars(program: CliProgram): string[] {
  const names = new Set<string>();
  for (const tool of collectMcpTools(program)) {
    for (const env of tool.leaf.mcpTool?.requiresEnv ?? []) {
      if (env.length > 0) {
        names.add(env);
      }
    }
  }
  return [...names].sort();
}

/** Builds manifest `user_config` entries for required environment variables. */
function buildUserConfig(program: CliProgram): Record<string, unknown> | undefined {
  const envVars = collectUserConfigEnvVars(program);
  if (envVars.length === 0) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const name of envVars) {
    const key =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "") || "env_var";
    out[key] = {
      type: "string",
      title: name,
      description: `Value for environment variable ${name}`,
      sensitive: /key|token|secret|password/i.test(name),
      required: true,
    };
  }
  return out;
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

/** CRC-32 table for ZIP local headers (store method). */
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    if (byte === undefined) {
      continue;
    }
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Writes a minimal ZIP (store, no compression) with one or more files. */
function zipStore(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const crc = crc32(file.data);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt32LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    const centralHdr = Buffer.alloc(46 + nameBuf.length);
    centralHdr.writeUInt32LE(0x02014b50, 0);
    centralHdr.writeUInt16LE(20, 4);
    centralHdr.writeUInt16LE(20, 6);
    centralHdr.writeUInt16LE(0, 8);
    centralHdr.writeUInt16LE(0, 10);
    centralHdr.writeUInt16LE(0, 12);
    centralHdr.writeUInt16LE(0, 14);
    centralHdr.writeUInt32LE(crc, 16);
    centralHdr.writeUInt32LE(file.data.length, 20);
    centralHdr.writeUInt32LE(file.data.length, 24);
    centralHdr.writeUInt32LE(nameBuf.length, 28);
    centralHdr.writeUInt16LE(0, 30);
    centralHdr.writeUInt16LE(0, 32);
    centralHdr.writeUInt16LE(0, 34);
    centralHdr.writeUInt16LE(0, 36);
    centralHdr.writeUInt32LE(0, 38);
    centralHdr.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHdr, 46);

    parts.push(local, file.data);
    central.push(centralHdr);
    offset += local.length + file.data.length;
  }

  const centralStart = offset;
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, centralBuf, end]);
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

/** Runs `mcp bundle`: writes `dist/<key>.mcpb` and prints the path on stdout. */
export function runMcpBundle(program: CliProgram): void {
  const outPath = packMcpBundle(program);
  process.stdout.write(`${outPath}\n`);
}
