/*
Shared utilities and staging helpers for Claude Code and Cursor plugin packages.
Internal module — not exported from index.ts.
*/

import {
  cpSync,
  type Dirent,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import type { CliMcpBundleConfig, CliProgram } from "../core/types.ts";
import { generatePluginSkillBundle } from "../skill/generate.ts";
import { applyPluginSkillHint } from "../skill/hint.ts";
import { sanitizeToolSegment } from "./tools.ts";
import type { ZipFileEntry } from "./zip.ts";

/**
 * Traverses a staging directory recursively and gathers ZIP entries preserving executable permissions.
 */
export function collectZipEntries(
  /** Directory containing the staged files. */
  rootDir: string,
  /** Subdirectory currently being traversed (defaults to rootDir). */
  dir = rootDir,
): ZipFileEntry[] {
  const entries: ZipFileEntry[] = [];
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
    const stMode = statSync(full).mode;
    const entry: ZipFileEntry = { name: rel, data: readFileSync(full) };
    if (stMode & 0o111) {
      entry.unixMode = stMode;
    }
    entries.push(entry);
  }
  return entries;
}

/**
 * Returns author metadata from bundle config or fallback defaults.
 */
export function defaultAuthor(
  /** Optional bundle configuration. */
  bundle?: CliMcpBundleConfig,
): {
  name: string;
  email?: string;
  url?: string;
} {
  return bundle?.author ?? { name: "Unknown" };
}

/**
 * Generates kebab-case plugin name for plugin manifests.
 */
export function pluginName(
  /** CLI program schema. */
  program: CliProgram,
): string {
  return program.key
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/**
 * Stages repository skill directory if present, or writes a generated MCP routing skill.
 */
export function stagePluginSkills(
  /** Plugin staging root directory. */
  pluginRoot: string,
  /** CLI program schema. */
  program: CliProgram,
  /** Working directory containing repository sources. */
  cwd: string,
): void {
  const dirName = sanitizeToolSegment(program.key);
  const repoSkillDir = program.mcpServer?.bundle?.skillsDir
    ? resolve(cwd, program.mcpServer.bundle.skillsDir)
    : join(cwd, "skills", dirName);

  if (existsSync(repoSkillDir) && statSync(repoSkillDir).isDirectory()) {
    const targetDir = join(pluginRoot, "skills", dirName);
    mkdirSync(join(targetDir, ".."), { recursive: true });
    cpSync(repoSkillDir, targetDir, { recursive: true });
  } else {
    const bundle = generatePluginSkillBundle(program);
    const skillMd = applyPluginSkillHint(program, bundle.skillMd);
    mkdirSync(join(pluginRoot, "skills", bundle.dirName), { recursive: true });
    writeFileSync(join(pluginRoot, "skills", bundle.dirName, "SKILL.md"), skillMd);
  }
}
