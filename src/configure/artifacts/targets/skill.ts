import { SkillInstallTarget } from "../target-skill.ts";

export const skillTarget = new SkillInstallTarget({
  key: "skill",
  actionKind: "agent-skill",
  label: "Agent skill",
  uninstallPrefix: "agent skill",
  skillDir: (p) => p.agentsSkillDir,
  detectedKey: "skill",
  statusField: "skill",
  isAvailable: (root) => root.skill?.enabled === true,
});
