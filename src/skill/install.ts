import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CliProgram } from "../core/types.ts";
import { displayHomePath, userHome } from "../paths/host.ts";
import { generateSkillBundle } from "./generate.ts";
import { applySkillInstallHints } from "./hint.ts";
import { skillDirName } from "./naming.ts";

export { skillDirName } from "./naming.ts";

export interface SkillInstallOpts {
  global?: boolean;
  rimraf?: boolean;
  dry?: boolean;
}

/** Resolved skill directory for a program (`~/.agents/skills/<key>/` or project `.agents/skills/<key>/`). */
export function resolveAgentsSkillDir(root: CliProgram, global = true): string {
  const base = global ? userHome() : process.cwd();
  return join(base, ".agents", "skills", skillDirName(root.key));
}

/** Writes skill.md, SKILL.md (compatibility copy), and reference.md; returns changed file paths. */
export function cliSkillInstall(root: CliProgram, opts: SkillInstallOpts): string[] {
  const bundle = generateSkillBundle(root);
  const { skillMd, referenceMd } = applySkillInstallHints(root, bundle.skillMd, bundle.referenceMd);
  const dir = resolveAgentsSkillDir(root, opts.global ?? true);
  const changed: string[] = [];

  if (opts.rimraf && existsSync(dir) && !opts.dry) {
    rmSync(dir, { recursive: true, force: true });
  }

  const skillPath = join(dir, "skill.md");
  const skillCompatPath = join(dir, "SKILL.md");
  const refPath = join(dir, "reference.md");

  if (!opts.dry) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(skillPath, skillMd, "utf8");
    writeFileSync(skillCompatPath, skillMd, "utf8");
    writeFileSync(refPath, referenceMd, "utf8");
    process.stdout.write(`Installed skill to ${displayHomePath(dir)}/\n`);
  }

  changed.push(skillPath, skillCompatPath, refPath);
  return changed;
}

/** True when the plan action kind installs the agent skill bundle. */
export function isAgentSkillActionKind(kind: string): boolean {
  return kind === "agent-skill";
}
