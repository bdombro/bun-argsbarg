/*
This module installs generated Agent Skills to Cursor or Claude Code skill directories.
*/

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CliCommand } from "../types.ts";
import { generateSkillBundle, type SkillTarget } from "./generate.ts";

export interface SkillInstallOpts {
  global?: boolean;
  force?: boolean;
}

/** Resolves the user home directory (`$HOME` when set). */
function userHome(): string {
  return process.env.HOME ?? homedir();
}

/** Resolves the install directory for a skill target. */
function resolveSkillDir(target: SkillTarget, dirName: string, global: boolean): string {
  const base = global
    ? join(userHome(), target === "cursor" ? ".cursor" : ".claude", "skills")
    : join(process.cwd(), target === "cursor" ? ".cursor" : ".claude", "skills");
  return join(base, dirName);
}

/** Writes SKILL.md and reference.md to the target skills directory. */
export function cliSkillInstall(root: CliCommand, target: SkillTarget, opts: SkillInstallOpts): string {
  const bundle = generateSkillBundle(root, target);
  const dir = resolveSkillDir(target, bundle.dirName, opts.global ?? false);

  if (existsSync(dir) && !opts.force) {
    process.stderr.write(`Skill directory already exists: ${dir}\nUse --force to overwrite.\n`);
    process.exit(1);
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), bundle.skillMd, "utf8");
  writeFileSync(join(dir, "reference.md"), bundle.referenceMd, "utf8");

  const label = target === "cursor" ? "Cursor" : "Claude Code";
  return `Installed ${label} skill to ${dir}/`;
}
