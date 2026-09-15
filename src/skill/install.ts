/*
This module provides paths and helpers for agent skill directories (~/.agents/skills/<key>/).
Skill generation is removed; skills are authored directly in repositories under skills/<app>/SKILL.md.
*/

import { join } from "node:path";
import type { CliProgram } from "../core/types.ts";
import { userHome } from "../paths/host.ts";
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

/** True when the plan action kind installs the agent skill bundle. */
export function isAgentSkillActionKind(kind: string): boolean {
  return kind === "agent-skill";
}
