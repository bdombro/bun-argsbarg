import { codexOnPath } from "../mcp-codex.ts";
import { SkillInstallTarget } from "../target-skill.ts";

export const codexSkillTarget = new SkillInstallTarget({
  key: "codexSkill",
  actionKind: "codex-skill",
  label: "Codex",
  uninstallPrefix: "codex skill",
  pairedMcpKey: "codexMcp",
  skillDir: (p) => p.codexSkillDir,
  detectedKey: "codexSkill",
  statusField: "codexSkill",
  isAvailable: () => codexOnPath(),
});
