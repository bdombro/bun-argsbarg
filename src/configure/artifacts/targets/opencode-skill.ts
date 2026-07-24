import { opencodePresent } from "~/configure/artifacts/mcp-opencode.ts";
import { userHome } from "~/configure/artifacts/paths.ts";
import { SkillInstallTarget } from "~/configure/artifacts/target-skill.ts";

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
