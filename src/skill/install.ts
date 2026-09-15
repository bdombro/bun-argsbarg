/*
This module installs agent skills to ~/.agents/skills/<key>/ per the dotagents protocol.
It writes skill.md and SKILL.md (compatibility copy) as an intent-based router.
*/

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CliProgram } from "../core/types.ts";
import { displayHomePath, userHome } from "../paths/host.ts";
import { generateSkillBundle } from "./generate.ts";
import { applySkillInstallHints } from "./hint.ts";
import { skillDirName } from "./naming.ts";

export { skillDirName } from "./naming.ts";

/** Options for agent skill installation. */
export interface SkillInstallOpts {
  /** When true, installs to user home ~/.agents/skills/<key>/; otherwise project .agents/skills/<key>/. */
  global?: boolean;
  /** When true, removes existing directory before installing. */
  rimraf?: boolean;
  /** When true, computes file paths without writing to disk. */
  dry?: boolean;
}

/** Resolved skill directory for a program (`~/.agents/skills/<key>/` or project `.agents/skills/<key>/`). */
export function resolveAgentsSkillDir(root: CliProgram, global = true): string {
  const base = global ? userHome() : process.cwd();
  return join(base, ".agents", "skills", skillDirName(root.key));
}

/** Writes skill.md and SKILL.md (compatibility copy); returns changed file paths. */
export function cliSkillInstall(root: CliProgram, opts: SkillInstallOpts): string[] {
  const bundle = generateSkillBundle(root);
  const { skillMd } = applySkillInstallHints(root, bundle.skillMd);
  const dir = resolveAgentsSkillDir(root, opts.global ?? true);
  const changed: string[] = [];

  if (opts.rimraf && existsSync(dir) && !opts.dry) {
    rmSync(dir, { recursive: true, force: true });
  }

  const skillPath = join(dir, "skill.md");
  const skillCompatPath = join(dir, "SKILL.md");

  if (!opts.dry) {
    mkdirSync(dir, { recursive: true });
    const legacyRef = join(dir, "reference.md");
    if (existsSync(legacyRef)) {
      rmSync(legacyRef, { force: true });
    }
    writeFileSync(skillPath, skillMd, "utf8");
    writeFileSync(skillCompatPath, skillMd, "utf8");
    process.stdout.write(`Installed skill to ${displayHomePath(dir)}/\n`);
  }

  changed.push(skillPath, skillCompatPath);
  return changed;
}

/** True when the plan action kind installs the agent skill bundle. */
export function isAgentSkillActionKind(kind: string): boolean {
  return kind === "agent-skill";
}
