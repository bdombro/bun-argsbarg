import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CliProgram } from "../types.ts";
import { generateSkillBundle, type SkillTarget } from "./generate.ts";
import { applySkillInstallHints } from "./hint.ts";

export interface SkillInstallOpts {
  global?: boolean;
  /** When true, remove an existing skill directory before writing. */
  rimraf?: boolean;
  /** When true, skip writes but return paths that would change. */
  dry?: boolean;
}

function userHome(): string {
  return process.env.HOME ?? homedir();
}

function resolveSkillDir(target: SkillTarget, dirName: string, global: boolean): string {
  const base = global
    ? join(userHome(), target === "cursor" ? ".cursor" : ".claude", "skills")
    : join(process.cwd(), target === "cursor" ? ".cursor" : ".claude", "skills");
  return join(base, dirName);
}

/** Writes SKILL.md and reference.md; returns changed file paths. */
export function cliSkillInstall(
  root: CliProgram,
  target: SkillTarget,
  opts: SkillInstallOpts,
): string[] {
  const bundle = generateSkillBundle(root, target);
  const { skillMd, referenceMd } = applySkillInstallHints(root, bundle.skillMd, bundle.referenceMd);
  const dir = resolveSkillDir(target, bundle.dirName, opts.global ?? false);
  const changed: string[] = [];

  if (opts.rimraf && existsSync(dir) && !opts.dry) {
    rmSync(dir, { recursive: true, force: true });
  }

  const skillPath = join(dir, "SKILL.md");
  const refPath = join(dir, "reference.md");

  if (!opts.dry) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(skillPath, skillMd, "utf8");
    writeFileSync(refPath, referenceMd, "utf8");
  }

  changed.push(skillPath, refPath);
  return changed;
}
