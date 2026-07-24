import { existsSync } from "node:fs";
import { join } from "node:path";
import { userHome } from "~/configure/artifacts/paths.ts";
import { SkillInstallTarget } from "~/configure/artifacts/target-skill.ts";

export const claudeSkillTarget = new SkillInstallTarget({
  key: "claudeSkill",
  actionKind: "claude-skill",
  label: "Claude Code",
  uninstallPrefix: "claude skill",
  pairedMcpKey: "claudeCodeMcp",
  skillDir: (p) => p.claudeSkillDir,
  detectedKey: "claudeSkill",
  statusField: "claudeSkill",
  isAvailable: () => existsSync(join(userHome(), ".claude")),
});
