import { opencodePresent } from "../mcp-opencode.ts";
import { userHome } from "../paths.ts";
import { SkillInstallTarget } from "../target-skill.ts";

export const opencodeSkillTarget = new SkillInstallTarget({
  key: "opencodeSkill",
  actionKind: "opencode-skill",
  label: "OpenCode",
  uninstallPrefix: "opencode skill",
  pairedMcpKey: "opencodeMcp",
  skillDir: (p) => p.opencodeSkillDir,
  detectedKey: "opencodeSkill",
  statusField: "opencodeSkill",
  isAvailable: () => opencodePresent(userHome()),
});
