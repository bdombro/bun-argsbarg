import { existsSync } from "node:fs";
import { join } from "node:path";
import { userHome } from "~/configure/artifacts/paths.ts";
import { McpJsonInstallTarget } from "~/configure/artifacts/target-mcp-json.ts";

export const cursorMcpTarget = new McpJsonInstallTarget({
  key: "cursorMcp",
  actionKind: "cursor-mcp",
  label: "cursor mcp",
  pairedSkillKey: "cursorSkill",
  configPath: (p) => p.cursorMcpPath,
  detectedKey: "cursorMcp",
  statusField: "cursorMcp",
  isAvailable: () => existsSync(join(userHome(), ".cursor")),
});
