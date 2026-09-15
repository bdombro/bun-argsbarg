/*
Install target definition for agent skill cleanup and status.
Skill generation is removed; skills are authored directly in repositories under skills/<app>/SKILL.md.
*/

import { existsSync } from "node:fs";
import { SkillInstallTarget } from "../target-skill.ts";

/** Registered install target for agent skill directory cleanup and detection. */
export const skillTarget = new SkillInstallTarget({
  key: "skill",
  actionKind: "agent-skill",
  label: "Agent skill",
  uninstallPrefix: "agent skill",
  skillDir: (p) => p.agentsSkillDir,
  detectedKey: "skill",
  statusField: "skill",
  isAvailable: (_root, p) => existsSync(p.agentsSkillDir),
});
