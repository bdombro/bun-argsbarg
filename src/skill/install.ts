import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { userHome } from "../paths/host.ts";
import type { CliProgram } from "../types.ts";
import { generateSkillBundle, type SkillTarget } from "./generate.ts";
import { applySkillInstallHints } from "./hint.ts";

export { skillDirNameForTarget, skillFrontmatterName, skillSlug } from "./naming.ts";

export interface SkillInstallOpts {
  global?: boolean;
  rimraf?: boolean;
  dry?: boolean;
}

function resolveSkillDir(target: SkillTarget, dirName: string, global: boolean): string {
  const home = userHome();
  switch (target) {
    case "cursor":
      return join(global ? home : process.cwd(), ".cursor", "skills", dirName);
    case "claude":
      return join(global ? home : process.cwd(), ".claude", "skills", dirName);
    case "codex":
      return join(global ? home : process.cwd(), ".codex", "skills", dirName);
    case "opencode":
      return join(global ? home : process.cwd(), ".config", "opencode", "skills", dirName);
    case "openclaw":
      return join(global ? home : process.cwd(), ".openclaw", "skills", dirName);
  }
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

/** Maps install action kind to skill target. */
export function skillTargetFromActionKind(kind: string): SkillTarget | undefined {
  switch (kind) {
    case "cursor-skill":
      return "cursor";
    case "claude-skill":
      return "claude";
    case "codex-skill":
      return "codex";
    case "opencode-skill":
      return "opencode";
    case "openclaw-skill":
      return "openclaw";
    default:
      return undefined;
  }
}
