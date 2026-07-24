import { existsSync } from "node:fs";
import { join } from "node:path";
import { userHome } from "../paths.ts";
import { SkillInstallTarget } from "../target-skill.ts";

export const cursorSkillTarget = new SkillInstallTarget({
  key: "cursorSkill",
  actionKind: "cursor-skill",
  label: "Cursor",
  uninstallPrefix: "cursor skill",
  pairedMcpKey: "cursorMcp",
  skillDir: (p) => p.cursorSkillDir,
  detectedKey: "cursorSkill",
  statusField: "cursorSkill",
  isAvailable: () => existsSync(join(userHome(), ".cursor")),
});
