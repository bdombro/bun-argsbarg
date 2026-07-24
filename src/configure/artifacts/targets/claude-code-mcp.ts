import { existsSync } from "node:fs";
import { join } from "node:path";
import { userHome } from "../paths.ts";
import { McpJsonInstallTarget } from "../target-mcp-json.ts";

export const claudeCodeMcpTarget = new McpJsonInstallTarget({
  key: "claudeCodeMcp",
  actionKind: "claude-mcp",
  label: "claude code mcp",
  pairedSkillKey: "claudeSkill",
  configPath: (p) => p.claudeMcpPath,
  detectedKey: "claudeMcp",
  statusField: "claudeMcp",
  isAvailable: () => existsSync(join(userHome(), ".claude")),
});
