import { existsSync } from "node:fs";
import { join } from "node:path";
import { openclawOnPath } from "../mcp-openclaw.ts";
import { userHome } from "../paths.ts";
import { SkillInstallTarget } from "../target-skill.ts";

export const openclawSkillTarget = new SkillInstallTarget({
  key: "openclawSkill",
  actionKind: "openclaw-skill",
  label: "OpenClaw",
  uninstallPrefix: "openclaw skill",
  pairedMcpKey: "openclawMcp",
  skillDir: (p) => p.openclawSkillDir,
  detectedKey: "openclawSkill",
  statusField: "openclawSkill",
  isAvailable: () => existsSync(join(userHome(), ".openclaw")) || openclawOnPath(),
});
