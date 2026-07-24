import { claudeDesktopPresent, userHome } from "../paths.ts";
import { McpJsonInstallTarget } from "../target-mcp-json.ts";

export const claudeDesktopMcpTarget = new McpJsonInstallTarget({
  key: "claudeDesktopMcp",
  actionKind: "claude-desktop-mcp",
  label: "claude desktop mcp",
  configPath: (p) => p.claudeDesktopMcpPath,
  detectedKey: "claudeDesktopMcp",
  statusField: "claudeDesktopMcp",
  isAvailable: (_root, paths) => claudeDesktopPresent(userHome(), paths.claudeDesktopMcpPath),
});
